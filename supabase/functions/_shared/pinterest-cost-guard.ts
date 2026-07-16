// Pinterest Hard Cost Guard — single choke-point for every paid AI call in the
// Pinterest pipeline. Controls per-run budget cap, ledger writes, and
// paused-run enforcement. See mem://marketing/pinterest-cost-controls-v1.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

export const SCORING_VERSION = "v1.2026-07-16";

export interface RunConfig {
  run_id: string;
  wave_slug: string | null;
  requested_pin_count: number;
  product_category: string | null;
  hero_priority_slugs: string[];
  max_credit_spend: number;
  max_image_calls: number;
  max_qa_calls: number;
  allow_pro_image: boolean;
  force_rescore: boolean;
  manual_resume_required: boolean;
  manual_resume: boolean;
  status:
    | "active"
    | "paused"
    | "completed"
    | "aborted"
    | "awaiting_manual_resume";
  paused_reason: string | null;
}

export class BudgetExceededError extends Error {
  constructor(public readonly detail: Record<string, unknown>) {
    super(`budget_exceeded: ${JSON.stringify(detail)}`);
    this.name = "BudgetExceededError";
  }
}

export class RunPausedError extends Error {
  constructor(public readonly reason: string) {
    super(`run_paused: ${reason}`);
    this.name = "RunPausedError";
  }
}

export class RetryLimitExceededError extends Error {
  constructor(public readonly kind: "image" | "qa", public readonly limit: number) {
    super(`retry_limit_exceeded:${kind}:${limit}`);
    this.name = "RetryLimitExceededError";
  }
}

export interface LedgerEntry {
  run_id: string;
  queue_id?: string | null;
  product_id?: string | null;
  provider: string;
  model: string;
  operation:
    | "image_gen"
    | "image_edit"
    | "qa"
    | "pre"
    | "integrity"
    | "native"
    | "composite"
    | "strategy"
    | "brief"
    | "probe";
  retry_number?: number;
  input_tokens?: number;
  output_tokens?: number;
  image_count?: number;
  provider_cost_usd?: number;
  credits: number;
  success: boolean;
  error_reason?: string | null;
  image_hash?: string | null;
  pdp_hero_hash?: string | null;
  scoring_version?: string | null;
  cached_hit?: boolean;
  meta?: Record<string, unknown>;
}

export async function loadRunConfig(
  sb: SupabaseClient,
  run_id: string,
): Promise<RunConfig | null> {
  const { data, error } = await sb
    .from("pinterest_run_config")
    .select("*")
    .eq("run_id", run_id)
    .maybeSingle();
  if (error || !data) return null;
  return data as RunConfig;
}

export async function upsertRunConfig(
  sb: SupabaseClient,
  cfg: Partial<RunConfig> & { run_id: string },
): Promise<RunConfig> {
  const { data, error } = await sb
    .from("pinterest_run_config")
    .upsert(cfg, { onConflict: "run_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data as RunConfig;
}

export async function currentRunSpend(
  sb: SupabaseClient,
  run_id: string,
): Promise<{ credits: number; image_calls: number; qa_calls: number }> {
  const { data, error } = await sb
    .from("pinterest_run_cost_ledger")
    .select("credits, operation, cached_hit")
    .eq("run_id", run_id);
  if (error) throw error;
  let credits = 0;
  let image_calls = 0;
  let qa_calls = 0;
  for (const row of data ?? []) {
    if (!row.cached_hit) credits += Number(row.credits ?? 0);
    if (row.operation === "image_gen" || row.operation === "image_edit") {
      if (!row.cached_hit) image_calls++;
    }
    if (
      row.operation === "qa" ||
      row.operation === "pre" ||
      row.operation === "integrity" ||
      row.operation === "native"
    ) {
      if (!row.cached_hit) qa_calls++;
    }
  }
  return { credits, image_calls, qa_calls };
}

/**
 * MUST be called BEFORE every paid gateway call. Throws BudgetExceededError
 * without touching the network when projected spend would exceed the cap.
 */
export async function assertBudget(
  sb: SupabaseClient,
  cfg: RunConfig,
  projected_credits: number,
  kind: "image" | "qa",
): Promise<{ before: number; projected: number }> {
  const spend = await currentRunSpend(sb, cfg.run_id);
  const projected = spend.credits + Math.max(0, projected_credits);
  if (projected > cfg.max_credit_spend) {
    throw new BudgetExceededError({
      run_id: cfg.run_id,
      cap: cfg.max_credit_spend,
      before: spend.credits,
      projected,
      kind,
    });
  }
  if (kind === "image" && spend.image_calls + 1 > cfg.max_image_calls) {
    throw new BudgetExceededError({
      run_id: cfg.run_id,
      image_calls: spend.image_calls,
      cap: cfg.max_image_calls,
      kind,
    });
  }
  if (kind === "qa" && spend.qa_calls + 1 > cfg.max_qa_calls) {
    throw new BudgetExceededError({
      run_id: cfg.run_id,
      qa_calls: spend.qa_calls,
      cap: cfg.max_qa_calls,
      kind,
    });
  }
  return { before: spend.credits, projected };
}

export async function assertNotPaused(cfg: RunConfig): Promise<void> {
  if (cfg.status === "paused" || cfg.status === "awaiting_manual_resume") {
    if (!cfg.manual_resume) {
      throw new RunPausedError(cfg.paused_reason ?? cfg.status);
    }
  }
  if (cfg.status === "aborted" || cfg.status === "completed") {
    throw new RunPausedError(cfg.status);
  }
}

export async function pauseRun(
  sb: SupabaseClient,
  run_id: string,
  reason: string,
): Promise<void> {
  await sb
    .from("pinterest_run_config")
    .update({ status: "paused", paused_reason: reason, manual_resume: false })
    .eq("run_id", run_id);
}

export async function recordLedger(
  sb: SupabaseClient,
  entry: LedgerEntry,
): Promise<void> {
  await sb.from("pinterest_run_cost_ledger").insert({
    run_id: entry.run_id,
    queue_id: entry.queue_id ?? null,
    product_id: entry.product_id ?? null,
    provider: entry.provider,
    model: entry.model,
    operation: entry.operation,
    retry_number: entry.retry_number ?? 0,
    input_tokens: entry.input_tokens ?? null,
    output_tokens: entry.output_tokens ?? null,
    image_count: entry.image_count ?? 0,
    provider_cost_usd: entry.provider_cost_usd ?? null,
    credits: entry.credits,
    success: entry.success,
    error_reason: entry.error_reason ?? null,
    image_hash: entry.image_hash ?? null,
    pdp_hero_hash: entry.pdp_hero_hash ?? null,
    scoring_version: entry.scoring_version ?? SCORING_VERSION,
    cached_hit: entry.cached_hit ?? false,
    meta: entry.meta ?? null,
  });
}
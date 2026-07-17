// Pinterest QA / PRE / vision / integrity score memoisation — Control 4.
// Before any paid QA-class call, compute a stable cache key from image bytes,
// PDP hero hash, product ID and scoring version. Reuse cached result when
// present; write a ledger row with cached_hit=true / credits=0.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  recordLedger,
  SCORING_VERSION,
  type LedgerEntry,
  type RunConfig,
} from "./pinterest-cost-guard.ts";

export async function sha256Hex(bytes: Uint8Array | string): Promise<string> {
  const input =
    typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface CacheKeyInput {
  image_hash: string;
  pdp_hero_hash?: string | null;
  product_id?: string | null;
  scorer: string;
  scoring_version?: string;
}

export async function buildCacheKey(k: CacheKeyInput): Promise<string> {
  return sha256Hex(
    [
      k.image_hash,
      k.pdp_hero_hash ?? "",
      k.product_id ?? "",
      k.scorer,
      k.scoring_version ?? SCORING_VERSION,
    ].join("|"),
  );
}

export async function getCached(
  sb: SupabaseClient,
  cache_key: string,
): Promise<{ result: unknown; passed: boolean } | null> {
  const { data } = await sb
    .from("pinterest_qa_score_cache")
    .select("result, passed")
    .eq("cache_key", cache_key)
    .maybeSingle();
  if (!data) return null;
  // Fire-and-forget hit counter update.
  sb.from("pinterest_qa_score_cache")
    .update({ hits: (data as any).hits ?? 0 + 1, last_hit_at: new Date().toISOString() })
    .eq("cache_key", cache_key)
    .then(() => {});
  return { result: data.result, passed: data.passed };
}

export async function putCached(
  sb: SupabaseClient,
  cache_key: string,
  input: CacheKeyInput,
  result: unknown,
  passed: boolean,
  credits_saved: number,
): Promise<void> {
  await sb.from("pinterest_qa_score_cache").upsert(
    {
      cache_key,
      scorer: input.scorer,
      scoring_version: input.scoring_version ?? SCORING_VERSION,
      image_hash: input.image_hash,
      pdp_hero_hash: input.pdp_hero_hash ?? null,
      product_id: input.product_id ?? null,
      result,
      passed,
      credits_saved,
    },
    { onConflict: "cache_key" },
  );
}

export interface RunScoredWithCacheArgs {
  cfg: RunConfig;
  scorer: string;
  operation: LedgerEntry["operation"];
  cache: CacheKeyInput;
  estimated_credits: number;
  queue_id?: string | null;
  product_id?: string | null;
  /** Real scorer implementation. Only invoked on cache miss. */
  run: () => Promise<{ result: unknown; passed: boolean; actual_credits: number }>;
}

/**
 * Wraps any paid QA / PRE / integrity / native / vision scorer call.
 * On cache hit → records `cached_hit=true, credits=0` ledger row, returns cached.
 * On miss → runs the scorer, records real ledger row, persists cache.
 * Bypassed only when cfg.force_rescore === true.
 */
export async function runScoredWithCache(
  sb: SupabaseClient,
  args: RunScoredWithCacheArgs,
): Promise<{ result: unknown; passed: boolean; cached: boolean }> {
  const key = await buildCacheKey(args.cache);
  if (!args.cfg.force_rescore) {
    const hit = await getCached(sb, key);
    if (hit) {
      await recordLedger(sb, {
        run_id: args.cfg.run_id,
        queue_id: args.queue_id ?? null,
        product_id: args.product_id ?? null,
        provider: "cache",
        model: args.scorer,
        operation: args.operation,
        credits: 0,
        success: true,
        image_hash: args.cache.image_hash,
        pdp_hero_hash: args.cache.pdp_hero_hash ?? null,
        scoring_version: args.cache.scoring_version ?? SCORING_VERSION,
        cached_hit: true,
      });
      return { result: hit.result, passed: hit.passed, cached: true };
    }
  }
  const out = await args.run();
  await putCached(sb, key, args.cache, out.result, out.passed, args.estimated_credits);
  await recordLedger(sb, {
    run_id: args.cfg.run_id,
    queue_id: args.queue_id ?? null,
    product_id: args.product_id ?? null,
    provider: "lovable-ai-gateway",
    model: args.scorer,
    operation: args.operation,
    credits: out.actual_credits,
    success: true,
    image_hash: args.cache.image_hash,
    pdp_hero_hash: args.cache.pdp_hero_hash ?? null,
    scoring_version: args.cache.scoring_version ?? SCORING_VERSION,
    cached_hit: false,
  });
  return { result: out.result, passed: out.passed, cached: false };
}
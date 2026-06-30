// Genesis V6.3 — AI Gateway Cost Optimizer.
// Shared helpers to deduplicate identical prompts, prevent overlapping
// per-product generations, and back off after upstream credit failures.
// All helpers are opt-in: existing fetch calls keep working unchanged.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const TEXT_TTL_HOURS = 24;
const IMAGE_TTL_HOURS = 24 * 7;

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface GatewayCacheOpts {
  supabase: SupabaseClient;
  model: string;
  body: unknown; // exact request body (excluding non-deterministic fields)
  functionName: string;
  productSlug?: string | null;
  ttlHours?: number; // override default
  isImage?: boolean; // longer TTL
  approxCreditsPerHit?: number; // for savings telemetry
}

export async function cacheKeyFor(model: string, body: unknown, extra?: string): Promise<string> {
  const canonical = JSON.stringify({ m: model, b: body, x: extra ?? null });
  return await sha256Hex(canonical);
}

export async function lookupCachedGateway(opts: GatewayCacheOpts): Promise<unknown | null> {
  const key = await cacheKeyFor(opts.model, opts.body);
  const { data, error } = await opts.supabase
    .from("ai_prompt_cache")
    .select("response_json, credits_saved_estimate, hit_count")
    .eq("cache_key", key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data) return null;
  // Fire-and-forget hit-count bump.
  opts.supabase
    .from("ai_prompt_cache")
    .update({
      hit_count: (data.hit_count ?? 0) + 1,
      credits_saved_estimate: (data.credits_saved_estimate ?? 0) + (opts.approxCreditsPerHit ?? 0),
      last_hit_at: new Date().toISOString(),
    })
    .eq("cache_key", key)
    .then(() => {}, () => {});
  return data.response_json;
}

export async function storeCachedGateway(opts: GatewayCacheOpts, responseJson: unknown): Promise<void> {
  const key = await cacheKeyFor(opts.model, opts.body);
  const ttlH = opts.ttlHours ?? (opts.isImage ? IMAGE_TTL_HOURS : TEXT_TTL_HOURS);
  const expires = new Date(Date.now() + ttlH * 3600 * 1000).toISOString();
  await opts.supabase
    .from("ai_prompt_cache")
    .upsert({
      cache_key: key,
      model: opts.model,
      function_name: opts.functionName,
      product_slug: opts.productSlug ?? null,
      response_json: responseJson as any,
      expires_at: expires,
    }, { onConflict: "cache_key" });
}

// ── Per-product/lane single-flight lock ─────────────────────────────────────

export interface AcquireLockOpts {
  supabase: SupabaseClient;
  productSlug: string;
  lane: string; // e.g. "creative-director-image", "pcie-v2-pipeline"
  ttlSeconds?: number;
  functionName?: string;
}

export async function acquireProductLock(opts: AcquireLockOpts): Promise<{ acquired: boolean; runId: string }> {
  const ttl = opts.ttlSeconds ?? 600;
  const runId = crypto.randomUUID();
  const expires = new Date(Date.now() + ttl * 1000).toISOString();
  // Clear stale lock first (best-effort).
  await opts.supabase
    .from("ai_generation_locks")
    .delete()
    .eq("product_slug", opts.productSlug)
    .eq("lane", opts.lane)
    .lt("expires_at", new Date().toISOString());
  const { error } = await opts.supabase
    .from("ai_generation_locks")
    .insert({
      product_slug: opts.productSlug,
      lane: opts.lane,
      run_id: runId,
      function_name: opts.functionName ?? null,
      expires_at: expires,
    });
  if (error) return { acquired: false, runId };
  return { acquired: true, runId };
}

export async function releaseProductLock(supabase: SupabaseClient, productSlug: string, lane: string, runId: string): Promise<void> {
  await supabase
    .from("ai_generation_locks")
    .delete()
    .eq("product_slug", productSlug)
    .eq("lane", lane)
    .eq("run_id", runId);
}

// ── Exponential probe backoff ───────────────────────────────────────────────
// Schedule (failures → cool-down minutes): 1→2, 2→5, 3→15, 4→30, 5→60, ≥6→120.

const PROBE_BACKOFF_MIN = [2, 5, 15, 30, 60, 120];

export async function shouldProbeNow(supabase: SupabaseClient): Promise<{ allowed: boolean; nextAllowedAt: string | null }> {
  const { data } = await supabase
    .from("ai_probe_backoff_state")
    .select("next_allowed_at")
    .eq("id", 1)
    .maybeSingle();
  if (!data) return { allowed: true, nextAllowedAt: null };
  const next = new Date(data.next_allowed_at).getTime();
  return { allowed: Date.now() >= next, nextAllowedAt: data.next_allowed_at };
}

export async function recordProbeOutcome(supabase: SupabaseClient, statusCode: number): Promise<void> {
  const ok = statusCode >= 200 && statusCode < 300;
  if (ok) {
    await supabase
      .from("ai_probe_backoff_state")
      .update({
        consecutive_failures: 0,
        next_allowed_at: new Date().toISOString(),
        last_attempt_at: new Date().toISOString(),
        last_status_code: statusCode,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    return;
  }
  const { data } = await supabase
    .from("ai_probe_backoff_state")
    .select("consecutive_failures")
    .eq("id", 1)
    .maybeSingle();
  const fails = (data?.consecutive_failures ?? 0) + 1;
  const idx = Math.min(fails - 1, PROBE_BACKOFF_MIN.length - 1);
  const waitMin = PROBE_BACKOFF_MIN[idx];
  await supabase
    .from("ai_probe_backoff_state")
    .update({
      consecutive_failures: fails,
      next_allowed_at: new Date(Date.now() + waitMin * 60 * 1000).toISOString(),
      last_attempt_at: new Date().toISOString(),
      last_status_code: statusCode,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
}

// ── Convenience: cached chat-completions wrapper ────────────────────────────

export async function cachedChatCompletion(opts: GatewayCacheOpts & { apiKey: string }): Promise<{ json: any; cached: boolean }> {
  const cached = await lookupCachedGateway(opts);
  if (cached) return { json: cached, cached: true };
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(opts.body),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`gateway ${resp.status}: ${t.slice(0, 200)}`);
  }
  const json = await resp.json();
  await storeCachedGateway(opts, json);
  return { json, cached: false };
}
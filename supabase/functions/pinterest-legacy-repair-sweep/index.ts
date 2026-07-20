// pinterest-legacy-repair-sweep
// ------------------------------------------------------------------
// One-shot orchestrator that retroactively repairs legacy Pinterest
// pins created BEFORE the current integrity guard / PRE gate / PCIE2
// publisher were fully enforced.
//
// This module does NOT reimplement any logic. It composes the existing
// production Pinterest Integrity Engine in the correct order:
//
//   1. pinterest-integrity-audit     — 12-point destination + product audit
//   2. pinterest-pin-repair          — write audit verdicts back to queue
//   3. pinterest-live-pin-audit      — category / visual / duplicate scan
//   4. pinterest-master-creative-sync — CASE B: promote master creative to PDP hero
//   5. pinterest-integrity-report    — JSON + CSV + HTML certification bundle
//
// Fail-closed: any sub-step failure is captured but does NOT roll back
// prior successful phases (they are individually idempotent + journaled).
// Admin-only (JWT + has_role('admin') required).
// ------------------------------------------------------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { isAiGenerationPaused } from "../_shared/pinterest-credit-guard.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Default cutoff: PRE + integrity-guard were rolled out on 2026-06-15.
// Anything older is considered legacy for this sweep.
const DEFAULT_LEGACY_CUTOFF = "2026-06-15T00:00:00Z";

type Phase =
  | "inventory"
  | "integrity_audit"
  | "pin_repair"
  | "live_pin_audit"
  | "hero_sync"
  | "report";

interface PhaseResult {
  phase: Phase;
  ok: boolean;
  ms: number;
  data?: unknown;
  error?: string;
}

async function invoke(
  name: string,
  body: Record<string, unknown>,
  authHeader: string,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Admin JWT for functions that verify auth (pinterest-pin-repair,
        // pinterest-integrity-audit, pinterest-integrity-report).
        Authorization: authHeader,
        apikey: ANON_KEY,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: unknown = text;
    try { data = JSON.parse(text); } catch { /* leave as text */ }
    if (!res.ok) return { ok: false, data, error: `${name} ${res.status}` };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: `${name}: ${(e as Error).message}` };
  } finally {
    // caller records ms
    void t0;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const traceId = crypto.randomUUID().slice(0, 8);
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response(
      JSON.stringify({ ok: false, traceId, error: "unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return new Response(
      JSON.stringify({ ok: false, traceId, error: "unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: isAdmin } = await sb.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (!isAdmin) {
    return new Response(
      JSON.stringify({ ok: false, traceId, error: "forbidden" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const cutoff = typeof body.legacy_cutoff === "string" ? body.legacy_cutoff : DEFAULT_LEGACY_CUTOFF;
  const skipHeroSyncRequested = body.skip_hero_sync === true;
  // Layer split — the deterministic Pinterest Integrity Engine (Layer A) must
  // always run to completion. AI-dependent enrichment (Layer B: hero sync,
  // creative regen, PRE) is gated on live credit availability and silently
  // skipped when the AI generation lane is paused. This guarantees the
  // integrity audit keeps protecting GetPawsy at AI balance = 0.
  const aiState = await isAiGenerationPaused(sb).catch(() => ({ paused: false, state: "green" as const }));
  const aiAvailable = !aiState.paused;
  const skipHeroSync = skipHeroSyncRequested || !aiAvailable;
  // Default audit mode: `posted` targets the 74 legacy live pins that own
  // real destination URLs. `all` also sweeps 2k+ rejected/draft rows which
  // exceeds the per-invocation wall-clock budget.
  const auditMode = (typeof body.audit_mode === "string" ? body.audit_mode : "posted");
  const auditBatchSize = Math.min(Number(body.batch_size) || 200, 400);

  // ------------------------------------------------------------------
  // PHASE 1 — Inventory legacy posted pins (evidence, not mutation).
  // ------------------------------------------------------------------
  const results: PhaseResult[] = [];
  const t1 = Date.now();
  const { data: legacyPins, error: invErr, count } = await sb
    .from("pinterest_pin_queue")
    .select(
      "id, pinterest_pin_id, product_id, product_slug, board_name, pin_title, destination_link, image_url, created_at",
      { count: "exact", head: false },
    )
    .eq("status", "posted")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(5000);

  results.push({
    phase: "inventory",
    ok: !invErr,
    ms: Date.now() - t1,
    data: { legacy_cutoff: cutoff, legacy_pins_found: count ?? legacyPins?.length ?? 0 },
    error: invErr?.message,
  });

  const legacyIds = new Set((legacyPins ?? []).map((p) => p.id as string));

  // ------------------------------------------------------------------
  // PHASE 2 — Integrity audit (writes pinterest_pin_audit_runs + rows).
  // Uses existing 12-point validator; scope='all' covers legacy posted pins.
  // ------------------------------------------------------------------
  const t2 = Date.now();
  const audit = await invoke(
    "pinterest-integrity-audit",
    { mode: auditMode, autorepair: true, batch_size: auditBatchSize },
    authHeader,
  );
  results.push({ phase: "integrity_audit", ok: audit.ok, ms: Date.now() - t2, data: audit.data, error: audit.error });

  // ------------------------------------------------------------------
  // PHASE 3 — Pin repair (writes audit verdicts back into queue rows).
  // ------------------------------------------------------------------
  const t3 = Date.now();
  const repair = await invoke("pinterest-pin-repair", {}, authHeader);
  results.push({ phase: "pin_repair", ok: repair.ok, ms: Date.now() - t3, data: repair.data, error: repair.error });

  // ------------------------------------------------------------------
  // PHASE 4 — Live-pin category / duplicate / visual mismatch scan.
  // Populates pinterest_live_pin_repair_queue with REPLACE / ARCHIVE /
  // REGENERATE recommendations that the existing repair-execute workers
  // will drain on their normal cron schedules.
  // ------------------------------------------------------------------
  const t4 = Date.now();
  const liveAudit = await invoke("pinterest-live-pin-audit", {}, authHeader);
  results.push({ phase: "live_pin_audit", ok: liveAudit.ok, ms: Date.now() - t4, data: liveAudit.data, error: liveAudit.error });

  // ------------------------------------------------------------------
  // PHASE 5 — CASE B: sync approved master creatives to PDP hero.
  // Only touches products whose pei_creative_dna has published_at set and
  // integrity score >= 95. Every write is journaled + rollback-safe.
  // ------------------------------------------------------------------
  let hero: { ok: boolean; data?: unknown; error?: string } = {
    ok: true,
    data: { skipped: true, reason: skipHeroSyncRequested ? "operator_requested" : "ai_unavailable", ai_state: aiState.state },
  };
  const t5 = Date.now();
  if (!skipHeroSync) {
    hero = await invoke(
      "pinterest-master-creative-sync",
      { mode: "sync", limit: 400 },
      authHeader,
    );
  }
  results.push({
    phase: "hero_sync",
    ok: hero.ok,
    ms: Date.now() - t5,
    data: hero.data,
    error: hero.error,
  });

  // ------------------------------------------------------------------
  // PHASE 6 — Certification report bundle (JSON + CSV + HTML in
  // admin-reports/pinterest-integrity/, indexed via pinterest_integrity_reports).
  // ------------------------------------------------------------------
  const t6 = Date.now();
  const report = await invoke("pinterest-integrity-report", { legacy_sweep: true, legacy_cutoff: cutoff }, authHeader);
  results.push({ phase: "report", ok: report.ok, ms: Date.now() - t6, data: report.data, error: report.error });

  // ------------------------------------------------------------------
  // Roll-up summary for the caller. Every downstream detail lives in the
  // canonical tables produced by the composed modules — no duplicate storage.
  // ------------------------------------------------------------------
  const auditSummary = (audit.data as any)?.summary ?? {};
  const liveSummary = liveAudit.data as any ?? {};
  const heroSummary = (hero.data as any)?.summary ?? {};
  const reportSummary = (report.data as any)?.summary ?? {};
  const reportUrls = (report.data as any)?.signed_urls ?? {};

  const rollup = {
    trace_id: traceId,
    legacy_cutoff: cutoff,
    legacy_pins_inventoried: legacyIds.size,
    ai_lane: {
      available: aiAvailable,
      state: aiState.state,
      layer_b_skipped: !aiAvailable || skipHeroSyncRequested,
      note: aiAvailable
        ? "Layer A (deterministic) + Layer B (AI enrichment) both executed."
        : "AI unavailable. Deterministic audit completed. Layer B (hero sync / creative regen) skipped.",
    },
    audit_mode: auditMode,
    audit_batch_size: auditBatchSize,
    audit: {
      total: auditSummary.total ?? 0,
      valid: auditSummary.valid ?? 0,
      repaired: auditSummary.repaired ?? 0,
      needs_replacement: auditSummary.needs_replacement ?? 0,
    },
    pin_repair: repair.data ?? null,
    live_audit: {
      total_live_pins_audited: liveSummary.total_live_pins_audited ?? 0,
      replacement_queue_size: liveSummary.replacement_queue_size ?? 0,
      archive_queue_size: liveSummary.archive_queue_size ?? 0,
      regenerate_queue_size: liveSummary.regenerate_queue_size ?? 0,
    },
    hero_sync: {
      candidates: heroSummary.candidates ?? 0,
      synced: heroSummary.synced ?? 0,
      skipped_same: heroSummary.skipped_same ?? 0,
      errors: heroSummary.errors ?? 0,
    },
    report: {
      pins_audited: reportSummary.pins_audited ?? 0,
      pins_pass: reportSummary.pins_pass ?? 0,
      pins_warning: reportSummary.pins_warning ?? 0,
      pins_fail: reportSummary.pins_fail ?? 0,
      hero_syncs: reportSummary.hero_syncs ?? 0,
      wrong_url_fixed: reportSummary.wrong_url_fixed ?? 0,
      signed_urls: reportUrls,
    },
  };

  const ok = results.every((r) => r.ok);

  return new Response(
    JSON.stringify({ ok, trace_id: traceId, rollup, phases: results }, null, 2),
    { status: ok ? 200 : 207, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
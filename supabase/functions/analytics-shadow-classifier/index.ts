// Shadow-mode traffic classifier (per session).
// Reads stored canonical_sessions fields (user_agent, stage, engagement,
// interactions) in small keyset-paginated batches and writes ONLY derived
// labels on canonical_sessions (traffic_quality, is_bot, technical_path,
// bot_confidence, bot_reason, shadow_classifier_version, shadow_classified_at).
// Raw events are never read or written. Exclusive lease + checkpoint live in
// public.analytics_job_leases (job = 'shadow_classifier').
//
// Auth: verify_jwt=false by platform default; requires a shared token header.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { CLASSIFIER_VERSION } from "../_shared/traffic-classifier.ts";
import { classifySessionRow } from "../_shared/session-shadow-classify.ts";
import { aggregateSessionEvidence } from "../_shared/session-evidence.ts";
import { resolveShadowWindow } from "../_shared/shadow-evidence-safety.ts";
import { fetchEvidencePages } from "../_shared/evidence-pagination.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VERSION = `${CLASSIFIER_VERSION}-session-shadow-evidence-v2`;
const JOB = "shadow_classifier";
const LEASE_MS = 5 * 60 * 1000;
const TIME_BUDGET_MS = 45_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clampInt(v: string | null, def: number, min: number, max: number) {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}

const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
const WARMER_SECRET = Deno.env.get("ANALYTICS_WARMER_SECRET") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // Same shared-secret gate as analytics-canonical-warmer; empty secrets never match. Never logged.
  const provided = req.headers.get("x-internal-secret") ?? "";
  const accepted = [INTERNAL_SECRET, WARMER_SECRET].filter((s) => s.length > 0);
  if (!provided || !accepted.includes(provided)) return json({ ok: false, error: "unauthorized" }, 401);

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "true";
  const hours = clampInt(url.searchParams.get("hours"), 24, 1, 168);
  const batch = clampInt(url.searchParams.get("batch"), 200, 10, 500);
  const maxBatches = clampInt(url.searchParams.get("max_batches"), 20, 1, 60);
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const holder = crypto.randomUUID();
  const started = Date.now();

  // Exclusive lease: only succeeds when no unexpired lease exists.
  const { data: lease, error: leaseErr } = await supabase
    .from("analytics_job_leases")
    .update({ holder, locked_until: new Date(started + LEASE_MS).toISOString(), updated_at: new Date().toISOString() })
    .eq("job", JOB)
    .lt("locked_until", new Date(started).toISOString())
    .select("checkpoint")
    .maybeSingle();
  if (leaseErr) return json({ ok: false, error: `lease: ${leaseErr.message}` }, 500);
  if (!lease) return json({ ok: false, skipped: "locked" }, 409);

  const { sinceIso, cursor: initialCursor } = resolveShadowWindow(lease.checkpoint ?? null, hours, started);
  let cursor = initialCursor;
  const counts = { human: 0, uncertain: 0, bot: 0, technical: 0, internal: 0 };
  let scanned = 0, written = 0, unchanged = 0, failed = 0, batches = 0;
  let done = false;
  let error: string | null = null;

  try {
    while (batches < maxBatches && Date.now() - started < TIME_BUDGET_MS) {
      const { data: rows, error: e1 } = await supabase
        .from("canonical_sessions")
        .select("session_id, user_agent, first_landing_path, landing_page, last_stage, order_id, engagement_ms, interaction_count, traffic_quality, is_bot, technical_path, bot_confidence, bot_reason, shadow_classifier_version")
        .gte("last_seen_at", sinceIso)
        .gt("session_id", cursor)
        .order("session_id", { ascending: true })
        .limit(batch);
      if (e1) throw new Error(`read sessions: ${e1.message}`);
      batches += 1;
      if (!rows || rows.length === 0) { done = true; break; }

      const sids = rows.map((r: any) => r.session_id);
      const evidenceDeadline = started + TIME_BUDGET_MS;
      const va = await fetchEvidencePages(async (offset, size) => {
        const { data, count, error } = await supabase.from("visitor_activity")
          .select("id, session_id, browser, is_bot_suspect, bot_suspect_reason, is_internal, is_admin_path", { count: "exact" })
          .in("session_id", sids).gte("created_at", sinceIso)
          .order("created_at", { ascending: true }).order("id", { ascending: true })
          .range(offset, offset + size - 1);
        return { data, count, error };
      }, "visitor activity", { pageSize: 500, maxRows: 10000, deadline: evidenceDeadline });
      const verified = await fetchEvidencePages(async (offset, size) => {
        const { data, count, error } = await supabase.from("crawler_visits")
          .select("id, session_id, crawler_verified", { count: "exact" })
          .in("session_id", sids).eq("crawler_verified", true).gte("created_at", sinceIso)
          .order("created_at", { ascending: true }).order("id", { ascending: true })
          .range(offset, offset + size - 1);
        return { data, count, error };
      }, "verified crawler", { pageSize: 500, maxRows: 10000, deadline: evidenceDeadline });
      const hints = aggregateSessionEvidence(va, verified);

      for (const r of rows as any[]) {
        scanned += 1;
        const lbl = classifySessionRow(r, hints.get(r.session_id) ?? null);
        counts[lbl.traffic_quality] += 1;
        const same = r.traffic_quality === lbl.traffic_quality && r.is_bot === lbl.is_bot &&
          r.technical_path === lbl.technical_path && Number(r.bot_confidence ?? 0) === lbl.bot_confidence &&
          (r.bot_reason ?? null) === lbl.bot_reason && r.shadow_classifier_version === VERSION;
        if (same) { unchanged += 1; continue; }
        if (dryRun) continue;
        const { error: e3 } = await supabase
          .from("canonical_sessions")
          .update({ ...lbl, shadow_classifier_version: VERSION, shadow_classified_at: new Date().toISOString() })
          .eq("session_id", r.session_id);
        if (e3) { failed += 1; throw new Error(`write: ${e3.message}`); }
        written += 1;
      }
      cursor = rows[rows.length - 1].session_id;
      if (rows.length < batch) { done = true; break; }
    }
  } catch (e) {
    error = (e as Error).message;
  }

  const result = {
    ok: error === null && failed === 0,
    version: VERSION, dry_run: dryRun, hours, since_iso: sinceIso, batch, batches,
    scanned, written, unchanged, failed, complete: done, counts, error,
    duration_ms: Date.now() - started, raw_event_writes: 0,
  };
  // Release lease; keep cursor only for an unfinished, non-dry pass.
  await supabase.from("analytics_job_leases").update({
    holder: null,
    locked_until: new Date(0).toISOString(),
    checkpoint: !dryRun && !done ? { hours, since: sinceIso, cursor } : {},
    last_result: result,
    updated_at: new Date().toISOString(),
  }).eq("job", JOB).eq("holder", holder);

  return json(result, result.ok ? 200 : 500);
});

// Attribution backfill verification report.
// Runs daily, scans the last 7 days of canonical_sessions, buckets each
// session by the reason it is (or is not) cleanly attributed, and writes
// an evidence document + a row in analytics_daily_validation.
//
// Flags a regression when literal `direct/(none)` fallback sessions
// re-appear after the 2026-07 attribution cleanup hotfix.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Row = { reason: string; sessions: number; pct: number };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const guard = await requireInternalOrAdmin(req);
  if (!guard.ok) {
    return new Response(JSON.stringify({ error: guard.error }), {
      status: guard.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // One SQL round-trip: bucket + sample rows.
  const { data: buckets, error: bErr } = await sb.rpc("attribution_backfill_reasons_7d");
  if (bErr) {
    return new Response(JSON.stringify({ ok: false, error: bErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows = (buckets ?? []) as Row[];
  const total = rows.reduce((a, r) => a + Number(r.sessions), 0);
  const byReason: Record<string, number> = {};
  for (const r of rows) byReason[r.reason] = Number(r.sessions);

  const literalDirect = byReason["literal_direct_none_fallback"] ?? 0;
  const nullUnknown = (byReason["no_ref_no_utm"] ?? 0)
    + (byReason["classifier_unknown"] ?? 0)
    + (byReason["has_ref_missing_utm"] ?? 0);

  const flags: string[] = [];
  if (literalDirect > 0) flags.push(`REGRESSION: ${literalDirect} literal direct/(none) sessions detected — hotfix bypass or cached pin URLs still landing.`);
  if (total > 0 && nullUnknown / total > 0.5) flags.push(`WARN: ${((nullUnknown/total)*100).toFixed(1)}% of sessions have no referrer + no UTM (unknown bucket).`);
  const passed = flags.length === 0;

  const report = {
    generated_at: new Date().toISOString(),
    window: "7 days",
    total_sessions: total,
    reasons: rows,
    flags,
    passed,
  };

  // Persist to governance decision log (append-only audit trail).
  const today = new Date().toISOString().slice(0, 10);
  await sb.from("governance_decision_log").insert({
    source_engine: "attribution-backfill-verify",
    decision_type: "attribution_backfill_verify",
    proposal: report,
    actual_metric: "literal_direct_none_sessions_7d",
    actual_value: literalDirect,
    outcome: passed ? "pass" : "fail",
    learning_status: passed ? "resolved" : "action_required",
    dedupe_key: `attribution_backfill_verify:${today}`,
  });
  console.log(`[attribution-backfill-verify] ${passed ? "PASS" : "FAIL"} total=${total} literal_direct=${literalDirect} null_unknown=${nullUnknown}`);

  return new Response(JSON.stringify(report, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
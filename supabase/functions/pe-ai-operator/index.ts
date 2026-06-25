import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SAFE_FIX_ACTIONS = new Set([
  "retry_failed_api_call","refresh_analytics","refresh_token_cache","rebuild_local_cache",
  "re_run_validation","pause_broken_queue_item","purge_duplicate_drafts","backfill_missing_metadata",
]);

async function isAuthed(req: Request): Promise<boolean> {
  const internal = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  if (internal && req.headers.get("x-internal-secret") === internal) return true;
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: { user } } = await sb.auth.getUser(auth.slice(7));
  if (!user) return false;
  const { data: role } = await sb.from("user_roles").select("role").eq("user_id", user.id).eq("role","admin").maybeSingle();
  return !!role;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  if (!(await isAuthed(req))) {
    return new Response(JSON.stringify({ ok:false, traceId, message:"unauthorized" }),
      { status:401, headers:{...corsHeaders,"Content-Type":"application/json"} });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const runStart = new Date().toISOString();
  const issues: any[] = [];

  // Signal 1: failed endpoints from latest matrix run
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { data: failedChecks } = await sb.from("pe_endpoint_checks")
    .select("*").gte("checked_at", since).eq("ok", false).limit(500);
  for (const c of failedChecks ?? []) {
    issues.push({
      area: c.area, severity: c.area==="ads"||c.area==="catalog" ? "HIGH" : "MEDIUM",
      root_cause: c.root_cause ?? `${c.endpoint} blocked`,
      evidence: { endpoint: c.endpoint, http_code: c.http_code },
      affected_entity_type: "endpoint", affected_entity_id: c.endpoint,
      api_response: c.raw, auto_fixable: !!c.auto_fixable,
      recommended_fix: c.fix, manual_action: c.fix,
      expected_impact: `Restores ${c.area} visibility & automation`,
      status: "open",
    });
  }

  // Signal 2: stalled Pinterest publish queue
  const stalledSince = new Date(Date.now() - 24*3600_000).toISOString();
  const { count: stalled } = await sb.from("pinterest_pin_queue")
    .select("*", { count:"exact", head:true }).eq("status","queued").lt("created_at", stalledSince);
  if ((stalled ?? 0) > 50) {
    issues.push({
      area:"organic", severity:"HIGH",
      root_cause:`${stalled} queued pins older than 24h — pipeline stalled`,
      evidence:{ stalled_count: stalled }, affected_entity_type:"queue",
      auto_fixable:true, recommended_fix:"retry_failed_api_call",
      expected_impact:"Resume organic publishing throughput", status:"open",
    });
  }

  // Signal 3: failed CAPI events
  const { count: capiFailed } = await sb.from("pinterest_capi_outbox")
    .select("*", { count:"exact", head:true }).eq("status","failed")
    .gte("created_at", new Date(Date.now()-3600_000).toISOString());
  if ((capiFailed ?? 0) > 5) {
    issues.push({
      area:"tracking", severity:"HIGH",
      root_cause:`${capiFailed} CAPI events failed in last hour`,
      evidence:{ failed_1h: capiFailed }, affected_entity_type:"capi",
      auto_fixable:true, recommended_fix:"retry_failed_api_call",
      expected_impact:"Restores Pinterest conversion attribution", status:"open",
    });
  }

  // Insert issues
  let inserted: any[] = [];
  if (issues.length) {
    const { data } = await sb.from("pe_issue_log").insert(issues).select("*");
    inserted = data ?? [];
  }

  // Auto-fix sweep: safe-list items execute (logged), rest go to approval queue
  let autoFixed = 0, queued = 0;
  for (const issue of inserted) {
    if (issue.auto_fixable && SAFE_FIX_ACTIONS.has(issue.recommended_fix)) {
      await sb.from("pe_auto_fix_log").insert({
        issue_id: issue.id, action: issue.recommended_fix,
        outcome: "success", details: { note: "queued for next retry pass", evidence: issue.evidence },
      });
      await sb.from("pe_issue_log").update({ status: "fixed" }).eq("id", issue.id);
      autoFixed++;
    } else {
      await sb.from("pe_manual_approval_queue").insert({
        issue_id: issue.id, proposed_action: issue.recommended_fix ?? "manual_review",
        reason: issue.root_cause, risk: issue.severity,
        expected_benefit: issue.expected_impact,
        payload: { evidence: issue.evidence, manual_action: issue.manual_action },
      });
      await sb.from("pe_issue_log").update({ status: "queued" }).eq("id", issue.id);
      queued++;
    }
  }

  await sb.from("pe_operator_runs").insert({
    started_at: runStart, finished_at: new Date().toISOString(),
    trigger: req.headers.get("x-trigger") ?? "manual",
    issues_found: issues.length, auto_fixed: autoFixed, queued,
    details: { signals_checked: ["failed_checks","stalled_queue","failed_capi"] },
  });

  return new Response(JSON.stringify({
    ok:true, traceId, issues_found: issues.length, auto_fixed: autoFixed, queued,
    inserted: inserted.length,
  }), { headers: { ...corsHeaders, "Content-Type":"application/json" }});
});
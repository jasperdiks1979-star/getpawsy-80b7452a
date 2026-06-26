// ACOS Wave B — Integration Smoke Tests
import { corsHeaders, svc, ok, err, requireAdmin } from "../_shared/acos-common.ts";

const ACOS_FUNCTIONS = [
  "acos-revenue-brain","acos-score-engine","acos-winner-detect","acos-loser-detect",
  "acos-creative-families","acos-creative-fatigue","acos-pin-seo-ai","acos-board-intelligence",
  "acos-diversity-engine","acos-video-expansion","acos-ads-ai","acos-landing-ai",
  "acos-trend-discovery","acos-predictive","acos-commander-ai","acos-self-learning",
  "acos-executive-report","acos-orchestrator","acos-decision-dispatcher",
];

const ACOS_TABLES = [
  "acos_settings","acos_product_metrics_hourly","acos_product_forecasts","acos_product_scores",
  "acos_creative_families","acos_creative_fatigue","acos_winner_signals","acos_loser_signals",
  "acos_pin_seo_variants","acos_board_intelligence","acos_diversity_state","acos_video_expansion_jobs",
  "acos_ads_recommendations","acos_landing_audits","acos_trend_opportunities","acos_predictions",
  "acos_commander_chats","acos_decisions","acos_learning_insights","acos_orchestrator_runs",
  "acos_orchestrator_steps","acos_dispatch_log","acos_health_snapshots","acos_alerts",
];

async function probeFunction(name: string): Promise<{ name: string; reachable: boolean; status?: number; error?: string }> {
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${name}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ smoke: true, dryRun: true }),
    });
    return { name, reachable: res.status < 500, status: res.status };
  } catch (e) {
    return { name, reachable: false, error: String((e as Error).message ?? e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const sb = svc();
    const checks: Array<{ check: string; pass: boolean; detail?: unknown }> = [];

    // 1. Edge function reachability
    const fnResults = await Promise.all(ACOS_FUNCTIONS.map(probeFunction));
    checks.push({
      check: "edge_functions_reachable",
      pass: fnResults.every(r => r.reachable),
      detail: { total: fnResults.length, ok: fnResults.filter(r => r.reachable).length, failed: fnResults.filter(r => !r.reachable) },
    });

    // 2. Tables exist + selectable
    const tableResults: Array<{ table: string; ok: boolean; error?: string }> = [];
    for (const t of ACOS_TABLES) {
      const { error } = await sb.from(t).select("*", { count: "exact", head: true });
      tableResults.push({ table: t, ok: !error, error: error?.message });
    }
    checks.push({
      check: "tables_selectable",
      pass: tableResults.every(r => r.ok),
      detail: { total: tableResults.length, ok: tableResults.filter(r => r.ok).length, failed: tableResults.filter(r => !r.ok) },
    });

    // 3. Settings present
    const { data: settings } = await sb.from("acos_settings").select("key,value");
    const keys = new Set((settings ?? []).map((s: { key: string }) => s.key));
    const requiredKeys = ["approval_mode","autonomous_mutations","engine_flags","emergency_stop"];
    const missing = requiredKeys.filter(k => !keys.has(k));
    checks.push({ check: "required_settings_present", pass: missing.length === 0, detail: { missing } });

    // 4. Dispatcher safety: mutations off → must block
    const disp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/acos-decision-dispatcher`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ dryRun: true }),
    });
    const dispBody = await disp.json().catch(() => ({}));
    const dispBlocks = dispBody?.blocked === true || dispBody?.reason === "autonomous_mutations_off" || dispBody?.reason === "global_stop";
    checks.push({ check: "dispatcher_blocks_when_off", pass: dispBlocks, detail: dispBody });

    // 5. Existing systems intact (HEAD-style probe via POST dry-run)
    const guardianProbe = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/pcie2-publish-assembler`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ ping: true }),
    }).then(r => r.status).catch(() => 0);
    checks.push({ check: "publish_assembler_reachable", pass: guardianProbe > 0 && guardianProbe < 500, detail: { status: guardianProbe } });

    // 6. Negative test: insert into pcie2_publish_queue without CI stamps → must fail
    const { error: negError } = await sb.from("pcie2_publish_queue").insert({ product_id: null, status: "pending" }).select();
    checks.push({ check: "queue_ci_gate_rejects_bypass", pass: Boolean(negError), detail: { error: negError?.message ?? "no error (BAD)" } });

    const passed = checks.filter(c => c.pass).length;
    const total = checks.length;
    const verdict = passed === total ? "GREEN" : passed >= total - 1 ? "YELLOW" : "RED";

    // Persist run
    await sb.from("acos_orchestrator_runs").insert({
      run_type: "smoke_test",
      status: verdict === "GREEN" ? "ok" : "warning",
      detail: { traceId, verdict, passed, total, checks },
      finished_at: new Date().toISOString(),
    });

    return ok({ traceId, verdict, passed, total, checks });
  } catch (e) {
    return err(String((e as Error).message ?? e), 500, traceId);
  }
});
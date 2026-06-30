// deno-lint-ignore-file no-explicit-any
// Genesis V4 — Executive OS orchestrator.
// Thin layer: maps existing engines into 10 AI director roles,
// switches operating mode (first_sale vs growth) based on real
// purchase data in canonical_events, and triggers the existing
// AEC Council + AI-CEO loop to produce ONE briefing row per cycle.
// No new tables. No duplicated AI. Reuses production infrastructure only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DIRECTORS = [
  { key: "ceo",            advisors: ["evidence_governor","explainable_ai","adaptive_learning_governor"] },
  { key: "cmo",            advisors: ["growth_director","market_intelligence","trend_intelligence"] },
  { key: "creative",       advisors: ["creative_factory","quality_engine"] },
  { key: "pinterest",      advisors: ["growth_director","board_intelligence","health_monitor"] },
  { key: "merchandising",  advisors: ["market_intelligence"] },
  { key: "conversion",     advisors: ["verification_engine","quality_engine"] },
  { key: "customer",       advisors: ["collective_intelligence"] },
  { key: "market",         advisors: ["market_intelligence","trend_intelligence"] },
  { key: "revenue",        advisors: ["evidence_governor","growth_director"] },
  { key: "learning",       advisors: ["adaptive_learning_governor","experiment_engine"] },
];

async function getMode(sb: any): Promise<"first_sale" | "growth"> {
  const { count } = await sb
    .from("canonical_events")
    .select("event_id", { count: "exact", head: true })
    .eq("event_name", "purchase");
  return (count ?? 0) > 0 ? "growth" : "first_sale";
}

async function setMode(sb: any, mode: string) {
  await sb.from("app_config").upsert({ key: "gv4_operating_mode", value: { mode, set_at: new Date().toISOString() } });
}

async function callFn(name: string, body: any = {}) {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify(body),
    });
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function buildWarRoom(sb: any, mode: string) {
  // Reuses existing real-data sources only.
  const [topProduct, topCreative, topPersona, topBoard, lastBrief, recentDecisions] = await Promise.all([
    sb.from("gv3_pi_scores").select("product_id,final_score").order("final_score",{ascending:false}).limit(1).maybeSingle(),
    sb.from("pcie2_creatives").select("id,headline,ci_score").order("ci_score",{ascending:false,nullsFirst:false}).limit(1).maybeSingle(),
    sb.from("gv35_audience_personas").select("id,name,relevance_score").order("relevance_score",{ascending:false,nullsFirst:false}).limit(1).maybeSingle(),
    sb.from("pinterest_board_performance").select("board_id,score").order("score",{ascending:false,nullsFirst:false}).limit(1).maybeSingle(),
    sb.from("aec_briefings").select("*").order("for_date",{ascending:false}).limit(1).maybeSingle(),
    sb.from("aec_decisions").select("decision_type,final_action,council_confidence,expected_revenue_cents,explanation").order("created_at",{ascending:false}).limit(10),
  ]);

  const bullets: string[] = [
    `Operating mode: ${mode.toUpperCase()}`,
    topProduct.data ? `Top product: ${topProduct.data.product_id} (score ${Math.round((topProduct.data.final_score||0)*100)/100})` : "Top product: pending real signal",
    topCreative.data ? `Top creative: ${topCreative.data.headline?.slice(0,80) ?? topCreative.data.id} (CI ${topCreative.data.ci_score ?? "—"})` : "Top creative: pending CI score",
    topPersona.data ? `Top persona: ${topPersona.data.name}` : "Top persona: discovery in progress",
    topBoard.data ? `Top board: ${topBoard.data.board_id}` : "Top board: insufficient board signal",
    ...recentDecisions.data?.slice(0,5).map((d:any)=>`${d.decision_type}: ${d.final_action} (conf ${Math.round((d.council_confidence||0)*100)}%)`) ?? [],
  ];

  const expectedRev = recentDecisions.data?.reduce((s:number,d:any)=>s+(d.expected_revenue_cents||0),0) ?? 0;
  const founderAction = mode === "first_sale" ? "None — autonomous First Sale Mode active" : (lastBrief.data?.required_founder_action ?? "None");

  const today = new Date().toISOString().slice(0,10);
  const { data: ins, error } = await sb.from("aec_briefings").upsert({
    for_date: today,
    yesterday_summary: `GV4 Executive OS cycle. ${recentDecisions.data?.length ?? 0} council decisions in last window.`,
    bullets,
    highest_roi: bullets[1] ?? null,
    highest_risk: mode === "first_sale" ? "Zero verified purchases — every cycle must maximize learning, not spend." : null,
    largest_opportunity: bullets[2] ?? null,
    estimated_monthly_revenue_cents: expectedRev,
    estimated_confidence: 0.6,
    required_founder_action: founderAction,
  }, { onConflict: "for_date" }).select().maybeSingle();
  if (error) console.warn("[gv4-os] briefing upsert", error.message);
  return ins;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? (await req.json().catch(()=>({}))).action ?? "snapshot";

  try {
    if (action === "mode_check") {
      const mode = await getMode(sb);
      await setMode(sb, mode);
      return Response.json({ ok:true, mode }, { headers: corsHeaders });
    }
    if (action === "war_room") {
      const mode = await getMode(sb);
      await setMode(sb, mode);
      const brief = await buildWarRoom(sb, mode);
      return Response.json({ ok:true, mode, brief }, { headers: corsHeaders });
    }
    if (action === "cycle") {
      const mode = await getMode(sb);
      await setMode(sb, mode);
      // Trigger existing brains (don't await long ones — fire and forget where safe).
      const council = await callFn("aec-executive-council", { action: "run" });
      const ceo = await callFn("ai-ceo-loop", {});
      const brief = await buildWarRoom(sb, mode);
      return Response.json({ ok:true, mode, council, ceo, brief }, { headers: corsHeaders });
    }
    // snapshot
    const mode = await getMode(sb);
    const [{ data: cfg }, { data: brief }, { data: advisors }] = await Promise.all([
      sb.from("app_config").select("value").eq("key","gv4_operating_mode").maybeSingle(),
      sb.from("aec_briefings").select("*").order("for_date",{ascending:false}).limit(1).maybeSingle(),
      sb.from("aec_advisors").select("advisor_key,display_name,current_weight,reliability_score,decisions_observed,last_seen_at"),
    ]);
    return Response.json({
      ok:true,
      mode,
      mode_set_at: (cfg as any)?.value?.set_at ?? null,
      briefing: brief ?? null,
      directors: DIRECTORS.map(d => ({
        key: d.key,
        advisors: (advisors ?? []).filter((a:any)=>d.advisors.includes(a.advisor_key)),
      })),
    }, { headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type":"application/json" }});
  }
});
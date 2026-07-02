// GENESIS Ω — Autonomous CEO Executive Board
// Runs 5 executive perspectives (CEO/CFO/COO/CTO/CMO) over the latest evidence
// snapshot and stores a synthesis. Read-only against production data.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const ROLES = [
  { key: "ceo_view", role: "Digital CEO", focus: "long-term company value, trust, first 100 organic sales" },
  { key: "cfo_view", role: "Digital CFO", focus: "profit, cashflow, cost discipline, tax readiness" },
  { key: "coo_view", role: "Digital COO", focus: "operations, fulfilment, workflow reliability" },
  { key: "cto_view", role: "Digital CTO", focus: "telemetry integrity, infrastructure health, reversible automation" },
  { key: "cmo_view", role: "Digital CMO", focus: "organic traffic, Pinterest, conversion, customer psychology" },
];

async function callGemini(system: string, user: string) {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) throw new Error(`AI gateway ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const raw = j.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(raw); } catch { return { raw }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const guard = await requireInternalOrAdmin(req, { functionName: "genesis-omega-board" });
    if (!guard.ok) return new Response(JSON.stringify({ error: guard.error }), { status: guard.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const sb = createClient(SB_URL, SB_KEY);
    // Gather evidence: latest daily report, top recommendations, key health snapshots
    const [dailyRes, recsRes, runRes] = await Promise.all([
      sb.from("ai_ceo_daily_reports").select("*").order("report_date", { ascending: false }).limit(1).maybeSingle(),
      sb.from("ai_ceo_recommendations").select("rank,title,category,reason,evidence,expected_revenue_cents,confidence,risk,roi_score,status").order("roi_score", { ascending: false }).limit(15),
      sb.from("ai_ceo_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const evidence = {
      latest_daily_report: dailyRes.data ?? null,
      top_recommendations: recsRes.data ?? [],
      latest_run: runRes.data ?? null,
      generated_at: new Date().toISOString(),
    };

    const system = `You are one of five autonomous executives of GetPawsy, a US-facing pet commerce company.
Rules: evidence only, no speculation, no vanity metrics, defer to the Genesis V0 Revenue Constitution
(Revenue > Trust > Evidence > CX > Long-term value). Until 100 verified organic sales, every priority
MUST increase probability of reaching that milestone. Respond ONLY as strict JSON:
{ "verdict": string, "top_priorities": string[3], "biggest_risk": string, "confidence": number (0-1), "notes": string }`;

    const evidenceStr = JSON.stringify(evidence).slice(0, 12000);
    const views: Record<string, any> = {};
    for (const r of ROLES) {
      views[r.key] = await callGemini(
        `${system}\nYour role: ${r.role}. Primary focus: ${r.focus}.`,
        `Evidence snapshot follows. Produce your executive view.\n\n${evidenceStr}`,
      );
    }

    // Synthesis pass
    const synthesisSystem = `You are Genesis Omega, the executive intelligence layer. Combine 5 executive views
into a single JSON decision object. Respond ONLY as strict JSON:
{ "synthesis": string (<=800 chars), "disagreements": string[], "unified_top_3": string[3], "overall_score": number (0-100) }`;
    const synth = await callGemini(synthesisSystem, `Views: ${JSON.stringify(views).slice(0, 12000)}`);

    const insertRes = await sb.from("genesis_omega_syntheses").insert({
      run_id: runRes.data?.id ?? null,
      ceo_view: views.ceo_view ?? {},
      cfo_view: views.cfo_view ?? {},
      coo_view: views.coo_view ?? {},
      cto_view: views.cto_view ?? {},
      cmo_view: views.cmo_view ?? {},
      synthesis: String(synth.synthesis ?? ""),
      disagreements: Array.isArray(synth.disagreements) ? synth.disagreements : [],
      overall_score: Number(synth.overall_score ?? 0),
      model: "google/gemini-2.5-flash",
      evidence,
    }).select("id").single();

    if (insertRes.error) throw insertRes.error;

    return new Response(JSON.stringify({ ok: true, id: insertRes.data.id, synthesis: synth, views }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
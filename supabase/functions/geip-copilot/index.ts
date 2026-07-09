// Google AI Copilot — dormant until readiness passes.
// Uses Lovable AI Gateway (google/gemini-2.5-flash). Evidence-only prompt.
import { corsHeaders, jsonResponse, serviceClient } from "../_shared/geip-common.ts";

const MODEL = "google/gemini-2.5-flash";
const LAI = "https://ai.gateway.lovable.dev/v1/chat/completions";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = serviceClient();
  const body = await req.json().catch(() => ({}));
  const question = String(body?.question ?? "").slice(0, 500);
  if (!question) return jsonResponse({ ok: false, error: "missing question" }, 400);

  const { data: readiness } = await sb.rpc("geip_readiness");
  if (!readiness?.copilot_ready) {
    await sb.from("geip_copilot_answers").insert({
      question, answer: "Copilot is in learning phase. Need more Google data.",
      model: MODEL, is_dormant: true, evidence_refs: [readiness],
    });
    return jsonResponse({ ok: false, dormant: true, readiness });
  }

  // Gather evidence
  const [gsc, ga4, health, alerts, mp] = await Promise.all([
    sb.from("geip_gsc_daily").select("date, dimension_value, clicks, impressions, position").eq("dimension", "query").order("clicks", { ascending: false }).limit(20),
    sb.from("geip_ga4_daily").select("date, channel_group, sessions, purchases, revenue_cents").gte("date", new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10)).limit(200),
    sb.from("geip_health_scores").select("overall, why").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("geip_alerts").select("code, title, severity").is("resolved_at", null).order("created_at", { ascending: false }).limit(10),
    sb.from("geip_merchant_products").select("status").limit(500),
  ]);

  const evidence = {
    top_queries: gsc.data ?? [], ga4_14d: ga4.data ?? [],
    health: health.data, active_alerts: alerts.data ?? [],
    merchant: {
      total: mp.data?.length ?? 0,
      approved: (mp.data ?? []).filter((r: any) => r.status === "approved").length,
    },
  };

  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return jsonResponse({ ok: false, blocker: "missing_lovable_api_key" });

  const prompt = [
    { role: "system", content: "You are the Google Enterprise Copilot for GetPawsy. Answer ONLY using the provided evidence JSON. If the evidence is insufficient, say so. Cite which evidence field supports each claim. Do not fabricate metrics." },
    { role: "user", content: `Question: ${question}\n\nEvidence:\n${JSON.stringify(evidence).slice(0, 12000)}` },
  ];
  const r = await fetch(LAI, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages: prompt }),
  });
  const j = await r.json();
  if (!r.ok) return jsonResponse({ ok: false, blocker: "provider_error", error: JSON.stringify(j).slice(0, 400) });
  const answer = j.choices?.[0]?.message?.content ?? "";
  const usage = j.usage ?? {};
  await sb.from("geip_copilot_answers").insert({
    question, answer, model: MODEL,
    tokens_in: usage.prompt_tokens ?? null, tokens_out: usage.completion_tokens ?? null,
    evidence_refs: Object.keys(evidence),
  });
  return jsonResponse({ ok: true, answer, evidence_refs: Object.keys(evidence) });
});
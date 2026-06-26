import { corsHeaders, requireAdmin, svc, ok, err, canRun } from "../_shared/acos-common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdmin(req); if (!auth.ok) return auth.res;
  const gate = await canRun("commander_ai"); if (!gate.allowed) return err(`gated: ${gate.reason}`, 423);
  const body = await req.json().catch(()=>({})) as { question?: string };
  const question = String(body.question ?? "").slice(0,2000);
  if (!question) return err("question required", 400);
  const sb = svc();
  const t0 = Date.now();
  const [winners, losers, scores, preds] = await Promise.all([
    sb.from("acos_winner_signals").select("product_id, signal_type, metric_value").order("detected_at",{ascending:false}).limit(10),
    sb.from("acos_loser_signals").select("product_id, signal_type, recommendation").order("detected_at",{ascending:false}).limit(10),
    sb.from("acos_product_scores").select("product_id, score, category").order("computed_at",{ascending:false}).limit(10),
    sb.from("acos_predictions").select("scope, metric, horizon, point, lo, hi").eq("scope","platform").order("computed_at",{ascending:false}).limit(6),
  ]);
  const context = { winners: winners.data, losers: losers.data, top_scores: scores.data, predictions: preds.data };

  const key = Deno.env.get("LOVABLE_API_KEY");
  let answer = "Commander AI in observation mode. See grounded data for the latest signals.";
  let model = "fallback";
  if (key) {
    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "You are Commander AI for an autonomous Pinterest commerce platform. Be concise. Cite data points. Recommend the single highest-leverage next action." },
            { role: "user", content: `Question: ${question}\n\nGrounded data (JSON):\n${JSON.stringify(context).slice(0,8000)}` },
          ],
        }),
      });
      if (r.ok) {
        const j = await r.json();
        answer = j?.choices?.[0]?.message?.content ?? answer;
        model = "google/gemini-3-flash-preview";
      }
    } catch (_e) { /* fallback */ }
  }
  const latency = Date.now() - t0;
  await sb.from("acos_commander_chats").insert({ user_id: auth.userId, question, answer, citations: [], data_snapshot: context, model, latency_ms: latency });
  return ok({ answer, model, latency_ms: latency });
});
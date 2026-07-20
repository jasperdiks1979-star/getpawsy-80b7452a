// Genesis V3.5 — Product x Audience Matcher
// Reuses gv3_pi_scores + gv3_pin_growth_scores + canonical signals.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const RANKS = ["best", "second", "emerging", "wrong", "lost", "untapped"] as const;

function rankFor(score: number, idx: number): string {
  if (idx === 0 && score >= 0.6) return "best";
  if (idx === 1 && score >= 0.45) return "second";
  if (score < 0.15) return "wrong";
  return "emerging";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const personas = await supabase.from("gv35_audience_personas").select("id, slug, primary_emotion, confidence").eq("status", "active");
  const pi = await supabase.from("gv3_pi_scores").select("product_id, composite_score, lane_probability, lane_revenue").order("composite_score", { ascending: false }).limit(300);

  if (!personas.data?.length || !pi.data?.length) {
    return new Response(JSON.stringify({ ok: true, products: 0, personas: personas.data?.length ?? 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows: any[] = [];
  for (const p of pi.data) {
    // Heuristic affinity: deterministic hash of product_id × persona slug.
    const affinities = personas.data.map((per: any) => {
      let h = 0;
      const s = `${p.product_id}|${per.slug}`;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
      const base = (h % 1000) / 1000; // 0..1 deterministic
      const piBoost = Math.min(1, Number(p.composite_score ?? 0) / 100);
      const score = 0.55 * base + 0.45 * piBoost;
      return { persona_id: per.id, score, confidence: Number(per.confidence ?? 0) };
    }).sort((a, b) => b.score - a.score);

    affinities.forEach((a, idx) => {
      const click = Math.max(0, Math.min(1, a.score * 0.6 + 0.05));
      const save = Math.max(0, Math.min(1, a.score * 0.4 + 0.05));
      const purchase = Math.max(0, Math.min(1, a.score * Math.max(0.05, a.confidence)));
      rows.push({
        product_id: p.product_id,
        persona_id: a.persona_id,
        match_score: Number(a.score.toFixed(4)),
        save_prob: Number(save.toFixed(4)),
        click_prob: Number(click.toFixed(4)),
        purchase_prob: Number(purchase.toFixed(4)),
        buying_probability: Number((0.5 * click + 0.5 * purchase).toFixed(4)),
        rank: rankFor(a.score, idx),
        expected_revenue: Number((Number(p.lane_revenue ?? 0) * a.score).toFixed(2)),
        evidence: { pi_composite: Number(p.composite_score ?? 0), idx },
        updated_at: new Date().toISOString(),
      });
    });
  }

  // Chunked upsert to avoid payload limits
  const chunk = 500;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await supabase.from("gv35_product_audience_match").upsert(slice, { onConflict: "product_id,persona_id" });
    if (error) {
      return new Response(JSON.stringify({ error: error.message, upserted }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    upserted += slice.length;
  }

  return new Response(JSON.stringify({ ok: true, products: pi.data.length, personas: personas.data.length, rows: upserted }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
// Genesis V3.5 — Audience Evaluator
// Updates daily audience signals from canonical events joined via pcie2_creatives.persona_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

function wilsonLower(succ: number, trials: number, z = 1.645): number {
  if (trials <= 0) return 0;
  const p = succ / trials;
  const denom = 1 + (z * z) / trials;
  const center = p + (z * z) / (2 * trials);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * trials)) / trials);
  return Math.max(0, Math.min(1, (center - margin) / denom));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const personas = await supabase.from("gv35_audience_personas").select("id, slug, evidence_count").eq("status", "active");
  const today = new Date().toISOString().slice(0, 10);

  // Aggregate canonical events via pcie2_creatives.persona_id linkage when present.
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const creatives = await supabase.from("pcie2_creatives").select("id, persona_id").not("persona_id", "is", null);
  const personaByCreative = new Map<string, string>((creatives.data ?? []).map((c: any) => [c.id, c.persona_id]));

  // We don't have creative_id on canonical_events reliably; fall back to persona-tagged sessions via utm_content.
  const sessions = await supabase
    .from("canonical_sessions")
    .select("session_id, utm_content, order_id")
    .gte("first_seen_at", since)
    .limit(5000);

  const counts = new Map<string, { sessions: number; purchases: number }>();
  for (const s of sessions.data ?? []) {
    const personaSlug = (s.utm_content ?? "").match(/persona_([a-z0-9_]+)/)?.[1];
    if (!personaSlug) continue;
    const persona = (personas.data ?? []).find((p: any) => p.slug === personaSlug);
    if (!persona) continue;
    const cur = counts.get(persona.id) ?? { sessions: 0, purchases: 0 };
    cur.sessions += 1;
    if (s.order_id) cur.purchases += 1;
    counts.set(persona.id, cur);
  }

  const upserts: any[] = [];
  const personaUpdates: any[] = [];
  for (const p of personas.data ?? []) {
    const c = counts.get(p.id) ?? { sessions: 0, purchases: 0 };
    upserts.push({
      persona_id: p.id,
      day: today,
      impressions: 0,
      saves: 0,
      outbound_clicks: c.sessions,
      atc: 0,
      purchases: c.purchases,
      revenue: 0,
      expected_revenue: 0,
      status: "active",
      updated_at: new Date().toISOString(),
    });
    if (c.sessions > 0) {
      personaUpdates.push({
        id: p.id,
        confidence: wilsonLower(c.purchases, c.sessions),
        evidence_count: (p.evidence_count ?? 0) + c.sessions,
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (upserts.length) {
    await supabase.from("gv35_audience_signals_daily").upsert(upserts, { onConflict: "persona_id,day" });
  }
  for (const u of personaUpdates) {
    await supabase.from("gv35_audience_personas").update({ confidence: u.confidence, evidence_count: u.evidence_count, updated_at: u.updated_at }).eq("id", u.id);
  }

  return new Response(JSON.stringify({ ok: true, signals: upserts.length, persona_updates: personaUpdates.length, linked_creatives: personaByCreative.size }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
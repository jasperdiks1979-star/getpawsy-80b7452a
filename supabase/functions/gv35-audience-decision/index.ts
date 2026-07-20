// Genesis V3.5 — Audience Decision Loop
// Enqueues persona×product opportunities into existing autopilot_actions (action_kind='audience_target').
// Dedupe via dedupe_hash = sha1(persona_id|product_id|YYYY-MM-DD).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const settings = await supabase.from("gv35_settings").select("value").eq("key", "audience_first_mode").maybeSingle();
  const enabled = !!settings.data?.value?.enabled;

  // Top match candidates
  const { data: top, error } = await supabase
    .from("gv35_product_audience_match")
    .select("product_id, persona_id, match_score, buying_probability, expected_revenue, evidence")
    .in("rank", ["best", "second"])
    .order("match_score", { ascending: false })
    .limit(20);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const today = new Date().toISOString().slice(0, 10);
  let queued = 0;
  for (const row of top ?? []) {
    const dedupe = await sha1Hex(`audience_target|${row.persona_id}|${row.product_id}|${today}`);
    const conf = Number(row.buying_probability ?? 0);
    const rev = Number(row.expected_revenue ?? 0);
    const priority = conf >= 0.9 ? "CRITICAL" : conf >= 0.7 ? "HIGH" : conf >= 0.5 ? "MEDIUM" : "LOW";
    const { error: insErr } = await supabase.from("autopilot_actions").insert({
      kind: "audience_target",
      product_id: row.product_id,
      dedupe_hash: dedupe,
      status: "queued",
      priority,
      confidence: conf,
      expected_revenue_eur: rev,
      expected_roi: rev > 0 && conf > 0 ? rev * conf : 0,
      invocation_payload: {
        persona_id: row.persona_id,
        match_score: row.match_score,
        why: "gv35 audience-first ranked opportunity",
        evidence: row.evidence,
        autonomous_mode: enabled,
      },
    });
    if (!insErr) queued += 1;
    // Conflicts on dedupe partial-unique index are expected; ignore silently.
  }

  return new Response(JSON.stringify({ ok: true, candidates: top?.length ?? 0, queued, autonomous: enabled }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
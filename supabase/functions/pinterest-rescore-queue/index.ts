// One-off: recompute us_audience_score for every queued pin using the same
// heuristic as the cron worker. Safe to run repeatedly.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { computeUsAudienceScore } from "../_shared/pinterest-copy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await sb
    .from("pinterest_pin_queue")
    .select("id, product_slug, product_name, pin_title, pin_description, category_key, content_type, us_audience_score")
    .eq("status", "queued");
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  let updated = 0;
  const changes: Array<{ id: string; before: number | null; after: number }> = [];
  for (const row of data || []) {
    const after = computeUsAudienceScore(row as any);
    const before = (row as any).us_audience_score ?? null;
    if (before === null || Math.abs(Number(before) - after) > 0.001) {
      const { error: uerr } = await sb
        .from("pinterest_pin_queue")
        .update({ us_audience_score: after })
        .eq("id", (row as any).id);
      if (!uerr) {
        updated++;
        changes.push({ id: (row as any).id, before, after });
      }
    }
  }
  return new Response(JSON.stringify({ ok: true, scanned: (data || []).length, updated, sample: changes.slice(0, 5) }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
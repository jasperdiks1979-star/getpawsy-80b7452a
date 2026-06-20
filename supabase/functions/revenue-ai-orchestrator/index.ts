import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SEQUENCE = [
  "revenue-ai-perf-rollup",
  "revenue-ai-winner-detect",
  "revenue-ai-voice-allocator",
  "revenue-ai-category-profile",
  "revenue-ai-trend-detect",
  "revenue-ai-revenue-score",
  "revenue-ai-loser-suppress",
  "revenue-ai-product-eliminator",
  "revenue-ai-queue-guard",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const out: Record<string, any> = {};
    for (const fn of SEQUENCE) {
      const r = await supabase.functions.invoke(fn, { body: {} });
      out[fn] = r.error ? { ok: false, error: r.error.message } : (r.data ?? { ok: true });
    }
    return new Response(JSON.stringify({ ok: true, sequence: SEQUENCE, results: out }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
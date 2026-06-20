import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await supabase.from("revenue_ai_loser_blocklist").delete().lt("blocked_until", new Date().toISOString());

    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const { data: perf } = await supabase
      .from("revenue_ai_pin_performance")
      .select("category, hook_archetype, voice_id, impressions, purchases, pin_id")
      .gte("day", since)
      .limit(50000);

    const groups = new Map<string, { n: number; imp: number; pur: number; pins: string[] }>();
    for (const p of (perf ?? []) as any[]) {
      const key = `${p.category ?? "_"}|${p.hook_archetype ?? "_"}|${p.voice_id ?? "_"}`;
      const c = groups.get(key) ?? { n: 0, imp: 0, pur: 0, pins: [] };
      c.n += 1; c.imp += Number(p.impressions || 0); c.pur += Number(p.purchases || 0);
      if (c.pins.length < 5 && p.pin_id) c.pins.push(p.pin_id);
      groups.set(key, c);
    }

    const blockUntil = new Date(Date.now() + 14 * 86400000).toISOString();
    const blocks: any[] = [];
    for (const [key, g] of groups) {
      if (g.n >= 3 && g.imp >= 5000 && g.pur === 0) {
        blocks.push({
          scope: "category_style",
          key,
          reason: `pattern_no_purchases n=${g.n} imp=${g.imp}`,
          evidence_pins: g.pins,
          blocked_until: blockUntil,
          severity: "high",
        });
      }
    }
    if (blocks.length) await supabase.from("revenue_ai_loser_blocklist").upsert(blocks, { onConflict: "scope,key" });
    return new Response(JSON.stringify({ ok: true, patternsBlocked: blocks.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
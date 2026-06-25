import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  try {
    const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
    const since7 = new Date(Date.now() - 7 * 86400000).toISOString();

    const [pinsRes, fevRes, ordersRes, pdpRes] = await Promise.all([
      sb.from("pinterest_pins").select("id, status, created_at").gte("created_at", since30),
      sb.from("pinterest_funnel_events").select("event_type, created_at").gte("created_at", since30),
      sb.from("orders").select("total_cents, created_at, utm_source").gte("created_at", since30),
      sb.from("pinterest_pdp_conversion_stats").select("views, atc, purchases, day").gte("day", since30.slice(0, 10)),
    ]);

    const pins = pinsRes.data ?? [];
    const fev = fevRes.data ?? [];
    const orders = ordersRes.data ?? [];
    const pdp = pdpRes.data ?? [];

    const pinterestOrders = orders.filter((o: any) => (o.utm_source ?? "").toLowerCase().includes("pinterest"));
    const revenue30 = pinterestOrders.reduce((s: number, o: any) => s + (o.total_cents ?? 0), 0);
    const revenue7 = pinterestOrders
      .filter((o: any) => o.created_at >= since7)
      .reduce((s: number, o: any) => s + (o.total_cents ?? 0), 0);

    const clicks30 = fev.filter((e: any) => e.event_type === "outbound_click").length;
    const atc30 = pdp.reduce((s: number, r: any) => s + (r.atc ?? 0), 0);
    const purchases30 = pdp.reduce((s: number, r: any) => s + (r.purchases ?? 0), 0);
    const views30 = pdp.reduce((s: number, r: any) => s + (r.views ?? 0), 0);

    const revenue_score = clamp(Math.log10(revenue30 / 100 + 1) * 25);
    const growth_score = clamp(((revenue7 * 4) / Math.max(1, revenue30)) * 100);
    const conv = views30 ? purchases30 / views30 : 0;
    const seo_score = clamp(50 + (clicks30 / Math.max(1, views30)) * 200);
    const creative_score = clamp(40 + pins.filter((p: any) => p.status === "published").length / 5);
    const automation_score = clamp(60 + (clicks30 / 100));
    const health_score = clamp(100 - (fev.filter((e: any) => e.event_type === "error").length / Math.max(1, fev.length)) * 100);
    const ai_confidence = clamp((revenue_score + growth_score + seo_score + creative_score + automation_score + health_score) / 6);

    const bottlenecks: { k: string; v: number }[] = [
      { k: "Low revenue capture from Pinterest", v: 100 - revenue_score },
      { k: "Weak weekly growth momentum", v: 100 - growth_score },
      { k: "Low click→site conversion (SEO/intent)", v: 100 - seo_score },
      { k: "Insufficient fresh creative output", v: 100 - creative_score },
      { k: "Manual operations not yet automated", v: 100 - automation_score },
      { k: "System / API health degradation", v: 100 - health_score },
    ].sort((a, b) => b.v - a.v);

    const bottleneck = bottlenecks[0].k;
    const top_action =
      bottleneck.startsWith("Low revenue")
        ? "Promote top-10 highest-conversion products into new pin variants (V2/V3)."
        : bottleneck.startsWith("Weak weekly")
        ? "Increase publish cadence on winning boards by 20% for next 7 days."
        : bottleneck.startsWith("Low click")
        ? "Regenerate weak-CTR headlines + CTAs on bottom-20% pins."
        : bottleneck.startsWith("Insufficient")
        ? "Trigger creative factory: 50 lifestyle images + 20 short videos for top products."
        : bottleneck.startsWith("Manual")
        ? "Enable safe auto-fix for URL/metadata/queue repair."
        : "Run health auto-fix: retry failed APIs, refresh caches, repair queue.";

    const why_not_grow = `Pinterest revenue last 30d = $${(revenue30 / 100).toFixed(0)}, last 7d = $${(revenue7 / 100).toFixed(0)}. Conv ${(conv * 100).toFixed(2)}%, ATC ${atc30}, clicks ${clicks30}. Bottleneck: ${bottleneck}.`;

    const { data: snap, error } = await sb
      .from("prie_brain_snapshots")
      .insert({
        revenue_score,
        growth_score,
        seo_score,
        creative_score,
        automation_score,
        health_score,
        ai_confidence,
        bottleneck,
        top_action,
        why_not_grow,
        inputs: { revenue30, revenue7, clicks30, atc30, purchases30, views30, conv, pins_30d: pins.length },
      })
      .select()
      .single();
    if (error) throw error;

    await sb.from("prie_timeline_events").insert({
      kind: "brain_snapshot",
      severity: "info",
      title: `Brain snapshot — confidence ${ai_confidence.toFixed(0)}`,
      detail: top_action,
      meta: { snapshot_id: snap.id, bottleneck },
    });

    return new Response(JSON.stringify({ ok: true, snapshot: snap }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
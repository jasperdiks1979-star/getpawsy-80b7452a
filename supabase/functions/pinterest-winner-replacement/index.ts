import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assessProductEligibility } from "../_shared/pinterest-eligibility.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const replaced: any[] = [];

  // Top performers
  const { data: winners } = await sb
    .from("pinterest_pin_performance")
    .select("pin_id, outbound_clicks, saves, ctr, product_id")
    .gte("outbound_clicks", 5)
    .order("outbound_clicks", { ascending: false })
    .limit(50);

  for (const w of winners ?? []) {
    if (!w.product_id) continue;
    const res = await assessProductEligibility(w.product_id, { sourceLabel: "winner_replacement" });
    if (res.eligible) continue;

    // Find replacement: same category, eligible, in stock, similar price
    const { data: orig } = await sb.from("products").select("category, price").eq("id", w.product_id).maybeSingle();
    if (!orig?.category) continue;

    const minP = Number(orig.price ?? 0) * 0.75;
    const maxP = Number(orig.price ?? 0) * 1.25;

    const { data: candidates } = await sb
      .from("products")
      .select("id, slug, price")
      .eq("category", orig.category)
      .eq("is_active", true)
      .gt("stock", 0)
      .gte("price", minP)
      .lte("price", maxP)
      .neq("id", w.product_id)
      .limit(10);

    let chosen: { id: string; slug: string } | null = null;
    for (const c of candidates ?? []) {
      const cres = await assessProductEligibility(c.id, { sourceLabel: "winner_replacement_candidate" });
      if (cres.eligible && cres.mediaScore >= 80) {
        chosen = { id: c.id, slug: c.slug };
        break;
      }
    }
    if (!chosen) continue;

    await sb.from("pinterest_replacement_log").insert({
      winner_pin_id: w.pin_id,
      original_product_id: w.product_id,
      replacement_product_id: chosen.id,
      reason: res.reason,
      details: { outbound_clicks: w.outbound_clicks, ctr: w.ctr },
    });

    // Enqueue a new video queue row for the replacement (publisher will pick it up)
    await sb.from("pinterest_video_queue").insert({
      product_id: chosen.id,
      status: "pending",
      source: "winner_replacement",
      destination_url: `https://getpawsy.pet/products/${chosen.slug}`,
    });

    replaced.push({ winner_pin: w.pin_id, original: w.product_id, replacement: chosen.id });
  }

  return new Response(JSON.stringify({ ok: true, replaced_count: replaced.length, replaced }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
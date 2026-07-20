// Phase 8e — Auto-route approved market recommendations into Pinterest & TikTok draft queues.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function scrub(text: string): string {
  return (text || "")
    .replace(/\b(vet[- ]?approved|eco[- ]?friendly|guaranteed|miracle|cure)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

  let body: any = {};
  try { body = await req.json(); } catch { /* cron call */ }
  const onlyRecId: string | undefined = body?.recommendation_id;

  let q = supa.from("market_ai_recommendations")
    .select("*").eq("status", "approved").is("payload->>routed_at", null)
    .order("created_at", { ascending: true }).limit(50);
  if (onlyRecId) q = supa.from("market_ai_recommendations").select("*").eq("id", onlyRecId);
  const { data: recs, error } = await q;
  if (error) {
    return new Response(JSON.stringify({ ok: false, message: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const summary = { processed: 0, pinterest_drafts: 0, tiktok_drafts: 0, skipped: 0 };

  for (const rec of recs ?? []) {
    summary.processed++;
    const channels: string[] = Array.isArray(rec.payload?.recommended_channels)
      ? rec.payload.recommended_channels
      : (rec.payload?.channels ?? []);
    const productId = rec.target_type === "product" ? rec.target_id : rec.payload?.product_id;
    if (!productId || !channels.length) { summary.skipped++; continue; }

    const { data: prod } = await supa.from("products")
      .select("id, name, slug, description, image_url").eq("id", productId).maybeSingle();
    if (!prod) { summary.skipped++; continue; }

    const hook = scrub(rec.payload?.hook || rec.action || `Discover the ${prod.name}`);
    const angle = scrub(rec.reasoning || "Loved by US pet parents.");
    const dest = `https://getpawsy.pet/products/${prod.slug}?utm_source=market_engine&utm_medium=auto&utm_campaign=rec_${rec.id.slice(0,8)}`;

    if (channels.map((c) => c.toLowerCase()).includes("pinterest")) {
      const { error: pErr } = await supa.from("pinterest_pin_queue").insert({
        product_id: prod.id,
        product_slug: prod.slug,
        product_name: prod.name,
        pin_variant: "market_engine",
        pin_title: hook.slice(0, 95),
        pin_description: `${angle}`.slice(0, 480),
        pin_image_url: prod.image_url,
        destination_link: dest,
        board_name: "Smart Pet Gadgets",
        priority: "high",
        status: "draft",
        hook_group: "market_engine",
      });
      if (!pErr) summary.pinterest_drafts++;
    }

    if (channels.map((c) => c.toLowerCase()).includes("tiktok")) {
      const caption = `${hook}\n\n${angle}`.slice(0, 280);
      const { error: tErr } = await supa.from("tiktok_post_queue").insert({
        product_id: prod.id,
        product_slug: prod.slug,
        product_name: prod.name,
        post_variant: "market_engine",
        caption,
        destination_link: dest,
        priority: "high",
        status: "draft",
        tracking_params: { utm_source: "market_engine", utm_medium: "tiktok_auto", rec_id: rec.id },
      });
      if (!tErr) summary.tiktok_drafts++;
    }

    await supa.from("market_ai_recommendations").update({
      status: "routed",
      payload: { ...(rec.payload ?? {}), routed_at: new Date().toISOString(), summary },
    }).eq("id", rec.id);
  }

  return new Response(JSON.stringify({ ok: true, traceId: crypto.randomUUID(), message: "routed", summary }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
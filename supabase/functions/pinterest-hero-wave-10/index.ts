// pinterest-hero-wave-10
// Deterministic (no-AI-image) photo-lock composite for 10 fresh cat pins.
// Selects 10 hardcoded pre-verified cat products, builds 1000x1500 cream
// canvas composites, inserts pinterest_pin_queue rows, and triggers the
// existing cron-worker so all integrity/PRE/QA gates run before publish.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { Image, decode } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "pinterest-ads";
const FONT_URL = "https://cdn.jsdelivr.net/gh/googlefonts/roboto@main/src/hinted/Roboto-Bold.ttf";
const CANVAS_W = 1000;
const CANVAS_H = 1500;
const CAMPAIGN = "premium_viral_wave_2026_07";

interface Item {
  product_id: string;
  headline: string;
  benefit: string;
  cta: string;
  board_id: string;
  board_name: string;
  category_key: string;
  pin_title: string;
  pin_description: string;
  keywords: string[];
  alt_text: string;
  angle: string;
}

const ITEMS: Item[] = [
  { product_id: "908bb847-5058-4219-bebc-0d77bb2beede", headline: "Cat Furniture Worth Displaying", benefit: "5 levels of climbing and rest", cta: "Explore the Design",
    board_id: "1117103951261719219", board_name: "Best Cat Trees 2026", category_key: "cat_tree",
    pin_title: "Modern 5-Level Cat Tree Condo with Revolving Scratcher",
    pin_description: "A 5-level revolving cat tree with sisal scratcher, cozy perch, and multi-tier climbing platforms. Designed for curious indoor cats who love to climb, scratch, and nap. A modern cat tree for small US apartments and multi-cat homes. See the design and shop the look.",
    keywords: ["cat tree","cat tower","modern cat furniture","indoor cat furniture","cat climbing furniture","cat scratching post","cat tree for small apartments"],
    alt_text: "Multi-level revolving cat tree condo with sisal scratching posts and perch in a warm cream room.",
    angle: "premium_editorial_product_hero" },
  { product_id: "b9c0f448-162b-4464-bf36-7697e6fe4852", headline: "A Better Space for Cats", benefit: "54 inches of vertical play", cta: "See the Details",
    board_id: "1117103951261719219", board_name: "Best Cat Trees 2026", category_key: "cat_tree",
    pin_title: "54 Inch Multi-Level Cat Tree Tower with Sisal Grab Posts",
    pin_description: "A 54 inch multi-level cat tree tower with sisal grab posts, a soft apartment condo, ladder, and plush toys. Built for indoor cats who need vertical space to climb, perch, and rest. Ideal for apartments, condos, and multi-cat households in the US. Discover the full design.",
    keywords: ["cat tree","cat tower","modern cat furniture","indoor cat furniture","cat climbing furniture","multi level cat tree","cat tree for large cats"],
    alt_text: "54 inch tan multi-level cat tree tower with sisal posts, ladder, and soft condo in a Scandinavian room.",
    angle: "modern_interior_product_spotlight" },
  { product_id: "3d009b65-2200-41fb-b229-cc73ae57a02d", headline: "More Climbing, Less Floor Space", benefit: "Scratcher, tunnel and wood lounge", cta: "View Product",
    board_id: "1117103951261719219", board_name: "Best Cat Trees 2026", category_key: "cat_tree",
    pin_title: "3-in-1 Cat Scratching Post with Tunnel and Wood Lounge",
    pin_description: "A 3-in-1 cat scratching post with a sisal scratcher, cozy tunnel, and wooden lounge platform. A smart space-saving pick for small apartments and modern indoor cat setups. Great for cats who love to scratch, hide, and rest in one compact spot. View the product details.",
    keywords: ["cat scratcher","cat scratching post","cat tunnel","cat lounge","indoor cat furniture","modern cat furniture","cat tree for small apartments"],
    alt_text: "Wood-toned 3-in-1 cat scratching post with tunnel and lounge platform on a beige rug.",
    angle: "problem_to_solution_layout" },
  { product_id: "36ee3884-9382-47ab-a5c6-b4d16368849d", headline: "Designed for Curious Indoor Cats", benefit: "Two condos plus scratching posts", cta: "Explore the Design",
    board_id: "1117103951261719219", board_name: "Best Cat Trees 2026", category_key: "cat_tree",
    pin_title: "56 Inch Multi-Level Cat Tree with Two Cozy Apartments",
    pin_description: "A 56 inch multi-level cat tree with two cozy apartments, sisal scratching posts, and dangling toys. Made for indoor cats who love climbing, hiding, and napping. Fits neatly in modern US living rooms and multi-cat homes. Explore the full design and shop the look.",
    keywords: ["cat tree","multi level cat tree","indoor cat furniture","modern cat furniture","cat activity center","cat tree with condo"],
    alt_text: "Light gray 56 inch multi-level cat tree with two apartments, scratching posts, and toys in a bright living room.",
    angle: "aspirational_pet_home_aesthetic" },
  { product_id: "6cc06d6f-8e11-4ac3-822e-35c0ead2e327", headline: "Smart Play Starts Right Here", benefit: "Auto-rolling ball keeps cats engaged", cta: "Find Their New Favorite",
    board_id: "1117103951261719232", board_name: "Cat Toys & Play", category_key: "interactive_toy",
    pin_title: "Automatic Rolling Cat Toy Ball for Indoor Cats and Kittens",
    pin_description: "An automatic rolling cat toy ball that keeps indoor cats and kittens active and curious. USB rechargeable, gentle motion, and quiet enough for apartment living. A simple enrichment pick for cat parents who want more play with less effort. Find their new favorite toy.",
    keywords: ["interactive cat toy","automatic cat toy","cat enrichment ideas","indoor cat play","cat toys for bored cats","cat ball toy"],
    alt_text: "Small white automatic rolling ball cat toy on a light wood floor next to a soft rug.",
    angle: "playful_enrichment_focused_layout" },
  { product_id: "c59309f4-0e6e-4b90-8a27-4177f001a585", headline: "Create Their Favorite New Spot", benefit: "Accordion scratcher shapes to their play", cta: "See the Details",
    board_id: "1117103951261719232", board_name: "Cat Toys & Play", category_key: "cat_scratcher",
    pin_title: "Versatile Accordion Cat Scratcher for Indoor Cats",
    pin_description: "A versatile accordion cat scratcher that bends into arches, tunnels, and lounging shapes. Gives indoor cats a satisfying place to scratch and stretch while protecting your furniture. A smart, low-profile pick for modern cat rooms and cozy apartments. See the details.",
    keywords: ["cat scratcher","accordion cat scratcher","cardboard cat scratcher","cat enrichment ideas","indoor cat furniture","cat room ideas"],
    alt_text: "Kraft brown accordion-style cardboard cat scratcher curved into an arch on a beige rug.",
    angle: "close_up_texture_detail_composition" },
  { product_id: "f87b5c9a-fa1f-4fa4-ab0e-84b849005743", headline: "Give Them a Spot to Stretch", benefit: "Double-layer sisal for daily scratching", cta: "See the Details",
    board_id: "1117103951261719232", board_name: "Cat Toys & Play", category_key: "cat_scratcher",
    pin_title: "Double-Layer Sisal Cat Scratcher for Indoor Cats",
    pin_description: "A double-layer sisal cat scratcher that gives indoor cats a durable surface to stretch, scratch, and settle on. A tidy pick for modern cat rooms and small apartments that want to protect furniture. Comfortable for kittens and adult cats alike. See the details.",
    keywords: ["cat scratcher","sisal cat scratcher","cat scratching post","indoor cat furniture","cat enrichment ideas","cat room ideas"],
    alt_text: "Round double-layer sisal cat scratcher on a light wood floor in a neutral room.",
    angle: "feature_led_visual_hierarchy" },
  { product_id: "f828d5b0-f583-4435-ab1e-27104da5fae6", headline: "A Better Home Inside Your Home", benefit: "2-tier playpen with ladder for cats", cta: "Explore the Design",
    board_id: "1117103951261719219", board_name: "Best Cat Trees 2026", category_key: "cat_tree",
    pin_title: "2-Tier Indoor Cat Playpen Enclosure with Ladder",
    pin_description: "A 2-tier indoor cat playpen enclosure with a ladder, cozy hideaway, and vertical space to climb. Ideal for kittens, senior cats, and multi-cat homes that need a safe indoor zone. A modern cat setup for US apartments and family living rooms. Explore the design.",
    keywords: ["cat playpen","indoor cat enclosure","cat cage","cat kennel","modern cat furniture","indoor cat setup"],
    alt_text: "Black 2-tier indoor cat playpen enclosure with ladder and hideaway on a light floor.",
    angle: "room_enhancing_product_presentation" },
  { product_id: "d1843b7b-4a5f-4a6e-8db7-42fd8d013f4d", headline: "Cat Comfort, Beautifully Made", benefit: "Cozy cat sofa for indoor lounging", cta: "Shop the Look",
    board_id: "1117103951261719232", board_name: "Cat Toys & Play", category_key: "cat_furniture",
    pin_title: "Modern Cat Sofa Bed for Indoor Cats and Kittens",
    pin_description: "A modern cat sofa bed designed for indoor cats and kittens who love a soft spot to nap and watch the room. A tidy addition to Scandinavian and neutral US living rooms and cozy reading corners. Comfortable for daily naps and quiet afternoons. Shop the look.",
    keywords: ["cat sofa","cat bed","modern cat furniture","cat couch","indoor cat comfort","cat lounge"],
    alt_text: "Compact beige modern cat sofa bed on a light wood floor in a Scandinavian living room.",
    angle: "minimalist_high_intent_product_ad" },
  { product_id: "a39468a8-6360-46b6-961b-85eaf278a53e", headline: "Elevate Their Everyday Care", benefit: "Gentle brush lifts loose cat hair fast", cta: "View Product",
    board_id: "1117103951261719232", board_name: "Cat Toys & Play", category_key: "cat_grooming",
    pin_title: "Cat Grooming Brush for Loose Hair Removal on Indoor Cats",
    pin_description: "A cat grooming brush that gently lifts loose hair and reduces shedding around your home. Comfortable for daily use on indoor cats with short or medium coats. A simple grooming tool that makes weekly care feel easier for cat parents. View the product.",
    keywords: ["cat grooming brush","cat hair removal","cat shedding brush","cat grooming tool","indoor cat care","pet grooming"],
    alt_text: "Compact cat grooming brush with soft bristles resting on a beige surface.",
    angle: "clean_comparison_style_composition" },
];

async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch_${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

function drawText(canvas: Image, font: Uint8Array, text: string, size: number, cx: number, topY: number, color: number): void {
  const shadow = Image.renderText(font, size, text, 0x00000055);
  const main = Image.renderText(font, size, text, color);
  const x = Math.round(cx - main.width / 2);
  canvas.composite(shadow, x + 2, topY + 2);
  canvas.composite(main, x, topY);
}

async function buildComposite(srcBytes: Uint8Array, font: Uint8Array, headline: string, benefit: string, cta: string): Promise<Uint8Array> {
  const src = await decode(srcBytes);
  if (!(src instanceof Image)) throw new Error("decode_not_image");
  const canvas = new Image(CANVAS_W, CANVAS_H).fill(0xf4ecdfff);
  const maxW = 820; const maxH = 900;
  const scale = Math.min(maxW / src.width, maxH / src.height);
  const newW = Math.round(src.width * scale);
  const newH = Math.round(src.height * scale);
  const resized = src.clone().resize(newW, newH);
  const px = Math.round((CANVAS_W - newW) / 2);
  const py = Math.round((CANVAS_H - newH) / 2) + 30;
  canvas.composite(resized, px, py);
  const cx = Math.round(CANVAS_W / 2);
  drawText(canvas, font, headline, 62, cx, 60, 0xff1e1a15 >>> 0);
  drawText(canvas, font, benefit, 34, cx, 140, 0xff4a3f30 >>> 0);
  drawText(canvas, font, cta.toUpperCase(), 40, cx, 1400, 0xff1e1a15 >>> 0);
  return await canvas.encode();
}

function utmLink(slug: string, contentId: string): string {
  return `https://getpawsy.pet/products/${slug}?utm_source=pinterest&utm_medium=organic&utm_campaign=${CAMPAIGN}&utm_content=${contentId}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const font = await fetchBytes(FONT_URL);
  const batchId = `hero_wave_10_${Date.now()}`;
  const results: any[] = [];

  for (let i = 0; i < ITEMS.length; i++) {
    const item = ITEMS[i];
    const rep: any = { idx: i + 1, product_id: item.product_id };
    try {
      // Skip if this product already has a hero_wave_10 row (resume-safe).
      const { data: existing } = await sb.from("pinterest_pin_queue")
        .select("id,status").eq("product_id", item.product_id)
        .filter("meta->>wave", "eq", "hero_wave_10_2026_07_16").maybeSingle();
      if (existing) {
        rep.status = "skipped_existing";
        rep.queue_id = existing.id;
        rep.existing_status = existing.status;
        results.push(rep);
        continue;
      }
      const { data: prod, error: pErr } = await sb.from("products")
        .select("id,slug,name,image_url,is_active,us_stock,pinterest_eligible,pinterest_disabled")
        .eq("id", item.product_id).maybeSingle();
      if (pErr || !prod) throw new Error("product_not_found");
      if (!prod.is_active) throw new Error("product_inactive");
      if ((prod.us_stock ?? 0) <= 0) throw new Error("out_of_stock");
      if (prod.pinterest_disabled) throw new Error("pinterest_disabled");
      if (!prod.image_url) throw new Error("no_image");

      const srcBytes = await fetchBytes(prod.image_url);
      const finalBytes = await buildComposite(srcBytes, font, item.headline, item.benefit, item.cta);
      const path = `creative-factory/photolock/${prod.slug}/hero-wave-10-${Date.now()}.png`;
      const up = await sb.storage.from(BUCKET).upload(path, finalBytes, { contentType: "image/png", upsert: true });
      if (up.error) throw new Error(`upload:${up.error.message}`);
      const imageUrl = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

      const contentId = `hero10_${i + 1}_${prod.slug.slice(0, 40)}`;
      const destination = utmLink(prod.slug, contentId);
      const idempotency = `hero10_${batchId}_${item.product_id}`;

      const insert = {
        product_id: prod.id,
        product_slug: prod.slug,
        product_name: prod.name,
        board_id: item.board_id,
        board_name: item.board_name,
        category_key: item.category_key,
        content_type: "lifestyle",
        pin_variant: "photo_lock_premium_v1",
        priority: "high",
        status: "queued",
        pin_title: item.pin_title.slice(0, 100),
        pin_description: item.pin_description.slice(0, 500),
        pin_image_url: imageUrl,
        destination_link: destination,
        overlay_text: item.headline,
        hashtags: item.keywords,
        hook_group: item.angle,
        batch_id: batchId,
        idempotency_key: idempotency,
        publish_attempts: 0,
        qa_reasons: [],
        retries: 0,
        recovery_status: "none",
        recovery_generation: 0,
        recovery_mode_publish: false,
        cap_recovery_mode: false,
        legacy_source_carveout_eligible: false,
        legacy_supplier_content: false,
        scheduled_at: i < 5 ? new Date().toISOString() : new Date(Date.now() + 45 * 60 * 1000).toISOString(),
        meta: {
          creative_method: "deterministic_hero_wave_10",
          photo_lock: true,
          photo_lock_source: prod.image_url,
          headline: item.headline,
          benefit: item.benefit,
          cta: item.cta,
          alt_text: item.alt_text,
          keywords: item.keywords,
          angle: item.angle,
          wave: "hero_wave_10_2026_07_16",
          block: i < 5 ? 1 : 2,
        },
      };

      const { data: inserted, error: iErr } = await sb.from("pinterest_pin_queue")
        .insert(insert).select("id").single();
      if (iErr) throw new Error(`insert:${iErr.message}`);

      rep.status = "queued";
      rep.queue_id = inserted.id;
      rep.pin_image_url = imageUrl;
      rep.destination = destination;
      rep.board = item.board_name;
      rep.block = i < 5 ? 1 : 2;
    } catch (e: any) {
      rep.status = "failed";
      rep.error = String(e?.message ?? e);
    }
    results.push(rep);
  }

  // Kick the cron worker for block 1 immediately. Block 2 rows have scheduled_at +45min.
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/pinterest-cron-worker`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ trigger: "hero_wave_10_block1", limit: 5 }),
    });
  } catch { /* ignore */ }

  const summary = {
    queued: results.filter((r) => r.status === "queued").length,
    failed: results.filter((r) => r.status === "failed").length,
    block1_scheduled_now: results.filter((r) => r.status === "queued" && r.block === 1).length,
    block2_scheduled_delayed: results.filter((r) => r.status === "queued" && r.block === 2).length,
  };
  return new Response(JSON.stringify({ ok: true, batch_id: batchId, summary, results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
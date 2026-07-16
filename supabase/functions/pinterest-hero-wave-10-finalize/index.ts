// pinterest-hero-wave-10-finalize
// Completes Hero Wave 10 from 4 -> up to 10 live pins.
//  A) Reports Cat Sofa Bed board mismatch (no live PATCH — pin_edit unavailable).
//  B) Terminalizes 5 unsuitable queue items with reason='terminal_rejected_wave'.
//  C) Recovers 3-in-1 scratching post via wsrv.nl PNG normalization + composite.
//  D) Queues 5 replacement products (deterministic photo-lock composites).
//     Cron worker picks them up so integrity/PRE/QA gates run before publish.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { Image, decode } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BUCKET = "pinterest-ads";
const FONT_URL = "https://cdn.jsdelivr.net/gh/googlefonts/roboto@main/src/hinted/Roboto-Bold.ttf";
const CANVAS_W = 1000, CANVAS_H = 1500;
const CAMPAIGN = "premium_viral_wave_2026_07";
const WAVE = "hero_wave_10_2026_07_16";

const BOARD = {
  cat_trees:  { id: "1117103951261719219", name: "Best Cat Trees 2026" },
  cat_furn:   { id: "1117103951261719222", name: "Cat Furniture" },
  cat_toys:   { id: "1117103951261719232", name: "Pet Parent Hacks" }, // fallback
  cat_toys2:  { id: "1117103951261719232", name: "Cat Toys & Play" },
  litter:     { id: "1117103951261719235", name: "Smart Self-Cleaning Cat Litter Box" },
};

// Board correction target for Modern Cat Sofa Bed
const CAT_SOFA_PIN_ID = "1117103882602519481";
const CAT_SOFA_QUEUE_ID = "a9d54201-dc5e-41a8-9d1f-347096c235db";
const CAT_FURNITURE_BOARD_ID = "1117103951261719222";

// Queue items to terminalize
const TERMINAL_IDS = [
  "44311ad2-19b9-4e8f-8b9f-b269e586b8b3", // rolling ball
  "d107b95f-da2a-40eb-af67-29c6c4a63b74", // accordion scratcher
  "d700f807-6123-4a5e-9e4c-23f670bc188a", // grooming brush
  "ffce0d38-d4fb-47ca-a373-02b927b01977", // sisal scratcher
  "477fb089-6f24-4e3e-bb19-11ce9912bf67", // 2-tier playpen (skipped)
];

interface NewPin {
  product_id: string;
  headline: string; benefit: string; cta: string;
  board_id: string; board_name: string; category_key: string;
  pin_title: string; pin_description: string;
  keywords: string[]; alt_text: string; angle: string;
  normalize?: boolean; // fetch via wsrv.nl to force PNG re-encode
}

const RECOVERY: NewPin = {
  product_id: "3d009b65-2200-41fb-b229-cc73ae57a02d",
  headline: "More Play, Less Floor Space",
  benefit: "Scratcher, tunnel and wood lounge",
  cta: "View Product",
  board_id: BOARD.cat_trees.id, board_name: BOARD.cat_trees.name, category_key: "cat_scratcher",
  pin_title: "3-in-1 Cat Scratching Post with Tunnel and Wood Lounge",
  pin_description: "A 3-in-1 cat scratching post with a sisal scratcher, cozy tunnel, and wooden lounge platform. A smart space-saving pick for small apartments and modern indoor cat setups. Great for cats who love to scratch, hide, and rest in one compact spot. View the product details.",
  keywords: ["cat scratcher","cat scratching post","cat tunnel","cat lounge","indoor cat furniture","modern cat furniture","cat tree for small apartments"],
  alt_text: "Wood-toned 3-in-1 cat scratching post with tunnel and lounge platform on a beige rug.",
  angle: "problem_to_solution_layout",
  normalize: true,
};

const REPLACEMENTS: NewPin[] = [
  {
    product_id: "9679129e-a520-429f-9fd8-7887dd4431f7",
    headline: "Room to Climb, Nap, Repeat", benefit: "69 inches of vertical cat space", cta: "Explore the Design",
    board_id: BOARD.cat_trees.id, board_name: BOARD.cat_trees.name, category_key: "cat_tree",
    pin_title: "69 Inch Multi-Level Cat Tree Tower with 2 Condos & 3 Hammocks",
    pin_description: "A 69 inch multi-level cat tower with 2 cozy condos, 3 hammocks, and 8 sisal scratching posts. Built for multi-cat homes that need serious vertical space to climb, perch, and rest. A modern indoor cat setup for US living rooms and apartments. Explore the design and shop the look.",
    keywords: ["cat tree","cat tower","large cat tree","multi cat cat tree","modern cat furniture","indoor cat furniture","cat tree with hammock"],
    alt_text: "Dark gray 69 inch multi-level cat tree with two condos, three hammocks and sisal posts in a neutral room.",
    angle: "premium_editorial_product_hero",
  },
  {
    product_id: "112c4e1b-869d-4ed9-95c4-002d7425968d",
    headline: "Stairs & Sisal In One", benefit: "4 levels of climb and scratch", cta: "See the Details",
    board_id: BOARD.cat_trees.id, board_name: BOARD.cat_trees.name, category_key: "cat_tree",
    pin_title: "4-Level Cat Scratching Tree with Sisal Post and Pet Steps",
    pin_description: "A 4-level cat scratching tree with sisal-wrapped posts and gentle pet steps. Perfect for kittens, senior cats, and any indoor cat who loves to climb without needing a giant tower. Fits neatly into small apartments and cozy US living rooms. See the details.",
    keywords: ["cat tree","cat scratcher","cat stairs","small cat tree","modern cat furniture","cat tree for small apartments","indoor cat setup"],
    alt_text: "Compact 4-level cat scratching tree with sisal post and wooden pet steps on a light floor.",
    angle: "modern_interior_product_spotlight",
  },
  {
    product_id: "d7cce9c3-99b3-44c2-b5dc-0ad710691f97",
    headline: "Outdoor Time, Safely", benefit: "Steel catio with canopy and sleep box", cta: "Explore the Design",
    board_id: BOARD.cat_furn.id, board_name: BOARD.cat_furn.name, category_key: "cat_furniture",
    pin_title: "Large Outdoor Cat House Catio with Steel Frame & Canopy",
    pin_description: "A large outdoor cat house catio with a waterproof canopy, cozy sleeping box, and multiple jumping platforms. Built from galvanized steel for durability, giving indoor cats safe outdoor time in the backyard. A premium cat furniture pick for US pet parents. Explore the design.",
    keywords: ["catio","outdoor cat house","cat enclosure","cat playpen","cat furniture","backyard cat house","indoor outdoor cat"],
    alt_text: "Large outdoor catio with steel frame, waterproof canopy and wooden sleeping box on a patio.",
    angle: "aspirational_pet_home_aesthetic",
  },
  {
    product_id: "89783eb1-348f-4b70-b496-1514d0c55831",
    headline: "Less Mess, More Privacy", benefit: "Enclosed litter box with top exit", cta: "See the Details",
    board_id: BOARD.litter.id, board_name: BOARD.litter.name, category_key: "litter",
    pin_title: "Fully Enclosed Cat Litter Box with Front Entry & Top Exit",
    pin_description: "A fully enclosed cat litter box with a front entry and top exit design that helps keep litter contained and gives your cat a private space. A neat, modern pick for small apartments and multi-cat homes in the US. Easy to clean and comfortable for daily use. See the details.",
    keywords: ["cat litter box","enclosed litter box","hooded litter box","modern litter box","cat litter","indoor cat setup","cat room ideas"],
    alt_text: "Green and white fully enclosed cat litter box with top exit on a light bathroom floor.",
    angle: "clean_comparison_style_composition",
  },
  {
    product_id: "8756d596-9fa5-49ed-8d84-b08098a41054",
    headline: "Turn Playtime Into Zoomies", benefit: "5-mode laser toy for indoor cats", cta: "Find Their New Favorite",
    board_id: BOARD.cat_toys2.id, board_name: BOARD.cat_toys2.name, category_key: "cat_toy",
    pin_title: "Laser Pointer Cat Toy for Indoor Cats & Kittens",
    pin_description: "A rechargeable laser pointer cat toy with 5 projection modes to keep indoor cats and kittens active and engaged. Long range and easy to use for quick play sessions in the living room. A simple enrichment pick for busy cat parents. Find their new favorite toy.",
    keywords: ["cat laser toy","laser pointer cat","interactive cat toy","cat enrichment ideas","indoor cat play","cat toys for bored cats"],
    alt_text: "USB-rechargeable red laser pointer cat toy on a light wood surface.",
    angle: "playful_enrichment_focused_layout",
  },
];

async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch_${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

// Robust source normalization: pipes through wsrv.nl to output baseline PNG
// (strips EXIF orientation, converts non-baseline / progressive / CMYK JPEGs).
async function fetchNormalizedPng(sourceUrl: string): Promise<Uint8Array> {
  const proxy = `https://wsrv.nl/?url=${encodeURIComponent(sourceUrl)}&output=png&w=1400&we&n=-1`;
  const r = await fetch(proxy);
  if (!r.ok) throw new Error(`normalize_${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

function drawText(canvas: Image, font: Uint8Array, text: string, size: number, cx: number, topY: number, color: number) {
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
  const maxW = 820, maxH = 900;
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
  return `https://getpawsy.pet/products/${slug}?utm_source=pinterest&utm_medium=organic&utm_campaign=${CAMPAIGN}&utm_content=hero10_recovery_${contentId}`;
}

async function queueOne(sb: any, font: Uint8Array, item: NewPin, batchId: string, idx: number, kind: "recovery"|"replacement"): Promise<any> {
  const rep: any = { kind, product_id: item.product_id, board: item.board_name };
  const { data: prod, error: pErr } = await sb.from("products")
    .select("id,slug,name,image_url,is_active,us_stock,pinterest_disabled")
    .eq("id", item.product_id).maybeSingle();
  if (pErr || !prod) { rep.status = "failed"; rep.error = "product_not_found"; return rep; }
  if (!prod.is_active) { rep.status = "failed"; rep.error = "inactive"; return rep; }
  if ((prod.us_stock ?? 0) <= 0) { rep.status = "failed"; rep.error = "oos"; return rep; }
  if (prod.pinterest_disabled) { rep.status = "failed"; rep.error = "disabled"; return rep; }
  if (!prod.image_url) { rep.status = "failed"; rep.error = "no_image"; return rep; }

  rep.source_image = prod.image_url;

  // idempotency guard
  const { data: existing } = await sb.from("pinterest_pin_queue")
    .select("id,status").eq("product_id", item.product_id)
    .filter("meta->>wave_phase", "eq", "hero_wave_10_finalize_2026_07_16").maybeSingle();
  if (existing) { rep.status = "already_queued"; rep.queue_id = existing.id; return rep; }

  let srcBytes: Uint8Array;
  try {
    srcBytes = item.normalize
      ? await fetchNormalizedPng(prod.image_url)
      : await fetchBytes(prod.image_url);
    rep.source_bytes = srcBytes.length;
    rep.decode_normalized = !!item.normalize;
  } catch (e: any) { rep.status = "failed"; rep.error = `fetch:${e.message}`; return rep; }

  let finalBytes: Uint8Array;
  try {
    finalBytes = await buildComposite(srcBytes, font, item.headline, item.benefit, item.cta);
  } catch (e: any) {
    // If direct decode fails (progressive/CMYK JPEG), retry once via normalizer
    if (!item.normalize) {
      try {
        const norm = await fetchNormalizedPng(prod.image_url);
        finalBytes = await buildComposite(norm, font, item.headline, item.benefit, item.cta);
        rep.decode_normalized = true;
      } catch (e2: any) { rep.status = "failed"; rep.error = `composite_after_normalize:${e2.message}`; return rep; }
    } else { rep.status = "failed"; rep.error = `composite:${e.message}`; return rep; }
  }

  const path = `creative-factory/photolock/${prod.slug}/hero-wave-10-finalize-${Date.now()}-${idx}.png`;
  const up = await sb.storage.from(BUCKET).upload(path, finalBytes, { contentType: "image/png", upsert: true });
  if (up.error) { rep.status = "failed"; rep.error = `upload:${up.error.message}`; return rep; }
  const imageUrl = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  const contentId = `${kind}_${idx}_${prod.slug.slice(0, 32)}`;
  const destination = utmLink(prod.slug, contentId);
  const idempotency = `hero10_finalize_${batchId}_${item.product_id}`;

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
    scheduled_at: new Date().toISOString(),
    meta: {
      creative_method: "deterministic_hero_wave_10_finalize",
      photo_lock: true,
      photo_lock_source: prod.image_url,
      headline: item.headline, benefit: item.benefit, cta: item.cta,
      alt_text: item.alt_text, keywords: item.keywords, angle: item.angle,
      wave: WAVE, wave_phase: "hero_wave_10_finalize_2026_07_16",
      kind, normalize: !!rep.decode_normalized,
    },
  };
  const { data: ins, error: iErr } = await sb.from("pinterest_pin_queue")
    .insert(insert).select("id").single();
  if (iErr) { rep.status = "failed"; rep.error = `insert:${iErr.message}`; return rep; }
  rep.status = "queued";
  rep.queue_id = ins.id;
  rep.pin_image_url = imageUrl;
  rep.destination = destination;
  return rep;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const batchId = `hero10_finalize_${Date.now()}`;
  const report: any = { batch_id: batchId, phases: {} };

  // A) Cat Sofa board mismatch — report only (pin_edit unavailable).
  report.phases.A_board_correction = {
    pin_id: CAT_SOFA_PIN_ID,
    queue_id: CAT_SOFA_QUEUE_ID,
    current_board: "Cat Toys & Play",
    correct_board: "Cat Furniture",
    correct_board_id: CAT_FURNITURE_BOARD_ID,
    api_action: "skipped",
    reason: "pinterest_pin_edit_scope_unavailable_prior_401",
    db_updated: false,
    live_pin_unchanged: true,
  };

  // B) Terminalize
  const term: any[] = [];
  for (const id of TERMINAL_IDS) {
    const { data, error } = await sb.from("pinterest_pin_queue")
      .update({
        status: "rejected",
        rejection_reason: "terminal_rejected_wave_hero10",
        meta_terminal: true,
      })
      .eq("id", id).select("id,product_slug,rejection_reason").maybeSingle();
    term.push({ id, ok: !error, updated: data, error: error?.message });
  }
  report.phases.B_terminalized = term;

  // C + D) Queue recovery + replacements (deterministic composites)
  const font = await fetchBytes(FONT_URL);
  const results: any[] = [];
  results.push(await queueOne(sb, font, RECOVERY, batchId, 0, "recovery"));
  for (let i = 0; i < REPLACEMENTS.length; i++) {
    results.push(await queueOne(sb, font, REPLACEMENTS[i], batchId, i + 1, "replacement"));
  }
  report.phases.C_D_new_pins = results;

  // Trigger cron worker to process the freshly queued rows.
  try {
    const cronResp = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-cron-worker`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ trigger: "hero_wave_10_finalize", limit: 8 }),
    });
    report.cron_trigger = { status: cronResp.status };
  } catch (e: any) { report.cron_trigger = { error: String(e?.message ?? e) }; }

  report.summary = {
    live_before: 4,
    terminalized: term.filter((t) => t.ok).length,
    queued: results.filter((r) => r.status === "queued").length,
    failed: results.filter((r) => r.status === "failed").length,
    already_queued: results.filter((r) => r.status === "already_queued").length,
    composites: results.filter((r) => r.status === "queued").length,
    ai_image_calls: 0,
  };

  return new Response(JSON.stringify(report, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
// cinematic-campaign-12pack
//
// Admin-only. Seeds a 12-pin Pinterest video campaign with a fixed category mix
// (3 cat litter, 2 catio, 2 dog beds, 2 cat trees, 1 pet tech, 2 wildcards),
// varied native style presets, varied emotional registers, and
// approved_for_render=true so the cinematic v5 pipeline picks them up,
// renders them, validates them, and autopublishes to Pinterest.
//
// The existing pipeline handles:
//   - hook generation (5 variants per job, best selected)
//   - voiceover (ElevenLabs, female default)
//   - storyboard (7-beat: hook → pattern_interrupt → problem → emotional_payoff
//                 → benefit → social_proof → cta)
//   - render (Remotion worker, 9:16, handheld camera, 8–15s)
//   - validation v5 (motion, realism, emotional, pacing, text-safe area)
//   - autopublish to the matched Pinterest board with UTM-tagged URL
//
// POST body: { dry_run?: boolean }
// Returns: { ok, traceId, campaign_id, seeded: [{job_id, slug, category, preset, register, hook_variant}] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Slot = {
  bucket: string;
  category_filter: string[] | null; // null = wildcard
  name_includes?: string[]; // optional substring match (lowercased)
  preset: string;
  emotional_register: string;
  hook_variant: string;
  voice_style: string;
  camera_style: string;
};

// 12-slot plan. Presets/registers/cameras rotated for variety.
const PLAN: Slot[] = [
  // 3× cat litter
  { bucket: "cat_litter_1", category_filter: ["Cat Litter Boxes"], preset: "satisfying_cleaning", emotional_register: "relatable_pain", hook_variant: "the litter box thing nobody talks about", voice_style: "warm_confessional", camera_style: "iphone_vertical_closeup" },
  { bucket: "cat_litter_2", category_filter: ["Cat Litter Boxes"], preset: "problem_solution", emotional_register: "surprise", hook_variant: "i didn't know cat litter could do this", voice_style: "curious_calm", camera_style: "pet_owner_followcam" },
  { bucket: "cat_litter_3", category_filter: ["Cat Litter Boxes"], preset: "before_after", emotional_register: "aspirational", hook_variant: "before vs after switching litter boxes", voice_style: "warm_confessional", camera_style: "kitchen_counter_handheld" },
  // 2× catio (mapped to Cat Houses / Cat Furniture)
  { bucket: "catio_1", category_filter: ["Cat Houses", "Cat Furniture"], preset: "cozy_indoor_cat", emotional_register: "tender", hook_variant: "my indoor cat's new favorite spot", voice_style: "soft_intimate", camera_style: "morning_window_handheld" },
  { bucket: "catio_2", category_filter: ["Cat Houses", "Cat Furniture"], preset: "luxury_pet_lifestyle", emotional_register: "aspirational", hook_variant: "the cat setup i'll never undo", voice_style: "warm_confessional", camera_style: "iphone_vertical_closeup" },
  // 2× dog beds
  { bucket: "dog_bed_1", category_filter: ["Dog Beds"], preset: "emotional_pet_owner", emotional_register: "tender", hook_variant: "my senior dog actually sleeps through the night now", voice_style: "soft_intimate", camera_style: "low_angle_floor" },
  { bucket: "dog_bed_2", category_filter: ["Dog Beds"], preset: "pet_transformation", emotional_register: "relatable_pain", hook_variant: "if your dog won't settle, try this", voice_style: "curious_calm", camera_style: "pet_owner_followcam" },
  // 2× cat trees
  { bucket: "cat_tree_1", category_filter: ["Cat Trees & Condos"], preset: "calm_pet_parent", emotional_register: "tender", hook_variant: "the cat tree that finally got the zoomies under control", voice_style: "warm_confessional", camera_style: "morning_window_handheld" },
  { bucket: "cat_tree_2", category_filter: ["Cat Trees & Condos"], preset: "funny_relatable_pet", emotional_register: "funny", hook_variant: "pov: you finally caved and got the giant cat tree", voice_style: "playful_dry", camera_style: "low_angle_floor" },
  // 1× pet tech
  { bucket: "pet_tech_1", category_filter: null, name_includes: ["smart", "auto", "wifi", "electric", "app", "camera", "fountain"], preset: "i_didnt_know_i_needed_this", emotional_register: "surprise", hook_variant: "this pet gadget genuinely changed our routine", voice_style: "curious_calm", camera_style: "kitchen_counter_handheld" },
  // 2× wildcards (any active product)
  { bucket: "wildcard_1", category_filter: null, preset: "i_didnt_know_i_needed_this", emotional_register: "surprise", hook_variant: "i wish i bought this sooner", voice_style: "warm_confessional", camera_style: "iphone_vertical_closeup" },
  { bucket: "wildcard_2", category_filter: null, preset: "emotional_pet_owner", emotional_register: "tender", hook_variant: "the small thing my pet loves the most", voice_style: "soft_intimate", camera_style: "pet_owner_followcam" },
];

function pickProduct(pool: any[], used: Set<string>, slot: Slot): any | null {
  let candidates = pool.filter((p) => !used.has(p.id));
  if (slot.category_filter) {
    candidates = candidates.filter((p) => slot.category_filter!.includes(p.category));
  }
  if (slot.name_includes && slot.name_includes.length) {
    candidates = candidates.filter((p) => {
      const n = String(p.name ?? "").toLowerCase();
      return slot.name_includes!.some((kw) => n.includes(kw));
    });
  }
  if (candidates.length === 0) return null;
  // Prefer products with higher price (typically better imagery / margin)
  candidates.sort(() => Math.random() - 0.5);
  return candidates[0];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);
  if (req.method !== "POST") return json(405, { ok: false, traceId, message: "POST only" });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return json(401, { ok: false, traceId, message: "unauthorized" });

  const body: any = await req.json().catch(() => ({}));
  const dryRun = Boolean(body?.dry_run);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: u } = await userClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json(401, { ok: false, traceId, message: "unauthorized" });

  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", uid)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) return json(403, { ok: false, traceId, message: "admin only" });

  // Pull large eligible pool
  const { data: products, error: pErr } = await admin
    .from("products_public")
    .select("id, slug, name, image_url, price, category")
    .not("image_url", "is", null)
    .eq("is_active", true)
    .limit(1000);
  if (pErr || !products?.length) {
    return json(500, { ok: false, traceId, message: pErr?.message ?? "no products" });
  }

  const used = new Set<string>();
  const seeded: any[] = [];
  const rejected: any[] = [];
  const campaign_id = `12pack_${Date.now().toString(36)}_${traceId}`;

  for (const slot of PLAN) {
    const product = pickProduct(products, used, slot);
    if (!product) {
      rejected.push({ bucket: slot.bucket, reason: "no_eligible_product" });
      continue;
    }
    used.add(product.id);

    const utm = `utm_source=pinterest&utm_medium=video_pin&utm_campaign=${campaign_id}&utm_content=${slot.bucket}`;
    seeded.push({
      product_slug: product.slug,
      product_id: product.id,
      product_name: product.name,
      product_price: product.price != null ? String(product.price) : null,
      hook_variant: slot.hook_variant,
      preset: slot.preset,
      voice_style: slot.voice_style,
      camera_style: slot.camera_style,
      emotional_register: slot.emotional_register,
      content_type: "ugc_pov",
      media_type: "video",
      status: "pending",
      status_message: `12pack ${campaign_id} ${slot.bucket}`,
      created_by: uid,
      approved_for_render: true,
      approved_at: new Date().toISOString(),
      approved_by: uid,
      autopilot: true,
      auto_publish: true,
      publish_window_bypass: true,
      product_ids: [product.id],
      pin_destination_url: `https://getpawsy.pet/products/${product.slug}?${utm}`,
      product_lock: {
        product_id: product.id,
        product_slug: product.slug,
        product_name: product.name,
        category: product.category ?? null,
        image_url: product.image_url,
      },
    });
  }

  if (dryRun) {
    return json(200, { ok: true, traceId, campaign_id, dry_run: true, seeded_preview: seeded, rejected });
  }

  if (seeded.length === 0) {
    return json(500, { ok: false, traceId, message: "no products matched any slot", rejected });
  }

  const { data: inserted, error: iErr } = await admin
    .from("cinematic_ad_jobs")
    .insert(seeded)
    .select("id, product_slug, preset, emotional_register, hook_variant");
  if (iErr) return json(500, { ok: false, traceId, message: iErr.message });

  // Kick the dispatcher so workers start claiming immediately.
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/cinematic-ad-kick-pending`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({ source: "12pack", campaign_id }),
    });
  } catch (_e) {
    // non-fatal; cron also picks up pending jobs
  }

  return json(200, {
    ok: true,
    traceId,
    campaign_id,
    total_seeded: inserted?.length ?? 0,
    seeded: inserted,
    rejected,
    message: `Seeded ${inserted?.length ?? 0} jobs. Pipeline will render, validate, and autopublish.`,
  });
});
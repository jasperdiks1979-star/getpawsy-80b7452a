// Pinterest Zero-Credit Refill Worker
//
// Builds Pinterest pin queue rows from existing product assets WITHOUT calling
// any AI service. Uses predefined headline, CTA, description, overlay and
// board templates randomly combined per category.
//
// Trigger:
//   - On-demand POST (admin button / manual run)
//   - pg_cron every 10 minutes
//
// Refill rule:
//   if status='queued' rows < TARGET_QUEUE_DEPTH (default 50)
//   → top up to TARGET_QUEUE_DEPTH using non-AI templates.
//
// Guards:
//   - Skip products posted/queued in last 24h (cooldown)
//   - Skip if creative_fingerprint already exists in queue
//   - Respect publishing_paused flag
//   - NEVER triggers when products lack image_url or destination URL
//
// Pin row is inserted with status='queued', ready for the existing
// pinterest-cron-worker → pinterest-pin-publisher path.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_ORIGIN = Deno.env.get("PUBLIC_SITE_ORIGIN") ?? "https://getpawsy.pet";

const TARGET_QUEUE_DEPTH = 50;
const MIN_TOPUP = 1;
const MAX_TOPUP_PER_RUN = 60;
const PRODUCT_COOLDOWN_HOURS = 24;

// ------------------------------------------------------------------
// Category map: product.category → internal key
// ------------------------------------------------------------------
function categoryKeyFor(raw: string | null | undefined): keyof typeof TEMPLATES {
  const c = (raw ?? "").toLowerCase();
  if (c.includes("litter")) return "litter_boxes";
  if (c.includes("cat tree") || c.includes("cat condo") || c.includes("scratch")) return "cat_trees";
  if (c.includes("cat") && (c.includes("furniture") || c.includes("house") || c.includes("bed"))) return "cat_furniture";
  if (c.includes("cat") && c.includes("toy")) return "cat_toys";
  if (c.includes("dog") && c.includes("toy")) return "dog_toys";
  if (c.includes("dog") && c.includes("bed")) return "dog_beds";
  if (c.includes("travel") || c.includes("carrier") || c.includes("collar") || c.includes("leash") || c.includes("stroller")) return "pet_travel";
  return "pet_accessories";
}

// ------------------------------------------------------------------
// Template pools — each category provides ≥20 unique combinations
// (headlines × ctas × descriptions × overlays = thousands of variants)
// ------------------------------------------------------------------
type TemplatePool = {
  headlines: string[];      // {name}, {price}, {category}
  overlays: string[];       // short text for image overlay caption
  descriptions: string[];   // {name}, {price}
  ctas: string[];
  hashtags: string[][];
  hookGroup: string;
  boards: string[];         // candidate board names
};

const SHARED_CTAS = [
  "Shop Now",
  "See It on GetPawsy",
  "Tap to Shop",
  "Get Yours",
  "View Details",
  "Add to Cart",
  "Order Today",
  "Browse the Collection",
];

const TEMPLATES: Record<string, TemplatePool> = {
  cat_trees: {
    headlines: [
      "Cat Tree Your Indoor Cat Will Actually Use",
      "Floor-to-Ceiling Cat Tree for Bigger Cats",
      "Sturdy Cat Tree Built for Climbers",
      "Modern Cat Tree That Fits Small Spaces",
      "Heavy-Duty Cat Tree for Multi-Cat Homes",
      "Cat Tree With Hammock, Perches & Scratch Posts",
      "Cat Tree That Saves Your Couch From Scratching",
      "Quiet, Wobble-Free Cat Tree for Adult Cats",
      "Cat Tree With a Real Wood Frame",
      "Cat Tree US Pet Parents Are Loving Right Now",
    ],
    overlays: [
      "For Big Cats Too",
      "Saves Your Couch",
      "No Wobble",
      "Built to Last",
      "Cats Love It",
      "Floor to Ceiling",
      "Multi-Cat Friendly",
      "Modern + Sturdy",
    ],
    descriptions: [
      "{name} — a sturdy cat tree built for real climbers. Designed to save your furniture and keep cats happy indoors. Shop at GetPawsy.",
      "Looking for a cat tree that won't wobble? {name} keeps adult cats busy without taking over the room.",
      "A real-wood cat tree your cat will actually use. {name} comes with perches, posts and hideouts.",
      "Big cat? {name} is built tall and stable so even larger cats feel safe on the top perch.",
    ],
    ctas: SHARED_CTAS,
    hashtags: [["#cattree", "#catfurniture", "#catlovers"], ["#indoorcats", "#catparent"], ["#cattower"]],
    hookGroup: "cat_tree_value_proposition",
    boards: ["Best Cat Trees 2026", "Cat Furniture", "Indoor Cat Setup", "Modern Cat Furniture"],
  },
  cat_furniture: {
    headlines: [
      "Cat Furniture That Actually Looks Good",
      "Cozy Cat Furniture for Small Apartments",
      "Modern Cat Furniture for Style-Conscious Homes",
      "Cat Furniture That Doubles as a Hideout",
      "Cat Furniture US Cat Parents Are Buying",
      "Compact Cat Furniture for Indoor Cats",
      "Cat Furniture With a Wood Finish",
      "Cat Furniture That Fits Right In",
    ],
    overlays: [
      "Stylish + Cozy",
      "Fits Any Room",
      "Modern Look",
      "Cats Love It",
      "Apartment Friendly",
      "Wood Finish",
    ],
    descriptions: [
      "{name} blends into your living room while giving your cat a cozy hideout. Browse cat furniture at GetPawsy.",
      "Modern cat furniture without the cheap plastic look. {name} is built for real homes.",
      "Small space? {name} gives your cat their own spot without taking over.",
    ],
    ctas: SHARED_CTAS,
    hashtags: [["#catfurniture", "#moderncatlife"], ["#catparent", "#indoorcat"], ["#catcondo"]],
    hookGroup: "cat_furniture_aesthetic",
    boards: ["Cat Furniture", "Modern Cat Furniture", "Indoor Cat Setup", "Luxury Pet Beds"],
  },
  litter_boxes: {
    headlines: [
      "Smart Self-Cleaning Litter Box for Indoor Cats",
      "Odor-Locking Litter Box That Actually Works",
      "Litter Box That Hides the Mess",
      "No-Scoop Litter Box for Busy Cat Parents",
      "Enclosed Litter Box for Privacy + Less Smell",
      "Quiet Litter Box for Anxious Cats",
      "Litter Box With Anti-Tracking Design",
      "Big Cat? This Litter Box Fits Them",
    ],
    overlays: [
      "No More Scooping",
      "Locks Odor In",
      "Self-Cleaning",
      "Less Smell",
      "Hides the Mess",
      "Fits Big Cats",
    ],
    descriptions: [
      "{name} keeps odor in and the floor cleaner. A smarter litter box for indoor cats.",
      "Less scooping, more cuddles — {name} keeps the box fresh for you.",
      "An enclosed litter box that respects your cat's privacy — and your nose. Shop at GetPawsy.",
    ],
    ctas: SHARED_CTAS,
    hashtags: [["#litterbox", "#catlitter"], ["#smartcatlitter", "#catparent"], ["#noscoop"]],
    hookGroup: "litter_box_pain_relief",
    boards: ["Smart Self-Cleaning Cat Litter Box", "Indoor Cat Setup", "Smart Pet Gadgets"],
  },
  cat_toys: {
    headlines: [
      "Cat Toys That Keep Indoor Cats Busy",
      "Interactive Cat Toy for Solo Play",
      "Cat Toy That Bored Indoor Cats Actually Use",
      "Quiet Cat Toy for Apartment Cats",
      "Cat Toy That Burns Real Energy",
      "Cat Toy For Multi-Cat Households",
      "Cat Toy That Mimics Real Prey",
      "Battery-Free Cat Toy That Lasts",
    ],
    overlays: [
      "Burns Real Energy",
      "Beats Boredom",
      "Solo Play",
      "Cats Go Wild",
      "Quiet + Fun",
      "Multi-Cat Friendly",
    ],
    descriptions: [
      "{name} keeps indoor cats engaged without you needing to play 24/7.",
      "Bored cat? {name} mimics real prey movement and tires them out fast.",
      "An interactive cat toy that even shy cats will enjoy. Shop at GetPawsy.",
    ],
    ctas: SHARED_CTAS,
    hashtags: [["#cattoys", "#catplay"], ["#indoorcat", "#catparent"], ["#interactivecattoy"]],
    hookGroup: "cat_toy_engagement",
    boards: ["Cat Furniture", "Indoor Cat Setup", "Smart Pet Gadgets", "GetPawsy Products"],
  },
  dog_toys: {
    headlines: [
      "Dog Puzzle Toy That Tires Smart Dogs Out",
      "Tough Dog Toy for Heavy Chewers",
      "Interactive Dog Toy for Solo Play",
      "Dog Toy That Slows Down Fast Eaters",
      "Dog Toy That Beats Boredom",
      "Dog Puzzle Toy for Training Time",
      "Treat-Dispensing Dog Toy",
      "Dog Toy Built for Big Dogs",
    ],
    overlays: [
      "Built Tough",
      "Beats Boredom",
      "Brain Workout",
      "Heavy Chewer Approved",
      "Solo Play",
      "Slows Fast Eaters",
    ],
    descriptions: [
      "{name} gives smart dogs a real mental workout — no more chewed-up furniture.",
      "Heavy chewer? {name} is built to handle real teeth and real boredom.",
      "A treat-dispensing dog toy that turns playtime into training time.",
    ],
    ctas: SHARED_CTAS,
    hashtags: [["#dogtoys", "#dogenrichment"], ["#smartdog", "#dogparent"], ["#dogpuzzle"]],
    hookGroup: "dog_toy_enrichment",
    boards: ["Smart Pet Gadgets", "Dog Walking Essentials", "Pet Parent Hacks", "GetPawsy Products"],
  },
  dog_beds: {
    headlines: [
      "Orthopedic Dog Bed for Older Dogs",
      "Memory Foam Dog Bed for Big Breeds",
      "Calming Dog Bed for Anxious Pups",
      "Washable Dog Bed That Actually Stays Clean",
      "Cozy Dog Bed for Small Dogs",
      "Waterproof Dog Bed for Muddy Paws",
      "Dog Bed That Supports Joints",
      "Dog Bed Built for Heavy Dogs",
    ],
    overlays: [
      "Joint Support",
      "For Big Dogs",
      "Calms Anxiety",
      "Memory Foam",
      "Washable Cover",
      "Cozy + Cushioned",
    ],
    descriptions: [
      "{name} cushions aging joints and helps senior dogs rest better.",
      "Big dog? {name} is built deep and supportive enough to fit them.",
      "A washable dog bed your pup will actually want to sleep in.",
    ],
    ctas: SHARED_CTAS,
    hashtags: [["#dogbed", "#orthopedicdogbed"], ["#dogparent", "#bigdog"], ["#calmingdogbed"]],
    hookGroup: "dog_bed_comfort",
    boards: ["Luxury Pet Beds", "Dog Walking Essentials", "Pet Parent Hacks", "GetPawsy Products"],
  },
  pet_travel: {
    headlines: [
      "Pet Carrier Built for Real Travel",
      "Comfy Pet Travel Bag for Long Trips",
      "Foldable Pet Stroller for Daily Walks",
      "Pet Carrier With Breathable Mesh",
      "Pet Travel Gear US Owners Are Loving",
      "Pet Carrier That Fits Under the Seat",
      "Heavy-Duty Pet Stroller for Multi-Pet Homes",
      "Pet Car Seat That Keeps Them Safe",
    ],
    overlays: [
      "Travel Ready",
      "Breathable Mesh",
      "Fits Under the Seat",
      "Heavy Duty",
      "Daily Walk Ready",
      "Comfortable + Safe",
    ],
    descriptions: [
      "{name} keeps trips low-stress for both of you. Breathable, safe, ready to roll.",
      "Travel a lot? {name} folds down small and stands up to real use.",
      "A pet carrier that respects your pet — and your back.",
    ],
    ctas: SHARED_CTAS,
    hashtags: [["#petcarrier", "#dogtravel"], ["#petparent", "#travelwithpets"], ["#petstroller"]],
    hookGroup: "pet_travel_safety",
    boards: ["Dog Travel Accessories", "Dog Walking Essentials", "Smart Pet Gadgets"],
  },
  pet_accessories: {
    headlines: [
      "Pet Accessory Your Setup Is Missing",
      "Smart Pet Gadget for Everyday Use",
      "Pet Essential US Pet Parents Are Loving",
      "Tiny Upgrade, Big Difference",
      "Pet Accessory Worth Adding to the Cart",
      "Practical Pet Gear That Actually Helps",
      "Pet Accessory Built for Real Homes",
      "Pet Upgrade Your Pet Deserves",
    ],
    overlays: [
      "Smart Upgrade",
      "Daily Use",
      "Worth It",
      "Pet Parent Pick",
      "Practical + Cute",
      "Small but Mighty",
    ],
    descriptions: [
      "{name} — a small upgrade that actually makes pet life easier.",
      "Looking for a practical pet accessory? {name} earns its spot.",
      "Pet parents are picking up {name} as a daily-use upgrade.",
    ],
    ctas: SHARED_CTAS,
    hashtags: [["#petaccessories", "#petgadgets"], ["#petparent", "#smartpet"], ["#getpawsy"]],
    hookGroup: "pet_accessory_upgrade",
    boards: ["GetPawsy Products", "Smart Pet Gadgets", "Pet Parent Hacks"],
  },
};

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
async function sha8(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).slice(0, 4).map(b => b.toString(16).padStart(2, "0")).join("");
}
function clipTitle(s: string, max = 95): string {
  return s.length <= max ? s : s.slice(0, max - 1).trim() + "…";
}
function clipDesc(s: string, max = 480): string {
  return s.length <= max ? s : s.slice(0, max - 1).trim() + "…";
}
function tmpl(s: string, vars: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const forceCount: number | null = Number.isFinite(body?.count) ? Math.min(MAX_TOPUP_PER_RUN, Math.max(1, body.count)) : null;
  const dryRun = body?.dry_run === true;

  try {
    const { assertIsolationAllows } = await import("../_shared/pinterest-wave-isolation.ts");
    const guard = await assertIsolationAllows(supabase, body?.run_id ?? null, corsHeaders);
    if (guard) return guard;
  } catch (e) {
    console.warn("[noai-refill] wave-isolation check failed (non-fatal):", e);
  }

  // 1) Respect publishing pause
  const { data: state } = await supabase.from("pinterest_credit_state").select("publishing_paused").eq("id", 1).maybeSingle();
  if (state?.publishing_paused === true) {
    return json({ ok: true, skipped: true, reason: "publishing_paused" });
  }

  // 2) Current queue depth
  const { count: queued } = await supabase.from("pinterest_pin_queue")
    .select("id", { count: "exact", head: true }).eq("status", "queued");
  const queuedNow = queued ?? 0;
  const needed = forceCount ?? Math.max(0, TARGET_QUEUE_DEPTH - queuedNow);

  if (needed < MIN_TOPUP && !forceCount) {
    return json({
      ok: true,
      skipped: true,
      reason: "queue_above_target",
      queued_now: queuedNow,
      target: TARGET_QUEUE_DEPTH,
      ai_free_capacity: queuedNow,
    });
  }

  const topUp = Math.min(MAX_TOPUP_PER_RUN, needed);

  // 3) Recently used products (cooldown)
  const cooldownSince = new Date(Date.now() - PRODUCT_COOLDOWN_HOURS * 3600_000).toISOString();
  const { data: recentRows } = await supabase.from("pinterest_pin_queue")
    .select("product_id")
    .or(`posted_at.gte.${cooldownSince},created_at.gte.${cooldownSince}`)
    .not("product_id", "is", null);
  const cooldown = new Set((recentRows ?? []).map(r => r.product_id as string));

  // 4) Eligible products
  const { data: products } = await supabase.from("products")
    .select("id, name, slug, category, price, image_url")
    .eq("is_active", true)
    .eq("is_duplicate", false)
    .not("image_url", "is", null)
    .not("slug", "is", null)
    .limit(500);

  const eligible = (products ?? []).filter(p => !cooldown.has(p.id));
  const eligibleCount = eligible.length;

  if (eligibleCount === 0) {
    return json({
      ok: true,
      skipped: true,
      reason: "no_eligible_products",
      queued_now: queuedNow,
      cooldown_size: cooldown.size,
    });
  }

  // 5) Load board id map (board name → board id)
  const { data: boardRows } = await supabase.from("pinterest_boards")
    .select("id, name").eq("is_blacklisted", false).eq("is_sandbox", false);
  const boardIdByName = new Map<string, string>((boardRows ?? []).map(b => [b.name as string, b.id as string]));

  // 5b) Revenue Autopilot weights — Phase 3 (tier-weighted) + Phase 5 (20% discovery)
  // If autopilot has not run yet, weightByProduct is empty and the legacy
  // uniform random shuffle still works.
  const { data: tierRows } = await supabase
    .from("pinterest_revenue_product_tiers")
    .select("product_id, tier, publish_weight");
  const weightByProduct = new Map<string, number>();
  const tierByProduct = new Map<string, string>();
  for (const t of tierRows ?? []) {
    weightByProduct.set(t.product_id as string, Number(t.publish_weight ?? 1));
    tierByProduct.set(t.product_id as string, t.tier as string);
  }
  // Eligible products with no tier row are "discovery" candidates (new/untested)
  const discoveryPool = eligible.filter((p) => !tierByProduct.has(p.id));
  const tieredPool = eligible.filter((p) => tierByProduct.has(p.id));

  // Discovery reserve: 20% of slots go to untested products if any exist
  const discoverySlots = discoveryPool.length > 0
    ? Math.min(discoveryPool.length, Math.max(1, Math.round(topUp * 0.20)))
    : 0;
  const tieredSlots = Math.max(0, topUp - discoverySlots);

  function weightedDraw<T extends { id: string }>(pool: T[], n: number, rng: () => number): T[] {
    const out: T[] = [];
    const remaining = [...pool];
    while (out.length < n && remaining.length > 0) {
      const weights = remaining.map((p) => Math.max(0.05, weightByProduct.get(p.id) ?? 1));
      const total = weights.reduce((a, b) => a + b, 0);
      let r = rng() * total;
      let idx = 0;
      for (; idx < weights.length; idx++) {
        r -= weights[idx];
        if (r <= 0) break;
      }
      if (idx >= remaining.length) idx = remaining.length - 1;
      out.push(remaining[idx]);
      remaining.splice(idx, 1);
    }
    return out;
  }

  // 6) Build pins, randomized
  const rng = mulberry32(Date.now() & 0xffffffff);
  const drawnTiered = weightedDraw(tieredPool, tieredSlots, rng);
  const drawnDiscovery = discoveryPool.sort(() => rng() - 0.5).slice(0, discoverySlots);
  // Interleave so discovery pins don't all schedule at the end
  const shuffled: typeof eligible = [];
  const a = drawnTiered, b = drawnDiscovery;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) shuffled.push(a[i]);
    if (i < b.length) shuffled.push(b[i]);
  }
  // Fallback when autopilot hasn't seeded tiers yet
  if (shuffled.length === 0) {
    shuffled.push(...[...eligible].sort(() => rng() - 0.5));
  }

  const rowsToInsert: any[] = [];
  const usedFingerprints = new Set<string>();

  for (const p of shuffled) {
    if (rowsToInsert.length >= topUp) break;

    const key = categoryKeyFor(p.category);
    const pool = TEMPLATES[key];
    const headline = pick(pool.headlines, rng);
    const overlay = pick(pool.overlays, rng);
    const descTmpl = pick(pool.descriptions, rng);
    const cta = pick(pool.ctas, rng);
    const tags = pick(pool.hashtags, rng);

    // Prefer a mapped board that actually exists in pinterest_boards
    const candidates = pool.boards.filter(b => boardIdByName.has(b));
    const boardName = candidates.length ? pick(candidates, rng) : pick(pool.boards, rng);
    const boardId = boardIdByName.get(boardName) ?? null;

    if (!boardId) continue; // skip if board not provisioned

    const vars = { name: p.name as string, price: p.price ? `$${p.price}` : "", category: (p.category ?? "") as string };
    const pinTitle = clipTitle(`${headline} — ${p.name}`);
    const pinDescription = clipDesc(`${tmpl(descTmpl, vars)} ${cta} at GetPawsy.pet.`);
    const destinationLink = `${SITE_ORIGIN}/products/${p.slug}?utm_source=pinterest&utm_medium=organic&utm_campaign=noai_${key}`;

    const fp = await sha8(`${p.id}|${headline}|${overlay}|${descTmpl}|${boardName}`);
    if (usedFingerprints.has(fp)) continue;
    usedFingerprints.add(fp);

    // Skip if already present
    const { data: existing } = await supabase.from("pinterest_pin_queue")
      .select("id").eq("creative_fingerprint", fp).limit(1).maybeSingle();
    if (existing) continue;

    rowsToInsert.push({
      product_id: p.id,
      product_slug: p.slug,
      product_name: p.name,
      pin_variant: `noai_${key}_${fp}`,
      pin_title: pinTitle,
      pin_description: pinDescription,
      pin_image_url: p.image_url,
      destination_link: destinationLink,
      external_url: destinationLink,
      final_resolved_url: destinationLink,
      board_name: boardName,
      board_id: boardId,
      hashtags: tags,
      priority: "medium",
      status: "queued",
      hook_group: pool.hookGroup,
      category_key: key,
      overlay_text: overlay,
      content_type: "product",
      creative_fingerprint: fp,
      idempotency_key: `noai_${p.id}_${fp}`,
      scheduled_at: new Date(Date.now() + rowsToInsert.length * 60_000).toISOString(),
      meta: {
        generator: "noai_refill_v1",
        category_key: key,
        ai_free: true,
        tier: tierByProduct.get(p.id) ?? "discovery",
        publish_weight: weightByProduct.get(p.id) ?? 1,
      },
    });
  }

  let inserted = 0;
  if (rowsToInsert.length > 0 && !dryRun) {
    const { error, count } = await supabase
      .from("pinterest_pin_queue")
      .insert(rowsToInsert, { count: "exact" });
    if (error) {
      return json({ ok: false, error: error.message, attempted: rowsToInsert.length }, 500);
    }
    inserted = count ?? rowsToInsert.length;
  }

  const { count: queuedAfter } = await supabase.from("pinterest_pin_queue")
    .select("id", { count: "exact", head: true }).eq("status", "queued");

  return json({
    ok: true,
    dry_run: dryRun,
    products_eligible: eligibleCount,
    queued_before: queuedNow,
    queued_after: queuedAfter ?? 0,
    drafts_created: 0, // we skip draft state; we queue directly
    queued_created: inserted,
    publishable_immediately: inserted,
    target_depth: TARGET_QUEUE_DEPTH,
    ai_free_capacity: queuedAfter ?? 0,
    cooldown_skipped: cooldown.size,
    ai_calls_attempted: 0,
  });
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
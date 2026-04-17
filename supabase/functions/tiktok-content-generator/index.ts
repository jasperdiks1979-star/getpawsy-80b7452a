import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const ALLOWED_ORIGINS = [
  "https://getpawsy.pet",
  "https://www.getpawsy.pet",
  "https://getpawsy.lovable.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, cache-control",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// =====================================================================
// VIRAL TIKTOK TEMPLATES — US-targeted, proven retention patterns
// =====================================================================
// Designed for high 3-second retention (the make-or-break TikTok metric).
// Every hook follows one of these proven viral patterns:
// - Pattern Interrupt (curiosity gap)
// - POV / Relatable
// - Problem-Agitate-Solve
// - Social Proof / FOMO
// - Demo / Transformation
//
// All copy uses US English, $ pricing, US shipping references, and
// US-trending hashtags. Captions stay under 150 chars before hashtags
// (TikTok's caption sweet spot for engagement).
// =====================================================================

type Variant = {
  variant: string;
  label: string;
  hook: (name: string, category: string) => string; // on-screen text (3-sec hook)
  caption: (name: string, desc: string, category: string, tags: string) => string;
};

const VIRAL_TEMPLATES: Variant[] = [
  {
    variant: "pattern_interrupt",
    label: "Pattern Interrupt (highest avg retention)",
    hook: (_name, cat) => `I can't believe this ${cat} thing actually works...`,
    caption: (name, _desc, cat, tags) =>
      `Y'all I was NOT expecting this 😭 Best ${cat} purchase of 2025 hands down. Link in bio 🔗\n\n${tags}`,
  },
  {
    variant: "pov_relatable",
    label: "POV / Relatable Moment",
    hook: (_name, cat) => `POV: your ${cat} finally has the thing they've been begging for`,
    caption: (name, _desc, _cat, tags) =>
      `Tell me why he's obsessed 😂 Got this from GetPawsy and now it's his whole personality\n\n${tags}`,
  },
  {
    variant: "problem_agitate_solve",
    label: "Problem-Agitate-Solve",
    hook: (_name, cat) => `Stop buying cheap ${cat} stuff that breaks in 2 weeks`,
    caption: (name, desc, _cat, tags) =>
      `If you're tired of replacing this every month, watch til the end 👀 ${desc.slice(0, 80)}\n\nGet it → link in bio\n\n${tags}`,
  },
  {
    variant: "social_proof_fomo",
    label: "Social Proof / FOMO",
    hook: (_name, cat) => `Every pet parent in the US is buying this right now`,
    caption: (_name, _desc, cat, tags) =>
      `This ${cat} thing keeps selling out 😩 Restocked at GetPawsy.pet — get one before they're gone again\n\n${tags}`,
  },
  {
    variant: "demo_transformation",
    label: "Demo / Before & After",
    hook: (name, _cat) => `Watch what happens in 10 seconds 👇`,
    caption: (name, desc, _cat, tags) =>
      `Wait for it... 🤯 ${desc.slice(0, 70)}\n\nYes it's real. Yes link in bio.\n\n${tags}`,
  },
  {
    variant: "question_hook",
    label: "Question Hook (high comments)",
    hook: (_name, cat) => `Why is no one talking about this ${cat} hack??`,
    caption: (_name, _desc, cat, tags) =>
      `Drop a 🐾 if your pet needs this. Honestly the best ${cat} find on TikTok shop alternatives\n\n${tags}`,
  },
  {
    variant: "list_curiosity",
    label: "Numbered List Curiosity",
    hook: (_name, cat) => `3 reasons every US pet parent is buying this ${cat} product`,
    caption: (name, _desc, _cat, tags) =>
      `1. Free US shipping 🇺🇸\n2. Made for pets, loved by humans\n3. It just works 🤌\n\nLink in bio\n\n${tags}`,
  },
];

// =====================================================================
// US-TRENDING PET HASHTAG POOLS (April 2026)
// =====================================================================
// Mix of high-volume discovery tags + niche community tags.
// TikTok algo rewards 3-5 highly relevant tags > 20 generic ones.

const HASHTAG_POOLS = {
  always: ["#fyp", "#foryou", "#foryoupage"],
  us_pet: ["#americanpetparents", "#uspets", "#petsoftiktok", "#pettok"],
  cat: ["#catsoftiktok", "#cattok", "#catlover", "#catmom", "#cattree", "#catsofinstagram"],
  dog: ["#dogsoftiktok", "#dogtok", "#doglover", "#dogmom", "#dogdad", "#puppytok"],
  generic_pet: ["#petproducts", "#petcare", "#petparent", "#petlife"],
  shopping: ["#tiktokmademebuyit", "#amazonfinds", "#mustbuy", "#smallbusinesscheck"],
  brand: ["#getpawsy"],
};

function buildHashtags(category: string): string[] {
  const cat = category.toLowerCase();
  const isCat = /cat|kitten|litter/.test(cat);
  const isDog = /dog|puppy/.test(cat);

  const pool: string[] = [
    ...HASHTAG_POOLS.always.slice(0, 2),
    ...HASHTAG_POOLS.us_pet.slice(0, 2),
    ...(isCat ? HASHTAG_POOLS.cat.slice(0, 3) : []),
    ...(isDog ? HASHTAG_POOLS.dog.slice(0, 3) : []),
    ...(!isCat && !isDog ? HASHTAG_POOLS.generic_pet.slice(0, 2) : []),
    HASHTAG_POOLS.shopping[Math.floor(Math.random() * HASHTAG_POOLS.shopping.length)],
    HASHTAG_POOLS.brand[0],
  ];

  // Dedupe + cap at 8 (TikTok sweet spot)
  return Array.from(new Set(pool)).slice(0, 8);
}

// =====================================================================
// US PRIME-TIME SCHEDULING
// =====================================================================
// Based on TikTok's 2025 US engagement data:
// - Tue/Wed/Thu: best engagement days
// - 6-9pm EST = 3-6pm PST = peak US scrolling window
// - Secondary peaks: 11am-1pm EST (lunch break)
//
// We schedule posts in EST prime-time slots, spread across upcoming days.

const US_PRIME_SLOTS_EST = [
  { hour: 19, minute: 0, label: "7:00 PM EST (peak)" },   // primary
  { hour: 12, minute: 0, label: "12:00 PM EST (lunch)" }, // secondary
  { hour: 21, minute: 0, label: "9:00 PM EST (PST peak)" }, // tertiary
];

function nextUSPrimeTime(offsetIndex: number): Date {
  const now = new Date();
  // EST = UTC-5 (EDT = UTC-4 during DST). We use UTC-4 for DST safety in spring/summer.
  // For Apr 2026 we're in EDT (UTC-4).
  const slotsPerDay = US_PRIME_SLOTS_EST.length;
  const dayOffset = Math.floor(offsetIndex / slotsPerDay);
  const slot = US_PRIME_SLOTS_EST[offsetIndex % slotsPerDay];

  const target = new Date(now);
  target.setUTCDate(now.getUTCDate() + dayOffset);
  // EDT 19:00 = UTC 23:00
  target.setUTCHours(slot.hour + 4, slot.minute, 0, 0);

  // If the computed time is in the past, push forward by a day
  if (target.getTime() < now.getTime()) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return target;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function generateTikTokPosts(
  product: {
    id: string;
    name: string;
    slug: string;
    description: string;
    price: number;
    category: string;
    image_url: string;
  },
  startSlotIndex: number,
) {
  const BASE_URL = "https://getpawsy.pet";
  const utm = `?utm_source=tiktok&utm_medium=organic&utm_campaign=us_viral&utm_content=${product.slug}`;
  const category = (product.category || "pet").toLowerCase().replace(/s$/, "");
  const desc = stripHtml(product.description || "");
  const hashtags = buildHashtags(product.category || "pet");
  const tagStr = hashtags.join(" ");

  return VIRAL_TEMPLATES.map((tpl, i) => ({
    product_id: product.id,
    product_slug: product.slug,
    product_name: product.name,
    post_variant: tpl.variant,
    caption: tpl.caption(product.name, desc, category, tagStr),
    hashtags,
    thumbnail_url: product.image_url,
    destination_link: `${BASE_URL}/products/${product.slug}${utm}`,
    priority: product.name.toLowerCase().includes("litter") ? "high" : "medium",
    status: "draft",
    scheduled_at: nextUSPrimeTime(startSlotIndex + i).toISOString(),
    tracking_params: {
      hook_text: tpl.hook(product.name, category),
      template_label: tpl.label,
      target_market: "US",
    },
  }));
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const count = Math.min(Math.max(body.count || 5, 1), 10);
    const variantsPerProduct = Math.min(Math.max(body.variants_per_product || 1, 1), 3);

    // Avoid recent duplicates (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: recentPosts } = await sb
      .from("tiktok_post_queue")
      .select("product_id")
      .gte("created_at", sevenDaysAgo);

    const recentIds = new Set((recentPosts || []).map((p: any) => p.product_id));

    const { data: products, error } = await sb
      .from("products")
      .select("id, name, slug, description, price, category, image_url, stock")
      .eq("is_active", true)
      .gt("stock", 0)
      .not("image_url", "is", null)
      .not("slug", "is", null)
      .gt("price", 0)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    let eligible = (products || []).filter((p: any) => !recentIds.has(p.id));
    if (eligible.length < count) {
      const repeats = (products || []).filter((p: any) => recentIds.has(p.id));
      eligible = [...eligible, ...repeats];
    }

    const selected = eligible.slice(0, count);

    let slotCursor = 0;
    const allPosts: any[] = [];
    for (const p of selected) {
      const posts = generateTikTokPosts(
        {
          id: p.id,
          name: p.name || "",
          slug: p.slug!,
          description: p.description || "",
          price: Number(p.price),
          category: p.category || "Pet Products",
          image_url: p.image_url!,
        },
        slotCursor,
      );
      // Take only the first N variants per product (rotate through templates)
      const picked = posts.slice(0, variantsPerProduct);
      allPosts.push(...picked);
      slotCursor += picked.length;
    }

    if (allPosts.length > 0) {
      const { error: insertError } = await sb
        .from("tiktok_post_queue")
        .insert(allPosts);
      if (insertError) throw insertError;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        queued: allPosts.length,
        products_used: selected.length,
        target_market: "US",
        templates_used: VIRAL_TEMPLATES.slice(0, variantsPerProduct).map((t) => t.label),
      }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("tiktok-content-generator error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});

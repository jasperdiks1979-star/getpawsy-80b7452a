import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { PINTEREST_ALLOWED_SLUGS } from "../_shared/pinterest-qa.ts";

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

const HOOK_TEMPLATES = [
  { variant: "hook" as const, prefix: "Stop", suffix: "forever" },
  { variant: "problem_solution" as const, prefix: "Tired of", suffix: "? Try this" },
  { variant: "benefit" as const, prefix: "Why pet owners love", suffix: "" },
];

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function detectBoard(name: string, category: string): string {
  const lower = (name + " " + category).toLowerCase();
  if (lower.includes("tree") || lower.includes("tower")) return "Cat Trees for Large Cats";
  if (lower.includes("litter")) return "Cat Essentials";
  if (lower.includes("furniture") || lower.includes("shelf") || lower.includes("wall")) return "Cat Furniture";
  if (lower.includes("cat") || lower.includes("kitten")) return "Cat Products";
  if (lower.includes("dog") || lower.includes("puppy")) return "Cat Products";
  return "Cat Products";
}

function generatePinVariants(product: {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  category: string;
  image_url: string;
}): Array<{
  product_id: string;
  product_slug: string;
  product_name: string;
  pin_variant: string;
  pin_title: string;
  pin_description: string;
  pin_image_url: string;
  destination_link: string;
  board_name: string;
  hashtags: string[];
  priority: string;
  scheduled_at: string;
}> {
  const BASE_URL = "https://getpawsy.pet";
  const utm = `?utm_source=pinterest&utm_medium=social&utm_campaign=auto_pin&utm_content=${product.slug}`;
  const board = detectBoard(product.name, product.category);
  const shortName = product.name.length > 60 ? product.name.slice(0, 57) + "..." : product.name;
  const desc = stripHtml(product.description || "").slice(0, 200);
  const category = (product.category || "pet products").toLowerCase();

  const hashtags = [
    "#petproducts",
    "#petsupplies",
    `#${category.replace(/\s+/g, "")}`,
    "#petcare",
    "#petlovers",
    "#smartpet",
    "#getpawsy",
  ];

  const isLitterBox = product.name.toLowerCase().includes("litter");
  const priority = isLitterBox ? "high" : "medium";

  const now = new Date();

  return [
    {
      product_id: product.id,
      product_slug: product.slug,
      product_name: product.name,
      pin_variant: "hook",
      pin_title: `This Changed Everything for ${category.includes("cat") ? "Cat" : "Pet"} Owners 🐾`,
      pin_description: `✔ ${desc}\n\nDiscover why thousands of pet parents switched to ${shortName}. Browse smart pet solutions on GetPawsy.\n\n${hashtags.join(" ")}`,
      pin_image_url: product.image_url,
      destination_link: `${BASE_URL}/products/${product.slug}${utm}`,
      board_name: board,
      hashtags,
      priority,
      scheduled_at: new Date(now.getTime() + 0).toISOString(),
    },
    {
      product_id: product.id,
      product_slug: product.slug,
      product_name: product.name,
      pin_variant: "problem_solution",
      pin_title: `Tired of the Daily Hassle? ${shortName.slice(0, 50)}`,
      pin_description: `The #1 complaint from pet owners — solved.\n\n✔ Saves time\n✔ Reduces mess\n✔ Works automatically\n\n${desc.slice(0, 100)}\n\nShop now on GetPawsy 🛒\n\n${hashtags.join(" ")}`,
      pin_image_url: product.image_url,
      destination_link: `${BASE_URL}/products/${product.slug}${utm}`,
      board_name: board,
      hashtags,
      priority,
      scheduled_at: new Date(now.getTime() + 4 * 3600000).toISOString(), // +4h
    },
    {
      product_id: product.id,
      product_slug: product.slug,
      product_name: product.name,
      pin_variant: "benefit",
      pin_title: `Why Pet Parents Love ${shortName.slice(0, 60)} ❤️`,
      pin_description: `✔ Convenience you'll wonder how you lived without\n✔ Built for busy pet parents\n✔ US shipping · 5–10 business days\n\n${desc.slice(0, 120)}\n\nExplore at GetPawsy.pet\n\n${hashtags.join(" ")}`,
      pin_image_url: product.image_url,
      destination_link: `${BASE_URL}/products/${product.slug}${utm}`,
      board_name: board,
      hashtags,
      priority,
      scheduled_at: new Date(now.getTime() + 8 * 3600000).toISOString(), // +8h
    },
  ];
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    // 🛡️ Performance Mode lockdown — only the hero allowlist may be auto-pinned.
    // The legacy multi-product scheduler is disabled until scale_unlocked.
    return new Response(
      JSON.stringify({
        ok: false,
        code: "PERFORMANCE_MODE_LOCKDOWN",
        message: `Auto-scheduler is disabled in Performance Mode. Use pinterest-viral-batch for the approved hero slug(s): ${Array.from(PINTEREST_ALLOWED_SLUGS).join(", ")}.`,
      }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
    // eslint-disable-next-line no-unreachable
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const dailyTarget = Math.min(Math.max(body.count || 9, 3), 15);
    const productsNeeded = Math.ceil(dailyTarget / 3); // 3 variants per product

    // Check what was posted in last 7 days to avoid duplicates
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: recentPins } = await sb
      .from("pinterest_pin_queue")
      .select("product_id")
      .gte("created_at", sevenDaysAgo);

    const recentProductIds = new Set((recentPins || []).map((p) => p.product_id));

    // Fetch eligible products
    const { data: products, error } = await sb
      .from("products")
      .select("id, name, slug, description, price, compare_at_price, category, image_url, stock, cost_price")
      .eq("is_active", true)
      .gt("stock", 0)
      .not("image_url", "is", null)
      .not("slug", "is", null)
      .gt("price", 0)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    // Filter out recently pinned, prioritize high-margin
    let eligible = (products || []).filter((p) => !recentProductIds.has(p.id));

    // If not enough fresh products, allow repeats but deprioritize
    if (eligible.length < productsNeeded) {
      const repeats = (products || []).filter((p) => recentProductIds.has(p.id));
      eligible = [...eligible, ...repeats];
    }

    // Always include litter box if available
    const litterBoxIdx = eligible.findIndex((p) =>
      (p.name || "").toLowerCase().includes("litter")
    );
    if (litterBoxIdx > 0) {
      const [lb] = eligible.splice(litterBoxIdx, 1);
      eligible.unshift(lb);
    }

    // Take needed products
    const selected = eligible.slice(0, productsNeeded);

    // Generate pin variants
    const allPins = selected.flatMap((p) =>
      generatePinVariants({
        id: p.id,
        name: p.name || "",
        slug: p.slug!,
        description: p.description || "",
        price: Number(p.price),
        category: p.category || "Pet Products",
        image_url: p.image_url!,
      })
    );

    // Trim to daily target
    const toQueue = allPins.slice(0, dailyTarget);

    // Insert into queue
    if (toQueue.length > 0) {
      const { error: insertError } = await sb
        .from("pinterest_pin_queue")
        .insert(toQueue);
      if (insertError) throw insertError;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        queued: toQueue.length,
        products_used: selected.length,
        sample: toQueue.slice(0, 3),
      }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("pinterest-scheduler error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});

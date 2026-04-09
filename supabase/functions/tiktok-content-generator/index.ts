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

const HOOK_TEMPLATES: Array<{
  variant: string;
  titleTemplate: (name: string, category: string) => string;
  captionTemplate: (name: string, desc: string, hashtags: string) => string;
}> = [
  {
    variant: "hook",
    titleTemplate: (name, cat) => `Wait til you see what this ${cat} product does 😱`,
    captionTemplate: (name, desc, tags) =>
      `POV: You just discovered ${name} and your life changed forever 🐾\n\n${desc.slice(0, 100)}\n\n🔗 Link in bio → GetPawsy.pet\n\n${tags}`,
  },
  {
    variant: "problem_solution",
    titleTemplate: (name, cat) => `Every ${cat} owner needs this 👇`,
    captionTemplate: (name, desc, tags) =>
      `Tired of the daily struggle? ${name} solves it ✅\n\n✔ Saves time\n✔ Your pet will love it\n✔ Free US shipping\n\n${desc.slice(0, 80)}\n\n🛒 Shop at GetPawsy.pet\n\n${tags}`,
  },
  {
    variant: "benefit",
    titleTemplate: (name) => `Why thousands of pet parents switched to ${name.slice(0, 40)} ❤️`,
    captionTemplate: (name, desc, tags) =>
      `This is the product pet parents are obsessed with 🐱🐶\n\n${desc.slice(0, 100)}\n\nDiscover why at GetPawsy.pet 🔗\n\n${tags}`,
  },
  {
    variant: "demo",
    titleTemplate: (name) => `${name.slice(0, 50)} — Watch it in action 🎬`,
    captionTemplate: (name, desc, tags) =>
      `Here's how ${name} works in real life 👀\n\n${desc.slice(0, 100)}\n\nAvailable at GetPawsy.pet 🛒\n\n${tags}`,
  },
  {
    variant: "trending",
    titleTemplate: (name, cat) => `The ${cat} product that's going viral 🔥`,
    captionTemplate: (name, desc, tags) =>
      `This is why ${name} is trending right now 📈\n\n${desc.slice(0, 100)}\n\nGet yours → GetPawsy.pet\n\n${tags}`,
  },
];

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function generateTikTokPosts(product: {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  category: string;
  image_url: string;
}) {
  const BASE_URL = "https://getpawsy.pet";
  const utm = `?utm_source=tiktok&utm_medium=organic&utm_campaign=auto_post&utm_content=${product.slug}`;
  const category = (product.category || "pet").toLowerCase().replace(/s$/, "");
  const desc = stripHtml(product.description || "");

  const hashtags = [
    "#petproducts",
    "#pettok",
    `#${category.replace(/\s+/g, "")}`,
    "#petcare",
    "#petlovers",
    "#getpawsy",
    "#fyp",
    "#foryou",
  ];
  const tagStr = hashtags.join(" ");

  const now = new Date();

  return HOOK_TEMPLATES.map((tpl, i) => ({
    product_id: product.id,
    product_slug: product.slug,
    product_name: product.name,
    post_variant: tpl.variant,
    caption: tpl.captionTemplate(product.name, desc, tagStr),
    hashtags,
    thumbnail_url: product.image_url,
    destination_link: `${BASE_URL}/lp/${product.slug}${utm}`,
    priority: product.name.toLowerCase().includes("litter") ? "high" : "medium",
    status: "draft",
    scheduled_at: new Date(now.getTime() + i * 4 * 3600000).toISOString(),
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
    const productsNeeded = count;

    // Avoid recent duplicates
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: recentPosts } = await sb
      .from("tiktok_post_queue")
      .select("product_id")
      .gte("created_at", sevenDaysAgo);

    const recentIds = new Set((recentPosts || []).map((p: any) => p.product_id));

    // Fetch products
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
    if (eligible.length < productsNeeded) {
      const repeats = (products || []).filter((p: any) => recentIds.has(p.id));
      eligible = [...eligible, ...repeats];
    }

    const selected = eligible.slice(0, productsNeeded);

    const allPosts = selected.flatMap((p: any) =>
      generateTikTokPosts({
        id: p.id,
        name: p.name || "",
        slug: p.slug!,
        description: p.description || "",
        price: Number(p.price),
        category: p.category || "Pet Products",
        image_url: p.image_url!,
      })
    );

    // Only take first variant per product to keep volume manageable
    const toInsert = allPosts
      .filter((_: any, i: number) => i % HOOK_TEMPLATES.length === 0 || allPosts.length <= count * 2)
      .slice(0, count * 2);

    if (toInsert.length > 0) {
      const { error: insertError } = await sb
        .from("tiktok_post_queue")
        .insert(toInsert);
      if (insertError) throw insertError;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        queued: toInsert.length,
        products_used: selected.length,
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

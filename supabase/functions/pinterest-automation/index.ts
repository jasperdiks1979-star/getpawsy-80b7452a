import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { PINTEREST_ALLOWED_SLUGS, runPinQa } from "../_shared/pinterest-qa.ts";

const QA_LOCKDOWN_ERROR = {
  ok: false,
  code: "PINTEREST_QA_LOCKDOWN",
  error: `Pinterest automation is restricted to: ${Array.from(PINTEREST_ALLOWED_SLUGS).join(", ")}. Use the Generate Viral Pins button to create draft pins for the approved product.`,
};
import { resolvePinterestBoardId } from "../_shared/pinterest.ts";
import { getPinterestApiBase, getPinterestMode, markProductionForbidden } from "../_shared/pinterest-config.ts";

const ALLOWED_ORIGINS = [
  "https://getpawsy.pet",
  "https://www.getpawsy.pet",
  "https://getpawsy.lovable.app",
  "https://id-preview--597d7eb2-8207-4374-9ac1-67ffe0048ce1.lovable.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const BASE_URL = "https://getpawsy.pet";
const PINTEREST_PRODUCTION_API_BASE = "https://api.pinterest.com/v5";
const DIRECT_TEST_IMAGE_URL = "https://getpawsy.pet/images/products/128e0207-8a94-4d71-b428-5b7f5002528f.webp";
const DIRECT_TEST_DESTINATION_URL = "https://getpawsy.pet/products/automatic-cat-litter-box-self-cleaning-app-control";
const DIRECT_TEST_TITLE = "Self-Cleaning Cat Litter Box";
const DIRECT_TEST_DESCRIPTION = "A smart automatic litter box for busy cat owners.";
const DIRECT_TEST_REQUIRED_SCOPE = "pins:write";
const DIRECT_TEST_ADMIN_EMAILS = new Set(["jasperdiks@hotmail.com"]);

// ── Viral Hook System v3 — mandatory ≤6-word scroll-stoppers ──
const VIRAL_HOOKS: string[] = [
  "Wait… this cleans itself?",
  "I stopped cleaning my litter box",
  "This fixed the worst cat problem",
  "This is why your house smells",
  "I wish I found this sooner",
  "Every cat owner needs this",
  "This feels illegal for cat owners",
  "Cats are obsessed with this",
  "I replaced my litter box with THIS",
  "You're doing this wrong",
];
// High-risk viral hooks injected every 3rd pin
const HIGH_RISK_HOOKS = new Set<string>([
  "This feels illegal for cat owners",
  "I replaced my litter box with THIS",
  "You're doing this wrong",
]);

// Variants: A=Curiosity/Shock, B=Pain→Solution, C=Testimonial/Transformation
type ViralVariant = "A" | "B" | "C";
const VARIANT_LABELS: Record<ViralVariant, string> = {
  A: "Curiosity/Shock",
  B: "Pain→Solution",
  C: "Testimonial",
};

const SOFT_CTAS = [
  "See why cat owners switched",
  "Find out why",
  "Learn more",
];

function buildViralTitle(hook: string, _productName: string, _variant: ViralVariant): string {
  // Hook IS the title — short, punchy, ≤100 chars (Pinterest limit)
  return hook.slice(0, 100);
}

function buildViralDescription(hook: string, productName: string, variant: ViralVariant): string {
  const name = (productName || "this").slice(0, 50);
  const cta = SOFT_CTAS[Math.abs(hashCode(name + variant)) % SOFT_CTAS.length];
  // 4 lines: problem → solution → benefit → CTA
  const lines: Record<ViralVariant, string[]> = {
    A: [
      hook,
      `${name} — built for indoor cats.`,
      "Less smell. Less mess. More time.",
      `${cta} →`,
    ],
    B: [
      "The smell, the scooping, the mess — every day.",
      `${name} handles it for you.`,
      "Cleaner home in minutes, not hours.",
      `${cta} →`,
    ],
    C: [
      "I stopped dreading the litter box.",
      `Switching to ${name} changed our home.`,
      "Calmer cat. Cleaner space. Less stress.",
      `${cta} →`,
    ],
  };
  return lines[variant].join("\n");
}

/** CTR-readiness heuristic (0–100): rewards short hook, real image, deep link, and variant balance. */
function ctrReadyScore(opts: { hook: string; imageUrl: string; destLink: string; variant: ViralVariant }): number {
  let s = 50;
  const words = opts.hook.split(/\s+/).filter(Boolean).length;
  if (words > 0 && words <= 6) s += 20;
  if (HIGH_RISK_HOOKS.has(opts.hook)) s += 10;
  if (/\?$/.test(opts.hook) || /\!$/.test(opts.hook)) s += 5;
  if (opts.imageUrl && /^https?:\/\//.test(opts.imageUrl)) s += 10;
  if (opts.destLink && opts.destLink.includes("/products/")) s += 5;
  if (opts.variant === "C") s += 2; // testimonial slight edge
  return Math.max(0, Math.min(100, s));
}

/** Pick 3 distinct hooks for a product (one per variant), deterministic, last slot biased to high-risk. */
function pickHooksForProduct(productId: string): string[] {
  const seed = Math.abs(hashCode(productId || "x"));
  const pool = [...VIRAL_HOOKS];
  const out: string[] = [];
  for (let i = 0; i < 2; i++) {
    const idx = (seed + i * 7) % pool.length;
    out.push(pool.splice(idx, 1)[0]);
  }
  // Slot 3: prefer a high-risk hook still in the pool
  const risky = pool.filter((h) => HIGH_RISK_HOOKS.has(h));
  out.push(risky.length ? risky[seed % risky.length] : pool[seed % pool.length]);
  return out;
}

// ── Scale Engine: 10 unique scroll-stopping hooks for cat products ──
const SCALE_HOOKS_CAT: string[] = [
  "Stop scooping your cat's litter every day",
  "This fixes the worst part of owning a cat",
  "Cat owners are switching to this",
  "No smell. No mess. No effort.",
  "I wish I bought this when I got my cat",
  "The litter box hack every cat parent needs",
  "Why your house smells like cat (and how to fix it)",
  "Cleaner litter box. Happier cat. Less work.",
  "If you have a cat, you need this",
  "The 30-second cat litter trick changing everything",
];

const SCALE_HOOKS_TREE: string[] = [
  "Your cat secretly hates that flimsy cat tree",
  "The cat tree that actually survives big cats",
  "Stop buying cat trees that fall apart",
  "Indoor cats deserve better than this",
  "This cat tree changed our living room",
  "The only cat tree worth your money",
  "Why every cat in your house will fight for this",
  "Built like furniture. Loved by cats.",
  "If you have an apartment, this cat tree fits",
  "The Maine Coon-approved cat tree",
];

const SCALE_HOOKS_CARE: string[] = [
  "Cat care got 10x easier with this",
  "Smart cat owners are doing this differently",
  "The cat care upgrade you didn't know you needed",
  "Stop overpaying for cat supplies that don't work",
  "This is the cat product going viral",
  "Cat parents swear by this one thing",
  "Make cat ownership 90% easier",
  "Your cat's new favorite thing",
  "The clever cat care trick saving hours",
  "If you have an indoor cat, read this",
];

const SCALE_BOARDS = [
  "Cat Care Essentials",
  "Smart Pet Products",
  "Cat Owner Hacks",
  "Pet Cleaning Solutions",
];

function pickHookSet(name: string): string[] {
  const n = name.toLowerCase();
  if (n.includes("tree") || n.includes("tower") || n.includes("condo")) return SCALE_HOOKS_TREE;
  if (n.includes("litter")) return SCALE_HOOKS_CAT;
  return SCALE_HOOKS_CARE;
}

function buildScaleDescription(hook: string, productName: string): string {
  return `${hook}.\n\n✔ Made for indoor cats\n✔ Easy to set up — most owners do it in 10 min\n✔ Ships from US warehouses\n\nSee why thousands of cat parents picked ${productName.slice(0, 60)} on GetPawsy.\n\n#catlitterbox #selfcleaninglitterbox #catcare #smartpetproducts #catmom #indoorcat`;
}

/** Build 10 scale-engine pins for one product, distributing across 4 boards & randomized 24h schedule. */
function generateScalePins(product: any, startMs: number, slotMinutes: number[]): any[] {
  const hooks = pickHookSet(product.name || "");
  const slug = product.slug;
  const pins: any[] = [];
  for (let i = 0; i < hooks.length; i++) {
    const hook = hooks[i];
    const board = SCALE_BOARDS[i % SCALE_BOARDS.length];
    const variantTag = `scale_${Date.now().toString(36)}_${i + 1}`;
    const destUrl = `${BASE_URL}/products/${slug}?utm_source=pinterest&utm_medium=organic&utm_campaign=scale&utm_content=${slug}-v${i + 1}`;
    const minutesOffset = slotMinutes[i % slotMinutes.length];
    const scheduledAt = new Date(startMs + minutesOffset * 60_000).toISOString();
    pins.push({
      product_id: product.id,
      product_slug: slug,
      product_name: product.name,
      pin_variant: variantTag,
      hook_group: "scale",
      category_key: "scale",
      pin_title: `${hook} — ${(product.name || "").slice(0, 60)}`.slice(0, 100),
      pin_description: buildScaleDescription(hook, product.name || ""),
      pin_image_url: product.image_url || "",
      destination_link: destUrl,
      board_name: board,
      overlay_text: hook,
      hashtags: ["#catlitterbox", "#selfcleaninglitterbox", "#catcare", "#smartpetproducts", "#getpawsy"],
      priority: "high",
      status: "queued",
      scheduled_at: scheduledAt,
    });
  }
  return pins;
}

// ── GetPawsy-specific hook templates ──
const HOOKS: Record<string, { problem: string[]; curiosity: string[]; result: string[]; target: string[] }> = {
  cat_trees: {
    problem: ["Stop Buying Cheap Cat Trees", "Tired of Ugly Cat Trees?", "Cat Trees That Actually Last"],
    curiosity: ["Cats Are Obsessed With This", "This Cat Tree Changed Everything", "Why Cat Owners Are Switching"],
    result: ["Big Cat? This Is The One", "Finally a Cat Tree Worth It", "The Cat Tree That Stays Standing"],
    target: ["Small Apartment? Try This", "Best Cat Tree for Large Cats", "Multi-Cat Household Solution"],
  },
  cat_litter_boxes: {
    problem: ["Stop Scooping So Much", "End the Litter Box Struggle", "No More Litter Box Odor"],
    curiosity: ["Future of Cat Litter Boxes", "Why This Litter Box Sells Out", "The Litter Box Upgrade You Need"],
    result: ["Easy To Clean Cat Setup", "Finally a Smart Litter Box", "Cleaner Home in Minutes"],
    target: ["Busy Cat Owner? Try This", "Best for Multi-Cat Homes", "Apartment-Friendly Litter Box"],
  },
  cat_furniture: {
    problem: ["Cats Destroying Your Furniture?", "Stop Buying Cheap Cat Shelves", "Your Cat Deserves Better"],
    curiosity: ["Modern Cat Furniture That Works", "Why This Design Went Viral", "Cat Furniture That Looks Good"],
    result: ["Happy Cat, Stylish Home", "The Cat Shelf That Fits Anywhere", "Premium Cat Furniture Worth It"],
    target: ["Small Space Cat Setup", "Best Cat Furniture for Apartments", "Indoor Cat Must-Have"],
  },
  cat_essentials: {
    problem: ["Stop Overpaying for Cat Supplies", "Cat Essentials You're Missing", "Your Cat Setup Needs This"],
    curiosity: ["Why Cat Owners Love This", "The Cat Product Going Viral", "Smart Cat Essentials"],
    result: ["Better Cat Care Made Easy", "Upgrade Your Cat's Life", "Simple Cat Care Solution"],
    target: ["New Cat Owner Starter Kit", "Indoor Cat Essentials", "Best Gifts for Cat Lovers"],
  },
  dog_travel: {
    problem: ["Traveling With Your Dog Is Stressful", "Dog Travel Mistakes to Avoid", "Stop Struggling With Dog Trips"],
    curiosity: ["Dog Travel Made Easy", "Why Dog Owners Swear By This", "The Travel Gear Dogs Love"],
    result: ["Stress-Free Dog Travel", "Road Trip Ready With Your Dog", "Your Dog Will Thank You"],
    target: ["Best Dog Travel Gear", "Dog Car Accessories That Work", "Flying With Your Dog?"],
  },
};

function detectCategory(name: string, category: string): string {
  const lower = (name + " " + category).toLowerCase();
  if (lower.includes("cat tree") || lower.includes("cat condo") || lower.includes("cat tower")) return "cat_trees";
  if (lower.includes("litter")) return "cat_litter_boxes";
  if (lower.includes("cat") && (lower.includes("furniture") || lower.includes("shelf") || lower.includes("shelves") || lower.includes("perch"))) return "cat_furniture";
  if (lower.includes("dog") && (lower.includes("travel") || lower.includes("car") || lower.includes("carrier"))) return "dog_travel";
  if (lower.includes("cat")) return "cat_essentials";
  return "cat_essentials";
}

function generatePins(product: any, boards: Record<string, string[]>) {
  const catKey = detectCategory(product.name || "", product.category || "");
  const boardList = boards[catKey] || boards.fallback || ["Pet Products"];

  // Viral system: 3 variants (A/B/C) per product, each with a distinct ≤6-word hook
  const hooks = pickHooksForProduct(product.id || product.slug || product.name || "");
  const variants: ViralVariant[] = ["A", "B", "C"];
  const pins: any[] = [];

  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    const hook = hooks[i];
    const board = boardList[i % boardList.length];
    const destUrl = product.slug
      ? `${BASE_URL}/products/${product.slug}?utm_source=pinterest&utm_medium=organic&utm_campaign=viral_v3&utm_content=${product.slug}-${variant}`
      : `${BASE_URL}/collections/${catKey.replace("_", "-")}?utm_source=pinterest&utm_medium=organic&utm_campaign=viral_v3`;

    const score = ctrReadyScore({ hook, imageUrl: product.image_url || "", destLink: destUrl, variant });

    pins.push({
      product_id: product.id,
      product_slug: product.slug || "",
      product_name: product.name || "",
      pin_variant: `viral_${variant}`,
      hook_group: VARIANT_LABELS[variant],
      category_key: catKey,
      pin_title: buildViralTitle(hook, product.name || "", variant),
      pin_description: buildViralDescription(hook, product.name || "", variant),
      pin_image_url: product.image_url || "",
      destination_link: destUrl,
      board_name: board,
      overlay_text: hook,
      hashtags: buildHashtags(catKey),
      priority: catKey === "cat_trees" || catKey === "cat_litter_boxes" ? "high" : catKey === "dog_travel" ? "low" : "medium",
      status: "draft",
      scheduled_at: null,
    });
    // score is logged at publish time via cron worker (overlay_text + variant heuristic)
    void score;
  }

  return pins;
}

function buildDescription(hook: string, product: any, group: string): string {
  const name = product.name || "this product";
  const ctas = [
    "Shop now on GetPawsy",
    "Browse smart pet products on GetPawsy",
    "Discover more at GetPawsy.pet",
    "Find the perfect fit at GetPawsy",
  ];
  const cta = ctas[Math.floor(Math.abs(hashCode(product.id || "")) % ctas.length)];

  const descs: Record<string, string> = {
    problem: `${hook}.\n\n✔ Built for durability\n✔ Easy to set up\n✔ Free shipping over $35\n\n${cta}`,
    curiosity: `${hook}.\n\nPet owners are choosing ${name} for good reason.\n\n✔ Premium quality\n✔ US shipping\n✔ 30-day returns\n\n${cta}`,
    result: `${hook}.\n\n✔ Highly rated by pet owners\n✔ Sturdy and well-made\n✔ Ships from US warehouses\n\n${cta}`,
    target: `${hook}.\n\nDesigned for pet parents who want the best.\n\n✔ Space-efficient\n✔ Easy assembly\n✔ Free shipping over $35\n\n${cta}`,
  };
  return descs[group] || descs.problem;
}

function buildHashtags(catKey: string): string[] {
  const base = ["#petproducts", "#getpawsy"];
  const specific: Record<string, string[]> = {
    cat_trees: ["#cattree", "#catfurniture", "#catlife", "#catmom", "#indoorcat"],
    cat_litter_boxes: ["#catlitterbox", "#catcare", "#catmom", "#indoorcat", "#smartpet"],
    cat_furniture: ["#catfurniture", "#catshelf", "#moderncat", "#catlover"],
    cat_essentials: ["#catessentials", "#catcare", "#catlife", "#catmom"],
    dog_travel: ["#dogtravel", "#doglife", "#dogmom", "#travelwithdog"],
  };
  return [...base, ...(specific[catKey] || specific.cat_essentials)];
}

function hashCode(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return hash;
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
    const action = body.action as string;

    if (action === "direct_pinterest_api_test") {
      const adminCheck = await requireDirectTestAdmin(sb, req);
      if (!adminCheck.ok) return json(cors, { ok: false, error: adminCheck.error });

      const { data: conn } = await sb
        .from("pinterest_connection")
        .select("*")
        .eq("status", "connected")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!conn?.access_token) return json(cors, { ok: false, error: "Pinterest not connected: no latest OAuth access token found" });

      const accessToken = await getFreshPinterestProductionToken(sb, conn);
      if (!accessToken) return json(cors, { ok: false, error: "Pinterest OAuth token is expired and refresh failed" });

      return await runDirectPinterestApiTest(sb, conn, accessToken, cors);
    }

    if (action === "get_connection") {
      const { data } = await sb.from("pinterest_connection").select("*").limit(1).maybeSingle();
      return json(cors, { ok: true, connection: data });
    }

    if (action === "set_sandbox_token") {
      const envToken = Deno.env.get("PINTEREST_ACCESS_TOKEN");
      if (!envToken) return json(cors, { ok: false, error: "PINTEREST_ACCESS_TOKEN secret not set" });

      const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
      const payload = {
        account_name: "Sandbox Account",
        account_id: "sandbox",
        access_token: envToken,
        refresh_token: null,
        token_expires_at: expiresAt,
        status: "connected",
        last_error: null,
        updated_at: new Date().toISOString(),
      };

      const { data: existing } = await sb.from("pinterest_connection").select("id").limit(1).maybeSingle();
      const { error: dbErr } = existing?.id
        ? await sb.from("pinterest_connection").update(payload).eq("id", existing.id)
        : await sb.from("pinterest_connection").insert(payload);

      if (dbErr) return json(cors, { ok: false, error: dbErr.message });
      return json(cors, { ok: true, message: "Sandbox token activated" });
    }

    if (action === "get_dashboard") {
      const [
        { count: totalProducts },
        { count: readyProducts },
        { count: queuedPins },
        { count: postedPins },
        { count: failedPins },
        { data: boardMappings },
      ] = await Promise.all([
        sb.from("products").select("*", { count: "exact", head: true }).eq("is_active", true),
        sb.from("products").select("*", { count: "exact", head: true }).eq("pinterest_ready", true).eq("pinterest_disabled", false),
        sb.from("pinterest_pin_queue").select("*", { count: "exact", head: true }).in("status", ["draft", "queued", "scheduled"]),
        sb.from("pinterest_pin_queue").select("*", { count: "exact", head: true }).eq("status", "posted"),
        sb.from("pinterest_pin_queue").select("*", { count: "exact", head: true }).eq("status", "failed"),
        sb.from("pinterest_board_mappings").select("*").order("priority"),
      ]);
      const { data: connection } = await sb.from("pinterest_connection").select("*").limit(1).maybeSingle();

      return json(cors, {
        ok: true,
        stats: { totalProducts, readyProducts, queuedPins, postedPins, failedPins },
        boardMappings,
        connection,
      });
    }

    if (action === "generate_pins") {
      const productId = body.productId;
      if (!productId) throw new Error("productId required");

      const { data: product, error } = await sb
        .from("products")
        .select("id, name, slug, description, price, category, image_url")
        .eq("id", productId)
        .single();
      if (error || !product) throw new Error("Product not found");

      const { data: mappings } = await sb.from("pinterest_board_mappings").select("category_key, board_names");
      const boards: Record<string, string[]> = {};
      for (const m of mappings || []) boards[m.category_key] = m.board_names;

      const pins = generatePins(product, boards);

      await sb.from("pinterest_pin_queue")
        .delete()
        .eq("product_id", productId)
        .in("status", ["draft", "queued", "scheduled"]);

      if (pins.length > 0) {
        const { error: insertErr } = await sb.from("pinterest_pin_queue").insert(pins);
        if (insertErr) throw insertErr;
      }

      const catKey = detectCategory(product.name || "", product.category || "");
      await sb.from("products").update({
        pinterest_ready: true,
        pinterest_category: catKey,
        pinterest_last_generated_at: new Date().toISOString(),
        pinterest_status: "generated",
      }).eq("id", productId);

      return json(cors, { ok: true, generated: pins.length, category: catKey });
    }

    if (action === "bulk_generate") {
      const { data: products } = await sb
        .from("products")
        .select("id, name, slug, description, price, category, image_url")
        .eq("is_active", true)
        .eq("pinterest_disabled", false)
        .not("image_url", "is", null)
        .not("slug", "is", null)
        .gt("price", 0)
        .order("created_at", { ascending: false })
        .limit(50);

      const { data: mappings } = await sb.from("pinterest_board_mappings").select("category_key, board_names");
      const boards: Record<string, string[]> = {};
      for (const m of mappings || []) boards[m.category_key] = m.board_names;

      let totalGenerated = 0;
      for (const product of products || []) {
        const pins = generatePins(product, boards);
        await sb.from("pinterest_pin_queue").delete().eq("product_id", product.id).in("status", ["draft", "queued", "scheduled"]);
        if (pins.length > 0) {
          await sb.from("pinterest_pin_queue").insert(pins);
          totalGenerated += pins.length;
        }
        const catKey = detectCategory(product.name || "", product.category || "");
        await sb.from("products").update({
          pinterest_ready: true,
          pinterest_category: catKey,
          pinterest_last_generated_at: new Date().toISOString(),
          pinterest_status: "generated",
        }).eq("id", product.id);
      }

      return json(cors, { ok: true, products: (products || []).length, pinsGenerated: totalGenerated });
    }

    if (action === "queue_pins") {
      const limit = Math.min(body.count || 9, 30);
      const { data: drafts } = await sb.from("pinterest_pin_queue")
        .select("id, priority, pin_variant, overlay_text")
        .eq("status", "draft")
        .order("priority", { ascending: true })
        .limit(limit);

      if (!drafts?.length) return json(cors, { ok: true, queued: 0 });

      // Interleave: avoid consecutive same-hook/variant; inject high-risk hook every 3rd slot
      const HIGH_RISK = new Set<string>([
        "This feels illegal for cat owners",
        "I replaced my litter box with THIS",
        "You're doing this wrong",
      ]);
      const ordered: any[] = [];
      const remaining = [...drafts];
      while (remaining.length) {
        const last = ordered[ordered.length - 1];
        const wantHighRisk = ordered.length > 0 && (ordered.length + 1) % 3 === 0;
        let pickIdx = -1;
        if (wantHighRisk) {
          pickIdx = remaining.findIndex(
            (d) => HIGH_RISK.has(d.overlay_text) && (!last || d.overlay_text !== last.overlay_text),
          );
        }
        if (pickIdx === -1) {
          pickIdx = remaining.findIndex(
            (d) => !last || (d.pin_variant !== last.pin_variant && d.overlay_text !== last.overlay_text),
          );
        }
        if (pickIdx === -1) pickIdx = 0;
        ordered.push(remaining.splice(pickIdx, 1)[0]);
      }

      const now = Date.now();
      for (let i = 0; i < ordered.length; i++) {
        const hoursOffset = Math.floor(i / 3) * 24 + (i % 3) * 8;
        const scheduledAt = new Date(now + hoursOffset * 3600000).toISOString();
        await sb.from("pinterest_pin_queue").update({ status: "queued", scheduled_at: scheduledAt }).eq("id", ordered[i].id);
      }

      return json(cors, { ok: true, queued: ordered.length });
    }

    if (action === "get_queue") {
      const status = body.status || "queued";
      const { data: pins } = await sb.from("pinterest_pin_queue")
        .select("*")
        .eq("status", status)
        .order("scheduled_at", { ascending: true })
        .limit(50);
      return json(cors, { ok: true, pins });
    }

    if (action === "get_products") {
      const { data: products } = await sb.from("products")
        .select("id, name, slug, category, image_url, price, is_active, pinterest_ready, pinterest_disabled, pinterest_priority, pinterest_category, pinterest_last_generated_at, pinterest_last_posted_at, pinterest_status, pinterest_board_override")
        .eq("is_active", true)
        .order("name")
        .limit(100);
      return json(cors, { ok: true, products });
    }

    if (action === "update_product") {
      const { productId, ...fields } = body;
      if (!productId) throw new Error("productId required");
      const allowed = ["pinterest_ready", "pinterest_disabled", "pinterest_priority", "pinterest_board_override"];
      const updates: any = {};
      for (const k of allowed) if (k in fields) updates[k] = fields[k];
      if (Object.keys(updates).length === 0) throw new Error("No valid fields");
      await sb.from("products").update(updates).eq("id", productId);
      return json(cors, { ok: true });
    }

    if (action === "retry_failed") {
      const { error } = await sb.from("pinterest_pin_queue")
        .update({ status: "queued", error_message: null })
        .eq("status", "failed");
      return json(cors, { ok: true, error: error?.message });
    }

    if (action === "scale_100") {
      return json(cors, QA_LOCKDOWN_ERROR);
      // Generate ~100 pins/day spread across 24h, randomized intervals,
      // pulling 5–10 cat-focused products (litter boxes, cat trees, cat care).
      const targetPins = Math.min(Math.max(body.targetPins || 100, 10), 200);
      const productCount = Math.min(Math.max(body.productCount || 10, 5), 20);

      const { data: products, error: prodErr } = await sb
        .from("products")
        .select("id, name, slug, category, image_url")
        .eq("is_active", true)
        .eq("pinterest_disabled", false)
        .not("image_url", "is", null)
        .not("slug", "is", null)
        .or("category.ilike.%cat%,name.ilike.%cat%")
        .order("created_at", { ascending: false })
        .limit(80);
      if (prodErr) throw prodErr;

      // Prioritize litter boxes, then cat trees, then everything else cat
      const ranked = (products || []).sort((a, b) => {
        const score = (p: any) => {
          const n = (p.name || "").toLowerCase();
          if (n.includes("litter")) return 3;
          if (n.includes("tree") || n.includes("tower") || n.includes("condo")) return 2;
          return 1;
        };
        return score(b) - score(a);
      });
      const selected = ranked.slice(0, productCount);
      if (selected.length === 0) {
        return json(cors, { ok: false, error: "No eligible cat products found" });
      }

      const pinsPerProduct = Math.ceil(targetPins / selected.length);

      // Build randomized 24h slot list (minutes from now), one per pin
      const totalSlots = pinsPerProduct * selected.length;
      const baseInterval = (24 * 60) / totalSlots; // minutes per pin
      const slotMinutesAll: number[] = [];
      for (let i = 0; i < pinsPerProduct; i++) {
        const jitter = (Math.random() - 0.5) * baseInterval * 0.6;
        slotMinutesAll.push(Math.max(1, Math.round(i * baseInterval + jitter)));
      }

      const startMs = Date.now();
      let allPins: any[] = [];
      for (const p of selected) {
        const pins = generateScalePins(p, startMs, slotMinutesAll).slice(0, pinsPerProduct);
        allPins = allPins.concat(pins);
      }
      // Trim to exact target
      allPins = allPins.slice(0, targetPins);

      // Skip image-less or invalid pins
      allPins = allPins.filter(
        (p) => p.pin_image_url && p.pin_image_url.startsWith("https://") && p.product_slug,
      );

      if (allPins.length === 0) {
        return json(cors, { ok: false, error: "No valid pins generated" });
      }

      const { error: insErr } = await sb.from("pinterest_pin_queue").insert(allPins);
      if (insErr) throw insErr;

      // Mark products as ready
      for (const p of selected) {
        await sb.from("products").update({
          pinterest_ready: true,
          pinterest_category: "scale",
          pinterest_last_generated_at: new Date().toISOString(),
          pinterest_status: "generated",
        }).eq("id", p.id);
      }

      return json(cors, {
        ok: true,
        queued: allPins.length,
        productsUsed: selected.length,
        boards: SCALE_BOARDS,
        firstScheduled: allPins[0]?.scheduled_at,
        lastScheduled: allPins[allPins.length - 1]?.scheduled_at,
      });
    }

    if (action === "update_boards") {
      const { category_key, board_names } = body;
      if (!category_key || !board_names) throw new Error("category_key and board_names required");
      await sb.from("pinterest_board_mappings").upsert({ category_key, board_names }, { onConflict: "category_key" });
      return json(cors, { ok: true });
    }

    if (action === "publish_next") {
      const { data: conn } = await sb.from("pinterest_connection").select("*").limit(1).maybeSingle();
      if (!conn || conn.status !== "connected" || !conn.access_token) {
        return json(cors, { ok: false, error: "Pinterest not connected" });
      }

      const { data: pin } = await sb.from("pinterest_pin_queue")
        .select("*")
        .eq("status", "queued")
        .not("approved_at", "is", null)
        .in("product_slug", Array.from(PINTEREST_ALLOWED_SLUGS))
        .lt("retries", 2)
        .order("scheduled_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!pin) {
        const { data: anyQueued } = await sb.from("pinterest_pin_queue")
          .select("*")
          .eq("status", "queued")
          .order("scheduled_at", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        const eligibility = determineEligibility(anyQueued, { requireApproved: true, ignoreSchedule: true, allowed: Array.from(PINTEREST_ALLOWED_SLUGS), maxRetries: 2 });
        return json(cors, { ok: false, error: eligibility.reason || "no_eligible_queued_pin", selected_pin: compactPinForDiagnostics(anyQueued), eligibility });
      }

      return await publishSelectedPin(sb, conn, pin, cors, {
        actionName: "publish_next",
        requireApproved: true,
        ignoreSchedule: true,
      });
    }

    if (action === "approval_check") {
      const mode = await getPinterestMode(sb);
      const apiBase = await getPinterestApiBase(sb);
      const { count: pinsCreated } = await sb
        .from("pinterest_pin_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "posted")
        .not("pin_external_id", "is", null);

      const { data: recentLogs } = await sb
        .from("pinterest_post_logs")
        .select("status, response_data, created_at, error_message")
        .order("created_at", { ascending: false })
        .limit(20);

      // Count verified pins from logs (response_data.pin_verified === true)
      const { data: verifiedLogs } = await sb
        .from("pinterest_post_logs")
        .select("response_data")
        .eq("status", "success")
        .in("action", ["publish", "test_publish"])
        .limit(1000);
      const verifiedPinsCount = (verifiedLogs || []).filter(
        (l: any) => l?.response_data?.pin_verified === true,
      ).length;

      const sandboxWorking = (pinsCreated || 0) >= 3 && mode === "sandbox";
      return json(cors, {
        ok: true,
        mode,
        api_base: apiBase,
        can_publish_production: mode === "production",
        sandbox_working: sandboxWorking,
        pins_created: pinsCreated || 0,
        verified_pins_count: verifiedPinsCount,
        ready_for_upgrade: (pinsCreated || 0) >= 3,
        recent_logs: recentLogs || [],
      });
    }

    if (action === "set_mode") {
      // Admin-only: switch runtime mode (sandbox|production)
      const next = (body.mode || "").toLowerCase();
      if (next !== "sandbox" && next !== "production") {
        return json(cors, { ok: false, error: "mode must be 'sandbox' or 'production'" });
      }
      const { error: upErr } = await sb
        .from("pinterest_runtime_settings")
        .update({ mode: next, updated_at: new Date().toISOString() })
        .eq("id", 1);
      if (upErr) return json(cors, { ok: false, error: upErr.message });
      await sb.from("pinterest_post_logs").insert({
        action: "mode_change",
        status: "success",
        response_data: { mode: next },
      });
      return json(cors, { ok: true, mode: next });
    }

    if (action === "test_publish_sandbox") {
      // Create 3 real test pins against the active API base (sandbox by default).
      const { data: conn } = await sb.from("pinterest_connection").select("*").limit(1).maybeSingle();
      if (!conn?.access_token) return json(cors, { ok: false, error: "Pinterest not connected" });

      const { data: products } = await sb
        .from("products")
        .select("id, name, slug, image_url")
        .eq("is_active", true)
        .not("image_url", "is", null)
        .not("slug", "is", null)
        .limit(3);

      if (!products || products.length < 1) return json(cors, { ok: false, error: "No eligible products" });

      const boardName = SCALE_BOARDS[0];
      const boardId = await resolvePinterestBoardId(conn.access_token, boardName);

      const created: any[] = [];
      for (const p of products) {
        const title = `Test Pin — ${(p.name || "GetPawsy").slice(0, 90)}`;
        const description = `Sandbox approval test pin for GetPawsy. ${p.name}`;
        const link = `${BASE_URL}/products/${p.slug}?utm_source=pinterest&utm_medium=test&utm_campaign=approval`;
        try {
          const mode = await getPinterestMode(sb);
          const apiBase = await getPinterestApiBase(sb);
          console.log("[pinterest] publish", { mode, api_base: apiBase, test: true });
          const res = await fetch(`${apiBase}/pins`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${conn.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              title,
              description,
              board_id: boardId,
              media_source: { source_type: "image_url", url: p.image_url },
              link,
            }),
          });
          const body = await res.json().catch(() => ({}));
          console.log("[pinterest] response", { status: res.status, mode, api_base: apiBase, pin_id: body?.id });
          if (!res.ok || !body?.id) {
            if (res.status === 403 && mode === "production") {
              await markProductionForbidden(sb);
            }
            await sb.from("pinterest_post_logs").insert({
              action: "test_publish",
              status: "failed",
              error_message: `HTTP ${res.status}: ${JSON.stringify(body).slice(0, 500)}`,
              response_data: { mode, api_base: apiBase },
            });
            created.push({ product_id: p.id, ok: false, error: body });
            continue;
          }
          const externalUrl = `https://www.pinterest.com/pin/${body.id}/`;
          // Verify pin exists (retry once after 5s if missing)
          const verifyOnce = async (): Promise<boolean> => {
            try {
              const vr = await fetch(`${apiBase}/pins/${body.id}`, {
                headers: { Authorization: `Bearer ${conn.access_token}` },
              });
              return vr.ok;
            } catch { return false; }
          };
          let pinVerified = await verifyOnce();
          if (!pinVerified) {
            await new Promise((r) => setTimeout(r, 5000));
            pinVerified = await verifyOnce();
          }
          console.log("[pinterest] verify", { pin_id: body.id, pin_verified: pinVerified });
          await sb.from("pinterest_post_logs").insert({
            action: "test_publish",
            status: "success",
            response_data: {
              mode,
              api_base: apiBase,
              external_pin_id: body.id,
              external_url: externalUrl,
              image_url: p.image_url,
              pin_verified: pinVerified,
            },
          });
          created.push({ product_id: p.id, ok: true, external_pin_id: body.id, external_url: externalUrl, image_url: p.image_url, pin_verified: pinVerified });
        } catch (e) {
          created.push({ product_id: p.id, ok: false, error: e instanceof Error ? e.message : String(e) });
        }
      }

      return json(cors, {
        ok: true,
        mode: await getPinterestMode(sb),
        api_base: await getPinterestApiBase(sb),
        created,
        success_count: created.filter((c) => c.ok).length,
      });
    }

    if (action === "approve_pin") {
      const pinId = body.pinId;
      if (!pinId) return json(cors, { ok: false, error: "pinId required" });
      const { data: pin } = await sb.from("pinterest_pin_queue").select("*").eq("id", pinId).maybeSingle();
      if (!pin) return json(cors, { ok: false, error: "Pin not found" });
      if (!PINTEREST_ALLOWED_SLUGS.has(pin.product_slug)) {
        return json(cors, QA_LOCKDOWN_ERROR);
      }
      const reasons = runPinQa(pin);
      if (reasons.length > 0) {
        await sb.from("pinterest_pin_queue").update({
          qa_reasons: reasons,
          error_message: `QA gate: ${reasons.join(",")}`,
        }).eq("id", pinId);
        return json(cors, { ok: false, error: `QA failed: ${reasons.join(",")}`, qa_reasons: reasons });
      }
      await sb.from("pinterest_pin_queue").update({
        status: "queued",
        approved_at: new Date().toISOString(),
        qa_reasons: [],
        error_message: null,
        scheduled_at: new Date().toISOString(),
      }).eq("id", pinId);
      return json(cors, { ok: true });
    }

    if (action === "reject_pin") {
      const pinId = body.pinId;
      if (!pinId) return json(cors, { ok: false, error: "pinId required" });
      await sb.from("pinterest_pin_queue").update({
        status: "skipped",
        approved_at: null,
        error_message: body.reason || "Rejected by admin",
      }).eq("id", pinId);
      return json(cors, { ok: true });
    }

    if (action === "purge_bad_pins") {
      // Delete every draft/queued/failed/skipped pin that is either not on
      // the allowlist OR currently flagged with any QA reason.
      const allowed = Array.from(PINTEREST_ALLOWED_SLUGS);
      const { data: candidates } = await sb.from("pinterest_pin_queue")
        .select("id, product_slug, qa_reasons, status")
        .in("status", ["draft", "queued", "failed", "skipped"]);
      const ids = (candidates || [])
        .filter((p: any) =>
          !allowed.includes(p.product_slug) ||
          (Array.isArray(p.qa_reasons) && p.qa_reasons.length > 0)
        )
        .map((p: any) => p.id);
      if (ids.length === 0) return json(cors, { ok: true, deleted: 0 });
      const { error: delErr } = await sb.from("pinterest_pin_queue").delete().in("id", ids);
      if (delErr) return json(cors, { ok: false, error: delErr.message });
      return json(cors, { ok: true, deleted: ids.length });
    }

    if (action === "bulk_approve") {
      const pinIds: string[] = Array.isArray(body.pinIds) ? body.pinIds.slice(0, 10) : [];
      if (pinIds.length === 0) return json(cors, { ok: false, error: "pinIds required (max 10)" });
      const { data: pins } = await sb.from("pinterest_pin_queue").select("*").in("id", pinIds);
      let approved = 0;
      const failures: Array<{ id: string; reasons: string[] }> = [];
      for (const pin of pins || []) {
        if (!PINTEREST_ALLOWED_SLUGS.has(pin.product_slug)) {
          failures.push({ id: pin.id, reasons: ["allowlist_disabled"] });
          continue;
        }
        const reasons = runPinQa(pin);
        if (reasons.length > 0) {
          await sb.from("pinterest_pin_queue").update({
            qa_reasons: reasons,
            error_message: `QA gate: ${reasons.join(",")}`,
          }).eq("id", pin.id);
          failures.push({ id: pin.id, reasons });
          continue;
        }
        await sb.from("pinterest_pin_queue").update({
          status: "queued",
          approved_at: new Date().toISOString(),
          qa_reasons: [],
          error_message: null,
          scheduled_at: new Date().toISOString(),
        }).eq("id", pin.id);
        approved++;
      }
      return json(cors, { ok: true, approved, failures });
    }

    if (action === "bulk_reject") {
      const pinIds: string[] = Array.isArray(body.pinIds) ? body.pinIds.slice(0, 10) : [];
      if (pinIds.length === 0) return json(cors, { ok: false, error: "pinIds required (max 10)" });
      const { error } = await sb.from("pinterest_pin_queue").update({
        status: "skipped",
        approved_at: null,
        error_message: body.reason || "Bulk rejected by admin",
      }).in("id", pinIds);
      if (error) return json(cors, { ok: false, error: error.message });
      return json(cors, { ok: true, rejected: pinIds.length });
    }

    if (action === "regenerate_pin") {
      // Mark the existing draft as skipped, then trigger a fresh viral batch
      // for the same hero product. The cron worker will only ever publish
      // approved pins, so a stale draft sitting in the queue is harmless.
      const pinId = body.pinId;
      if (!pinId) return json(cors, { ok: false, error: "pinId required" });
      const { data: pin } = await sb.from("pinterest_pin_queue").select("product_slug").eq("id", pinId).maybeSingle();
      if (!pin) return json(cors, { ok: false, error: "Pin not found" });
      await sb.from("pinterest_pin_queue").update({
        status: "skipped",
        approved_at: null,
        error_message: "Replaced by regenerate",
      }).eq("id", pinId);
      // Fire-and-await: invoke viral batch for the same slug.
      const fnUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pinterest-viral-batch`;
      const r = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ productSlug: pin.product_slug, maxPins: 1 }),
      });
      const data = await r.json().catch(() => ({}));
      return json(cors, { ok: true, regenerated: true, batch: data });
    }

    if (action === "set_scale_unlocked") {
      const unlocked = !!body.unlocked;
      const { data: existing } = await sb.from("pinterest_runtime_settings").select("id").limit(1).maybeSingle();
      const payload = { scale_unlocked: unlocked, updated_at: new Date().toISOString() };
      const { error } = existing?.id
        ? await sb.from("pinterest_runtime_settings").update(payload).eq("id", existing.id)
        : await sb.from("pinterest_runtime_settings").insert(payload);
      if (error) return json(cors, { ok: false, error: error.message });
      return json(cors, { ok: true, scale_unlocked: unlocked });
    }

    // ── Recovery & diagnostics actions ────────────────────────────────────
    if (action === "publish_diagnostics") {
      const nowIso = new Date().toISOString();
      const allowed = Array.from(PINTEREST_ALLOWED_SLUGS);
      const [{ data: stuck }, { data: lastCron }, { data: conn }] = await Promise.all([
        sb.from("pinterest_pin_queue").select("id, publishing_started_at").eq("status", "publishing").lt("publishing_started_at", new Date(Date.now() - 15 * 60_000).toISOString()),
        sb.from("pinterest_post_logs").select("created_at, status").eq("action", "cron_tick").order("created_at", { ascending: false }).limit(1),
        sb.from("pinterest_connection").select("status, last_error, last_publish_at").limit(1).maybeSingle(),
      ]);
      const [draftCount, queuedCount, publishingCount, postedCount, failedCount, skippedCount] = await Promise.all([
        sb.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "draft"),
        sb.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "queued"),
        sb.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "publishing"),
        sb.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "posted"),
        sb.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "failed"),
        sb.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "skipped"),
      ]);
      const grouped: Record<string, number> = {
        draft: draftCount.count || 0,
        queued: queuedCount.count || 0,
        publishing: publishingCount.count || 0,
        posted: postedCount.count || 0,
        failed: failedCount.count || 0,
        skipped: skippedCount.count || 0,
      };

      const since = new Date(Date.now() - 86_400_000).toISOString();
      const [{ count: posted24 }, { count: failed24 }, { data: durRows }, { data: lastPublishLog }] = await Promise.all([
        sb.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "posted").not("pinterest_pin_id", "is", null).not("external_url", "is", null).gte("posted_at", since),
        sb.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "failed").gte("updated_at", since),
        sb.from("pinterest_publish_logs").select("duration_ms").eq("status", "success").gte("created_at", since).limit(200),
        sb.from("pinterest_publish_logs").select("*").order("created_at", { ascending: false }).limit(1),
      ]);
      const durations = (durRows || []).map((r: any) => r.duration_ms).filter((n: number) => Number.isFinite(n));
      const avgDuration = durations.length ? Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length) : null;
      const totalAttempts = (posted24 || 0) + (failed24 || 0);
      const successRate = totalAttempts > 0 ? Math.round(((posted24 || 0) / totalAttempts) * 100) : null;

      const { data: queuedSample } = await sb
        .from("pinterest_pin_queue")
        .select("*")
        .eq("status", "queued")
        .order("scheduled_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .limit(500);
      const reasons: Record<string, number> = { not_approved: 0, scheduled_in_future: 0, slug_not_allowed: 0, retries_exceeded: 0, qa_blocked: 0, invalid_image_url: 0, invalid_destination_url: 0, ready: 0 };
      for (const row of queuedSample || []) {
        const eligibility = determineEligibility(row, { requireApproved: true, ignoreSchedule: false, allowed, maxRetries: 2 });
        if (eligibility.eligible) reasons.ready++;
        else if (eligibility.reason === "not_approved") reasons.not_approved++;
        else if (eligibility.reason === "scheduled_in_future") reasons.scheduled_in_future++;
        else if (eligibility.reason === "slug_not_allowed") reasons.slug_not_allowed++;
        else if (eligibility.reason === "retry_limit_reached") reasons.retries_exceeded++;
        else if (String(eligibility.reason || "").startsWith("qa_")) reasons.qa_blocked++;
        else if (String(eligibility.reason || "").includes("image")) reasons.invalid_image_url++;
        else if (String(eligibility.reason || "").includes("destination")) reasons.invalid_destination_url++;
      }

      const nextQueued = (queuedSample || [])[0] || null;
      const nextEligibility = determineEligibility(nextQueued, { requireApproved: true, ignoreSchedule: false, allowed, maxRetries: 2 });
      const nextPublishNowEligibility = determineEligibility(nextQueued, { requireApproved: true, ignoreSchedule: true, allowed, maxRetries: 2 });

      return json(cors, {
        ok: true,
        api_status: conn?.status || "disconnected",
        api_last_error: conn?.last_error || null,
        last_publish_at: conn?.last_publish_at || null,
        last_cron_tick: lastCron?.[0]?.created_at || null,
        last_cron_status: lastCron?.[0]?.status || null,
        last_publish_log: lastPublishLog?.[0] || null,
        counts_by_status: grouped,
        stuck_publishing: (stuck || []).length,
        posted_24h: posted24 || 0,
        failed_24h: failed24 || 0,
        success_rate_24h: successRate,
        avg_publish_ms: avgDuration,
        queued_breakdown: reasons,
        next_queued_pin: compactPinForDiagnostics(nextQueued),
        next_queued_eligibility: nextEligibility,
        publish_now_eligibility: nextPublishNowEligibility,
        publish_next_note: "Publish next ignores schedule, but still requires queued + approved + QA-valid + allowed product.",
        generated_disabled_until_live_publish_works: true,
      });
    }

    if (action === "recover_orphaned_queued") {
      const { error, count } = await sb
        .from("pinterest_pin_queue")
        .update({ status: "draft", error_message: "Auto-recovered: queued without approval" }, { count: "exact" })
        .eq("status", "queued")
        .is("approved_at", null);
      if (error) return json(cors, { ok: false, error: error.message });
      return json(cors, { ok: true, recovered: count || 0 });
    }

    if (action === "clear_stuck_publishing") {
      const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
      const { error, count } = await sb
        .from("pinterest_pin_queue")
        .update({ status: "queued", publishing_started_at: null, error_message: "Auto-recovered: stuck in publishing" }, { count: "exact" })
        .eq("status", "publishing")
        .lt("publishing_started_at", cutoff);
      if (error) return json(cors, { ok: false, error: error.message });
      return json(cors, { ok: true, cleared: count || 0 });
    }

    if (action === "dedupe_queue") {
      // Delete duplicate (product_id, pin_variant) rows in draft/queued, keep oldest.
      const { data: rows } = await sb
        .from("pinterest_pin_queue")
        .select("id, product_id, pin_variant, created_at, status")
        .in("status", ["draft", "queued"])
        .order("created_at", { ascending: true });
      const seen = new Set<string>();
      const toDelete: string[] = [];
      for (const r of rows || []) {
        const key = `${(r as any).product_id}::${(r as any).pin_variant}`;
        if (seen.has(key)) toDelete.push((r as any).id);
        else seen.add(key);
      }
      if (toDelete.length === 0) return json(cors, { ok: true, deleted: 0 });
      const { error } = await sb.from("pinterest_pin_queue").delete().in("id", toDelete);
      if (error) return json(cors, { ok: false, error: error.message });
      return json(cors, { ok: true, deleted: toDelete.length });
    }

    if (action === "delete_pin") {
      const pinId = body.pinId;
      if (!pinId) return json(cors, { ok: false, error: "pinId required" });
      const { error } = await sb.from("pinterest_pin_queue").delete().eq("id", pinId);
      if (error) return json(cors, { ok: false, error: error.message });
      return json(cors, { ok: true });
    }

    if (action === "force_publish" || action === "test_publish_now") {
      const pinId = body.pinId;
      if (!pinId) return json(cors, { ok: false, error: "pinId required" });
      const { data: conn } = await sb.from("pinterest_connection").select("*").limit(1).maybeSingle();
      if (!conn || conn.status !== "connected" || !conn.access_token) {
        return json(cors, { ok: false, error: "Pinterest not connected" });
      }
      const { data: pin } = await sb.from("pinterest_pin_queue").select("*").eq("id", pinId).maybeSingle();
      if (!pin) return json(cors, { ok: false, error: "Pin not found" });
      if (pin.status !== "queued") {
        return json(cors, { ok: false, error: `Cannot force publish status=${pin.status}`, selected_pin: compactPinForDiagnostics(pin) });
      }
      return await publishSelectedPin(sb, conn, pin, cors, {
        actionName: action,
        requireApproved: false,
        ignoreSchedule: true,
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (e) {
    console.error("pinterest-automation error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});

function compactPinForDiagnostics(pin: any, boardId: string | null = null) {
  if (!pin) return null;
  return {
    id: pin.id,
    status: pin.status,
    approved: Boolean(pin.approved_at),
    approved_at: pin.approved_at || null,
    scheduled_at: pin.scheduled_at || null,
    board_id: pin.board_id || boardId || null,
    board_name: pin.board_name || null,
    image_url: pin.pin_image_url || null,
    destination_url: pin.destination_link || null,
    pinterest_pin_id: pin.pinterest_pin_id || pin.pin_external_id || null,
    external_url: pin.external_url || (pin.pin_external_id ? `https://www.pinterest.com/pin/${pin.pin_external_id}/` : null),
    retry_count: pin.retries ?? pin.publish_attempts ?? 0,
    publish_attempts: pin.publish_attempts ?? 0,
    rejection_reason: pin.rejection_reason || pin.error_message || pin.last_publish_error || (Array.isArray(pin.qa_reasons) && pin.qa_reasons.length ? pin.qa_reasons.join(',') : null),
    product_slug: pin.product_slug || null,
    title: pin.pin_title || null,
  };
}

function validateImageUrl(url: string | null | undefined) {
  if (!url || typeof url !== "string") return { ok: false, reason: "missing_image_url" };
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return { ok: false, reason: "image_url_not_https" };
    return { ok: true, reason: null, host: parsed.hostname };
  } catch {
    return { ok: false, reason: "malformed_image_url" };
  }
}

function validateDestinationUrl(url: string | null | undefined, slug?: string | null) {
  if (!url || typeof url !== "string") return { ok: false, reason: "missing_destination_url" };
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return { ok: false, reason: "destination_url_not_https" };
    if (parsed.hostname !== "getpawsy.pet" && parsed.hostname !== "www.getpawsy.pet") {
      return { ok: false, reason: "destination_not_getpawsy" };
    }
    if (!parsed.pathname.startsWith("/products/")) return { ok: false, reason: "destination_not_product_url" };
    if (slug && !parsed.pathname.includes(`/products/${slug}`)) return { ok: false, reason: "destination_slug_mismatch" };
    return { ok: true, reason: null, host: parsed.hostname, path: parsed.pathname };
  } catch {
    return { ok: false, reason: "malformed_destination_url" };
  }
}

function determineEligibility(pin: any, opts: { requireApproved: boolean; ignoreSchedule: boolean; allowed: string[]; maxRetries: number }) {
  if (!pin) return { eligible: false, reason: "no_queued_pin" };
  if (pin.status !== "queued") return { eligible: false, reason: `status_${pin.status || "missing"}` };
  if (opts.requireApproved && !pin.approved_at) return { eligible: false, reason: "not_approved" };
  if (!opts.ignoreSchedule && pin.scheduled_at && pin.scheduled_at > new Date().toISOString()) return { eligible: false, reason: "scheduled_in_future" };
  if (!opts.allowed.includes(pin.product_slug)) return { eligible: false, reason: "slug_not_allowed" };
  if ((pin.retries || 0) >= opts.maxRetries) return { eligible: false, reason: "retry_limit_reached" };
  const imageValidation = validateImageUrl(pin.pin_image_url);
  if (!imageValidation.ok) return { eligible: false, reason: imageValidation.reason, imageValidation };
  const destinationValidation = validateDestinationUrl(pin.destination_link, pin.product_slug);
  if (!destinationValidation.ok) return { eligible: false, reason: destinationValidation.reason, destinationValidation };
  const qaReasons = runPinQa(pin);
  if (qaReasons.length > 0) return { eligible: false, reason: `qa_${qaReasons.join(",")}`, qa_reasons: qaReasons, imageValidation, destinationValidation };
  return { eligible: true, reason: "eligible", imageValidation, destinationValidation, qa_reasons: [] };
}

async function requireDirectTestAdmin(sb: any, req: Request): Promise<{ ok: true } | { ok: false; error: string }> {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return { ok: false, error: "Admin auth required" };

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!anonKey) return { ok: false, error: "Backend auth is missing anon key configuration" };

  const authClient = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await authClient.auth.getUser();
  if (error || !data?.user?.id) return { ok: false, error: "Admin auth token invalid" };

  const { data: role } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .eq("role", "admin")
    .maybeSingle();
  const email = String(data.user.email || "").trim().toLowerCase();
  if (role?.role === "admin" || DIRECT_TEST_ADMIN_EMAILS.has(email)) return { ok: true };
  return { ok: false, error: "Admin role required for Direct Pinterest API Test" };
}

async function getFreshPinterestProductionToken(sb: any, conn: any): Promise<string | null> {
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (!expiresAt || Date.now() < expiresAt - 5 * 60_000) return conn.access_token;

  const clientId = Deno.env.get("PINTEREST_CLIENT_ID");
  const clientSecret = Deno.env.get("PINTEREST_CLIENT_SECRET");
  if (!conn.refresh_token || !clientId || !clientSecret) return null;

  const response = await fetch(`${PINTEREST_PRODUCTION_API_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: conn.refresh_token }),
  });
  const responseText = await response.text();
  let responseJson: any = null;
  try { responseJson = JSON.parse(responseText); } catch { responseJson = { raw: responseText }; }

  if (!response.ok || !responseJson?.access_token) {
    await sb.from("pinterest_post_logs").insert({
      action: "direct_api_token_refresh",
      status: "failed",
      error_message: `Pinterest token refresh ${response.status}: ${responseText}`,
      response_data: { api_base: PINTEREST_PRODUCTION_API_BASE, status_code: response.status, response_body: responseJson },
    });
    return null;
  }

  const nextExpiresAt = new Date(Date.now() + (responseJson.expires_in || 3600) * 1000).toISOString();
  await sb.from("pinterest_connection").update({
    access_token: responseJson.access_token,
    refresh_token: responseJson.refresh_token || conn.refresh_token,
    token_expires_at: nextExpiresAt,
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("id", conn.id);
  return responseJson.access_token;
}

async function fetchJsonWithText(url: string, accessToken: string) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const text = await response.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { ok: response.ok, status: response.status, body, text };
}

async function checkPublicUrl(url: string, expectedHost: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return { ok: false, reason: "not_https", url };
    if (parsed.hostname !== expectedHost && parsed.hostname !== `www.${expectedHost}`) return { ok: false, reason: "unexpected_host", url, host: parsed.hostname };
    let response = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (response.status === 405 || response.status === 403) response = await fetch(url, { method: "GET", redirect: "follow" });
    return { ok: response.ok, reason: response.ok ? "reachable" : `http_${response.status}`, url, status_code: response.status, content_type: response.headers.get("content-type") };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e), url };
  }
}

async function runDirectPinterestApiTest(sb: any, conn: any, accessToken: string, cors: Record<string, string>) {
  const startedAt = Date.now();
  const endpoint = `${PINTEREST_PRODUCTION_API_BASE}/pins`;
  const tokenMetadata = { prefix: accessToken.slice(0, 8), length: accessToken.length, latest_connection_id: conn.id };
  const imageCheck = await checkPublicUrl(DIRECT_TEST_IMAGE_URL, "getpawsy.pet");
  const destinationCheck = await checkPublicUrl(DIRECT_TEST_DESTINATION_URL, "getpawsy.pet");
  const latestOauthLog = await sb
    .from("pinterest_post_logs")
    .select("response_data, created_at")
    .eq("action", "oauth_connect")
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const scopeText = String(latestOauthLog?.data?.response_data?.scopes || "");
  const requiredScopePresent = scopeText.split(/[\s,]+/).includes(DIRECT_TEST_REQUIRED_SCOPE);
  const accountResponse = await fetchJsonWithText(`${PINTEREST_PRODUCTION_API_BASE}/user_account`, accessToken);
  const boardsResponse = await fetchJsonWithText(`${PINTEREST_PRODUCTION_API_BASE}/boards?page_size=250&privacy=ALL`, accessToken);
  const boards = Array.isArray(boardsResponse.body?.items) ? boardsResponse.body.items : [];
  const selectedBoard = boards.find((board: any) => typeof board?.id === "string" && board.id.trim()) || null;

  const requestPayload = {
    title: DIRECT_TEST_TITLE,
    description: DIRECT_TEST_DESCRIPTION,
    board_id: selectedBoard?.id || null,
    media_source: { source_type: "image_url", url: DIRECT_TEST_IMAGE_URL },
    link: DIRECT_TEST_DESTINATION_URL,
  };
  const diagnostics = {
    api_base: PINTEREST_PRODUCTION_API_BASE,
    endpoint,
    token: tokenMetadata,
    required_scope: DIRECT_TEST_REQUIRED_SCOPE,
    latest_oauth_scopes: scopeText || null,
    required_scope_present: requiredScopePresent,
    account_status_code: accountResponse.status,
    account_response_body: accountResponse.body,
    boards_status_code: boardsResponse.status,
    boards_count: boards.length,
    selected_board: selectedBoard ? { id: selectedBoard.id, name: selectedBoard.name || null } : null,
    image_validation: imageCheck,
    destination_validation: destinationCheck,
  };

  if (!imageCheck.ok || !destinationCheck.ok || !boardsResponse.ok || !selectedBoard?.id || !requiredScopePresent) {
    const errorMessage = !requiredScopePresent
      ? `OAuth token missing required scope: ${DIRECT_TEST_REQUIRED_SCOPE}. Latest scopes: ${scopeText || "none found"}`
      : !selectedBoard?.id
        ? `No real Pinterest board ID returned by production /boards. Status ${boardsResponse.status}: ${boardsResponse.text}`
        : !imageCheck.ok
          ? `Fixed image URL is not publicly reachable: ${imageCheck.reason}`
          : !destinationCheck.ok
            ? `Fixed destination URL is not publicly reachable: ${destinationCheck.reason}`
            : `Pinterest board lookup failed: ${boardsResponse.status}: ${boardsResponse.text}`;
    const responseBody = { error: errorMessage, diagnostics };
    await sb.from("pinterest_post_logs").insert({ action: "direct_api_test", status: "failed", error_message: errorMessage, response_data: responseBody });
    await sb.from("pinterest_publish_logs").insert({
      status: "failed",
      board_id: requestPayload.board_id,
      image_url: DIRECT_TEST_IMAGE_URL,
      pin_title: DIRECT_TEST_TITLE,
      destination_link: DIRECT_TEST_DESTINATION_URL,
      request_payload: requestPayload,
      response_payload: responseBody,
      error_message: errorMessage,
      duration_ms: Date.now() - startedAt,
    });
    return json(cors, { ok: false, error: errorMessage, request_endpoint: endpoint, request_payload: requestPayload, status_code: null, response_body: responseBody, pin_id: null, external_url: null, diagnostics });
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(requestPayload),
  });
  const responseText = await response.text();
  let responseBody: any = null;
  try { responseBody = JSON.parse(responseText); } catch { responseBody = { raw: responseText }; }
  const pinId = typeof responseBody?.id === "string" && responseBody.id.trim() ? responseBody.id.trim() : null;
  const externalUrl = pinId ? `https://www.pinterest.com/pin/${pinId}/` : null;
  const success = response.ok && Boolean(pinId && externalUrl);
  const errorMessage = success ? null : `Pinterest API ${response.status}: ${responseText}`;
  const logPayload = { ...diagnostics, status_code: response.status, response_body: responseBody, returned_pin_id: pinId, returned_pin_url: externalUrl };

  await sb.from("pinterest_post_logs").insert({
    action: "direct_api_test",
    status: success ? "success" : "failed",
    error_message: errorMessage,
    response_data: logPayload,
  });
  await sb.from("pinterest_publish_logs").insert({
    status: success ? "success" : "failed",
    board_id: requestPayload.board_id,
    image_url: DIRECT_TEST_IMAGE_URL,
    pin_title: DIRECT_TEST_TITLE,
    destination_link: DIRECT_TEST_DESTINATION_URL,
    request_payload: requestPayload,
    response_payload: logPayload,
    error_message: errorMessage,
    duration_ms: Date.now() - startedAt,
  });
  if (success) await sb.from("pinterest_connection").update({ last_publish_at: new Date().toISOString(), last_error: null }).eq("id", conn.id);
  if (!success) await sb.from("pinterest_connection").update({ last_error: errorMessage }).eq("id", conn.id);

  return json(cors, {
    ok: success,
    error: errorMessage,
    request_endpoint: endpoint,
    board_id: requestPayload.board_id,
    image_url: DIRECT_TEST_IMAGE_URL,
    destination_url: DIRECT_TEST_DESTINATION_URL,
    status_code: response.status,
    response_body: responseBody,
    pin_id: pinId,
    external_url: externalUrl,
    diagnostics,
  });
}

async function publishSelectedPin(sb: any, conn: any, pin: any, cors: Record<string, string>, opts: { actionName: string; requireApproved: boolean; ignoreSchedule: boolean }) {
  const startedAt = Date.now();
  const attempt = (pin.publish_attempts || 0) + 1;
  const allowed = Array.from(PINTEREST_ALLOWED_SLUGS);
  const eligibility = determineEligibility(pin, { requireApproved: opts.requireApproved, ignoreSchedule: opts.ignoreSchedule, allowed, maxRetries: 2 });
  console.log("[pinterest-publish] selected queue row", compactPinForDiagnostics(pin));
  console.log("[pinterest-publish] image URL validation result", eligibility.imageValidation || validateImageUrl(pin.pin_image_url));
  console.log("[pinterest-publish] destination URL validation result", eligibility.destinationValidation || validateDestinationUrl(pin.destination_link, pin.product_slug));

  if (!eligibility.eligible) {
    const reason = eligibility.reason || "not_eligible";
    await sb.from("pinterest_pin_queue").update({
      status: opts.actionName === "force_publish" ? "failed" : pin.status,
      rejection_reason: reason,
      error_message: reason,
      last_publish_error: reason,
      qa_reasons: eligibility.qa_reasons || pin.qa_reasons || [],
      publishing_started_at: null,
    }).eq("id", pin.id);
    await sb.from("pinterest_publish_logs").insert({
      pin_queue_id: pin.id,
      attempt,
      status: "failed",
      image_url: pin.pin_image_url,
      pin_title: pin.pin_title,
      destination_link: pin.destination_link,
      request_payload: { action: opts.actionName, selected_pin: compactPinForDiagnostics(pin), eligibility },
      response_payload: { eligibility },
      error_message: reason,
      duration_ms: Date.now() - startedAt,
    });
    return json(cors, { ok: false, error: reason, selected_pin: compactPinForDiagnostics({ ...pin, rejection_reason: reason }), eligibility });
  }

  let boardId: string | null = null;
  try {
    boardId = await resolvePinterestBoardId(conn.access_token, pin.board_name || "");
    console.log("[pinterest-publish] Pinterest board id used", { pin_id: pin.id, board_name: pin.board_name, board_id: boardId });

    const apiBase = await getPinterestApiBase(sb);
    const mode = await getPinterestMode(sb);
    const requestPayload = {
      title: pin.pin_title,
      description: pin.pin_description,
      board_id: boardId,
      media_source: { source_type: "image_url", url: pin.pin_image_url },
      link: pin.destination_link,
    };
    console.log("[pinterest-publish] Pinterest API request payload", requestPayload);

    const claimUpdate: Record<string, unknown> = {
      status: "publishing",
      publishing_started_at: new Date().toISOString(),
      publish_attempts: attempt,
      board_id: boardId,
      rejection_reason: null,
      last_publish_error: null,
      error_message: null,
    };
    if (!pin.approved_at) claimUpdate.approved_at = new Date().toISOString();
    const { data: claimed } = await sb.from("pinterest_pin_queue")
      .update(claimUpdate)
      .eq("id", pin.id)
      .in("status", ["queued", "draft"])
      .select("id")
      .maybeSingle();
    if (!claimed) throw new Error("pin_already_claimed_or_not_publishable");

    await sb.from("pinterest_publish_logs").insert({
      pin_queue_id: pin.id,
      attempt,
      status: "started",
      board_id: boardId,
      image_url: pin.pin_image_url,
      pin_title: pin.pin_title,
      destination_link: pin.destination_link,
      request_payload: { ...requestPayload, selected_pin: compactPinForDiagnostics(pin, boardId), image_validation: eligibility.imageValidation, destination_validation: eligibility.destinationValidation },
    });

    const response = await fetch(`${apiBase}/pins`, {
      method: "POST",
      headers: { Authorization: `Bearer ${conn.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload),
    });
    const responseText = await response.text();
    let responseJson: any = null;
    try { responseJson = JSON.parse(responseText); } catch { responseJson = { raw: responseText }; }
    console.log("[pinterest-publish] Pinterest API response status/body", { status: response.status, body: responseJson });

    if (!response.ok) {
      if (response.status === 403 && mode === "production") await markProductionForbidden(sb);
      throw new Error(`Pinterest API ${response.status}: ${responseText}`);
    }

    const pinterestPinId = typeof responseJson?.id === "string" && responseJson.id.trim() ? responseJson.id.trim() : null;
    const externalUrl = pinterestPinId ? `https://www.pinterest.com/pin/${pinterestPinId}/` : null;
    if (!pinterestPinId || !externalUrl) {
      throw new Error(`Pinterest response missing real pin id or external URL: ${responseText}`);
    }

    await sb.from("pinterest_pin_queue").update({
      status: "posted",
      posted_at: new Date().toISOString(),
      pin_external_id: pinterestPinId,
      pinterest_pin_id: pinterestPinId,
      external_url: externalUrl,
      board_id: boardId,
      error_message: null,
      last_publish_error: null,
      rejection_reason: null,
      publishing_started_at: null,
    }).eq("id", pin.id);

    await sb.from("pinterest_publish_logs").insert({
      pin_queue_id: pin.id,
      attempt,
      status: "success",
      board_id: boardId,
      image_url: pin.pin_image_url,
      pin_title: pin.pin_title,
      destination_link: pin.destination_link,
      request_payload: requestPayload,
      response_payload: { ...responseJson, external_url: externalUrl },
      duration_ms: Date.now() - startedAt,
    });

    await sb.from("pinterest_post_logs").insert({
      pin_queue_id: pin.id,
      action: "publish",
      status: "success",
      response_data: { external_id: pinterestPinId, pin_id: pinterestPinId, external_url: externalUrl, board_id: boardId },
    });
    await sb.from("pinterest_connection").update({ last_publish_at: new Date().toISOString(), last_error: null }).eq("id", conn.id);
    await sb.from("products").update({ pinterest_last_posted_at: new Date().toISOString(), pinterest_status: "posted" }).eq("id", pin.product_id);

    return json(cors, { ok: true, published: pinterestPinId, pinterest_pin_id: pinterestPinId, external_url: externalUrl, board_id: boardId, selected_pin: compactPinForDiagnostics({ ...pin, pinterest_pin_id: pinterestPinId, external_url: externalUrl }, boardId), response: responseJson, duration_ms: Date.now() - startedAt });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "Unknown error";
    console.log("[pinterest-publish] failed", { pin_id: pin.id, board_id: boardId, error: errMsg });
    await sb.from("pinterest_pin_queue").update({
      status: "failed",
      retries: (pin.retries || 0) + 1,
      error_message: errMsg,
      last_publish_error: errMsg,
      rejection_reason: errMsg,
      board_id: boardId,
      publishing_started_at: null,
    }).eq("id", pin.id);
    await sb.from("pinterest_publish_logs").insert({
      pin_queue_id: pin.id,
      attempt,
      status: "failed",
      board_id: boardId,
      image_url: pin.pin_image_url,
      pin_title: pin.pin_title,
      destination_link: pin.destination_link,
      request_payload: { action: opts.actionName, selected_pin: compactPinForDiagnostics(pin, boardId) },
      response_payload: { error: errMsg },
      error_message: errMsg,
      duration_ms: Date.now() - startedAt,
    });
    await sb.from("pinterest_post_logs").insert({ pin_queue_id: pin.id, action: "publish", status: "failed", error_message: errMsg, response_data: { board_id: boardId } });
    await sb.from("pinterest_connection").update({ last_error: errMsg }).eq("id", conn.id);
    return json(cors, { ok: false, error: errMsg, selected_pin: compactPinForDiagnostics({ ...pin, rejection_reason: errMsg }, boardId), board_id: boardId });
  }
}

function json(cors: Record<string, string>, data: any) {
  return new Response(JSON.stringify(data), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

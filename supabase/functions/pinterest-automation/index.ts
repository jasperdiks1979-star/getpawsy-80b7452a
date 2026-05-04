import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
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
  const hookSet = HOOKS[catKey] || HOOKS.cat_essentials;
  const boardList = boards[catKey] || boards.fallback || ["Pet Products"];
  const shortName = (product.name || "").length > 50 ? (product.name || "").slice(0, 47) + "..." : (product.name || "");

  const pins: any[] = [];
  const groups = ["problem", "curiosity", "result", "target"] as const;
  let pinNum = 0;

  for (const group of groups) {
    const hooks = hookSet[group];
    for (let i = 0; i < hooks.length && pinNum < 10; i++) {
      const hook = hooks[i];
      const board = boardList[pinNum % boardList.length];
      const destUrl = product.slug
        ? `${BASE_URL}/products/${product.slug}?utm_source=pinterest&utm_medium=organic&utm_campaign=auto_pin&utm_content=${product.slug}`
        : `${BASE_URL}/collections/${catKey.replace("_", "-")}?utm_source=pinterest&utm_medium=organic&utm_campaign=auto_pin`;

      pins.push({
        product_id: product.id,
        product_slug: product.slug || "",
        product_name: product.name || "",
        pin_variant: `${group}_${i + 1}`,
        hook_group: group,
        category_key: catKey,
        pin_title: `${hook} — ${shortName}`,
        pin_description: buildDescription(hook, product, group),
        pin_image_url: product.image_url || "",
        destination_link: destUrl,
        board_name: board,
        overlay_text: hook,
        hashtags: buildHashtags(catKey),
        priority: catKey === "cat_trees" || catKey === "cat_litter_boxes" ? "high" : catKey === "dog_travel" ? "low" : "medium",
        status: "draft",
        scheduled_at: null,
      });
      pinNum++;
    }
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
        .select("id, priority")
        .eq("status", "draft")
        .order("priority", { ascending: true })
        .limit(limit);

      if (!drafts?.length) return json(cors, { ok: true, queued: 0 });

      const now = Date.now();
      for (let i = 0; i < drafts.length; i++) {
        const hoursOffset = Math.floor(i / 3) * 24 + (i % 3) * 8;
        const scheduledAt = new Date(now + hoursOffset * 3600000).toISOString();
        await sb.from("pinterest_pin_queue").update({ status: "queued", scheduled_at: scheduledAt }).eq("id", drafts[i].id);
      }

      return json(cors, { ok: true, queued: drafts.length });
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
        .lte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!pin) return json(cors, { ok: true, message: "No pins ready to publish" });

      try {
        const boardId = await resolvePinterestBoardId(conn.access_token, pin.board_name);
        const mode = await getPinterestMode(sb);
        const apiBase = await getPinterestApiBase(sb);
        console.log("[pinterest] publish", { mode, api_base: apiBase, pin_id: pin.id });
        const pinRes = await fetch(`${apiBase}/pins`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${conn.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: pin.pin_title,
            description: pin.pin_description,
            board_id: boardId,
            media_source: {
              source_type: "image_url",
              url: pin.pin_image_url,
            },
            link: pin.destination_link,
          }),
        });

        if (!pinRes.ok) {
          const errBody = await pinRes.text();
          console.log("[pinterest] response", { status: pinRes.status, mode, api_base: apiBase });
          if (pinRes.status === 403 && mode === "production") {
            await markProductionForbidden(sb);
          }
          throw new Error(`Pinterest API ${pinRes.status}: ${errBody}`);
        }

        const pinData = await pinRes.json();
        const externalUrl = pinData?.id ? `https://www.pinterest.com/pin/${pinData.id}/` : null;
        console.log("[pinterest] response", { status: 200, mode, api_base: apiBase, pin_id: pinData.id, external_url: externalUrl });
        await sb.from("pinterest_pin_queue").update({
          status: "posted",
          posted_at: new Date().toISOString(),
          pin_external_id: pinData.id,
        }).eq("id", pin.id);

        await sb.from("pinterest_connection").update({
          last_publish_at: new Date().toISOString(),
          last_error: null,
        }).eq("id", conn.id);

        await sb.from("products").update({
          pinterest_last_posted_at: new Date().toISOString(),
          pinterest_status: "posted",
        }).eq("id", pin.product_id);

        return json(cors, { ok: true, published: pinData.id });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "Unknown error";
        await sb.from("pinterest_pin_queue").update({
          status: "failed",
          error_message: errMsg,
        }).eq("id", pin.id);

        await sb.from("pinterest_connection").update({
          last_error: errMsg,
        }).eq("id", conn.id);

        return json(cors, { ok: false, error: errMsg });
      }
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

    throw new Error(`Unknown action: ${action}`);
  } catch (e) {
    console.error("pinterest-automation error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});

function json(cors: Record<string, string>, data: any) {
  return new Response(JSON.stringify(data), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

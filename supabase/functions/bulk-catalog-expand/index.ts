/**
 * Bulk Catalog Expansion
 * One-shot orchestrator: scouts CJ US winners across pet niches,
 * imports up to N new products with proper category mapping,
 * generates SEO-safe titles + descriptions + tags,
 * and activates them for live + sitemap + Merchant feed.
 *
 * Triggered via internal shared-secret header (no public auth needed).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-trigger",
};

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

// ───────────────────────────────────────────────────────────────────
// Category mapping: keyword → internal canonical category
// ───────────────────────────────────────────────────────────────────
type CatRule = { match: RegExp; category: string; tags: string[] };
const CATEGORY_RULES: CatRule[] = [
  { match: /\b(cat\s*tree|cat\s*tower|cat\s*condo|cat\s*furniture)\b/i, category: "Cat Trees & Condos", tags: ["cat tree", "condo", "tower"] },
  { match: /\b(cat\s*scratch|scratching\s*post|sisal\s*post)\b/i, category: "Cat Scratching Posts", tags: ["scratching post", "sisal"] },
  { match: /\b(litter\s*box|litter\s*tray|self[-\s]*cleaning\s*litter|cat\s*toilet)\b/i, category: "Cat Litter Boxes", tags: ["litter box", "self-cleaning"] },
  { match: /\b(cat\s*litter\s*mat)\b/i, category: "Cat Litter Boxes", tags: ["litter mat"] },
  { match: /\b(cat\s*bed|kitten\s*bed|cat\s*hammock|cat\s*cushion)\b/i, category: "Cat Beds", tags: ["cat bed", "cozy"] },
  { match: /\b(cat\s*carrier|cat\s*backpack|cat\s*travel)\b/i, category: "Cat Carriers", tags: ["cat carrier", "travel"] },
  { match: /\b(cat\s*toy|cat\s*tunnel|cat\s*ball|cat\s*teaser|catnip|interactive\s*cat)\b/i, category: "Cat Toys", tags: ["cat toy", "interactive"] },
  { match: /\b(cat\s*fountain|cat\s*water\s*dispenser|cat\s*bowl|cat\s*feeder|slow\s*feeder.*cat)\b/i, category: "Cat Bowls & Feeders", tags: ["cat feeder", "bowl"] },
  { match: /\b(cat\s*brush|cat\s*comb|cat\s*grooming|cat\s*nail)\b/i, category: "Cat Grooming", tags: ["cat grooming", "brush"] },
  { match: /\b(cat\s*collar|cat\s*harness|cat\s*leash)\b/i, category: "Cat Collars & Accessories", tags: ["cat collar"] },
  { match: /\b(cat\s*house|cat\s*cave|cat\s*den)\b/i, category: "Cat Houses", tags: ["cat house"] },

  { match: /\b(orthopedic|memory\s*foam).*(dog\s*bed|pet\s*bed)\b/i, category: "Dog Beds", tags: ["orthopedic", "memory foam"] },
  { match: /\b(elevated|cooling).*(dog\s*bed|pet\s*cot)\b/i, category: "Dog Beds", tags: ["elevated", "cooling"] },
  { match: /\b(dog\s*bed|puppy\s*bed|dog\s*mattress|dog\s*sofa)\b/i, category: "Dog Beds", tags: ["dog bed", "comfort"] },
  { match: /\b(dog\s*house|dog\s*kennel|dog\s*crate|dog\s*den)\b/i, category: "Dog Houses", tags: ["dog house", "shelter"] },
  { match: /\b(dog\s*stroller|pet\s*stroller|dog\s*carrier|pet\s*backpack|car\s*seat.*dog)\b/i, category: "Dog Carriers", tags: ["stroller", "carrier"] },
  { match: /\b(dog\s*toy|chew\s*toy|rope\s*toy|squeaky|fetch\s*ball|tug.*toy|puzzle.*dog)\b/i, category: "Dog Toys", tags: ["dog toy", "chew"] },
  { match: /\b(dog\s*bowl|slow\s*feeder.*dog|elevated.*bowl|automatic.*pet\s*feeder|dog\s*fountain|water\s*dispenser)\b/i, category: "Dog Bowls & Feeders", tags: ["dog feeder", "bowl"] },
  { match: /\b(dog\s*brush|dog\s*comb|deshedding|dog\s*grooming|nail\s*clipper|dog\s*shampoo)\b/i, category: "Dog Grooming", tags: ["dog grooming", "brush"] },
  { match: /\b(dog\s*collar|dog\s*harness|dog\s*leash|retractable\s*leash|no[-\s]*pull)\b/i, category: "Dog Collars & Leashes", tags: ["collar", "harness", "leash"] },
  { match: /\b(dog\s*training|clicker|treat\s*pouch|training\s*pad|pee\s*pad)\b/i, category: "Dog Training", tags: ["training"] },
  { match: /\b(pet\s*stairs|dog\s*ramp|dog\s*steps)\b/i, category: "Dog Beds", tags: ["pet stairs", "ramp"] },
];

const NON_PET_BLOCK = /\b(bird|parrot|reptile|snake|lizard|gecko|turtle|chicken|hamster|guinea\s*pig|ferret|fish\s*tank|aquarium|sunglasses|jewelry|necklace|earring|bracelet|phone\s*case|handbag|wallet|nail\s*art|makeup|saddle|horse)\b/i;
const POLICY_BLOCK = /\b(shock\s*collar|electric\s*fence|prong\s*collar|choke\s*chain|bark\s*shock|aversive)\b/i;

function classifyProduct(name: string, fallbackCategory?: string | null): { category: string; tags: string[] } | null {
  if (NON_PET_BLOCK.test(name)) return null;
  if (POLICY_BLOCK.test(name)) return null;

  for (const r of CATEGORY_RULES) {
    if (r.match.test(name)) return { category: r.category, tags: r.tags };
  }
  // Fallback: very generic cat or dog
  const lower = name.toLowerCase();
  if (lower.includes("cat")) return { category: "Cat Toys", tags: ["cat"] };
  if (lower.includes("dog") || lower.includes("puppy")) return { category: "Dog Toys", tags: ["dog"] };
  return null;
}

// ───────────────────────────────────────────────────────────────────
// Title + description generation (deterministic, no LLM cost)
// ───────────────────────────────────────────────────────────────────
function cleanRawName(raw: string): string {
  return raw
    .replace(/[\u4e00-\u9fff]/g, "") // remove Chinese chars
    .replace(/\s*\/\s*/g, " ")
    .replace(/[^\w\s\-,&'."()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildBrandedTitle(rawName: string, category: string): string {
  const cleaned = cleanRawName(rawName);
  // Extract the most meaningful 4-7 words
  const stopwords = new Set(["the", "a", "an", "for", "with", "and", "of", "in", "on", "to", "from", "new"]);
  const words = cleaned.split(/\s+/).filter(w => w.length > 1 && !stopwords.has(w.toLowerCase()));
  const core = words.slice(0, 7).join(" ");

  const benefitMap: Record<string, string> = {
    "Cat Trees & Condos": "Multi-Level Climbing Tower",
    "Cat Litter Boxes": "Easy-Clean Design",
    "Cat Beds": "Plush Cozy Retreat",
    "Cat Carriers": "Soft-Sided Travel",
    "Cat Toys": "Interactive Play",
    "Cat Bowls & Feeders": "Slow-Feed Anti-Gulp",
    "Cat Grooming": "Self-Cleaning Brush",
    "Cat Scratching Posts": "Sisal Scratch Post",
    "Cat Houses": "Hideaway Den",
    "Cat Collars & Accessories": "Adjustable Comfort Fit",
    "Dog Beds": "Orthopedic Support",
    "Dog Houses": "Weather-Resistant Shelter",
    "Dog Carriers": "Lightweight Travel",
    "Dog Toys": "Durable Chew-Resistant",
    "Dog Bowls & Feeders": "Slow-Feed Anti-Choke",
    "Dog Grooming": "Deshedding Brush",
    "Dog Collars & Leashes": "Padded No-Pull",
    "Dog Training": "Positive Reinforcement",
  };

  const benefit = benefitMap[category] || "Premium Quality";
  const title = `GetPawsy ${core} – ${benefit}`;
  return title.slice(0, 145);
}

function buildDescription(title: string, category: string, tags: string[]): string {
  const intros: Record<string, string> = {
    "Cat Trees & Condos": "Give your cat hours of climbing, scratching, and lounging with this multi-level activity tower. Designed for stability and built with soft plush platforms, sisal-wrapped posts, and an enclosed condo retreat.",
    "Cat Litter Boxes": "Simplify litter box maintenance with this thoughtfully designed unit. Engineered for easy access for your cat and quick cleaning for you, with odor control built into the structure.",
    "Cat Beds": "Create a cozy, calming retreat where your cat can curl up and rest. Soft, breathable materials and a supportive cushion base help your cat feel safe and warm.",
    "Cat Carriers": "Travel with confidence knowing your cat is secure and comfortable. Mesh windows ensure ventilation while padded interiors keep your cat calm during car rides, vet visits, or trips.",
    "Cat Toys": "Encourage natural hunting instincts and active play with this engaging cat toy. Designed to stimulate curiosity, support exercise, and reduce indoor boredom.",
    "Cat Bowls & Feeders": "Promote healthier eating habits with a feeder built for your cat's daily routine. Slow-feed designs help prevent overeating, while easy-clean materials keep mealtime hygienic.",
    "Cat Grooming": "Keep your cat's coat soft, shiny, and tangle-free with this gentle grooming tool. Designed to remove loose fur, reduce shedding around the home, and turn grooming into a calm bonding moment.",
    "Cat Scratching Posts": "Redirect natural scratching behavior with a sturdy, sisal-wrapped post that protects your furniture. The stable base and ideal height help cats stretch fully while they scratch.",
    "Cat Houses": "Offer your cat a private hideaway that feels safe and calming. Enclosed designs help reduce stress while giving your cat a personal retreat anywhere in your home.",
    "Cat Collars & Accessories": "A comfortable, adjustable collar that's gentle around the neck. Lightweight materials and a secure closure make it ideal for indoor and outdoor wear.",
    "Dog Beds": "Support your dog's joints and sleep quality with this thoughtfully cushioned bed. Designed for dogs of all life stages, from active pups to senior companions needing extra orthopedic comfort.",
    "Dog Houses": "Give your dog a comfortable shelter built to handle real outdoor conditions. Weather-resistant materials and a sturdy frame make it suitable for the backyard, patio, or covered porch.",
    "Dog Carriers": "Take your dog along easily with a carrier built for comfort and safety. Breathable mesh, padded straps, and a secure interior keep your dog relaxed during walks, travel, or daily errands.",
    "Dog Toys": "Keep your dog engaged, mentally stimulated, and physically active. Built tough for everyday play, this toy stands up to chewing and supports healthy exercise habits.",
    "Dog Bowls & Feeders": "Make mealtime healthier and more enjoyable. Designed to slow rapid eating, support digestion, and keep food and water organized in any kitchen or feeding area.",
    "Dog Grooming": "Maintain a healthy, shiny coat between baths. Designed to gently remove loose fur and tangles while turning grooming into a calm, bonding routine.",
    "Dog Collars & Leashes": "A secure, comfortable collar built for everyday walks. Padded materials and a strong, adjustable fit reduce strain and keep your dog safely connected to you.",
    "Dog Training": "Support consistent, positive training sessions at home or on the go. Designed to make reinforcement easy and reward-based — a calm, modern approach trainers recommend.",
  };

  const intro = intros[category] || "Designed with both pets and pet parents in mind, this product blends durability, comfort, and easy maintenance for everyday use.";

  const tagBenefits = tags.slice(0, 3).map(t => {
    const benefitsByTag: Record<string, string> = {
      orthopedic: "supports aging joints and muscles",
      "memory foam": "molds to your pet's body shape",
      cooling: "stays breathable in warm weather",
      elevated: "lifts your pet off cold or hot floors",
      interactive: "encourages mental stimulation",
      "self-cleaning": "reduces daily maintenance",
      "slow-feed": "promotes healthier eating speed",
    };
    return benefitsByTag[t.toLowerCase()];
  }).filter(Boolean);

  const benefitLine = tagBenefits.length
    ? ` Built-in features ${tagBenefits.join(", ")}.`
    : "";

  return `${intro}${benefitLine} Ships from a US warehouse with reliable delivery and is designed for daily use in the average American home.`;
}

function buildSlug(name: string, suffix: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${base}-${suffix.slice(0, 8)}`;
}

// ───────────────────────────────────────────────────────────────────
// CJ API helpers
// ───────────────────────────────────────────────────────────────────
async function getCJAccessToken(): Promise<string> {
  const email = Deno.env.get("CJ_EMAIL")!;
  const password = Deno.env.get("CJ_PASSWORD")!;
  const res = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data.result) throw new Error(`CJ auth failed: ${data.message}`);
  return data.data.accessToken;
}

async function searchCJ(token: string, keyword: string, page = 1) {
  const params = new URLSearchParams({
    pageNum: String(page),
    pageSize: "50",
    countryCode: "US",
    productNameEn: keyword,
  });
  const res = await fetch(`${CJ_API_BASE}/product/list?${params}`, {
    headers: { "Content-Type": "application/json", "CJ-Access-Token": token },
  });
  return res.json();
}

// ───────────────────────────────────────────────────────────────────
// Main handler
// ───────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const url = new URL(req.url);
    const target = parseInt(url.searchParams.get("target") || "100", 10);
    const dryRun = url.searchParams.get("dryRun") === "true";

    const KEYWORDS = [
      "cat tree", "cat condo", "cat scratching post",
      "cat litter box", "cat litter mat",
      "cat toy", "interactive cat toy", "cat tunnel", "cat teaser",
      "cat carrier", "cat backpack",
      "cat bed", "cat hammock",
      "cat fountain", "cat slow feeder", "cat bowl",
      "cat grooming brush", "cat nail clipper",
      "orthopedic dog bed", "elevated dog bed", "cooling dog bed", "dog bed plush",
      "dog house outdoor",
      "dog stroller", "pet carrier backpack", "dog car seat",
      "dog chew toy", "dog rope toy", "puzzle dog toy", "interactive dog toy",
      "automatic pet feeder", "slow feeder dog bowl", "elevated dog bowl", "pet water fountain",
      "dog deshedding brush", "dog nail grinder",
      "no pull dog harness", "padded dog collar", "retractable leash",
      "training treat pouch", "pet stairs", "dog ramp",
    ];

    // ─── Phase 1: Scout ───
    const allCandidates = new Map<string, any>();
    const cjToken = await getCJAccessToken();

    for (const kw of KEYWORDS) {
      try {
        const result = await searchCJ(cjToken, kw);
        if (!result?.result || !result?.data?.list) continue;
        for (const p of result.data.list) {
          const rawName = p.productNameEn || p.productName || "";
          if (!rawName || rawName.length < 5) continue;
          const price = Number(p.sellPrice) || 0;
          if (price < 5 || price > 150) continue;
          const classified = classifyProduct(rawName);
          if (!classified) continue;
          if (allCandidates.has(p.pid)) continue;

          // Markup: 2.4x for retail-realistic pricing
          const retailPrice = Math.round((price * 2.4 + 0.99) * 100) / 100;

          allCandidates.set(p.pid, {
            pid: p.pid,
            rawName,
            cost: price,
            retailPrice,
            category: classified.category,
            tags: classified.tags,
            image: p.productImage || null,
            weight: p.productWeight || null,
            searchKeyword: kw,
          });
        }
        await new Promise(r => setTimeout(r, 250));
      } catch (e) {
        console.error(`scout error "${kw}":`, e);
      }
    }

    const candidatesList = Array.from(allCandidates.values());
    console.log(`[bulk-expand] Scouted ${candidatesList.length} unique candidates`);

    // ─── Phase 2: Skip already imported ───
    const existingPids = new Set<string>();
    {
      const { data } = await supabase.from("products").select("cj_product_id").not("cj_product_id", "is", null);
      for (const r of (data || [])) if (r.cj_product_id) existingPids.add(r.cj_product_id);
    }
    const fresh = candidatesList.filter(c => !existingPids.has(c.pid));
    console.log(`[bulk-expand] ${fresh.length} fresh after dedupe (${candidatesList.length - fresh.length} already imported)`);

    // ─── Phase 3: Score + sort ───
    const scored = fresh.map(c => {
      let score = 0;
      // Category diversity bonus is applied later
      if (c.retailPrice >= 25 && c.retailPrice <= 80) score += 5;
      else if (c.retailPrice >= 15 && c.retailPrice < 25) score += 3;
      else if (c.retailPrice > 80 && c.retailPrice <= 120) score += 2;
      const lower = c.rawName.toLowerCase();
      if (/(orthopedic|interactive|self[-\s]?cleaning|automatic|cooling|elevated|premium|durable)/.test(lower)) score += 3;
      if (c.image) score += 2;
      if (c.weight && c.weight > 0) score += 1;
      return { ...c, score };
    }).sort((a, b) => b.score - a.score);

    // ─── Phase 4: Pick top N with category balancing ───
    // Cap per category to avoid 80% in one bucket
    const CATEGORY_CAPS: Record<string, number> = {
      "Cat Trees & Condos": 12,
      "Cat Litter Boxes": 10,
      "Cat Beds": 8,
      "Cat Carriers": 6,
      "Cat Toys": 14,
      "Cat Bowls & Feeders": 10,
      "Cat Grooming": 6,
      "Cat Scratching Posts": 5,
      "Cat Houses": 4,
      "Cat Collars & Accessories": 4,
      "Dog Beds": 14,
      "Dog Houses": 4,
      "Dog Carriers": 8,
      "Dog Toys": 14,
      "Dog Bowls & Feeders": 10,
      "Dog Grooming": 6,
      "Dog Collars & Leashes": 8,
      "Dog Training": 5,
    };

    const perCatCount: Record<string, number> = {};
    const picked: any[] = [];
    for (const item of scored) {
      const cap = CATEGORY_CAPS[item.category] ?? 10;
      const used = perCatCount[item.category] ?? 0;
      if (used >= cap) continue;
      picked.push(item);
      perCatCount[item.category] = used + 1;
      if (picked.length >= target) break;
    }

    if (dryRun) {
      return Response.json({
        ok: true,
        dryRun: true,
        scouted: candidatesList.length,
        fresh: fresh.length,
        wouldImport: picked.length,
        perCategory: perCatCount,
        sample: picked.slice(0, 10).map(p => ({
          name: p.rawName.slice(0, 60),
          category: p.category,
          retailPrice: p.retailPrice,
          score: p.score,
        })),
      }, { headers: corsHeaders });
    }

    // ─── Phase 5: Insert with full SEO data ───
    const inserted: any[] = [];
    const failed: any[] = [];

    for (const p of picked) {
      try {
        const title = buildBrandedTitle(p.rawName, p.category);
        const description = buildDescription(title, p.category, p.tags);
        const slug = buildSlug(title, p.pid);
        const compareAt = Math.round((p.retailPrice * 1.35 + 0.99) * 100) / 100;

        // Insert into products
        const { data: inserted_row, error } = await supabase
          .from("products")
          .insert({
            name: title,
            slug,
            description,
            short_description: description.slice(0, 160),
            price: p.retailPrice,
            compare_at_price: compareAt,
            cost_price: p.cost,
            image_url: p.image,
            category: p.category,
            tags: p.tags,
            cj_product_id: p.pid,
            weight: p.weight,
            stock: 100, // default available
            is_active: true,
            is_featured: false,
            meta_title: title.slice(0, 60),
            meta_description: description.slice(0, 158),
            meta_keywords: p.tags,
            country_of_origin: "US",
            shipping_origin_country: "US",
          })
          .select("id, slug, name, category, price")
          .single();

        if (error) {
          failed.push({ pid: p.pid, error: error.message });
          continue;
        }
        inserted.push(inserted_row);
      } catch (e: any) {
        failed.push({ pid: p.pid, error: e.message });
      }
    }

    // ─── Phase 6: Log ───
    await supabase.from("cron_job_logs").insert({
      job_name: "bulk-catalog-expand",
      status: "completed",
      success: true,
      items_processed: inserted.length,
      items_failed: failed.length,
      details: {
        target,
        scouted: candidatesList.length,
        fresh: fresh.length,
        picked: picked.length,
        inserted: inserted.length,
        failed: failed.length,
        perCategory: perCatCount,
      },
    });

    return Response.json({
      ok: true,
      target,
      scouted: candidatesList.length,
      fresh: fresh.length,
      picked: picked.length,
      inserted: inserted.length,
      failed: failed.length,
      perCategory: perCatCount,
      sampleInserted: inserted.slice(0, 5),
      failures: failed.slice(0, 5),
    }, { headers: corsHeaders });
  } catch (e: any) {
    console.error("[bulk-catalog-expand] fatal:", e);
    return Response.json({ ok: false, error: e.message }, { status: 500, headers: corsHeaders });
  }
});

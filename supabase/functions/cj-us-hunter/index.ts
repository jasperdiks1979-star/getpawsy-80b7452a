import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

// Allowed pet categories
const ALLOWED_CATEGORIES = [
  "cat toy", "dog toy", "pet toy", "cat feeder", "dog feeder", "pet feeder",
  "cat carrier", "dog carrier", "pet carrier", "grooming", "brush", "comb",
  "dog training", "training tool", "leash", "harness", "collar", "bowl",
  "cat tree", "scratching", "cat bed", "dog bed", "pet bed", "fountain",
  "litter", "slow feeder", "puzzle", "interactive",
];

// Excluded types
const EXCLUDED_PATTERNS = [
  "glass", "fragile", "furniture set", "aquarium", "fish tank", "terrarium",
  "horse", "reptile", "bird cage", "aviary", "saddle",
  // Non-pet items
  "sunglasses", "nail art", "phone case", "handbag", "jewelry", "earring",
  "necklace", "bracelet", "ring", "wallet", "purse", "makeup",
];

function isPetProduct(name: string): boolean {
  const lower = name.toLowerCase();
  if (EXCLUDED_PATTERNS.some(p => lower.includes(p))) return false;
  const petKeywords = ["cat", "dog", "pet", "kitten", "puppy", "feline", "canine"];
  return petKeywords.some(kw => lower.includes(kw)) ||
    ALLOWED_CATEGORIES.some(c => lower.includes(c));
}

function isAllowedCategory(name: string): boolean {
  const lower = name.toLowerCase();
  return ALLOWED_CATEGORIES.some(c => lower.includes(c));
}

function isExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDED_PATTERNS.some(p => lower.includes(p));
}

function scoreProduct(p: { name: string; price: number; category?: string; warehouse: string; shippingDays?: number }): number {
  let score = 0;
  const lower = `${p.name} ${p.category || ""}`.toLowerCase();

  // US warehouse = +4
  if (p.warehouse === "US") score += 4;

  // Price sweet spot
  if (p.price >= 15 && p.price <= 50) score += 3;
  else if (p.price > 50 && p.price <= 80) score += 2;
  else if (p.price >= 10 && p.price < 15) score += 1;

  // Toy / visual category = +2
  const visualKws = ["toy", "feeder", "carrier", "fountain", "tree", "bed", "bowl", "puzzle"];
  if (visualKws.some(kw => lower.includes(kw))) score += 2;

  // Clear category = +2
  if (ALLOWED_CATEGORIES.some(c => lower.includes(c))) score += 2;

  // Shipping = +1
  if (p.shippingDays && p.shippingDays <= 5) score += 1;

  // High-intent keywords = +1
  const intentKws = ["interactive", "enrichment", "training", "orthopedic", "automatic", "waterproof"];
  if (intentKws.some(kw => lower.includes(kw))) score += 1;

  return score;
}

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

async function searchCJProducts(token: string, page = 1, pageSize = 50, keyword?: string) {
  const params = new URLSearchParams({
    pageNum: String(page),
    pageSize: String(pageSize),
    countryCode: "US",
    categoryId: "2409110611570657700", // Pet Supplies
  });
  if (keyword) params.set("productNameEn", keyword);

  const res = await fetch(`${CJ_API_BASE}/product/list?${params}`, {
    method: "GET",
    headers: { "Content-Type": "application/json", "CJ-Access-Token": token },
  });
  const data = await res.json();
  return data;
}

async function getProductShipping(token: string, pid: string) {
  const res = await fetch(`${CJ_API_BASE}/product/shippingV2?pid=${pid}&country=US`, {
    method: "GET",
    headers: { "Content-Type": "application/json", "CJ-Access-Token": token },
  });
  const data = await res.json();
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "scan";

    // ── PUBLIC: list current winners ──
    if (action === "list") {
      const supabase = createClient(supabaseUrl, serviceKey);
      const { data: winners } = await supabase
        .from("cj_us_winners")
        .select("*")
        .order("score", { ascending: false })
        .limit(30);

      const topProducts = (winners || []).map(w => ({
        id: w.id,
        cj_product_id: w.cj_product_id,
        name: w.name,
        price: w.price,
        score: w.score,
        warehouse: w.warehouse,
        shipping_time: w.shipping_time,
        category: w.category,
        image_url: w.image_url,
      }));

      const priceRanges = {
        under20: topProducts.filter(p => p.price < 20).length,
        range20to50: topProducts.filter(p => p.price >= 20 && p.price <= 50).length,
        range50to80: topProducts.filter(p => p.price > 50 && p.price <= 80).length,
      };

      const shippingTimes = topProducts
        .filter(p => p.shipping_time)
        .map(p => ({ name: p.name, days: p.shipping_time }));

      return Response.json({
        ok: true,
        topProducts,
        recommendedImports: topProducts.filter(p => p.score >= 8),
        shippingTimes,
        priceRanges,
      }, { headers: corsHeaders });
    }

    // ── Auth for scan / import actions ──
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const isServiceRole = token === serviceKey;

    if (!isServiceRole) {
      if (!token) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: corsHeaders });
      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: { user } } = await anonClient.auth.getUser(token);
      if (!user) return Response.json({ ok: false, error: "Invalid token" }, { status: 401, headers: corsHeaders });
      const supabase = createClient(supabaseUrl, serviceKey);
      const { data: roleData } = await supabase.from("user_roles").select("role")
        .eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (!roleData) return Response.json({ ok: false, error: "Admin required" }, { status: 403, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // ── ACTION: scan — search CJ, score, save top 30 ──
    if (action === "scan") {
      const cjToken = await getCJAccessToken();
      const allProducts: any[] = [];

      // Search multiple pages and keywords
      const keywords = ["cat toy", "dog toy", "pet feeder", "dog training", "cat tree", "pet carrier", "dog harness", "cat bed", "dog bed", "pet grooming"];

      for (const kw of keywords) {
        try {
          const result = await searchCJProducts(cjToken, 1, 50, kw);
          if (result.result && result.data?.list) {
            for (const p of result.data.list) {
              const name = p.productNameEn || p.productName || "";
              if (!isPetProduct(name)) continue;
              if (isExcluded(name)) continue;

              const price = p.sellPrice || 0;
              if (price < 10 || price > 80) continue;

              // Check if already collected
              if (allProducts.some(ap => ap.pid === p.pid)) continue;

              allProducts.push({
                pid: p.pid,
                name,
                price,
                category: p.categoryName || kw,
                image: p.productImage || null,
                weight: p.productWeight || null,
              });
            }
          }
          // Rate limit
          await new Promise(r => setTimeout(r, 500));
        } catch (e) {
          console.error(`Error searching "${kw}":`, e);
        }
      }

      // Score all products
      const scored = allProducts.map(p => ({
        ...p,
        score: scoreProduct({
          name: p.name,
          price: p.price,
          category: p.category,
          warehouse: "US",
        }),
      }));

      scored.sort((a, b) => b.score - a.score);
      const top30 = scored.slice(0, 30);

      // Check shipping for top products (sample first 10 to avoid rate limits)
      for (let i = 0; i < Math.min(10, top30.length); i++) {
        try {
          const shipData = await getProductShipping(cjToken, top30[i].pid);
          if (shipData.result && shipData.data?.length > 0) {
            // Find US shipping option
            const usShip = shipData.data.find((s: any) =>
              s.logisticName?.toLowerCase().includes("us") ||
              s.aging <= 7
            );
            if (usShip) {
              top30[i].shippingDays = usShip.aging || 7;
            }
          }
          await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
          console.error(`Shipping check failed for ${top30[i].pid}:`, e);
        }
      }

      // Clear old winners and save new
      await supabase.from("cj_us_winners").delete().neq("id", "00000000-0000-0000-0000-000000000000");

      const imageIssues: any[] = [];

      for (const p of top30) {
        // Quick image check
        let imageOk = true;
        let imageIssue: string | null = null;
        if (p.image) {
          try {
            const imgRes = await fetch(p.image, { method: "HEAD", redirect: "follow" });
            const ct = imgRes.headers.get("content-type");
            if (!imgRes.ok || !ct || !ct.startsWith("image/")) {
              imageOk = false;
              imageIssue = "invalid_image";
            }
          } catch {
            imageOk = false;
            imageIssue = "unreachable";
          }
        } else {
          imageOk = false;
          imageIssue = "missing_image";
        }

        if (!imageOk) imageIssues.push({ pid: p.pid, name: p.name, issue: imageIssue });

        await supabase.from("cj_us_winners").upsert({
          cj_product_id: p.pid,
          name: p.name,
          price: p.price,
          shipping_time: p.shippingDays || null,
          warehouse: "US",
          category: p.category,
          score: p.score,
          image_url: p.image,
          image_ok: imageOk,
          weight: p.weight,
        }, { onConflict: "cj_product_id" });
      }

      // Log
      await supabase.from("cron_job_logs").insert({
        job_name: "cj-us-product-hunter",
        status: "completed",
        success: true,
        items_processed: top30.length,
        details: { searched: allProducts.length, imageIssues: imageIssues.length, topScore: top30[0]?.score },
      });

      return Response.json({
        ok: true,
        scanned: allProducts.length,
        winners: top30.length,
        imageIssues,
        topProducts: top30.map(p => ({
          cj_product_id: p.pid,
          name: p.name,
          price: p.price,
          score: p.score,
          category: p.category,
          shippingDays: p.shippingDays,
        })),
      }, { headers: corsHeaders });
    }

    // ── ACTION: import — auto-import winners into products table ──
    if (action === "import") {
      const body = await req.json().catch(() => ({}));
      const productIds: string[] = body.productIds || [];

      const { data: winners } = await supabase
        .from("cj_us_winners")
        .select("*")
        .eq("auto_imported", false)
        .eq("image_ok", true);

      const toImport = productIds.length > 0
        ? (winners || []).filter(w => productIds.includes(w.cj_product_id))
        : (winners || []).filter(w => w.score >= 8);

      let imported = 0;
      for (const w of toImport) {
        // Check if already exists
        const { data: existing } = await supabase
          .from("products")
          .select("id")
          .eq("cj_product_id", w.cj_product_id)
          .maybeSingle();

        if (existing) {
          await supabase.from("cj_us_winners")
            .update({ auto_imported: true, imported_product_id: existing.id })
            .eq("id", w.id);
          continue;
        }

        // Generate slug
        const slug = w.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 100);

        const { data: newProduct, error } = await supabase
          .from("products")
          .insert({
            name: w.name,
            price: w.price,
            image_url: w.image_url,
            category: w.category,
            cj_product_id: w.cj_product_id,
            weight: w.weight,
            stock: w.stock || 0,
            slug,
            is_active: false, // Manual review before activating
          })
          .select("id")
          .single();

        if (!error && newProduct) {
          await supabase.from("cj_us_winners")
            .update({ auto_imported: true, imported_product_id: newProduct.id })
            .eq("id", w.id);
          imported++;
        }
      }

      return Response.json({ ok: true, imported, total: toImport.length }, { headers: corsHeaders });
    }

    return Response.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400, headers: corsHeaders });
  } catch (err) {
    console.error("CJ US Hunter error:", err);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500, headers: corsHeaders });
  }
});

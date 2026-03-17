import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), { status, headers: corsHeaders });
}

// ── Types ──
type ProductRow = {
  id: string;
  slug?: string | null;
  name?: string | null;
  title?: string | null;
  product_type?: string | null;
  animal_type?: string | null;
  primary_keyword?: string | null;
  key_feature?: string | null;
  brand?: string | null;
  category_name?: string | null;
  shopping_title?: string | null;
  is_active?: boolean | null;
};

type RequestBody = {
  action?: "test" | "preview" | "preview_short" | "optimize";
  limit?: number;
  dryRun?: boolean;
  ids?: string[];
  shortTitlesOnly?: boolean;
  filterShort?: boolean;
  offset?: number;
};

// ── Text helpers ──
function sanitize(v: string | null | undefined): string {
  return (v ?? "").replace(/\s+/g, " ").replace(/[|]+/g, " ").replace(/[^\p{L}\p{N}\s&/+,\-().]/gu, "").trim();
}

function titleCase(s: string): string {
  return s.split(" ").filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function dedupe(s: string): string {
  const seen = new Set<string>();
  return s.split(" ").filter(w => { const k = w.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).join(" ");
}

function clamp(s: string, max = 120): string {
  const c = s.replace(/\s+/g, " ").trim();
  if (c.length <= max) return c;
  let out = "";
  for (const p of c.split(" ")) { const n = out ? `${out} ${p}` : p; if (n.length > max) break; out = n; }
  return out.trim();
}

function buildFallbackTitle(p: ProductRow, short = false): string {
  const parts = [sanitize(p.primary_keyword), sanitize(p.product_type), sanitize(p.key_feature), sanitize(p.animal_type), sanitize(p.brand)].filter(Boolean);
  let t = titleCase(dedupe(parts.join(" ")));
  const max = short ? 70 : 120;
  t = clamp(t, max);
  if (!t) t = clamp(titleCase(dedupe(sanitize(p.name || p.title || "Pet Product"))), max);
  return t;
}

function isValid(t: string, short = false): boolean {
  const max = short ? 70 : 120;
  return !!t && t.length >= 15 && t.length <= max && !/^\W+$/.test(t);
}

// ── AI title generation ──
async function generateAITitle(p: ProductRow, apiKey: string, short = false): Promise<string | null> {
  if (!apiKey) return null;
  const maxC = short ? 70 : 120;
  const prompt = `Create one Google Shopping product title.\nRules:\n- ${short ? "Maximum 70 characters." : "Between 70 and 120 characters, never exceed 120."}\n- English only\n- No promotional claims\n- Structure: Primary Keyword + Product Type + Key Feature + Target Animal\n- Return only the title, no quotes\n\nProduct:\nName: ${p.name || p.title || ""}\nPrimary keyword: ${p.primary_keyword || ""}\nProduct type: ${p.product_type || ""}\nKey feature: ${p.key_feature || ""}\nTarget animal: ${p.animal_type || ""}\nBrand: ${p.brand || ""}`;

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-flash-lite", messages: [{ role: "user", content: prompt }], temperature: 0.3 }),
    });
    if (!resp.ok) { console.error(`AI error ${resp.status}`); return null; }
    const d = await resp.json();
    const raw = d?.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== "string") return null;
    return clamp(titleCase(dedupe(sanitize(raw))), maxC);
  } catch (e) { console.error("AI call failed:", e); return null; }
}

// ── Main handler ──
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  console.log("[optimize-product-titles] START");

  // Env validation
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("[optimize-product-titles] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return json({ success: false, error: "Server configuration error: missing database credentials" }, 500);
  }

  // Auth: verify caller is authenticated (basic bearer check)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ success: false, error: "Authentication required. Please log in." }, 401);
  }

  // Verify token via anon client
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  if (ANON_KEY) {
    try {
      const authClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: { user }, error } = await authClient.auth.getUser();
      if (error || !user) {
        console.error("[optimize-product-titles] Auth failed:", error?.message);
        return json({ success: false, error: "Unauthorized. Please log in again." }, 401);
      }
      console.log("[optimize-product-titles] Authenticated user:", user.id);
    } catch (e) {
      console.error("[optimize-product-titles] Auth check error:", e);
      return json({ success: false, error: "Authentication verification failed" }, 401);
    }
  }

  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const dryRun = body.dryRun ?? true;
    const shortTitlesOnly = body.shortTitlesOnly ?? body.filterShort ?? false;
    const limit = Math.min(Math.max(body.limit ?? 20, 1), 500);
    const offset = body.offset ?? 0;
    const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];

    console.log(`[optimize-product-titles] action=${dryRun ? "preview" : "optimize"} limit=${limit} offset=${offset} short=${shortTitlesOnly}`);

    // Use service role for DB access
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Fetch products
    const selectFields = "id, slug, name, title, product_type, animal_type, primary_keyword, key_feature, brand, shopping_title, is_active";
    let query = admin.from("products").select(selectFields).eq("is_active", true).order("updated_at", { ascending: false });

    if (ids.length > 0) {
      query = admin.from("products").select(selectFields).in("id", ids);
    } else {
      query = query.range(offset, offset + limit - 1);
    }

    const { data: products, error: loadError } = await query;

    if (loadError) {
      console.error("[optimize-product-titles] DB error:", loadError.message);
      return json({ success: false, error: "Database query failed", details: loadError.message, debug: { table: "products", offset, limit } }, 500);
    }

    const rows = (products ?? []) as ProductRow[];
    console.log(`[optimize-product-titles] Fetched ${rows.length} products`);

    if (rows.length === 0) {
      return json({
        success: true,
        action: dryRun ? "preview" : "optimize",
        totalProducts: 0,
        optimizedCount: 0,
        updatedCount: 0,
        errorCount: 0,
        fallbackCount: 0,
        dryRun,
        shortTitlesOnly,
        results: [],
        charStats: null,
        debug: { table: "products", offset, limit, fetchedCount: 0 },
      });
    }

    // Process products
    const results: any[] = [];
    let optimizedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    let fallbackCount = 0;
    const lengths: number[] = [];

    for (const product of rows) {
      try {
        const originalTitle = product.shopping_title || product.name || product.title || "";
        let usedAI = false;
        let usedFallback = false;

        // Try AI first
        let optimized = await generateAITitle(product, LOVABLE_KEY, shortTitlesOnly);
        if (optimized && isValid(optimized, shortTitlesOnly)) {
          usedAI = true;
        } else {
          // Fallback
          optimized = buildFallbackTitle(product, shortTitlesOnly);
          usedFallback = true;
          fallbackCount++;
        }

        if (!isValid(optimized, shortTitlesOnly)) {
          errorCount++;
          results.push({ id: product.id, slug: product.slug, ok: false, category: product.product_type || "Unknown", original: originalTitle, optimized: null, charCount: 0, reason: "Could not generate valid title", usedAI: false, usedFallback: true });
          continue;
        }

        lengths.push(optimized.length);
        optimizedCount++;

        // Write if not dry run
        if (!dryRun) {
          const { error: updateErr } = await admin.from("products").update({ shopping_title: optimized, title_optimized_at: new Date().toISOString() }).eq("id", product.id);
          if (updateErr) {
            errorCount++;
            results.push({ id: product.id, slug: product.slug, ok: false, category: product.product_type || "Unknown", original: originalTitle, optimized, charCount: optimized.length, reason: updateErr.message, usedAI, usedFallback });
            continue;
          }
          updatedCount++;
        }

        results.push({ id: product.id, slug: product.slug, ok: true, category: product.product_type || "Unknown", original: originalTitle, optimized, charCount: optimized.length, dryRun, usedAI, usedFallback });
      } catch (err) {
        errorCount++;
        results.push({ id: product.id, slug: product.slug, ok: false, category: product.product_type || "Unknown", original: product.name || "", optimized: null, charCount: 0, reason: err instanceof Error ? err.message : "Unknown error", usedAI: false, usedFallback: false });
      }
    }

    // Compute char stats
    const charStats = lengths.length > 0 ? {
      avgLength: Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length),
      minLength: Math.min(...lengths),
      maxLength: Math.max(...lengths),
      inRange: lengths.filter(l => l >= 70 && l <= 120).length,
      tooShort: lengths.filter(l => l < 70).length,
      tooLong: lengths.filter(l => l > 120).length,
    } : null;

    console.log(`[optimize-product-titles] DONE: ${optimizedCount} optimized, ${updatedCount} updated, ${errorCount} errors, ${fallbackCount} fallback`);

    return json({
      success: true,
      action: dryRun ? "preview" : "optimize",
      totalProducts: rows.length,
      filteredCount: rows.length,
      optimizedCount,
      updatedCount,
      errorCount,
      fallbackCount,
      dryRun,
      shortTitlesOnly,
      charStats,
      results,
      debug: {
        table: "products",
        fetchedCount: rows.length,
        sampleIds: rows.slice(0, 3).map(r => r.id),
        aiAvailable: !!LOVABLE_KEY,
        missingFieldsRate: rows.filter(r => !r.primary_keyword && !r.product_type).length,
      },
    });
  } catch (err) {
    console.error("[optimize-product-titles] CRASH:", err);
    return json({ success: false, error: "Unexpected server error", details: err instanceof Error ? err.message : "Unknown" }, 500);
  }
});

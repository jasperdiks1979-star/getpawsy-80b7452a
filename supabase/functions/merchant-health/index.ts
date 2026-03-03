import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SITE = "https://getpawsy.pet";

const POLICY_PAGES: Record<string, { path: string; keywords: string[] }> = {
  shipping: { path: "/shipping", keywords: ["business days", "shipping"] },
  returns:  { path: "/returns",  keywords: ["refund"] },
  privacy:  { path: "/privacy",  keywords: ["information"] },
  terms:    { path: "/terms",    keywords: ["terms"] },
  contact:  { path: "/contact",  keywords: ["email"] },
  about:    { path: "/about",    keywords: ["getpawsy"] },
};

const SHIPPING_CLAIMS = [
  { key: "usFulfillmentVisible", patterns: [
    /warehouses?\s*(located\s+)?in\s+the\s+united\s+states/i,
    /us\s+warehouse/i,
    /ships?\s+from\s+(the\s+)?us/i,
    /domestic\s+(fulfillment|shipping)/i,
    /US\s+warehouses/i,
  ]},
  { key: "processingTimeVisible", patterns: [
    /processing\s+time/i,
    /1.?2\s+business\s+days?/i,
    /order\s+processing/i,
    /handled\s+within/i,
  ]},
  { key: "deliveryTimeVisible", patterns: [
    /delivery\s+time/i,
    /3.?7\s+business\s+days?/i,
    /estimated\s+delivery/i,
    /business\s+day\s+delivery/i,
  ]},
];

// Extract JS bundle URLs from SPA HTML shell and fetch their content
async function fetchJsBundleContent(html: string): Promise<string> {
  const scriptMatches = html.matchAll(/src=["']([^"']*\.js)["']/g);
  const urls: string[] = [];
  for (const m of scriptMatches) {
    const src = m[1].startsWith("http") ? m[1] : `${SITE}${m[1].startsWith("/") ? "" : "/"}${m[1]}`;
    urls.push(src);
  }
  // Fetch up to 5 JS bundles in parallel
  const results = await Promise.all(
    urls.slice(0, 5).map(async (u) => {
      try {
        const r = await fetch(u, { signal: AbortSignal.timeout(6000) });
        return r.ok ? await r.text() : "";
      } catch { return ""; }
    })
  );
  return results.join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // 1. Site reachable
    let siteReachable = false;
    try {
      const r = await fetch(SITE, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "GetPawsy-MerchantHealth/1.0" } });
      siteReachable = r.ok;
      const html = await r.text();

      // Also fetch JS bundle content to find rendered text
      const jsContent = await fetchJsBundleContent(html);
      const allContent = html + "\n" + jsContent;

      // Also fetch /shipping page content
      let shippingPageContent = "";
      try {
        const sr = await fetch(`${SITE}/shipping`, { signal: AbortSignal.timeout(6000), headers: { "User-Agent": "GetPawsy-MerchantHealth/1.0" } });
        if (sr.ok) shippingPageContent = await sr.text();
      } catch { /* ignore */ }

      const searchable = allContent + "\n" + shippingPageContent;

      // 3. Shipping claims from HTML + JS bundles + shipping page
      var shippingClaims: Record<string, boolean> = {};
      for (const c of SHIPPING_CLAIMS) {
        shippingClaims[c.key] = c.patterns.some((p: RegExp) => p.test(searchable));
      }
    } catch {
      var shippingClaims: Record<string, boolean> = {};
      for (const c of SHIPPING_CLAIMS) shippingClaims[c.key] = false;
    }

    // 2. Policy pages — parallel probes
    const policyEntries = Object.entries(POLICY_PAGES);
    const policyResults = await Promise.all(
      policyEntries.map(([, cfg]) => probePageOk(cfg.path, cfg.keywords))
    );
    const policyPages: Record<string, boolean> = {};
    policyEntries.forEach(([key], i) => { policyPages[key] = policyResults[i]; });

    // 4. Feed consistency — sample 10 products from DB, check price/availability match
    const { data: products } = await supabase
      .from("products")
      .select("id, slug, price, stock, is_active, image_url")
      .eq("is_active", true)
      .gt("price", 0)
      .limit(10);

    let priceMatch = true;
    let availabilityMatch = true;
    const mismatches: Array<{ id: string; issue: string }> = [];

    for (const p of (products || [])) {
      if (!p.price || p.price <= 0) {
        priceMatch = false;
        mismatches.push({ id: p.id, issue: "price_zero_or_missing" });
      }
      // Active products with no stock = potential availability mismatch in feed
      if (p.is_active && (p.stock === null || p.stock === undefined || p.stock <= 0)) {
        availabilityMatch = false;
        mismatches.push({ id: p.id, issue: "active_but_no_stock" });
      }
    }

    // 5. Image health — check first 10 product images
    let imagesReachable = true;
    let encodingValid = true;
    const imageIssues: Array<{ id: string; issue: string }> = [];

    const imageChecks = await Promise.all(
      (products || []).filter(p => p.image_url).slice(0, 10).map(async (p) => {
        try {
          const res = await fetch(p.image_url!, { method: "HEAD", signal: AbortSignal.timeout(5000) });
          const ct = res.headers.get("content-type") || "";
          if (!res.ok) return { id: p.id, ok: false, issue: `http_${res.status}` };
          if (!ct.startsWith("image/")) return { id: p.id, ok: false, issue: `bad_content_type:${ct}` };
          return { id: p.id, ok: true, issue: null };
        } catch {
          return { id: p.id, ok: false, issue: "fetch_failed" };
        }
      })
    );
    for (const ic of imageChecks) {
      if (!ic.ok) {
        imagesReachable = false;
        if (ic.issue?.includes("content_type")) encodingValid = false;
        imageIssues.push({ id: ic.id, issue: ic.issue! });
      }
    }

    // 6. Google category check — ensure products have a category
    const { data: noCat } = await supabase
      .from("products")
      .select("id")
      .eq("is_active", true)
      .is("category", null)
      .limit(5);
    const missingCategories = (noCat || []).length;

    // Build overall health status
    const allPoliciesOk = Object.values(policyPages).every(Boolean);
    const allShippingOk = Object.values(shippingClaims).every(Boolean);
    const healthy = siteReachable && allPoliciesOk && priceMatch && availabilityMatch && imagesReachable && allShippingOk;

    const result = {
      ok: true,
      healthy,
      ts: new Date().toISOString(),
      siteReachable,
      policyPages,
      feedConsistency: {
        priceMatch,
        availabilityMatch,
        mismatches: mismatches.slice(0, 5),
      },
      shippingClaims,
      imageHealth: {
        imagesReachable,
        encodingValid,
        issues: imageIssues.slice(0, 5),
      },
      categoryHealth: {
        missingCategories,
      },
    };

    // Log to DB for daily tracking
    await supabase.from("cron_job_logs").insert({
      job_name: "merchant-health-check",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: healthy ? "success" : "warning",
      success: healthy,
      details: result as any,
      items_processed: (products || []).length,
      items_failed: mismatches.length + imageIssues.length,
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

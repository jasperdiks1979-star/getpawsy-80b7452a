import fs from "node:fs";
import path from "node:path";
import {
  ensureDir,
  toIsoDate,
  renderUrlset,
  renderSitemapIndex,
  writeFile,
  chunk,
  absUrl,
  readJson,
  joinRoot,
} from "./sitemap-utils.mjs";

const BASE = "https://getpawsy.pet";
const OUT_DIR = joinRoot("public");
const CHUNK_SIZE = 5000;
const HISTORY_PATH = joinRoot("data", "sitemap-history.json");

const SUPABASE_URL = "https://nojvgfbcjgipjxpfatmm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vanZnZmJjamdpcGp4cGZhdG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTMxOTYsImV4cCI6MjA4Mzk4OTE5Nn0.gfjmYf9aB-BCIrCnH14Zmnm6GBEKX7QMWP1ELL_i9dc";

async function fetchFromSupabase(table, params) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) { console.warn(`[sitemaps] REST error ${table}: ${res.status}`); return null; }
    return await res.json();
  } catch (err) { console.warn(`[sitemaps] REST fetch failed ${table}:`, err.message); return null; }
}

function nowIsoDate() { return new Date().toISOString().slice(0, 10); }

function filterIndexable(entries) {
  return (Array.isArray(entries) ? entries : []).filter((e) => e && e.path && !e.noindex);
}

function validateXmlBasics(xml, mustContain) {
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'))
    throw new Error("XML does not start with required header.");
  for (const token of mustContain)
    if (!xml.includes(token)) throw new Error(`XML missing required token: ${token}`);
}

const EXCLUDED_PATHS = new Set([
  "/cart", "/checkout", "/account", "/profile", "/search",
  "/login", "/register", "/admin", "/dashboard", "/404",
]);

function isExcluded(p) {
  if (!p) return true;
  if (EXCLUDED_PATHS.has(p)) return true;
  if (p.includes("?") || p.includes("#")) return true;
  if (p.startsWith("/admin/") || p.startsWith("/dashboard/")) return true;
  return false;
}

// ── Delta lastmod ──
function loadHistory() {
  try { const p = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8")); return typeof p === "object" && p ? p : {}; }
  catch { return {}; }
}
function saveHistory(h) { fs.writeFileSync(HISTORY_PATH, JSON.stringify(h, null, 2), "utf8"); }

function resolveLastmod(urlPath, currentUpdatedAt, history, today) {
  const currentDate = toIsoDate(currentUpdatedAt) ?? today;
  const prev = history[urlPath];
  if (!prev) return currentDate;
  if (prev.updatedAt === currentUpdatedAt) return prev.lastmod;
  return currentDate;
}

// ── Revenue-weighted priority ──
function computeProductPriority(slug, revenueData, bestsellers, gscByPath) {
  let priority = 0.60;

  // Bestseller boost
  if (bestsellers.has(slug)) priority += 0.20;

  // Revenue boost from order data
  const rev = revenueData.get(slug);
  if (rev) {
    if (rev.revenue > 200) priority += 0.15;
    else if (rev.revenue > 50) priority += 0.10;
    if (rev.orderCount >= 3) priority += 0.05;
  }

  // Stock status
  // (stock info not in products_public view by default, handled via separate query if available)

  // GSC position boost
  const gsc = gscByPath[`/product/${slug}`];
  if (gsc) {
    if (gsc.position >= 4 && gsc.position <= 8) priority += 0.03;
    else if (gsc.position > 0 && gsc.position <= 3) priority += 0.05;
  }

  return Math.round(Math.min(0.90, Math.max(0.40, priority)) * 100) / 100;
}

function computeCollectionPriority(slug, topRevenueCollections) {
  if (topRevenueCollections.has(slug)) return 0.90;
  return 0.80;
}

// ── Load GSC metrics ──
function loadGscMetrics() {
  try {
    const data = JSON.parse(fs.readFileSync(joinRoot("data", "gsc-metrics.json"), "utf8"));
    const map = {};
    if (data && Array.isArray(data.rows)) {
      for (const r of data.rows) {
        try { const p = new URL(r.page).pathname; map[p] = r; } catch { /* skip */ }
      }
    }
    return map;
  } catch { return {}; }
}

async function main() {
  ensureDir(OUT_DIR);
  const today = nowIsoDate();
  const history = loadHistory();
  const newHistory = {};
  const gscByPath = loadGscMetrics();

  const safeRead = (p, fallback) => { try { return readJson(p); } catch { return fallback; } };

  // ── Fetch bestsellers set ──
  const bestsellersRaw = await fetchFromSupabase("bestsellers", "select=slug&is_active=eq.true");
  const bestsellers = new Set((bestsellersRaw || []).map((b) => b.slug));
  console.log(`[sitemaps] Bestsellers loaded: ${bestsellers.size}`);

  // ── Fetch order revenue data (last 30 days) ──
  const revenueData = new Map();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const ordersRaw = await fetchFromSupabase(
    "orders",
    `select=items,total_amount&status=eq.paid&created_at=gte.${thirtyDaysAgo}&limit=1000`
  );
  if (ordersRaw) {
    for (const order of ordersRaw) {
      const items = Array.isArray(order.items) ? order.items : [];
      for (const item of items) {
        // Extract slug from product name (items have id, name, price)
        const id = item.id;
        if (!id) continue;
        const existing = revenueData.get(id) || { revenue: 0, orderCount: 0 };
        existing.revenue += (item.price || 0) * (item.quantity || 1);
        existing.orderCount += 1;
        revenueData.set(id, existing);
      }
    }
    console.log(`[sitemaps] Revenue data: ${revenueData.size} products from ${ordersRaw.length} orders`);
  }

  // ── Build product ID → slug map for revenue matching ──
  const productIdSlugRaw = await fetchFromSupabase(
    "products_public",
    "select=id,slug&is_active=eq.true&is_duplicate=eq.false&slug=not.is.null&limit=5000"
  );
  const revenueBySlug = new Map();
  if (productIdSlugRaw) {
    for (const p of productIdSlugRaw) {
      const rev = revenueData.get(p.id);
      if (rev) revenueBySlug.set(p.slug, rev);
    }
  }

  // ── Top revenue collection slugs ──
  const topRevenueCollections = new Set();
  // Collections containing bestsellers are top revenue
  const collSlugRaw = await fetchFromSupabase("seo_collections", "select=slug&is_active=eq.true");
  if (collSlugRaw) {
    // Heuristic: top 10 collections by slug matching common high-value terms
    for (const c of collSlugRaw) {
      if (bestsellers.size > 0) {
        // Mark collections that appear in GSC top positions
        const gsc = gscByPath[`/collections/${c.slug}`];
        if (gsc && gsc.impressions > 200) topRevenueCollections.add(c.slug);
      }
    }
  }

  // ── Products (with seo_tier for tiered sitemaps) ──
  let productsRaw = await fetchFromSupabase(
    "products_public",
    "select=slug,updated_at,seo_tier&is_active=eq.true&is_duplicate=eq.false&slug=not.is.null&order=updated_at.desc&limit=5000"
  );
  let products;
  if (productsRaw && productsRaw.length > 0) {
    products = productsRaw
      .filter((p) => p.slug && p.slug.trim() !== "" && !isExcluded(`/product/${p.slug}`))
      .map((p) => ({
        path: `/product/${p.slug}`,
        lastmod: p.updated_at,
        priority: computeProductPriority(p.slug, revenueBySlug, bestsellers, gscByPath),
        seo_tier: p.seo_tier || 'C',
      }));
    console.log(`[sitemaps] Products from REST API: ${products.length}`);
  } else {
    products = filterIndexable(safeRead(joinRoot("data", "products.json"), [])).map((p) => ({
      ...p,
      seo_tier: 'B', // fallback JSON gets Tier B
    }));
    console.log(`[sitemaps] Products from JSON fallback: ${products.length}`);
  }

  if (products.length === 0) {
    console.error("[sitemaps] FATAL: 0 products fetched. Aborting build.");
    process.exit(1);
  }

  // ── Collections ──
  let collectionsRaw = await fetchFromSupabase("seo_collections", "select=slug,updated_at&is_active=eq.true&order=updated_at.desc");
  let collections;
  if (collectionsRaw && collectionsRaw.length > 0) {
    collections = collectionsRaw
      .filter((c) => !isExcluded(`/collections/${c.slug}`))
      .map((c) => ({
        path: `/collections/${c.slug}`,
        lastmod: c.updated_at,
        priority: computeCollectionPriority(c.slug, topRevenueCollections),
      }));
    console.log(`[sitemaps] Collections from REST API: ${collections.length}`);
  } else {
    collections = filterIndexable(safeRead(joinRoot("data", "collections.json"), []));
    console.log(`[sitemaps] Collections from JSON fallback: ${collections.length}`);
  }
  if (collections.length === 0) console.warn("[sitemaps] WARNING: 0 collections found.");

  // ── Blog ──
  let blogRaw = await fetchFromSupabase("blog_posts", "select=slug,published_at&is_published=eq.true&order=published_at.desc");
  let blog;
  if (blogRaw && blogRaw.length > 0) {
    blog = blogRaw.filter((b) => !isExcluded(`/blog/${b.slug}`)).map((b) => ({ path: `/blog/${b.slug}`, lastmod: b.published_at }));
    console.log(`[sitemaps] Blog from REST API: ${blog.length}`);
  } else {
    blog = filterIndexable(safeRead(joinRoot("data", "blog.json"), []));
    console.log(`[sitemaps] Blog from JSON fallback: ${blog.length}`);
  }

  const guides = filterIndexable(safeRead(joinRoot("data", "guides.json"), []));
  console.log(`[sitemaps] Guides from JSON: ${guides.length}`);
  const clusters = filterIndexable(safeRead(joinRoot("data", "clusters.json"), []));
  console.log(`[sitemaps] Clusters from JSON: ${clusters.length}`);

  // ── Sort alphabetically ──
  products.sort((a, b) => a.path.localeCompare(b.path));
  collections.sort((a, b) => a.path.localeCompare(b.path));
  blog.sort((a, b) => a.path.localeCompare(b.path));
  guides.sort((a, b) => a.path.localeCompare(b.path));
  clusters.sort((a, b) => a.path.localeCompare(b.path));

  // ── Build entries with delta lastmod ──
  const makeDelta = (entries, defaults) => entries.map((e) => {
    const lastmod = resolveLastmod(e.path, e.lastmod, history, today);
    return {
      loc: absUrl(BASE, e.path), lastmod,
      changefreq: e.changefreq ?? defaults.changefreq ?? null,
      priority: e.priority !== undefined ? e.priority : defaults.priority,
      _path: e.path, _updatedAt: e.lastmod ?? null,
    };
  });

  const staticPages = [
    { path: "/", priority: 1.0, changefreq: "daily", lastmod: today },
    { path: "/products", priority: 0.9, changefreq: "daily", lastmod: today },
    { path: "/blog", priority: 0.85, changefreq: "daily", lastmod: today },
    { path: "/guides", priority: 0.85, changefreq: "weekly", lastmod: today },
    { path: "/bestsellers", priority: 0.80, changefreq: "weekly", lastmod: today },
    { path: "/about", priority: 0.60, changefreq: "monthly", lastmod: today },
    { path: "/about-the-author", priority: 0.60, changefreq: "monthly", lastmod: today },
    { path: "/contact", priority: 0.50, changefreq: "monthly", lastmod: today },
    { path: "/shipping", priority: 0.40, changefreq: "monthly", lastmod: today },
    { path: "/returns", priority: 0.40, changefreq: "monthly", lastmod: today },
    { path: "/cookies", priority: 0.30, changefreq: "yearly", lastmod: today },
    { path: "/privacy", priority: 0.30, changefreq: "yearly", lastmod: today },
    { path: "/terms", priority: 0.30, changefreq: "yearly", lastmod: today },
  ].map((e) => ({
    loc: absUrl(BASE, e.path), lastmod: e.lastmod, changefreq: e.changefreq, priority: e.priority,
    _path: e.path, _updatedAt: e.lastmod,
  }));

  const collectionEntries = makeDelta(collections, { changefreq: "weekly", priority: 0.8 });
  const blogEntries = makeDelta(blog, { changefreq: "monthly", priority: 0.6 });
  const guideEntries = makeDelta(guides, { changefreq: "weekly", priority: 0.7 });
  const clusterEntries = makeDelta(clusters, { changefreq: "weekly", priority: 0.65 });

  // ── Tiered product entries (Tier C excluded from sitemaps entirely) ──
  const tierAProducts = products.filter((p) => p.seo_tier === 'A');
  const tierBProducts = products.filter((p) => p.seo_tier === 'B');
  // Tier C: NOT in any sitemap (noindex, follow applied client-side)

  const makeDeltaProduct = (entries, defaultPriority) => entries.map((e) => {
    const lastmod = resolveLastmod(e.path, e.lastmod, history, today);
    return {
      loc: absUrl(BASE, e.path), lastmod,
      changefreq: "weekly",
      priority: e.priority !== undefined ? Math.min(e.priority, defaultPriority) : defaultPriority,
      _path: e.path, _updatedAt: e.lastmod ?? null,
    };
  });

  const coreProductEntries = makeDeltaProduct(tierAProducts, 0.90);
  const secondaryProductEntries = makeDeltaProduct(tierBProducts, 0.60);
  const productEntriesAll = [...coreProductEntries, ...secondaryProductEntries];

  console.log(`[sitemaps] Tier A (core): ${tierAProducts.length}, Tier B (secondary): ${tierBProducts.length}, Tier C (noindex): ${products.length - tierAProducts.length - tierBProducts.length}`);

  // ── Record history ──
  const allEntries = [...staticPages, ...collectionEntries, ...blogEntries, ...guideEntries, ...clusterEntries, ...productEntriesAll];
  for (const e of allEntries) newHistory[e._path] = { lastmod: e.lastmod, updatedAt: e._updatedAt };

  const clean = (entries) => entries.map(({ loc, lastmod, changefreq, priority }) => ({ loc, lastmod, changefreq, priority }));

  const writeChecked = (filename, xml, mustContain) => {
    validateXmlBasics(xml, mustContain);
    writeFile(path.join(OUT_DIR, filename), xml);
    console.log(`[sitemaps] ✓ ${filename} (${xml.length} bytes)`);
  };

  writeChecked("sitemap-static.xml", renderUrlset(clean(staticPages)), ["<urlset", "</urlset>"]);
  if (collectionEntries.length > 0) writeChecked("sitemap-collections.xml", renderUrlset(clean(collectionEntries)), ["<urlset", "</urlset>"]);
  if (blogEntries.length > 0) writeChecked("sitemap-blog.xml", renderUrlset(clean(blogEntries)), ["<urlset", "</urlset>"]);
  if (guideEntries.length > 0) writeChecked("sitemap-guides.xml", renderUrlset(clean(guideEntries)), ["<urlset", "</urlset>"]);
  if (clusterEntries.length > 0) writeChecked("sitemap-clusters.xml", renderUrlset(clean(clusterEntries)), ["<urlset", "</urlset>"]);

  // Build sitemapindex dynamically — only reference files that were actually written
  const sitemapIndexItems = [
    { loc: `${BASE}/sitemap-static.xml`, lastmod: today },
  ];
  if (collectionEntries.length > 0) sitemapIndexItems.push({ loc: `${BASE}/sitemap-collections.xml`, lastmod: today });
  if (blogEntries.length > 0) sitemapIndexItems.push({ loc: `${BASE}/sitemap-blog.xml`, lastmod: today });
  if (guideEntries.length > 0) sitemapIndexItems.push({ loc: `${BASE}/sitemap-guides.xml`, lastmod: today });
  if (clusterEntries.length > 0) sitemapIndexItems.push({ loc: `${BASE}/sitemap-clusters.xml`, lastmod: today });

  // ── Tiered product sitemaps ──
  // Core products (Tier A) → sitemap-core-products.xml (priority 0.9)
  if (coreProductEntries.length > 0) {
    writeChecked("sitemap-core-products.xml", renderUrlset(clean(coreProductEntries)), ["<urlset", "</urlset>"]);
    sitemapIndexItems.push({ loc: `${BASE}/sitemap-core-products.xml`, lastmod: today });
  }
  // Secondary products (Tier B) → sitemap-secondary-products.xml (priority 0.6)
  if (secondaryProductEntries.length > 0) {
    writeChecked("sitemap-secondary-products.xml", renderUrlset(clean(secondaryProductEntries)), ["<urlset", "</urlset>"]);
    sitemapIndexItems.push({ loc: `${BASE}/sitemap-secondary-products.xml`, lastmod: today });
  }

  // ── Remove stale legacy product sitemap chunks ──
  for (let i = 1; i <= 10; i++) {
    const staleName = `sitemap-products-${i}.xml`;
    const stalePath = path.join(OUT_DIR, staleName);
    if (fs.existsSync(stalePath)) {
      fs.unlinkSync(stalePath);
      console.log(`[sitemaps] ✗ Removed legacy ${staleName} (replaced by tiered sitemaps)`);
    }
  }

  const indexXml = renderSitemapIndex(sitemapIndexItems);
  validateXmlBasics(indexXml, ["<sitemapindex", "</sitemapindex>"]);
  writeFile(path.join(OUT_DIR, "sitemap.xml"), indexXml);

  // Clean up legacy alias files that may have stale references
  for (const alias of ["sitemap-index.xml", "sitemap_index.xml"]) {
    const aliasPath = path.join(OUT_DIR, alias);
    if (fs.existsSync(aliasPath)) {
      fs.unlinkSync(aliasPath);
      console.log(`[sitemaps] ✗ Removed legacy alias ${alias}`);
    }
  }

  // ── Post-write assertions ──
  const requiredFiles = ["sitemap.xml"];
  if (coreProductEntries.length > 0) requiredFiles.push("sitemap-core-products.xml");
  for (const rf of requiredFiles) {
    const fp = path.join(OUT_DIR, rf);
    if (!fs.existsSync(fp)) {
      console.error(`[sitemaps] FATAL: Required file ${rf} was not written.`);
      process.exit(1);
    }
    const content = fs.readFileSync(fp, "utf8");
    if (!content.includes("<?xml")) {
      console.error(`[sitemaps] FATAL: ${rf} is not valid XML.`);
      process.exit(1);
    }
  }
  console.log(`[sitemaps] ✓ Post-write assertions passed`);

  saveHistory(newHistory);

  // ── Summary ──
  const totalUrls = staticPages.length + collectionEntries.length + blogEntries.length
    + guideEntries.length + clusterEntries.length + productEntriesAll.length;

  // Priority distribution
  const priDist = { high: 0, mid: 0, low: 0 };
  for (const e of productEntriesAll) {
    if (e.priority >= 0.80) priDist.high++;
    else if (e.priority >= 0.65) priDist.mid++;
    else priDist.low++;
  }

  console.log(`\n[sitemaps] ══════════════════════════════════════`);
  console.log(`[sitemaps] Generation complete at ${new Date().toISOString()}`);
  console.log(`[sitemaps] Products:    ${products.length} (Tier A: ${tierAProducts.length}, Tier B: ${tierBProducts.length}, Tier C: ${products.length - tierAProducts.length - tierBProducts.length} noindex)`);
  console.log(`[sitemaps] Indexed:     ${productEntriesAll.length} (in sitemaps)`);
  console.log(`[sitemaps] Noindexed:   ${products.length - productEntriesAll.length} (Tier C, excluded from sitemaps)`);
  console.log(`[sitemaps] Collections: ${collections.length} (top revenue: ${topRevenueCollections.size})`);
  console.log(`[sitemaps] Blog:        ${blog.length}`);
  console.log(`[sitemaps] Guides:      ${guides.length}`);
  console.log(`[sitemaps] Clusters:    ${clusters.length}`);
  console.log(`[sitemaps] Static:      ${staticPages.length}`);
  console.log(`[sitemaps] Total URLs:  ${totalUrls}`);
  console.log(`[sitemaps] Index refs:  ${sitemapIndexItems.length}`);
  console.log(`[sitemaps] Bestsellers: ${bestsellers.size}`);
  console.log(`[sitemaps] Delta tracking: ${Object.keys(newHistory).length} entries`);
  console.log(`[sitemaps] ══════════════════════════════════════\n`);
}

main().catch((err) => {
  console.error("[sitemaps] Fatal error:", err);
  process.exit(1);
});

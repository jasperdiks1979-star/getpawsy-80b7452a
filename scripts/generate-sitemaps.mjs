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
const PRODUCTS_CHUNK_SIZE = 45000;
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

/** Paginated fetch — handles Supabase 1000-row limit */
async function fetchAllPages(table, params) {
  const PAGE_SIZE = 1000;
  let all = [];
  let offset = 0;
  while (true) {
    const sep = params ? "&" : "";
    const page = await fetchFromSupabase(table, `${params}${sep}limit=${PAGE_SIZE}&offset=${offset}`);
    if (!page || page.length === 0) break;
    all = all.concat(page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all.length > 0 ? all : null;
}

function nowIsoDate() { return new Date().toISOString().slice(0, 10); }

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

async function main() {
  ensureDir(OUT_DIR);
  const today = nowIsoDate();
  const history = loadHistory();
  const newHistory = {};

  const safeRead = (p, fallback) => { try { return readJson(p); } catch { return fallback; } };

  // ══════════════════════════════════════════════════════════════════════
  // PRODUCTS — ALL active, non-duplicate products (no tier filtering)
  // ══════════════════════════════════════════════════════════════════════
  let productsRaw = await fetchAllPages(
    "products_public",
    "select=slug,updated_at&is_active=eq.true&is_duplicate=eq.false&slug=not.is.null&order=updated_at.desc"
  );
  let products;
  if (productsRaw && productsRaw.length > 0) {
    // Deduplicate by slug
    const seen = new Set();
    products = productsRaw
      .filter((p) => {
        if (!p.slug || p.slug.trim() === "" || isExcluded(`/product/${p.slug}`)) return false;
        if (seen.has(p.slug)) return false;
        seen.add(p.slug);
        return true;
      })
      .map((p) => ({ path: `/product/${p.slug}`, lastmod: p.updated_at }));
    console.log(`[sitemaps] Products from REST API: ${products.length}`);
  } else {
    products = (safeRead(joinRoot("data", "products.json"), [])
      .filter(e => e && e.path && !e.noindex));
    console.log(`[sitemaps] Products from JSON fallback: ${products.length}`);
  }

  if (products.length === 0) {
    console.error("[sitemaps] FATAL: 0 products fetched. Aborting build.");
    process.exit(1);
  }

  // ══════════════════════════════════════════════════════════════════════
  // COLLECTIONS — ALL active collections (no niche filter)
  // ══════════════════════════════════════════════════════════════════════
  let collectionsRaw = await fetchAllPages("seo_collections", "select=slug,updated_at&is_active=eq.true&order=updated_at.desc");
  let collections;
  if (collectionsRaw && collectionsRaw.length > 0) {
    collections = collectionsRaw
      .filter((c) => c.slug && !isExcluded(`/collections/${c.slug}`))
      .map((c) => ({ path: `/collections/${c.slug}`, lastmod: c.updated_at }));
    console.log(`[sitemaps] Collections from REST API: ${collections.length}`);
  } else {
    collections = safeRead(joinRoot("data", "collections.json"), []).filter(e => e && e.path);
    console.log(`[sitemaps] Collections from JSON fallback: ${collections.length}`);
  }

  // ══════════════════════════════════════════════════════════════════════
  // BLOG — ALL published posts (no niche filter, no cap)
  // ══════════════════════════════════════════════════════════════════════
  let blogRaw = await fetchAllPages("blog_posts", "select=slug,published_at&is_published=eq.true&order=published_at.desc");
  let blog;
  if (blogRaw && blogRaw.length > 0) {
    blog = blogRaw
      .filter((b) => b.slug && !isExcluded(`/blog/${b.slug}`))
      .map((b) => ({ path: `/blog/${b.slug}`, lastmod: b.published_at }));
    console.log(`[sitemaps] Blog from REST API: ${blog.length}`);
  } else {
    blog = safeRead(joinRoot("data", "blog.json"), []).filter(e => e && e.path);
    console.log(`[sitemaps] Blog from JSON fallback: ${blog.length}`);
  }

  // ══════════════════════════════════════════════════════════════════════
  // GUIDES — ALL guides (no niche filter)
  // ══════════════════════════════════════════════════════════════════════
  const guides = safeRead(joinRoot("data", "guides.json"), []).filter(e => e && e.path && !e.noindex);
  console.log(`[sitemaps] Guides from JSON: ${guides.length}`);

  const clusters = safeRead(joinRoot("data", "clusters.json"), []).filter(e => e && e.path && !e.noindex);
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

  // ── Static pages → sitemap-pages.xml ──
  const staticPages = [
    { path: "/", priority: 1.0, changefreq: "daily", lastmod: today },
    { path: "/products", priority: 0.9, changefreq: "daily", lastmod: today },
    { path: "/bestsellers", priority: 0.80, changefreq: "weekly", lastmod: today },
    { path: "/about", priority: 0.50, changefreq: "monthly", lastmod: today },
    { path: "/contact", priority: 0.40, changefreq: "monthly", lastmod: today },
    { path: "/shipping", priority: 0.30, changefreq: "monthly", lastmod: today },
    { path: "/returns", priority: 0.30, changefreq: "monthly", lastmod: today },
    { path: "/privacy-policy", priority: 0.20, changefreq: "monthly", lastmod: today },
    { path: "/terms", priority: 0.20, changefreq: "monthly", lastmod: today },
  ].map((e) => ({
    loc: absUrl(BASE, e.path), lastmod: e.lastmod, changefreq: e.changefreq, priority: e.priority,
    _path: e.path, _updatedAt: e.lastmod,
  }));

  const productEntries = makeDelta(products, { changefreq: "weekly", priority: 0.70 });
  const collectionEntries = makeDelta(collections, { changefreq: "weekly", priority: 0.80 });
  const blogEntries = makeDelta(blog, { changefreq: "monthly", priority: 0.60 });
  const guideEntries = makeDelta([...guides, ...clusters], { changefreq: "weekly", priority: 0.70 });

  // ── Record history ──
  const allEntries = [...staticPages, ...productEntries, ...collectionEntries, ...blogEntries, ...guideEntries];
  for (const e of allEntries) newHistory[e._path] = { lastmod: e.lastmod, updatedAt: e._updatedAt };

  const clean = (entries) => entries.map(({ loc, lastmod, changefreq, priority }) => ({ loc, lastmod, changefreq, priority }));

  const writeChecked = (filename, xml, mustContain) => {
    validateXmlBasics(xml, mustContain);
    writeFile(path.join(OUT_DIR, filename), xml);
    console.log(`[sitemaps] ✓ ${filename} (${xml.length} bytes)`);
  };

  // ══════════════════════════════════════════════════════════════════════
  // WRITE SITEMAPS
  // ══════════════════════════════════════════════════════════════════════
  const sitemapIndexItems = [];

  // 1. Pages (static)
  writeChecked("sitemap-pages.xml", renderUrlset(clean(staticPages)), ["<urlset", "</urlset>"]);
  sitemapIndexItems.push({ loc: `${BASE}/sitemap-pages.xml`, lastmod: today });

  // 2. Products — split into chunks of 45000
  const productChunks = chunk(productEntries, PRODUCTS_CHUNK_SIZE);
  if (productChunks.length === 0) productChunks.push([]); // at least 1 file
  for (let i = 0; i < productChunks.length; i++) {
    const filename = `sitemap-products-${i + 1}.xml`;
    writeChecked(filename, renderUrlset(clean(productChunks[i])), ["<urlset", "</urlset>"]);
    sitemapIndexItems.push({ loc: `${BASE}/${filename}`, lastmod: today });
  }

  // 3. Collections
  if (collectionEntries.length > 0) {
    writeChecked("sitemap-collections.xml", renderUrlset(clean(collectionEntries)), ["<urlset", "</urlset>"]);
    sitemapIndexItems.push({ loc: `${BASE}/sitemap-collections.xml`, lastmod: today });
  }

  // 4. Guides (includes clusters)
  if (guideEntries.length > 0) {
    writeChecked("sitemap-guides.xml", renderUrlset(clean(guideEntries)), ["<urlset", "</urlset>"]);
    sitemapIndexItems.push({ loc: `${BASE}/sitemap-guides.xml`, lastmod: today });
  }

  // 5. Blog
  if (blogEntries.length > 0) {
    writeChecked("sitemap-blog.xml", renderUrlset(clean(blogEntries)), ["<urlset", "</urlset>"]);
    sitemapIndexItems.push({ loc: `${BASE}/sitemap-blog.xml`, lastmod: today });
  }

  // ── Remove stale legacy files ──
  const legacyFiles = [
    "sitemap-static.xml", "sitemap-index.xml", "sitemap_index.xml",
    "sitemap-core-products.xml", "sitemap-secondary-products.xml", "sitemap-clusters.xml",
  ];
  // Also remove any excess product chunk files
  for (let i = productChunks.length + 1; i <= 20; i++) {
    legacyFiles.push(`sitemap-products-${i}.xml`);
  }
  for (const name of legacyFiles) {
    const fp = path.join(OUT_DIR, name);
    if (fs.existsSync(fp)) {
      fs.unlinkSync(fp);
      console.log(`[sitemaps] ✗ Removed legacy ${name}`);
    }
  }

  // ── Write sitemap index ──
  const indexXml = renderSitemapIndex(sitemapIndexItems);
  validateXmlBasics(indexXml, ["<sitemapindex", "</sitemapindex>"]);
  writeFile(path.join(OUT_DIR, "sitemap.xml"), indexXml);
  console.log(`[sitemaps] ✓ sitemap.xml (index, ${sitemapIndexItems.length} entries)`);

  // ── Post-write assertions ──
  const requiredFiles = ["sitemap.xml", "sitemap-products-1.xml"];
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
  const totalUrls = staticPages.length + productEntries.length + collectionEntries.length
    + blogEntries.length + guideEntries.length;

  console.log(`\n[sitemaps] ══════════════════════════════════════`);
  console.log(`[sitemaps] Generation complete at ${new Date().toISOString()}`);
  console.log(`[sitemaps] Pages:       ${staticPages.length}`);
  console.log(`[sitemaps] Products:    ${productEntries.length} (in ${productChunks.length} file(s))`);
  console.log(`[sitemaps] Collections: ${collectionEntries.length}`);
  console.log(`[sitemaps] Blog:        ${blogEntries.length}`);
  console.log(`[sitemaps] Guides:      ${guideEntries.length}`);
  console.log(`[sitemaps] Total URLs:  ${totalUrls}`);
  console.log(`[sitemaps] Index refs:  ${sitemapIndexItems.length}`);
  console.log(`[sitemaps] ══════════════════════════════════════\n`);
}

main().catch((err) => {
  console.error("[sitemaps] Fatal error:", err);
  process.exit(1);
});

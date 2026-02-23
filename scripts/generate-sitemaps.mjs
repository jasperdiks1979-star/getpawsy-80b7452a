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

// Supabase REST API config
const SUPABASE_URL = "https://nojvgfbcjgipjxpfatmm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vanZnZmJjamdpcGp4cGZhdG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTMxOTYsImV4cCI6MjA4Mzk4OTE5Nn0.gfjmYf9aB-BCIrCnH14Zmnm6GBEKX7QMWP1ELL_i9dc";

async function fetchFromSupabase(table, params) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn(`[sitemaps] REST error ${table}: ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`[sitemaps] REST fetch failed for ${table}:`, err.message);
    return null;
  }
}

function nowIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function filterIndexable(entries) {
  return (Array.isArray(entries) ? entries : []).filter((e) => e && e.path && !e.noindex);
}

function validateXmlBasics(xml, mustContain) {
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) {
    throw new Error("XML does not start with required header.");
  }
  for (const token of mustContain) {
    if (!xml.includes(token)) throw new Error(`XML missing required token: ${token}`);
  }
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

// ── Delta-based lastmod tracking ──
function loadHistory() {
  try {
    const raw = fs.readFileSync(HISTORY_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), "utf8");
}

function resolveLastmod(urlPath, currentUpdatedAt, history, today) {
  const currentDate = toIsoDate(currentUpdatedAt) ?? today;
  const prev = history[urlPath];

  if (!prev) {
    // New URL — use current timestamp
    return currentDate;
  }

  if (prev.updatedAt === currentUpdatedAt) {
    // Content unchanged — preserve previous lastmod
    return prev.lastmod;
  }

  // Content changed — use actual updatedAt
  return currentDate;
}

function makeUrlEntriesDelta(entries, defaults, history, today) {
  return entries.map((e) => {
    const urlPath = e.path;
    const lastmod = resolveLastmod(urlPath, e.lastmod, history, today);

    return {
      loc: absUrl(BASE, urlPath),
      lastmod,
      changefreq: e.changefreq ?? defaults.changefreq ?? null,
      priority: e.priority !== undefined ? e.priority : defaults.priority,
      _path: urlPath,
      _updatedAt: e.lastmod ?? null,
    };
  });
}

async function main() {
  ensureDir(OUT_DIR);
  const today = nowIsoDate();
  const generatedAt = new Date().toISOString();
  const history = loadHistory();
  const newHistory = {};

  const safeRead = (p, fallback) => {
    try { return readJson(p); } catch { return fallback; }
  };

  // ── Products: live REST API → JSON fallback ──
  let productsRaw = await fetchFromSupabase(
    "products_public",
    "select=slug,updated_at&is_active=eq.true&is_duplicate=eq.false&slug=not.is.null&order=updated_at.desc&limit=5000"
  );
  let products;
  if (productsRaw && productsRaw.length > 0) {
    products = productsRaw
      .filter((p) => p.slug && p.slug.trim() !== "" && !isExcluded(`/product/${p.slug}`))
      .map((p) => ({ path: `/product/${p.slug}`, lastmod: p.updated_at, priority: 0.75 }));
    console.log(`[sitemaps] Products from REST API: ${products.length}`);
  } else {
    products = filterIndexable(safeRead(joinRoot("data", "products.json"), []));
    console.log(`[sitemaps] Products from JSON fallback: ${products.length}`);
  }

  // ── FAIL-SAFE: products must not be empty ──
  if (products.length === 0) {
    console.error("[sitemaps] FATAL: 0 products fetched. Aborting build.");
    process.exit(1);
  }

  // ── Collections ──
  let collectionsRaw = await fetchFromSupabase(
    "seo_collections",
    "select=slug,updated_at&is_active=eq.true&order=updated_at.desc"
  );
  let collections;
  if (collectionsRaw && collectionsRaw.length > 0) {
    collections = collectionsRaw
      .filter((c) => !isExcluded(`/collections/${c.slug}`))
      .map((c) => ({ path: `/collections/${c.slug}`, lastmod: c.updated_at }));
    console.log(`[sitemaps] Collections from REST API: ${collections.length}`);
  } else {
    collections = filterIndexable(safeRead(joinRoot("data", "collections.json"), []));
    console.log(`[sitemaps] Collections from JSON fallback: ${collections.length}`);
  }
  if (collections.length === 0) {
    console.warn("[sitemaps] WARNING: 0 collections found.");
  }

  // ── Blog ──
  let blogRaw = await fetchFromSupabase(
    "blog_posts",
    "select=slug,published_at&is_published=eq.true&order=published_at.desc"
  );
  let blog;
  if (blogRaw && blogRaw.length > 0) {
    blog = blogRaw
      .filter((b) => !isExcluded(`/blog/${b.slug}`))
      .map((b) => ({ path: `/blog/${b.slug}`, lastmod: b.published_at }));
    console.log(`[sitemaps] Blog from REST API: ${blog.length}`);
  } else {
    blog = filterIndexable(safeRead(joinRoot("data", "blog.json"), []));
    console.log(`[sitemaps] Blog from JSON fallback: ${blog.length}`);
  }

  // ── Guides & Clusters: JSON only ──
  const guides = filterIndexable(safeRead(joinRoot("data", "guides.json"), []));
  console.log(`[sitemaps] Guides from JSON: ${guides.length}`);
  const clusters = filterIndexable(safeRead(joinRoot("data", "clusters.json"), []));
  console.log(`[sitemaps] Clusters from JSON: ${clusters.length}`);

  // ── Sort alphabetically for stable ordering ──
  products.sort((a, b) => a.path.localeCompare(b.path));
  collections.sort((a, b) => a.path.localeCompare(b.path));
  blog.sort((a, b) => a.path.localeCompare(b.path));
  guides.sort((a, b) => a.path.localeCompare(b.path));
  clusters.sort((a, b) => a.path.localeCompare(b.path));

  // ── Static pages ──
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
    loc: absUrl(BASE, e.path),
    lastmod: e.lastmod,
    changefreq: e.changefreq,
    priority: e.priority,
    _path: e.path,
    _updatedAt: e.lastmod,
  }));

  // ── Build delta-aware entries ──
  const collectionEntries = makeUrlEntriesDelta(collections, { changefreq: "weekly", priority: 0.8 }, history, today);
  const blogEntries = makeUrlEntriesDelta(blog, { changefreq: "monthly", priority: 0.6 }, history, today);
  const guideEntries = makeUrlEntriesDelta(guides, { changefreq: "weekly", priority: 0.7 }, history, today);
  const clusterEntries = makeUrlEntriesDelta(clusters, { changefreq: "weekly", priority: 0.65 }, history, today);
  const productEntriesAll = makeUrlEntriesDelta(products, { changefreq: "weekly", priority: 0.75 }, history, today);

  // ── Record new history ──
  const allEntries = [...staticPages, ...collectionEntries, ...blogEntries, ...guideEntries, ...clusterEntries, ...productEntriesAll];
  for (const e of allEntries) {
    newHistory[e._path] = { lastmod: e.lastmod, updatedAt: e._updatedAt };
  }
  saveHistory(newHistory);

  // ── Strip internal fields before rendering ──
  const clean = (entries) => entries.map(({ loc, lastmod, changefreq, priority }) => ({ loc, lastmod, changefreq, priority }));

  const productChunks = chunk(clean(productEntriesAll), CHUNK_SIZE);

  // ── Write urlset sitemaps ──
  const childLastmods = {};
  const writeChecked = (filename, xml, mustContain) => {
    validateXmlBasics(xml, mustContain);
    writeFile(path.join(OUT_DIR, filename), xml);
    console.log(`[sitemaps] ✓ ${filename} (${xml.length} bytes)`);
  };

  // Track whether child content changed vs history
  const didChildChange = (filename, entries) => {
    const key = `__child__${filename}`;
    const prevHash = history[key]?.hash;
    const currentHash = entries.map((e) => `${e.loc}|${e.lastmod}`).join("\n");
    newHistory[key] = { hash: currentHash };
    return prevHash !== currentHash;
  };

  const staticClean = clean(staticPages);
  const collClean = clean(collectionEntries);
  const blogClean = clean(blogEntries);
  const guideClean = clean(guideEntries);
  const clusterClean = clean(clusterEntries);

  writeChecked("sitemap-static.xml", renderUrlset(staticClean), ["<urlset", "</urlset>"]);
  childLastmods["sitemap-static.xml"] = didChildChange("sitemap-static.xml", staticClean) ? today : (history["__child__sitemap-static.xml"]?.lastmod ?? today);

  writeChecked("sitemap-collections.xml", renderUrlset(collClean), ["<urlset", "</urlset>"]);
  writeChecked("sitemap-blog.xml", renderUrlset(blogClean), ["<urlset", "</urlset>"]);
  writeChecked("sitemap-guides.xml", renderUrlset(guideClean), ["<urlset", "</urlset>"]);
  writeChecked("sitemap-clusters.xml", renderUrlset(clusterClean), ["<urlset", "</urlset>"]);

  const sitemapIndexItems = [
    { loc: `${BASE}/sitemap-static.xml`, lastmod: today },
    { loc: `${BASE}/sitemap-hubs.xml`, lastmod: today },
    { loc: `${BASE}/sitemap-collections.xml`, lastmod: today },
    { loc: `${BASE}/sitemap-blog.xml`, lastmod: today },
    { loc: `${BASE}/sitemap-guides.xml`, lastmod: today },
    { loc: `${BASE}/sitemap-clusters.xml`, lastmod: today },
  ];

  if (productChunks.length === 0) productChunks.push([]);

  productChunks.forEach((chunkEntries, idx) => {
    const name = `sitemap-products-${idx + 1}.xml`;
    writeChecked(name, renderUrlset(chunkEntries), ["<urlset", "</urlset>"]);
    sitemapIndexItems.push({ loc: `${BASE}/${name}`, lastmod: today });
  });

  // ── Write sitemap index ──
  const indexXml = renderSitemapIndex(sitemapIndexItems);
  validateXmlBasics(indexXml, ["<sitemapindex", "</sitemapindex>"]);
  writeFile(path.join(OUT_DIR, "sitemap.xml"), indexXml);
  writeFile(path.join(OUT_DIR, "sitemap-index.xml"), indexXml);

  // ── Save updated history ──
  saveHistory(newHistory);

  // ── Summary ──
  const totalUrls = staticPages.length + collectionEntries.length + blogEntries.length
    + guideEntries.length + clusterEntries.length + productEntriesAll.length;

  console.log(`\n[sitemaps] ══════════════════════════════════════`);
  console.log(`[sitemaps] Generation complete at ${new Date().toISOString()}`);
  console.log(`[sitemaps] Products:    ${products.length}`);
  console.log(`[sitemaps] Collections: ${collections.length}`);
  console.log(`[sitemaps] Blog:        ${blog.length}`);
  console.log(`[sitemaps] Guides:      ${guides.length}`);
  console.log(`[sitemaps] Clusters:    ${clusters.length}`);
  console.log(`[sitemaps] Static:      ${staticPages.length}`);
  console.log(`[sitemaps] Total URLs:  ${totalUrls}`);
  console.log(`[sitemaps] Chunks:      ${productChunks.length} (max ${CHUNK_SIZE}/chunk)`);
  console.log(`[sitemaps] Index refs:  ${sitemapIndexItems.length}`);
  console.log(`[sitemaps] Delta tracking: ${Object.keys(newHistory).length} entries recorded`);
  console.log(`[sitemaps] ══════════════════════════════════════\n`);
}

main().catch((err) => {
  console.error("[sitemaps] Fatal error:", err);
  process.exit(1);
});

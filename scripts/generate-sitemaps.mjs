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

// Supabase REST API config (same as vite plugin)
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

function makeUrlEntries(entries, defaults = {}) {
  return entries.map((e) => ({
    loc: absUrl(BASE, e.path),
    lastmod: toIsoDate(e.lastmod) ?? defaults.lastmod ?? null,
    changefreq: e.changefreq ?? defaults.changefreq ?? null,
    priority: e.priority !== undefined ? e.priority : defaults.priority,
  }));
}

function validateXmlBasics(xml, mustContain) {
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) {
    throw new Error("XML does not start with required header.");
  }
  for (const token of mustContain) {
    if (!xml.includes(token)) throw new Error(`XML missing required token: ${token}`);
  }
}

async function main() {
  ensureDir(OUT_DIR);
  const today = nowIsoDate();

  // Load data — prefer live Supabase REST, fall back to JSON files
  const safeRead = (p, fallback) => {
    try {
      return readJson(p);
    } catch {
      return fallback;
    }
  };

  // ── Products: live REST API → JSON fallback ──
  let productsRaw = await fetchFromSupabase(
    "products_public",
    "select=slug,updated_at&is_active=eq.true&is_duplicate=eq.false&slug=not.is.null&order=updated_at.desc&limit=5000"
  );
  let products;
  if (productsRaw && productsRaw.length > 0) {
    products = productsRaw
      .filter((p) => p.slug && p.slug.trim() !== "")
      .map((p) => ({ path: `/product/${p.slug}`, lastmod: p.updated_at }));
    console.log(`[sitemaps] Products from REST API: ${products.length}`);
  } else {
    products = filterIndexable(safeRead(joinRoot("data", "products.json"), []));
    console.log(`[sitemaps] Products from JSON fallback: ${products.length}`);
  }

  // ── Collections: live REST API → JSON fallback ──
  let collectionsRaw = await fetchFromSupabase(
    "seo_collections",
    "select=slug,updated_at&is_active=eq.true&order=updated_at.desc"
  );
  let collections;
  if (collectionsRaw && collectionsRaw.length > 0) {
    collections = collectionsRaw.map((c) => ({ path: `/collections/${c.slug}`, lastmod: c.updated_at }));
    console.log(`[sitemaps] Collections from REST API: ${collections.length}`);
  } else {
    collections = filterIndexable(safeRead(joinRoot("data", "collections.json"), []));
    console.log(`[sitemaps] Collections from JSON fallback: ${collections.length}`);
  }

  // ── Blog: live REST API → JSON fallback ──
  let blogRaw = await fetchFromSupabase(
    "blog_posts",
    "select=slug,published_at&is_published=eq.true&order=published_at.desc"
  );
  let blog;
  if (blogRaw && blogRaw.length > 0) {
    blog = blogRaw.map((b) => ({ path: `/blog/${b.slug}`, lastmod: b.published_at }));
    console.log(`[sitemaps] Blog from REST API: ${blog.length}`);
  } else {
    blog = filterIndexable(safeRead(joinRoot("data", "blog.json"), []));
    console.log(`[sitemaps] Blog from JSON fallback: ${blog.length}`);
  }

  // ── Guides: JSON only (static + cluster articles) ──
  const guides = filterIndexable(safeRead(joinRoot("data", "guides.json"), []));
  console.log(`[sitemaps] Guides from JSON: ${guides.length}`);

  // ── Clusters: JSON only ──
  const clusters = filterIndexable(safeRead(joinRoot("data", "clusters.json"), []));
  console.log(`[sitemaps] Clusters from JSON: ${clusters.length}`);

  // Static pages
  const staticPages = makeUrlEntries(
    [
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
    ],
    { lastmod: today }
  );

  const collectionEntries = makeUrlEntries(collections, {
    changefreq: "weekly",
    priority: 0.8,
    lastmod: today,
  });

  const blogEntries = makeUrlEntries(blog, {
    changefreq: "monthly",
    priority: 0.6,
    lastmod: today,
  });

  const guideEntries = makeUrlEntries(guides, {
    changefreq: "weekly",
    priority: 0.7,
    lastmod: today,
  });

  const clusterEntries = makeUrlEntries(clusters, {
    changefreq: "weekly",
    priority: 0.65,
    lastmod: today,
  });

  // Products — already formatted as { path, lastmod }
  const productEntriesAll = makeUrlEntries(products, {
    changefreq: "weekly",
    priority: 0.75,
    lastmod: today,
  });

  const productChunks = chunk(productEntriesAll, CHUNK_SIZE);

  // Write urlset sitemaps
  const writeChecked = (filename, xml, mustContain) => {
    validateXmlBasics(xml, mustContain);
    writeFile(path.join(OUT_DIR, filename), xml);
    console.log(`[sitemaps] ✓ ${filename} (${xml.length} bytes)`);
  };

  writeChecked("sitemap-static.xml", renderUrlset(staticPages), ["<urlset", "</urlset>"]);
  writeChecked("sitemap-collections.xml", renderUrlset(collectionEntries), ["<urlset", "</urlset>"]);
  writeChecked("sitemap-blog.xml", renderUrlset(blogEntries), ["<urlset", "</urlset>"]);
  writeChecked("sitemap-guides.xml", renderUrlset(guideEntries), ["<urlset", "</urlset>"]);
  writeChecked("sitemap-clusters.xml", renderUrlset(clusterEntries), ["<urlset", "</urlset>"]);

  const sitemapIndexItems = [
    { loc: `${BASE}/sitemap-static.xml`, lastmod: today },
    { loc: `${BASE}/sitemap-hubs.xml`, lastmod: today },
    { loc: `${BASE}/sitemap-collections.xml`, lastmod: today },
    { loc: `${BASE}/sitemap-blog.xml`, lastmod: today },
    { loc: `${BASE}/sitemap-guides.xml`, lastmod: today },
    { loc: `${BASE}/sitemap-clusters.xml`, lastmod: today },
  ];

  // Ensure at least one products sitemap exists (even if empty)
  if (productChunks.length === 0) productChunks.push([]);

  productChunks.forEach((chunkEntries, idx) => {
    const name = `sitemap-products-${idx + 1}.xml`;
    const xml = renderUrlset(chunkEntries);
    writeChecked(name, xml, ["<urlset", "</urlset>"]);
    sitemapIndexItems.push({ loc: `${BASE}/${name}`, lastmod: today });
  });

  // Write sitemap index
  const indexXml = renderSitemapIndex(sitemapIndexItems);
  validateXmlBasics(indexXml, ["<sitemapindex", "</sitemapindex>"]);
  writeFile(path.join(OUT_DIR, "sitemap.xml"), indexXml);
  writeFile(path.join(OUT_DIR, "sitemap-index.xml"), indexXml);

  console.log(`[sitemaps] ✓ sitemap.xml (index, ${sitemapIndexItems.length} entries)`);
  console.log(`[sitemaps] Counts — products: ${products.length}, collections: ${collections.length}, blog: ${blog.length}, guides: ${guides.length}, clusters: ${clusters.length}`);
  console.log(`[sitemaps] Product chunks: ${productChunks.length} (chunk size ${CHUNK_SIZE})`);
  console.log(`[sitemaps] Done.`);
}

main().catch((err) => {
  console.error("[sitemaps] Fatal error:", err);
  process.exit(1);
});

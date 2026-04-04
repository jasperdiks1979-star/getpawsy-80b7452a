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
import { filterValidCollectionCandidates } from "./sitemap-collection-validator.mjs";

const BASE = "https://getpawsy.pet";
const OUT_DIR = joinRoot("public");
const PRODUCTS_CHUNK_SIZE = 45000;
const COLLECTION_MIN_PRODUCTS = Number(process.env.SITEMAP_COLLECTION_MIN_PRODUCTS || 4);
const HISTORY_PATH = joinRoot("data", "sitemap-history.json");

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://nojvgfbcjgipjxpfatmm.supabase.co";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vanZnZmJjamdpcGp4cGZhdG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTMxOTYsImV4cCI6MjA4Mzk4OTE5Nn0.gfjmYf9aB-BCIrCnH14Zmnm6GBEKX7QMWP1ELL_i9dc";

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

/** Non-pet exclusion — only cats & dogs allowed */
const NON_PET_RE = [
  /\b(bird|parrot|parakeet|cockatiel|canary|finch|budgie|macaw|aviary|bird\s*cage)\b/i,
  /\b(reptile|snake|lizard|gecko|iguana|turtle|tortoise|terrarium|vivarium)\b/i,
  /\b(chicken|poultry|hen|rooster|coop|egg\s*incubator)\b/i,
  /\b(hamster|gerbil|guinea\s*pig|chinchilla|ferret|rodent|hamster\s*cage)\b/i,
  /\b(fish\s*tank|aquarium|fish\s*food|fish\s*bowl|betta|goldfish)\b/i,
  /\b(rabbit\s*hutch|rabbit\s*cage|bunny\s*cage)\b/i,
];

function isNonPetSlugOrName(slug, name) {
  const text = `${slug || ''} ${name || ''}`;
  return NON_PET_RE.some(re => re.test(text));
}

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
  // FULL INDEXABLE SITEMAP — products + collections + guides/clusters
  // ══════════════════════════════════════════════════════════════════════

  // ── PRODUCTS (all active canonical products) ──
  let productsRaw = await fetchAllPages(
    "products_public",
    "select=slug,name,updated_at&is_active=eq.true&is_duplicate=eq.false&slug=not.is.null&order=updated_at.desc"
  );

  if (!productsRaw || productsRaw.length === 0) {
    productsRaw = await fetchAllPages(
      "products",
      "select=slug,name,updated_at&is_active=eq.true&is_duplicate=eq.false&slug=not.is.null&order=updated_at.desc"
    );
  }
  let products;
  if (productsRaw && productsRaw.length > 0) {
    const seen = new Set();
    products = productsRaw
      .filter((p) => {
        if (!p.slug || p.slug.trim() === "" || isExcluded(`/product/${p.slug}`)) return false;
        if (isNonPetSlugOrName(p.slug, p.name)) return false;
        if (seen.has(p.slug)) return false;
        seen.add(p.slug);
        return true;
      })
      .map((p) => ({ path: `/product/${p.slug}`, lastmod: p.updated_at }));
    console.log(`[sitemaps] Products: ${products.length}`);
  } else {
    products = (safeRead(joinRoot("data", "products.json"), [])
      .filter(e => e && e.path && !e.noindex));
    console.log(`[sitemaps] Products from JSON fallback: ${products.length}`);
  }

  if (products.length === 0) {
    console.error("[sitemaps] FATAL: 0 products fetched. Aborting build.");
    process.exit(1);
  }

  // ── COLLECTIONS (locked to 5 active collections only) ──
  const ACTIVE_COLLECTION_SLUGS = new Set([
    "dogs", "cats", "dog-beds", "cat-trees-and-condos", "cat-litter-boxes",
  ]);

  let collectionsRaw = await fetchAllPages(
    "seo_collections",
    "select=slug,updated_at,product_keyword_filter,product_category_filter&is_active=eq.true&order=updated_at.desc"
  );
  let productCatalog = await fetchAllPages(
    "products_public",
    "select=name,slug,category&is_active=eq.true&is_duplicate=eq.false&slug=not.is.null"
  );
  if (!productCatalog || productCatalog.length === 0) {
    productCatalog = await fetchAllPages(
      "products",
      "select=name,slug,category&is_active=eq.true&is_duplicate=eq.false&slug=not.is.null"
    );
  }
  if (!productCatalog) productCatalog = [];

  let collections;
  if (collectionsRaw && collectionsRaw.length > 0) {
    // Only include the 5 locked active collections
    collections = collectionsRaw
      .filter((c) => c.slug && ACTIVE_COLLECTION_SLUGS.has(c.slug))
      .map((c) => ({ path: `/collections/${c.slug}`, lastmod: c.updated_at }));
    console.log(`[sitemaps] Collections (locked active): ${collections.length}`);
  } else {
    // Fallback: only include locked slugs
    collections = safeRead(joinRoot("data", "collections.json"), [])
      .filter(e => e && e.path && ACTIVE_COLLECTION_SLUGS.has(e.path.replace('/collections/', '')));
    console.log(`[sitemaps] Collections from JSON fallback: ${collections.length}`);
  }

  // ── GUIDES + CLUSTERS ──
  let guidesRaw = await fetchAllPages(
    "published_guides",
    "select=slug,updated_at,published_at,is_published&is_published=eq.true&slug=not.is.null&order=updated_at.desc"
  );

  let guideEntriesRaw = [];
  if (guidesRaw && guidesRaw.length > 0) {
    const seenGuides = new Set();
    guideEntriesRaw = guidesRaw
      .filter((g) => {
        const guidePath = `/guides/${g.slug}`;
        if (!g.slug || isExcluded(guidePath) || seenGuides.has(guidePath)) return false;
        seenGuides.add(guidePath);
        return true;
      })
      .map((g) => ({ path: `/guides/${g.slug}`, lastmod: g.updated_at || g.published_at || today }));
    console.log(`[sitemaps] Guides from REST: ${guideEntriesRaw.length}`);
  } else {
    const guidesFallback = safeRead(joinRoot("data", "guides.json"), []).filter((e) => e && e.path);
    const clustersFallback = safeRead(joinRoot("data", "clusters.json"), []).filter((e) => e && e.path);
    guideEntriesRaw = [...guidesFallback, ...clustersFallback];
    console.log(`[sitemaps] Guides/clusters from JSON fallback: ${guideEntriesRaw.length}`);
  }

  // ── Ensure static JSON guides are always in sitemap (even if not in DB yet) ──
  const staticGuideIndex = safeRead(joinRoot("public", "data", "guides", "index.json"), []);
  if (Array.isArray(staticGuideIndex)) {
    const existingSlugs = new Set(guideEntriesRaw.map(g => g.path));
    for (const g of staticGuideIndex) {
      const gPath = `/guides/${g.slug}`;
      if (g.slug && !existingSlugs.has(gPath) && !isExcluded(gPath)) {
        guideEntriesRaw.push({ path: gPath, lastmod: g.updatedAt || g.publishedAt || today });
        existingSlugs.add(gPath);
      }
    }
    console.log(`[sitemaps] Guides after static merge: ${guideEntriesRaw.length}`);
  }

  // ── BLOG POSTS ──
  let blogRaw = await fetchAllPages(
    "blog_posts",
    "select=slug,updated_at,published_at&is_published=eq.true&is_noindexed=eq.false&slug=not.is.null&order=updated_at.desc"
  );
  let blogEntries = [];
  if (blogRaw && blogRaw.length > 0) {
    const seenBlogs = new Set();
    blogEntries = blogRaw
      .filter((b) => {
        const blogPath = `/blog/${b.slug}`;
        if (!b.slug || isExcluded(blogPath) || seenBlogs.has(blogPath)) return false;
        seenBlogs.add(blogPath);
        return true;
      })
      .map((b) => ({ path: `/blog/${b.slug}`, lastmod: b.updated_at || b.published_at || today }));
    console.log(`[sitemaps] Blog posts from REST: ${blogEntries.length}`);
  } else {
    blogEntries = safeRead(joinRoot("data", "blog.json"), []).filter((e) => e && e.path);
    console.log(`[sitemaps] Blog posts from JSON fallback: ${blogEntries.length}`);
  }

  // ── Sort alphabetically ──
  products.sort((a, b) => a.path.localeCompare(b.path));
  collections.sort((a, b) => a.path.localeCompare(b.path));

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

  // ── Static pages ──
  const staticPages = [
    // ── Core commerce ──
    { path: "/", priority: 1.0, changefreq: "daily", lastmod: today },
    { path: "/shop", priority: 0.95, changefreq: "daily", lastmod: today },
    { path: "/products", priority: 0.9, changefreq: "daily", lastmod: today },
    { path: "/bestsellers", priority: 0.90, changefreq: "daily", lastmod: today },
    { path: "/trending-pet-products", priority: 0.85, changefreq: "daily", lastmod: today },
    { path: "/recent-products", priority: 0.70, changefreq: "daily", lastmod: today },
    // ── Category hubs ──
    { path: "/dog", priority: 0.90, changefreq: "daily", lastmod: today },
    { path: "/cat", priority: 0.90, changefreq: "daily", lastmod: today },
    { path: "/dog/training", priority: 0.85, changefreq: "weekly", lastmod: today },
    { path: "/dog/travel", priority: 0.85, changefreq: "weekly", lastmod: today },
    { path: "/cat/training", priority: 0.85, changefreq: "weekly", lastmod: today },
    { path: "/cat/travel", priority: 0.85, changefreq: "weekly", lastmod: today },
    // ── Landing pages ──
    { path: "/lp/self-cleaning-litter-box", priority: 0.90, changefreq: "weekly", lastmod: today },
    { path: "/lp/cat-litter-box", priority: 0.90, changefreq: "weekly", lastmod: today },
    // ── SEO money pages ──
    { path: "/best-cat-litter-box-2026", priority: 0.90, changefreq: "weekly", lastmod: today },
    { path: "/best-dog-car-seat-safety", priority: 0.90, changefreq: "weekly", lastmod: today },
    { path: "/best-interactive-cat-toys", priority: 0.90, changefreq: "weekly", lastmod: today },
    { path: "/best-dog-anxiety-solutions", priority: 0.90, changefreq: "weekly", lastmod: today },
    { path: "/best-cat-litter-box-reddit", priority: 0.75, changefreq: "monthly", lastmod: today },
    { path: "/best-litter-box-for-smell", priority: 0.75, changefreq: "monthly", lastmod: today },
    { path: "/best-litter-box-large-cats", priority: 0.75, changefreq: "monthly", lastmod: today },
    { path: "/best-litter-boxes-apartments-2026", priority: 0.75, changefreq: "monthly", lastmod: today },
    { path: "/slow-feeder-dog-bowls", priority: 0.75, changefreq: "weekly", lastmod: today },
    { path: "/indoor-cat-furniture", priority: 0.75, changefreq: "weekly", lastmod: today },
    // ── Content hubs ──
    { path: "/blog", priority: 0.70, changefreq: "daily", lastmod: today },
    { path: "/guides", priority: 0.80, changefreq: "weekly", lastmod: today },
    { path: "/pet-care-guides", priority: 0.75, changefreq: "weekly", lastmod: today },
    { path: "/site-map", priority: 0.60, changefreq: "weekly", lastmod: today },
    // ── Trust pages ──
    { path: "/about", priority: 0.50, changefreq: "monthly", lastmod: today },
    { path: "/contact", priority: 0.50, changefreq: "monthly", lastmod: today },
    { path: "/shipping", priority: 0.50, changefreq: "monthly", lastmod: today },
    { path: "/returns", priority: 0.50, changefreq: "monthly", lastmod: today },
    { path: "/faq", priority: 0.40, changefreq: "monthly", lastmod: today },
    { path: "/how-we-test-products", priority: 0.40, changefreq: "monthly", lastmod: today },
    { path: "/why-trust-our-reviews", priority: 0.40, changefreq: "monthly", lastmod: today },
    { path: "/about-the-author", priority: 0.30, changefreq: "monthly", lastmod: today },
    { path: "/privacy", priority: 0.20, changefreq: "monthly", lastmod: today },
    { path: "/terms", priority: 0.20, changefreq: "monthly", lastmod: today },
    { path: "/affiliate-disclosure", priority: 0.20, changefreq: "monthly", lastmod: today },
  ].map((e) => ({
    loc: absUrl(BASE, e.path), lastmod: e.lastmod, changefreq: e.changefreq, priority: e.priority,
    _path: e.path, _updatedAt: e.lastmod,
  }));

  const productEntries = makeDelta(products, { changefreq: "weekly", priority: 0.80 });
  const collectionEntries = makeDelta(collections, { changefreq: "weekly", priority: 0.70 });
  const guideEntries = makeDelta(guideEntriesRaw, { changefreq: "weekly", priority: 0.65 });
  const blogPageEntries = makeDelta(blogEntries, { changefreq: "weekly", priority: 0.60 });

  // ── Record history ──
  const allEntries = [...staticPages, ...productEntries, ...collectionEntries, ...guideEntries, ...blogPageEntries];
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

  // 2. Products (chunked if needed)
  const productChunks = chunk(clean(productEntries), PRODUCTS_CHUNK_SIZE);
  productChunks.forEach((entries, index) => {
    const filename = `sitemap-products-${index + 1}.xml`;
    writeChecked(filename, renderUrlset(entries), ["<urlset", "</urlset>"]);
    sitemapIndexItems.push({ loc: `${BASE}/${filename}`, lastmod: today });
  });

  // 3. Collections
  if (collectionEntries.length > 0) {
    writeChecked("sitemap-collections.xml", renderUrlset(clean(collectionEntries)), ["<urlset", "</urlset>"]);
    sitemapIndexItems.push({ loc: `${BASE}/sitemap-collections.xml`, lastmod: today });
  }

  // 4. Guides + clusters
  if (guideEntries.length > 0) {
    writeChecked("sitemap-guides.xml", renderUrlset(clean(guideEntries)), ["<urlset", "</urlset>"]);
    sitemapIndexItems.push({ loc: `${BASE}/sitemap-guides.xml`, lastmod: today });
  }

  // 5. Blog posts
  if (blogPageEntries.length > 0) {
    writeChecked("sitemap-blog.xml", renderUrlset(clean(blogPageEntries)), ["<urlset", "</urlset>"]);
    sitemapIndexItems.push({ loc: `${BASE}/sitemap-blog.xml`, lastmod: today });
  }

  // ── Remove stale/excluded sitemap files ──
  const legacyFiles = [
    "sitemap-static.xml", "sitemap-index.xml", "sitemap_index.xml",
    "sitemap-core-products.xml", "sitemap-secondary-products.xml", "sitemap-clusters.xml",
    "sitemap-seo-pages.xml",
  ];
  for (let i = 2; i <= 20; i++) legacyFiles.push(`sitemap-products-${i}.xml`);
  for (const name of legacyFiles) {
    const fp = path.join(OUT_DIR, name);
    if (fs.existsSync(fp)) {
      fs.unlinkSync(fp);
      console.log(`[sitemaps] ✗ Removed ${name}`);
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

  const totalUrls = staticPages.length + productEntries.length + collectionEntries.length + guideEntries.length + blogPageEntries.length;
  writeFile(path.join(OUT_DIR, "sitemap-coverage.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    productCount: productEntries.length,
    collectionCount: collectionEntries.length,
    guideCount: guideEntries.length,
    blogCount: blogPageEntries.length,
    staticCount: staticPages.length,
    totalUrls,
  }, null, 2));
  console.log(`\n[sitemaps] ══════════════════════════════════════`);
  console.log(`[sitemaps] Full sitemap generation complete`);
  console.log(`[sitemaps] Pages:       ${staticPages.length}`);
  console.log(`[sitemaps] Products:    ${productEntries.length}`);
  console.log(`[sitemaps] Collections: ${collectionEntries.length}`);
  console.log(`[sitemaps] Guides:      ${guideEntries.length}`);
  console.log(`[sitemaps] Blog:        ${blogPageEntries.length}`);
  console.log(`[sitemaps] Total URLs:  ${totalUrls}`);
  console.log(`[sitemaps] ══════════════════════════════════════\n`);
}

main().catch((err) => {
  console.error("[sitemaps] Fatal error:", err);
  process.exit(1);
});

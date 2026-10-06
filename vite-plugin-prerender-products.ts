import { stripUnsupportedTitleClaims } from './src/lib/seo-title';
import fs from 'fs';
import { clampMetaDescription } from './src/lib/seo-title';
export { clampMetaDescription };
import { CANONICAL_COLLECTION_META, clusterForCollection, type SeoCluster } from './src/lib/seo-clusters';
import path from 'path';
import type { Plugin } from 'vite';
import { products as staticProducts } from './src/data/products';
import { resolveToCanonical, getCanonicalCategory } from './src/lib/canonical-category-registry';
import { isProductIndexable, isCrawlerExcludedProduct, loadPrimaryMerchandisedCollections, crawlerCollectionMembers, isCrawlerListable, MIN_INDEXABLE_COLLECTION_PRODUCTS, CANONICAL_SITEMAP_COLLECTIONS } from './scripts/seo-indexability.mjs';

const SITE = 'https://getpawsy.pet';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://nojvgfbcjgipjxpfatmm.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vanZnZmJjamdpcGp4cGZhdG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTMxOTYsImV4cCI6MjA4Mzk4OTE5Nn0.gfjmYf9aB-BCIrCnH14Zmnm6GBEKX7QMWP1ELL_i9dc';

interface ProductRecord {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  images: string[] | null;
  category: string | null;
  stock: number | null;
  is_active: boolean | null;
  updated_at: string | null;
  seo_noindex?: boolean | null;
  seo_tier?: string | null;
  merch_hidden?: boolean | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(value: string | null | undefined): string {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Crawler-only generic copy (intros, benefits, use cases, FAQs) was removed
// 2026-10-05: it asserted comfort/health/durability outcomes no product
// evidence supports. Prerendered PDPs show catalog facts only.

const ROBOTS_INDEX = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
const ROBOTS_NOINDEX_FOLLOW = 'noindex, follow';

function isInStock(p: ProductRecord): boolean {
  return p.is_active !== false && Number(p.stock || 0) > 0;
}

/** Base listing gate: in stock, indexable, priced. Merch visibility is applied per surface. */
/**
 * Storefront merchandising visibility (mirrors products_shop and the primary
 * merchandised collections: merch_hidden=false). Listing-only — never changes
 * PDP robots/indexability.
 */
export function isMerchVisible(p: ProductRecord): boolean {
  return p.merch_hidden !== true;
}

export function isListable(p: ProductRecord): boolean {
  return isCrawlerListable(p);
}

/** Paths advertised in public/sitemap-<name>.xml (null if the sitemap is absent, e.g. in unit tests). */
const advertisedCache = new Map<string, Set<string> | null>();
export function advertisedPaths(name: string): Set<string> | null {
  if (!advertisedCache.has(name)) {
    const f = path.resolve('public', `sitemap-${name}.xml`);
    advertisedCache.set(name, fs.existsSync(f)
      ? new Set([...fs.readFileSync(f, 'utf-8').matchAll(/<loc>https?:\/\/[^/<]+([^<]*)<\/loc>/g)].map((m) => m[1]))
      : null);
  }
  return advertisedCache.get(name)!;
}

function collectionHrefFor(category: string | null): string | null {
  const slug = slugify(category || '');
  const canonical = slug ? resolveToCanonical(slug) : null;
  if (!canonical || canonical === 'all') return null;
  const href = `/collections/${canonical}`;
  // Never point breadcrumbs/schema at a thin (noindex) or unadvertised collection.
  const advertised = advertisedPaths('collections');
  return advertised && !advertised.has(href) ? null : href;
}

function extractAssets(spaHtml: string): { assetTags: string; scriptTags: string } {
  const headMatch = spaHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const headContent = headMatch ? headMatch[1] : '';
  const scriptTags = (spaHtml.match(/<script[^>]*src="[^"]*"[^>]*><\/script>/g) || []).join('\n');
  const assetTags = (headContent.match(/<link[^>]*>|<style[^>]*>[\s\S]*?<\/style>/gi) || [])
    .filter((t) => !/rel=["']?canonical/i.test(t) && !/hreflang/i.test(t))
    .join('\n');
  return { assetTags, scriptTags };
}

function productImages(product: ProductRecord): string[] {
  const raw = [product.image_url, ...(Array.isArray(product.images) ? product.images : [])]
    .filter((value): value is string => Boolean(value));
  return [...new Set(raw)];
}

function formatPrice(price: number): string {
  return Number(price || 0).toFixed(2);
}

function buildProductSchema(product: ProductRecord, canonical: string, description: string, primaryImage: string) {
  const inStock = product.is_active !== false && Number(product.stock || 0) > 0;
  const priceValidUntil = new Date();
  priceValidUntil.setFullYear(priceValidUntil.getFullYear() + 1);

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${canonical}#product`,
    name: product.name,
    image: productImages(product),
    description,
    sku: product.id,
    brand: { '@type': 'Brand', name: 'GetPawsy' },
    offers: {
      '@type': 'Offer',
      '@id': `${canonical}#offer`,
      url: canonical,
      priceCurrency: 'USD',
      price: formatPrice(product.price),
      priceValidUntil: priceValidUntil.toISOString().split('T')[0],
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'US' },
      },
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'US',
        merchantReturnDays: 30,
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
      },
    },
    mainEntityOfPage: canonical,
    primaryImageOfPage: primaryImage,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Single REST call. Returns rows on success, `null` on a TRANSIENT failure
 * (abort/timeout, network reset, 5xx, 429). An empty array is a genuine
 * "no rows" answer — never conflated with a failure, which is what used to
 * abort the whole build on one timed-out page.
 */
async function supaRest<T>(table: string, params: string): Promise<T[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!res.ok) {
      console.warn(`[prerender-products] REST ${res.status} on ${table}`);
      return null;
    }
    return (await res.json()) as T[];
  } catch (err) {
    clearTimeout(timeout);
    console.warn(`[prerender-products] REST fetch failed on ${table}: ${(err as Error).message}`);
    return null;
  }
}

/** One page with bounded retries + linear backoff; throws with the exact range. */
async function fetchPageWithRetry<T>(
  table: string,
  params: string,
  limit: number,
  offset: number,
  maxAttempts = 4,
): Promise<T[]> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const rows = await supaRest<T>(table, `${params}&limit=${limit}&offset=${offset}`);
    if (rows !== null) return rows;
    if (attempt < maxAttempts) {
      const backoff = 800 * attempt;
      console.warn(
        `[prerender-products] retry ${attempt}/${maxAttempts - 1} for ${table} rows ${offset}-${offset + limit} in ${backoff}ms`,
      );
      await sleep(backoff);
    }
  }
  throw new Error(
    `[prerender-products] FATAL: ${table} page offset=${offset} limit=${limit} failed after ${maxAttempts} attempts`,
  );
}

async function fetchAllProducts(): Promise<ProductRecord[]> {
  const pageSize = 200;
  const all: ProductRecord[] = [];

  const fetchPaged = async (table: 'products_public' | 'products') => {
    let offset = 0;
    let size = pageSize;
    while (offset < 20000) {
      const params = `select=id,slug,name,description,price,image_url,images,category,stock,is_active,updated_at,seo_noindex,seo_tier,merch_hidden&is_active=eq.true&is_duplicate=eq.false&slug=not.is.null&order=id.asc`;
      // Adaptive paging: statement timeouts (57014) shrink with smaller pages.
      let page: ProductRecord[] | undefined;
      while (page === undefined) {
        try {
          page = await fetchPageWithRetry<ProductRecord>(table, params, size, offset);
        } catch (err) {
          if (size <= 25) throw err;
          size = Math.max(25, Math.floor(size / 2));
          console.warn(`[prerender-products] shrinking pageSize to ${size} after failures at offset=${offset}`);
        }
      }

      if (!page.length) break;
      all.push(...page.filter((product) => product.slug));
      if (page.length < size) break;
      offset += size;
    }
  };

  await fetchPaged('products_public');

  if (!all.length) {
    await fetchPaged('products');
  }

  if (!all.length) {
    const fallbackProducts: ProductRecord[] = staticProducts
      .filter((product) => product.inStock && product.slug && product.price > 0 && product.image)
      .map((product) => ({
        id: product.id,
        slug: product.slug,
        name: product.name,
        description: product.description,
        price: product.price,
        image_url: product.image,
        images: product.images,
        category: product.category,
        stock: product.inStock ? 25 : 0,
        is_active: product.inStock,
        updated_at: new Date().toISOString(),
      }));
    console.warn(
      `[prerender-products] ⚠ No DB products fetched — using static catalog fallback (${fallbackProducts.length} real products).`
    );
    all.push(...fallbackProducts);
  }

  const seen = new Set<string>();
  return all.filter((product) => {
    const slug = product.slug || '';
    if (!slug || seen.has(slug)) return false;
    seen.add(slug);
    return true;
  });
}

/** "<name> | GetPawsy", name cut at a word boundary so the title stays ≤ 65 chars. */
export function productSeoTitle(name: string): string {
  const n = name.replace(/\s+/g, ' ').trim();
  const room = 65 - ' | GetPawsy'.length;
  if (n.length <= room) return `${n} | GetPawsy`;
  const cut = n.slice(0, room - 1);
  const i = cut.lastIndexOf(' ');
  return `${(i > 20 ? cut.slice(0, i) : cut).replace(/[,;:.\-–—&\s]+$/, '')}… | GetPawsy`;
}


/** Titles of file-backed guides (public/data/guides), for cluster link labels. */
function readGuideTitles(): Map<string, string> {
  const dir = path.resolve('public/data/guides');
  const out = new Map<string, string>();
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || f === 'index.json') continue;
    try { const g = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')); if (g?.slug && g?.title) out.set(g.slug, stripUnsupportedTitleClaims(g.title)); } catch { /* skip */ }
  }
  return out;
}

/** Pillar first, then supporting guides; only guides with a file-backed page. */
export function clusterGuideLinks(cluster: SeoCluster | undefined, titles: Map<string, string>): Array<{ href: string; label: string }> {
  if (!cluster) return [];
  return [cluster.pillar, ...cluster.supporting]
    .filter((s) => titles.has(s))
    .map((s) => ({ href: `/guides/${s}`, label: titles.get(s)! }));
}

export function buildProductPage(product: ProductRecord, related: ProductRecord[], spaHtml: string): string {
  const slug = product.slug || product.id;
  const canonical = `${SITE}/products/${slug}`;
  const cleanDescription = stripHtml(product.description);
  const price = formatPrice(product.price);
  const description = clampMetaDescription(cleanDescription || `${product.name} — $${price} USD at GetPawsy.`);
  const images = productImages(product);
  const primaryImage = images[0] || `${SITE}/og-image.png`;
  const robots = isProductIndexable(product) ? ROBOTS_INDEX : ROBOTS_NOINDEX_FOLLOW;
  const collectionUrl = collectionHrefFor(product.category);
  const collectionLabel = collectionUrl ? (getCanonicalCategory(collectionUrl.split('/').pop() || '')?.label || product.category) : null;
  const productSchema = JSON.stringify(buildProductSchema(product, canonical, description, primaryImage));
  const crumbs = [
    { name: 'Home', item: `${SITE}/` },
    { name: 'Products', item: `${SITE}/products` },
    ...(collectionUrl ? [{ name: collectionLabel || '', item: `${SITE}${collectionUrl}` }] : []),
    { name: product.name, item: canonical },
  ];
  const breadcrumbSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  });
  const { assetTags, scriptTags } = extractAssets(spaHtml);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(productSeoTitle(product.name))}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${robots}">
  <meta name="googlebot" content="${robots}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="product">
  <meta property="og:title" content="${escapeHtml(productSeoTitle(product.name))}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${escapeHtml(primaryImage)}">
  <meta property="product:price:amount" content="${price}">
  <meta property="product:price:currency" content="USD">
  ${assetTags}
  <script type="application/ld+json">${productSchema}</script>
  <script type="application/ld+json">${breadcrumbSchema}</script>
</head>
<body>
  <div id="root">
    <main>
      <nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/products">Products</a>${collectionUrl ? ` / <a href="${collectionUrl}">${escapeHtml(collectionLabel || '')}</a>` : ''}</nav>
      <img src="${escapeHtml(primaryImage)}" alt="${escapeHtml(product.name)}" loading="eager">
      <h1>${escapeHtml(product.name)}</h1>
      <p>$${price} USD</p>
      <p>${isInStock(product) ? 'In stock' : 'Currently unavailable'}</p>
      ${cleanDescription ? `<section><h2>Product details</h2><p>${escapeHtml(cleanDescription)}</p></section>` : ''}
      ${related.length ? `<section><h2>Related products</h2><ul>${related.map((item) => `<li><a href="/products/${escapeHtml(item.slug || '')}">${escapeHtml(item.name)}</a></li>`).join('')}</ul></section>` : ''}
    </main>
  </div>
  ${scriptTags}
</body>
</html>`;
}

/** Shared raw-HTML shell for listing pages (/products, /blog, /collections/*). */
export function buildListingPage(opts: {
  spaHtml: string; path: string; title: string; h1: string; description: string;
  intro: string; crumbs: Array<{ name: string; path: string }>;
  items: Array<{ href: string; label: string; extra?: string }>; indexable?: boolean;
  /** Related guides (collection → pillar → supporting). */
  guides?: Array<{ href: string; label: string }>;
  categories?: Array<{ href: string; label: string }>;
  /** Emit an ItemList of the (canonical) item URLs. */
  itemList?: boolean;
}): string {
  const canonical = `${SITE}${opts.path === '/' ? '/' : opts.path}`;
  const robots = opts.indexable === false ? ROBOTS_NOINDEX_FOLLOW : ROBOTS_INDEX;
  const { assetTags, scriptTags } = extractAssets(opts.spaHtml);
  const breadcrumb = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: opts.crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${SITE}${c.path}` })),
  });
  const itemList = opts.itemList && opts.items.length
    ? `\n  <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org', '@type': 'ItemList', url: canonical,
      itemListElement: opts.items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}${it.href}`, name: it.label })),
    }).replace(/</g, '\\u003c')}</script>`
    : '';
  const guides = opts.guides && opts.guides.length
    ? `\n      <h2>Buying guides</h2>\n      <ul>\n${opts.guides.map((g) => `<li><a href="${escapeHtml(g.href)}">${escapeHtml(g.label)}</a></li>`).join('\n')}\n      </ul>`
    : '';
  const categories = opts.categories && opts.categories.length
    ? `\n      <h2>Shop by category</h2>\n      <ul>\n${opts.categories.map((g) => `<li><a href="${escapeHtml(g.href)}">${escapeHtml(g.label)}</a></li>`).join('\n')}\n      </ul>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(opts.title)}</title>
  <meta name="description" content="${escapeHtml(opts.description)}">
  <meta name="robots" content="${robots}">
  <meta name="googlebot" content="${robots}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(opts.title)}">
  <meta property="og:description" content="${escapeHtml(opts.description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:site_name" content="GetPawsy">
  ${assetTags}
  <script type="application/ld+json">${breadcrumb}</script>${itemList}
</head>
<body>
  <div id="root">
    <main>
      <nav aria-label="Breadcrumb">${opts.crumbs.map((c, i) => i === opts.crumbs.length - 1 ? escapeHtml(c.name) : `<a href="${c.path}">${escapeHtml(c.name)}</a>`).join(' / ')}</nav>
      <h1>${escapeHtml(opts.h1)}</h1>
      <p>${escapeHtml(opts.intro)}</p>
      <ul>
${opts.items.map((it) => `<li><a href="${escapeHtml(it.href)}">${escapeHtml(it.label)}</a>${it.extra ? ` — ${escapeHtml(it.extra)}` : ''}</li>`).join('\n')}
      </ul>${categories}${guides}
    </main>
  </div>
  ${scriptTags}
</body>
</html>`;
}

const PRIMARY_MERCH = loadPrimaryMerchandisedCollections();

export function collectionMembers(slug: string, products: ProductRecord[]): ProductRecord[] {
  return crawlerCollectionMembers(slug, products, PRIMARY_MERCH);
}

async function fetchBlogPosts(): Promise<Array<{ slug: string; title: string; excerpt: string | null }>> {
  const rows = await supaRest<{ slug: string; title: string; excerpt: string | null }>(
    'blog_posts',
    'select=slug,title,excerpt&is_published=eq.true&is_noindexed=eq.false&slug=not.is.null&order=published_at.desc&limit=500',
  );
  return rows || [];
}

function isExcludedProduct(product: ProductRecord): boolean {
  return isCrawlerExcludedProduct(product);
}

function buildNotFoundPage(spaHtml: string): string {
  const { assetTags, scriptTags } = extractAssets(spaHtml);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 - Page Not Found | GetPawsy</title>
  <meta name="robots" content="noindex, nofollow">
  <meta name="googlebot" content="noindex, nofollow">
  <meta name="prerender-status-code" content="404">
  ${assetTags}
</head>
<body>
  <div id="root">
    <main style="max-width:720px;margin:0 auto;padding:80px 20px;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;line-height:1.6">
      <p style="text-transform:uppercase;letter-spacing:.08em;color:#6b7280;font-size:12px">404</p>
      <h1 style="font-size:clamp(2rem,4vw,3rem);margin:0 0 12px;color:#111827">Page Not Found</h1>
      <p style="margin:0 0 24px;color:#374151">The requested page does not exist or is no longer available.</p>
      <a href="/products" style="display:inline-flex;padding:12px 18px;border-radius:999px;background:#111827;color:#fff;text-decoration:none;font-weight:600">Browse products</a>
    </main>
  </div>
  ${scriptTags}
</body>
</html>`;
}

function updateRedirectsManifest(distDir: string, slugs: string[]) {
  const redirectsPath = path.join(distDir, '_redirects');
  if (!fs.existsSync(redirectsPath)) {
    console.warn('[prerender-products] dist/_redirects not found, skipping redirect manifest update');
    return;
  }

  const redirects = fs.readFileSync(redirectsPath, 'utf-8').split(/\r?\n/);
  const filtered = redirects.filter(
    (line) =>
      !line.includes('/product/:slug /product/:slug.html 200') &&
      !line.includes('/product/* /404.html 404') &&
      !line.includes('/products/* /404.html 404') &&
      !/^\/products\/[^\s]+ \/products\/[^\s]+\.html 200$/.test(line.trim()) &&
      !line.startsWith('# ═══ Generated product prerender routes'),
  );
  const fallbackIndex = filtered.findIndex((line) => line.trim() === '/* /index.html 200');
  const insertIndex = fallbackIndex === -1 ? filtered.length : fallbackIndex;

  const explicitRules = [
    '# ═══ Generated product prerender routes ═══',
    '# Canonical /products/<slug> is served natively from dist/products/<slug>/index.html',
    '# (directory index resolves before the SPA fallback) — no rewrite rules needed.',
    // legacy singular route → canonical (permanent)
    ...slugs.map((slug) => `/product/${slug} /products/${slug} 301`),
    '/products/* /404.html 404',
    '/product/* /404.html 404',
  ];

  filtered.splice(insertIndex, 0, ...explicitRules);
  fs.writeFileSync(redirectsPath, `${filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`, 'utf-8');
}

export default function prerenderProductsPlugin(): Plugin {
  return {
    name: 'prerender-products',
    enforce: 'post',
    apply: 'build',
    async closeBundle() {
      const distDir = path.resolve('dist');
      const distProductDir = path.join(distDir, 'products');
      const spaHtmlPath = path.join(distDir, 'index.html');

      if (!fs.existsSync(spaHtmlPath)) {
        console.warn('[prerender-products] dist/index.html not found, skipping');
        return;
      }

      const products = await fetchAllProducts();
      if (!products.length) {
        throw new Error('[prerender-products] No active products were fetched, aborting build to prevent SPA-only product pages.');
      }

      const spaHtml = fs.readFileSync(spaHtmlPath, 'utf-8');
      fs.mkdirSync(distProductDir, { recursive: true });
      fs.writeFileSync(path.join(distDir, '404.html'), buildNotFoundPage(spaHtml), 'utf-8');

      // Filter out non-pet and policy-unsafe products
      const safeProducts = products.filter(p => !isExcludedProduct(p));
      const excludedCount = products.length - safeProducts.length;
      if (excludedCount > 0) {
        console.log(`[prerender-products] Excluded ${excludedCount} non-pet/unsafe products`);
      }

      let count = 0;
      for (const product of safeProducts) {
        const slug = product.slug || product.id;
        const related = safeProducts
          .filter((candidate) => candidate.id !== product.id && candidate.category && candidate.category === product.category && isListable(candidate) && isMerchVisible(candidate))
          .slice(0, 4);
        const html = buildProductPage(product, related, spaHtml);
        // Directory-index output: static hosting resolves /products/<slug> to
        // <slug>/index.html BEFORE the SPA fallback, so the canonical
        // extensionless URL serves prerendered HTML natively. Writing
        // `<slug>.html` only worked behind a _redirects rewrite, which Lovable
        // hosting does not process. See: PDP shell incident 2026-08-18.
        const slugDir = path.join(distProductDir, slug);
        fs.mkdirSync(slugDir, { recursive: true });
        fs.writeFileSync(path.join(slugDir, 'index.html'), html, 'utf-8');
        count += 1;
      }

      updateRedirectsManifest(distDir, safeProducts.map((product) => product.slug || product.id));

      // ── /products hub (dist/products/index.html) ──
      const listable = safeProducts.filter((p) => isListable(p) && isMerchVisible(p)).sort((a, b) => a.name.localeCompare(b.name));
      fs.writeFileSync(path.join(distProductDir, 'index.html'), buildListingPage({
        spaHtml, path: '/products', title: 'All Products | GetPawsy', h1: 'All Products',
        description: 'Browse in-stock cat and dog products at GetPawsy. Free shipping on eligible orders $35+, 30-day returns.',
        intro: `${listable.length} in-stock cat and dog products, listed alphabetically. Browse by category below or read our buying guides.`,
        crumbs: [{ name: 'Home', path: '/' }, { name: 'Products', path: '/products' }],
        items: listable.map((p) => ({ href: `/products/${p.slug}`, label: p.name, extra: `$${formatPrice(p.price)}` })),
        itemList: true,
        categories: productsHubCategoryLinks(safeProducts),
        guides: [{ href: '/guides', label: 'All pet buying guides' }],
      }), 'utf-8');

      // ── Canonical collections (dist/collections/<slug>/index.html) ──
      let collectionCount = 0;
      const guideTitles = readGuideTitles();
      for (const slug of CANONICAL_SITEMAP_COLLECTIONS) {
        const cat = getCanonicalCategory(slug);
        if (!cat || !cat.active) throw new Error(`[prerender-products] canonical collection ${slug} missing from registry`);
        const members = collectionMembers(slug, safeProducts).sort((a, b) => a.name.localeCompare(b.name));
        const dir = path.join(distDir, 'collections', slug);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), buildListingPage({
          spaHtml, path: `/collections/${slug}`,
          title: CANONICAL_COLLECTION_META[slug]?.title ?? `${cat.label} | GetPawsy`, h1: CANONICAL_COLLECTION_META[slug]?.h1 ?? cat.label,
          description: CANONICAL_COLLECTION_META[slug]?.description ?? `Browse in-stock ${cat.label.toLowerCase()} at GetPawsy. Free shipping on eligible orders $35+, 30-day returns.`,
          intro: CANONICAL_COLLECTION_META[slug]?.intro
            ? `${CANONICAL_COLLECTION_META[slug].intro} ${members.length} in-stock products.`
            : `${members.length} in-stock products in ${cat.label}.`,
          crumbs: [{ name: 'Home', path: '/' }, { name: 'Products', path: '/products' }, { name: cat.label, path: `/collections/${slug}` }],
          items: members.map((p) => ({ href: `/products/${p.slug}`, label: p.name, extra: `$${formatPrice(p.price)}` })),
          itemList: true,
          guides: clusterGuideLinks(clusterForCollection(slug), guideTitles),
          // Mirrors the runtime thin-collection guard (<3 products → noindex).
          indexable: members.length >= MIN_INDEXABLE_COLLECTION_PRODUCTS,
        }), 'utf-8');
        collectionCount++;
      }

      // ── /blog hub (dist/blog/index.html) ──
      try {
        const { loadSeoPolicy, isBlogIndexable } = await import('./scripts/seo-indexability.mjs');
        const policy = loadSeoPolicy();
        const advertisedBlog = advertisedPaths('blog');
        const posts = (await fetchBlogPosts()).filter((b) => isBlogIndexable(b.slug, policy) && (!advertisedBlog || advertisedBlog.has(`/blog/${b.slug}`)));
        fs.mkdirSync(path.join(distDir, 'blog'), { recursive: true });
        fs.writeFileSync(path.join(distDir, 'blog', 'index.html'), buildListingPage({
          spaHtml, path: '/blog', title: 'Blog | GetPawsy', h1: 'GetPawsy Blog',
          description: 'Articles for cat and dog owners from GetPawsy.',
          intro: `${posts.length} articles.`,
          crumbs: [{ name: 'Home', path: '/' }, { name: 'Blog', path: '/blog' }],
          items: posts.map((b) => ({ href: `/blog/${b.slug}`, label: b.title, extra: b.excerpt || undefined })),
        }), 'utf-8');
      } catch (e) {
        console.warn('[prerender-products] /blog hub skipped:', (e as Error).message);
      }
      console.log(`[prerender-products] ✅ Prerendered /products hub, ${collectionCount} collections, /blog hub`);

      const validationReport = {
        generatedAt: new Date().toISOString(),
        productCount: count,
        excludedNonPet: excludedCount,
        totalFetched: products.length,
        sampleSlugs: safeProducts.slice(0, 5).map((product) => product.slug || product.id),
        redirectMode: 'directory-index-native-resolution',
        outputPattern: 'dist/products/<slug>/index.html',
      };
      fs.writeFileSync(path.join(distDir, 'prerender-validation.json'), JSON.stringify(validationReport, null, 2), 'utf-8');

      const sample = products.slice(0, 3).map((product) => product.slug || product.id);
      console.log(`[prerender-products] ✅ Prerendered ${count} product pages`);
      console.log(`[prerender-products] Sample slugs: ${sample.join(', ')}`);
    },
  };
}
/** Indexable canonical collections for the /products hub "Shop by category" list. */
function productsHubCategoryLinks(products: Parameters<typeof collectionMembers>[1]): Array<{ href: string; label: string }> {
  return CANONICAL_SITEMAP_COLLECTIONS
    .map((slug) => ({ slug, cat: getCanonicalCategory(slug), n: collectionMembers(slug, products).length }))
    .filter((c) => c.cat?.active && c.n >= MIN_INDEXABLE_COLLECTION_PRODUCTS)
    .map((c) => ({ href: `/collections/${c.slug}`, label: `${c.cat!.label} (${c.n} products)` }));
}

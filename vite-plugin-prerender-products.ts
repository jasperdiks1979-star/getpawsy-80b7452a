import fs from 'fs';
import path from 'path';
import type { Plugin } from 'vite';
import { products as staticProducts } from './src/data/products';
import { resolveToCanonical, getCanonicalCategory } from './src/lib/canonical-category-registry';
import { isProductIndexable, CANONICAL_SITEMAP_COLLECTIONS } from './scripts/seo-indexability.mjs';

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

/** Products a crawler-facing listing may show: in stock and indexable. */
export function isListable(p: ProductRecord): boolean {
  return Boolean(p.slug) && isInStock(p) && isProductIndexable(p) && Number(p.price) > 0;
}

function collectionHrefFor(category: string | null): string | null {
  const slug = slugify(category || '');
  const canonical = slug ? resolveToCanonical(slug) : null;
  return canonical && canonical !== 'all' ? `/collections/${canonical}` : null;
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
      const params = `select=id,slug,name,description,price,image_url,images,category,stock,is_active,updated_at,seo_noindex,seo_tier&is_active=eq.true&is_duplicate=eq.false&slug=not.is.null&order=id.asc`;
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

export function buildProductPage(product: ProductRecord, related: ProductRecord[], spaHtml: string): string {
  const slug = product.slug || product.id;
  const canonical = `${SITE}/products/${slug}`;
  const cleanDescription = stripHtml(product.description);
  const price = formatPrice(product.price);
  const description = (cleanDescription || `${product.name} — $${price} USD at GetPawsy.`).slice(0, 280);
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
  <title>${escapeHtml(product.name)} | GetPawsy</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${robots}">
  <meta name="googlebot" content="${robots}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="product">
  <meta property="og:title" content="${escapeHtml(product.name)} | GetPawsy">
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
}): string {
  const canonical = `${SITE}${opts.path === '/' ? '/' : opts.path}`;
  const robots = opts.indexable === false ? ROBOTS_NOINDEX_FOLLOW : ROBOTS_INDEX;
  const { assetTags, scriptTags } = extractAssets(opts.spaHtml);
  const breadcrumb = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: opts.crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${SITE}${c.path}` })),
  });
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
  <script type="application/ld+json">${breadcrumb}</script>
</head>
<body>
  <div id="root">
    <main>
      <nav aria-label="Breadcrumb">${opts.crumbs.map((c, i) => i === opts.crumbs.length - 1 ? escapeHtml(c.name) : `<a href="${c.path}">${escapeHtml(c.name)}</a>`).join(' / ')}</nav>
      <h1>${escapeHtml(opts.h1)}</h1>
      <p>${escapeHtml(opts.intro)}</p>
      <ul>
${opts.items.map((it) => `<li><a href="${escapeHtml(it.href)}">${escapeHtml(it.label)}</a>${it.extra ? ` — ${escapeHtml(it.extra)}` : ''}</li>`).join('\n')}
      </ul>
    </main>
  </div>
  ${scriptTags}
</body>
</html>`;
}

/** Category membership for the locked canonical collections (mirrors seo_collections filters). */
const COLLECTION_MATCH: Record<string, (category: string) => boolean> = {
  dogs: (c) => /\bdog/i.test(c),
  cats: (c) => /\bcat/i.test(c),
  'dog-beds': (c) => c.toLowerCase() === 'dog beds',
  'cat-trees-and-condos': (c) => c.toLowerCase() === 'cat trees & condos',
  'cat-litter-boxes': (c) => c.toLowerCase() === 'cat litter boxes',
  'cat-toys': (c) => c.toLowerCase() === 'cat toys',
  'cat-beds': (c) => c.toLowerCase() === 'cat beds',
};

export function collectionMembers(slug: string, products: ProductRecord[]): ProductRecord[] {
  const match = COLLECTION_MATCH[slug];
  if (!match) return [];
  return products.filter((p) => isListable(p) && match(p.category || ''));
}

async function fetchBlogPosts(): Promise<Array<{ slug: string; title: string; excerpt: string | null }>> {
  const rows = await supaRest<{ slug: string; title: string; excerpt: string | null }>(
    'blog_posts',
    'select=slug,title,excerpt&is_published=eq.true&is_noindexed=eq.false&slug=not.is.null&order=published_at.desc&limit=500',
  );
  return rows || [];
}

/** Non-pet exclusion patterns — only cats & dogs allowed */
const NON_PET_RE: RegExp[] = [
  /\b(bird|parrot|parakeet|cockatiel|canary|finch|budgie|macaw|aviary|bird\s*cage)\b/i,
  /\b(reptile|snake|lizard|gecko|iguana|turtle|tortoise|terrarium|vivarium)\b/i,
  /\b(chicken|poultry|hen|rooster|coop|egg\s*incubator)\b/i,
  /\b(hamster|gerbil|guinea\s*pig|chinchilla|ferret|rodent|hamster\s*cage|hamster\s*wheel)\b/i,
  /\b(fish\s*tank|aquarium|fish\s*food|fish\s*bowl|betta|goldfish)\b/i,
  /\b(rabbit\s*hutch|rabbit\s*cage|bunny\s*cage)\b/i,
  /\b(sunglasses|nail\s*art|fashion\s*accessor|jewelry|bracelet|necklace|earring)\b/i,
];
const POLICY_UNSAFE_RE: RegExp[] = [
  /shock\s*(collar|training|correction)?/i, /static\s*correction/i,
  /electric\s*(fence|collar|training)/i, /aversive\s*training/i,
  /wireless\s*fence/i, /training\s*collar/i, /prong\s*collar/i, /choke\s*chain/i,
];
function isExcludedProduct(product: ProductRecord): boolean {
  const text = `${product.name} ${product.category || ''} ${product.description || ''}`;
  if (NON_PET_RE.some(p => p.test(text))) return true;
  if (POLICY_UNSAFE_RE.some(p => p.test(text))) return true;
  return false;
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
          .filter((candidate) => candidate.id !== product.id && candidate.category && candidate.category === product.category && isListable(candidate))
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
      const listable = safeProducts.filter(isListable).sort((a, b) => a.name.localeCompare(b.name));
      fs.writeFileSync(path.join(distProductDir, 'index.html'), buildListingPage({
        spaHtml, path: '/products', title: 'All Products | GetPawsy', h1: 'All Products',
        description: 'Browse in-stock cat and dog products at GetPawsy. Free shipping on eligible orders $35+, 30-day returns.',
        intro: `${listable.length} in-stock products.`,
        crumbs: [{ name: 'Home', path: '/' }, { name: 'Products', path: '/products' }],
        items: listable.map((p) => ({ href: `/products/${p.slug}`, label: p.name, extra: `$${formatPrice(p.price)}` })),
      }), 'utf-8');

      // ── Canonical collections (dist/collections/<slug>/index.html) ──
      let collectionCount = 0;
      for (const slug of CANONICAL_SITEMAP_COLLECTIONS) {
        const cat = getCanonicalCategory(slug);
        if (!cat || !cat.active) throw new Error(`[prerender-products] canonical collection ${slug} missing from registry`);
        const members = collectionMembers(slug, safeProducts).sort((a, b) => a.name.localeCompare(b.name));
        const dir = path.join(distDir, 'collections', slug);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), buildListingPage({
          spaHtml, path: `/collections/${slug}`, title: `${cat.label} | GetPawsy`, h1: cat.label,
          description: `Browse ${members.length} in-stock ${cat.label.toLowerCase()} at GetPawsy. Free shipping on eligible orders $35+, 30-day returns.`,
          intro: `${members.length} in-stock products in ${cat.label}.`,
          crumbs: [{ name: 'Home', path: '/' }, { name: 'Collections', path: '/collections/all' }, { name: cat.label, path: `/collections/${slug}` }],
          items: members.map((p) => ({ href: `/products/${p.slug}`, label: p.name, extra: `$${formatPrice(p.price)}` })),
          // Mirrors the runtime thin-collection guard (<3 products → noindex).
          indexable: members.length >= 3,
        }), 'utf-8');
        collectionCount++;
      }

      // ── /blog hub (dist/blog/index.html) ──
      try {
        const { loadSeoPolicy, isBlogIndexable } = await import('./scripts/seo-indexability.mjs');
        const policy = loadSeoPolicy();
        const posts = (await fetchBlogPosts()).filter((b) => isBlogIndexable(b.slug, policy));
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
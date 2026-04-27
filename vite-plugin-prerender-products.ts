import fs from 'fs';
import path from 'path';
import type { Plugin } from 'vite';
import { products as staticProducts } from './src/data/products';

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

function detectProductType(name: string, category: string): string {
  const combined = `${name} ${category}`.toLowerCase();
  if (/bed|cushion|pillow/.test(combined)) return 'bed';
  if (/toy|ball|chew|puzzle/.test(combined)) return 'toy';
  if (/harness/.test(combined)) return 'harness';
  if (/leash|lead/.test(combined)) return 'leash';
  if (/collar/.test(combined)) return 'collar';
  if (/carrier|crate|bag/.test(combined)) return 'carrier';
  if (/bowl|feeder|dish/.test(combined)) return 'bowl';
  if (/fountain|water/.test(combined)) return 'fountain';
  if (/groom|brush|comb/.test(combined)) return 'grooming';
  return 'accessory';
}

function buildIntro(product: ProductRecord): string {
  const type = detectProductType(product.name, product.category || '');
  const keyword = product.name;
  const intros: Record<string, string> = {
    bed: `This ${keyword} is built for pets that struggle with pressure points, restless sleep, or weak support from flat bedding. Unlike generic pads, it helps cushion joints, improve comfort, and create a calmer rest space for daily recovery. Ideal for senior pets, larger breeds, and any home that wants a more supportive sleep setup.`,
    toy: `This ${keyword} is designed for pets that need a healthier outlet for chewing, boredom, and indoor energy. Unlike flimsy toys that lose appeal quickly, it encourages longer engagement while supporting stimulation, play, and better behavior at home. A smart fit for training sessions, solo play, and everyday enrichment.`,
    harness: `This ${keyword} is designed for pet owners who need more control without adding throat pressure or discomfort. Unlike basic walking gear, it helps improve handling, reduce pulling stress, and support safer everyday outings. Great for daily walks, training routines, and pets that need a more stable fit.`,
    leash: `This ${keyword} is made for pet owners who want dependable control during walks, travel, and outdoor routines. Unlike weak clip-on leads, it helps improve grip, support safer movement, and reduce stress when pets lunge or change direction suddenly. A reliable choice for daily walking and structured training use.`,
    carrier: `This ${keyword} is built for safer, calmer transport during vet trips, travel days, and short errands. Unlike cramped carriers with poor airflow, it helps improve comfort, ventilation, and security while your pet is on the move. Perfect for travel routines that need a more stable and pet-friendly setup.`,
    bowl: `This ${keyword} is designed for cleaner feeding, better pacing, and easier mealtime routines. Unlike lightweight bowls that slide or promote fast eating, it helps support calmer feeding behavior while keeping your floor cleaner. A practical choice for everyday feeding at home.`,
    fountain: `This ${keyword} is made for pets that ignore stale water or need a fresher drinking setup. Unlike still-water bowls, it helps keep water moving, cleaner, and more appealing for regular hydration. Perfect for homes focused on comfort, wellness, and easier daily care.`,
    grooming: `This ${keyword} is designed to make routine coat care easier, cleaner, and less stressful. Unlike low-quality tools that pull fur or lose effectiveness fast, it helps improve grooming control while supporting coat maintenance and home cleanliness. A strong fit for pets that need regular brushing or shedding care.`,
    accessory: `This ${keyword} is built to solve a practical daily pet-care problem with more reliability than generic alternatives. Unlike disposable low-grade options, it helps improve comfort, convenience, and long-term use in real homes. A useful addition for pet owners who want better function and fewer compromises.`,
  };

  return intros[type] || intros.accessory;
}

function buildBenefits(product: ProductRecord): string[] {
  const type = detectProductType(product.name, product.category || '');
  const benefits: Record<string, string[]> = {
    bed: ['Supportive cushioning for daily rest', 'Helps reduce pressure on joints and hips', 'Comfort-focused design for longer naps', 'Better fit for senior or large pets'],
    toy: ['Encourages active play and stimulation', 'Helps reduce boredom-driven behavior', 'Built for repeat use during daily play', 'Safer alternative to cheap disposable toys'],
    harness: ['Improves walking control without throat strain', 'Supports a more secure everyday fit', 'Better comfort for longer wear', 'Useful for training and outdoor routines'],
    leash: ['Reliable control during walks and outings', 'Comfortable handling for daily use', 'More dependable than weak basic leads', 'Helps support safer direction changes'],
    carrier: ['Improves airflow during transport', 'Creates a more secure travel space', 'Helps reduce pet stress on the move', 'Better for vet trips and daily travel routines'],
    bowl: ['Supports cleaner feeding routines', 'Helps reduce floor mess around meals', 'More stable than lightweight bowls', 'Designed for easier daily use'],
    fountain: ['Encourages more consistent hydration', 'Keeps water circulating and fresher', 'Supports cleaner drinking routines', 'Useful for homes with indoor pets'],
    grooming: ['Helps manage loose fur and shedding', 'Supports cleaner coats and homes', 'Better control during routine grooming', 'Makes maintenance easier between appointments'],
    accessory: ['Practical for everyday pet care', 'Built for consistent repeated use', 'More dependable than generic alternatives', 'Designed around real home use cases'],
  };

  return benefits[type] || benefits.accessory;
}

function buildUseCases(product: ProductRecord): string {
  const type = detectProductType(product.name, product.category || '');
  const cases: Record<string, string> = {
    bed: 'Ideal for senior pets, larger breeds, indoor lounging, recovery days, and homes that want a more supportive rest area.',
    toy: 'Ideal for puppies, adult dogs, indoor play, boredom relief, training rewards, and pets that need healthy daily stimulation.',
    harness: 'Ideal for daily walks, leash training, high-energy pets, urban outings, and owners who want more secure control.',
    leash: 'Ideal for neighborhood walks, travel, training sessions, busy sidewalks, and pets that need dependable handling.',
    carrier: 'Ideal for vet visits, car travel, short flights, weekend trips, and pets that need a calmer transport experience.',
    bowl: 'Ideal for puppies, adult pets, indoor feeding stations, slower mealtimes, and cleaner kitchens.',
    fountain: 'Ideal for indoor cats, multi-pet homes, hydration support, and homes that want a cleaner water setup.',
    grooming: 'Ideal for shedding season, weekly coat care, sensitive pets, and owners who groom at home.',
    accessory: 'Ideal for daily routines, home organization, travel prep, and pet owners who want a more dependable setup.',
  };

  return cases[type] || cases.accessory;
}

function buildFaqs(product: ProductRecord): Array<{ question: string; answer: string }> {
  const name = product.name;
  return [
    {
      question: `Who is the ${name} best for?`,
      answer: `The ${name} is best for pet owners looking for a more reliable solution than basic alternatives, especially when daily comfort, durability, and ease of use matter.`,
    },
    {
      question: `Is the ${name} suitable for everyday use?`,
      answer: `Yes. The ${name} is intended for regular day-to-day use and is positioned as a practical long-term upgrade over lower-quality options.`,
    },
    {
      question: `Does the ${name} support fast US delivery?`,
      answer: `Yes. This product page is published only for active catalog items intended for the US storefront experience and customer-ready ordering flow.`,
    },
  ];
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

async function supaRest<T>(table: string, params: string): Promise<T[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: 'count=exact',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!res.ok) return [];
    return (await res.json()) as T[];
  } catch {
    clearTimeout(timeout);
    return [];
  }
}

async function fetchAllProducts(): Promise<ProductRecord[]> {
  const pageSize = 1000;
  let offset = 0;
  const all: ProductRecord[] = [];

  const fetchPaged = async (table: 'products_public' | 'products') => {
    offset = 0;
    while (true) {
      const duplicateFilter = table === 'products_public' ? '&is_duplicate=eq.false' : '&is_duplicate=eq.false';
      const page = await supaRest<ProductRecord>(
        table,
        `select=id,slug,name,description,price,image_url,images,category,stock,is_active,updated_at&is_active=eq.true${duplicateFilter}&slug=not.is.null&order=updated_at.desc&limit=${pageSize}&offset=${offset}`,
      );

      if (!page.length) break;
      all.push(...page.filter((product) => product.slug));
      if (page.length < pageSize) break;
      offset += pageSize;
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

function buildProductPage(product: ProductRecord, related: ProductRecord[], spaHtml: string): string {
  const slug = product.slug || product.id;
  const canonical = `${SITE}/product/${slug}`;
  const cleanDescription = stripHtml(product.description);
  const intro = buildIntro(product);
  const description = cleanDescription.length >= 80
    ? cleanDescription.slice(0, 280)
    : `${intro} ${buildUseCases(product)}`.slice(0, 280);
  const images = productImages(product);
  const primaryImage = images[0] || `${SITE}/og-image.png`;
  const price = formatPrice(product.price);
  const benefits = buildBenefits(product);
  const faqs = buildFaqs(product);
  const categorySlug = slugify(product.category || 'products');
  const collectionUrl = `/collections/${categorySlug}`;
  const productSchema = JSON.stringify(buildProductSchema(product, canonical, description, primaryImage));
  const breadcrumbSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
      { '@type': 'ListItem', position: 2, name: 'Products', item: `${SITE}/products` },
      ...(product.category ? [{ '@type': 'ListItem', position: 3, name: product.category, item: `${SITE}${collectionUrl}` }] : []),
      { '@type': 'ListItem', position: product.category ? 4 : 3, name: product.name, item: canonical },
    ],
  });

  const headMatch = spaHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const headContent = headMatch ? headMatch[1] : '';
  const scriptTags = (spaHtml.match(/<script[^>]*src="[^"]*"[^>]*><\/script>/g) || []).join('\n');
  const assetTags = (headContent.match(/<link[^>]*>|<style[^>]*>[\s\S]*?<\/style>/gi) || []).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(product.name)} | GetPawsy</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
  <meta name="googlebot" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="product">
  <meta property="og:title" content="${escapeHtml(product.name)} | GetPawsy">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${escapeHtml(primaryImage)}">
  <meta property="product:price:amount" content="${price}">
  <meta property="product:price:currency" content="USD">
  ${assetTags}
  <style>
    body{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;color:#111827;background:#fff;line-height:1.6}
    .wrap{max-width:1120px;margin:0 auto;padding:32px 20px 64px}
    .grid{display:grid;gap:32px;grid-template-columns:minmax(0,1.1fr) minmax(0,0.9fr)}
    .media img{width:100%;height:auto;display:block;border-radius:20px;background:#f3f4f6}
    .eyebrow{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;margin-bottom:8px}
    h1{font-size:clamp(2rem,4vw,3rem);line-height:1.05;margin:0 0 12px}
    h2{font-size:1.35rem;margin:32px 0 12px}
    .price{font-size:1.75rem;font-weight:700;margin:16px 0 8px}
    .lede{font-size:1.05rem;color:#374151}
    .panel{border:1px solid #e5e7eb;border-radius:20px;padding:20px;background:#fff}
    .list{padding-left:20px;margin:0}.list li{margin:8px 0}
    .links{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}.links a,.cta{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:10px 16px;text-decoration:none}
    .cta{background:#111827;color:#fff;font-weight:600}.links a{background:#f3f4f6;color:#111827}
    .meta{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:20px}.meta .panel{padding:16px}
    .faq details{border:1px solid #e5e7eb;border-radius:16px;padding:14px 16px;margin:12px 0}.faq summary{font-weight:600;cursor:pointer}
    @media (max-width: 900px){.grid{grid-template-columns:1fr}.wrap{padding:24px 16px 48px}}
  </style>
  <script type="application/ld+json">${productSchema}</script>
  <script type="application/ld+json">${breadcrumbSchema}</script>
</head>
<body>
  <div id="root">
    <main class="wrap">
      <nav aria-label="Breadcrumb" class="eyebrow"><a href="/" style="color:inherit">Home</a> / <a href="/products" style="color:inherit">Products</a>${product.category ? ` / <a href="${collectionUrl}" style="color:inherit">${escapeHtml(product.category)}</a>` : ''}</nav>
      <section class="grid">
        <div class="media">
          <img src="${escapeHtml(primaryImage)}" alt="${escapeHtml(product.name)}" loading="eager">
        </div>
        <div>
          <div class="eyebrow">Active product page</div>
          <h1>${escapeHtml(product.name)}</h1>
          <p class="price">$${price} USD</p>
          <p class="lede">${escapeHtml(intro)}</p>
          <div class="links">
            <a class="cta" href="/cart">Add to cart</a>
            ${product.category ? `<a href="${collectionUrl}">Shop more in ${escapeHtml(product.category)}</a>` : ''}
          </div>
          <div class="meta">
            <div class="panel"><strong>Availability</strong><br>${product.is_active !== false && Number(product.stock || 0) > 0 ? 'In stock for US storefront' : 'Currently unavailable'}</div>
            <div class="panel"><strong>Canonical URL</strong><br>${escapeHtml(canonical)}</div>
          </div>
        </div>
      </section>

      <section class="panel" style="margin-top:32px">
        <h2>Why pet owners choose this product</h2>
        <p>${escapeHtml(description)}</p>
      </section>

      <section>
        <h2>Benefits</h2>
        <ul class="list">${benefits.map((benefit) => `<li>${escapeHtml(benefit)}</li>`).join('')}</ul>
      </section>

      <section>
        <h2>Best use cases</h2>
        <p>${escapeHtml(buildUseCases(product))}</p>
        <p>Unlike cheap generic alternatives that often underperform after a short period of use, this product page is positioned around better durability, more dependable daily use, and a clearer fit for real pet-owner needs.</p>
      </section>

      <section>
        <h2>Product details</h2>
        <p>${escapeHtml(cleanDescription || description)}</p>
      </section>

      ${related.length ? `<section>
        <h2>Related products</h2>
        <div class="links">${related.map((item) => `<a href="/product/${escapeHtml(item.slug || item.id)}">${escapeHtml(item.name)}</a>`).join('')}</div>
      </section>` : ''}

      <section class="faq">
        <h2>Frequently asked questions</h2>
        ${faqs.map((faq) => `<details><summary>${escapeHtml(faq.question)}</summary><p>${escapeHtml(faq.answer)}</p></details>`).join('')}
      </section>
    </main>
  </div>
  ${scriptTags}
</body>
</html>`;
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
  const headMatch = spaHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const headContent = headMatch ? headMatch[1] : '';
  const scriptTags = (spaHtml.match(/<script[^>]*src="[^"]*"[^>]*><\/script>/g) || []).join('\n');
  const assetTags = (headContent.match(/<link[^>]*>|<style[^>]*>[\s\S]*?<\/style>/gi) || []).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 - Page Not Found | GetPawsy</title>
  <meta name="robots" content="noindex, nofollow">
  <meta name="googlebot" content="noindex, nofollow">
  <meta name="prerender-status-code" content="404">
  <link rel="canonical" href="${SITE}/404">
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
  const filtered = redirects.filter((line) => !line.includes('/product/:slug /product/:slug.html 200') && !line.includes('/product/* /404.html 404'));
  const fallbackIndex = filtered.findIndex((line) => line.trim() === '/* /index.html 200');
  const insertIndex = fallbackIndex === -1 ? filtered.length : fallbackIndex;

  const explicitRules = [
    '# ═══ Generated product prerender routes — exact-match static HTML before SPA fallback ═══',
    ...slugs.map((slug) => `/product/${slug} /product/${slug}.html 200`),
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
      const distProductDir = path.join(distDir, 'product');
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
          .filter((candidate) => candidate.id !== product.id && candidate.category && candidate.category === product.category)
          .slice(0, 4);
        const html = buildProductPage(product, related, spaHtml);
        fs.writeFileSync(path.join(distProductDir, `${slug}.html`), html, 'utf-8');
        count += 1;
      }

      updateRedirectsManifest(distDir, safeProducts.map((product) => product.slug || product.id));

      const validationReport = {
        generatedAt: new Date().toISOString(),
        productCount: count,
        excludedNonPet: excludedCount,
        totalFetched: products.length,
        sampleSlugs: safeProducts.slice(0, 5).map((product) => product.slug || product.id),
        redirectMode: 'exact-static-routes-before-spa-fallback',
      };
      fs.writeFileSync(path.join(distDir, 'prerender-validation.json'), JSON.stringify(validationReport, null, 2), 'utf-8');

      const sample = products.slice(0, 3).map((product) => product.slug || product.id);
      console.log(`[prerender-products] ✅ Prerendered ${count} product pages`);
      console.log(`[prerender-products] Sample slugs: ${sample.join(', ')}`);
    },
  };
}
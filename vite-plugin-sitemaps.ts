/**
 * Vite plugin that generates sitemap + merchant-feed XML files at build time
 * by querying the Supabase REST API directly — NO edge functions needed.
 */
import type { Plugin } from 'vite';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'https://getpawsy.pet';
const SUPABASE_URL = 'https://nojvgfbcjgipjxpfatmm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vanZnZmJjamdpcGp4cGZhdG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTMxOTYsImV4cCI6MjA4Mzk4OTE5Nn0.gfjmYf9aB-BCIrCnH14Zmnm6GBEKX7QMWP1ELL_i9dc';
const FREE_SHIPPING_THRESHOLD = 35;

// ── Supabase REST helper ──────────────────────────────────────────────

async function supaRest<T>(table: string, params: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: 'count=exact',
    },
  });
  if (!res.ok) {
    console.warn(`[xml-plugin] REST error ${table}: ${res.status}`);
    return [];
  }
  return (await res.json()) as T[];
}

// ── XML helpers ───────────────────────────────────────────────────────

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.substring(0, max - 3) + '...';
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function urlTag(loc: string, lastmod: string, changefreq: string, priority: string): string {
  return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

// ── Sitemap generation ────────────────────────────────────────────────

interface ProductRow { id: string; slug: string | null; updated_at: string; }
interface CategoryRow { slug: string; name: string; }
interface BestsellersRow { slug: string; updated_at: string; }
interface CollectionsRow { slug: string; updated_at: string; }
interface BlogRow { slug: string; published_at: string; }

const CLEAN_CATEGORY_SLUGS: Record<string, string> = {
  'cat-trees-and-condos': 'cat-trees-condos',
  'dog-beds': 'dog-beds',
  'cat-litter-boxes': 'cat-litter-boxes',
  'dog-toys': 'dog-toys',
  'cat-toys': 'cat-toys',
  'dog-collars-leashes': 'dog-collars-leashes',
  'dog-carriers': 'dog-carriers',
  'cat-carriers': 'cat-carriers',
  'dog-grooming': 'dog-grooming',
  'guinea-pig-cages': 'guinea-pig-cages',
};

const FALLBACK_GUIDES = [
  "best-cat-litter-box-2026","how-many-litter-boxes-per-cat",
  "best-cat-litter-box-furniture-enclosures-2026","best-litter-boxes-multi-cat",
  "best-extra-large-litter-boxes","best-cat-trees-small-apartments",
  "best-litter-box-small-apartments","best-litter-box-odor-bathroom",
  "best-low-tracking-litter-box","best-litter-box-kittens",
  "best-litter-box-senior-cats","best-litter-box-under-100",
  "best-litter-box-studio-apartment","best-high-sided-litter-box",
  "how-to-choose-guinea-pig-cage","guinea-pig-cage-vs-playpen",
  "cat-condo-vs-cat-tower","choosing-safe-cat-tree-indoor",
  "outdoor-dog-games-enrichment",
];

async function buildSitemapIndex(today: string): Promise<string> {
  const subs = ['static','products','categories','bestsellers','collections','blog','guides'];
  const entries = subs.map(s =>
    `  <sitemap>\n    <loc>${BASE_URL}/sitemap-${s}.xml</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>`;
}

function buildStaticSitemap(today: string): string {
  const pages: [string,string,string][] = [
    ['/',   'daily','1.0'],
    ['/products','daily','0.95'],
    ['/bestsellers','daily','0.90'],
    ['/cat-trees-condos','daily','0.90'],
    ['/blog','daily','0.80'],
    ['/guides','daily','0.85'],
  ];
  const urls = pages.map(([p,cf,pr]) => urlTag(`${BASE_URL}${p}`, today, cf, pr)).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

async function buildProductsSitemap(today: string): Promise<string> {
  const rows = await supaRest<ProductRow>('products_public',
    'select=id,slug,updated_at&is_active=eq.true&is_duplicate=eq.false&order=updated_at.desc&limit=5000');
  const urls = rows.map((p, i) => {
    const lm = p.updated_at?.split('T')[0] || today;
    const path = p.slug || p.id;
    const pri = i < 100 ? '0.95' : i < 500 ? '0.85' : '0.75';
    return urlTag(`${BASE_URL}/product/${path}`, lm, 'daily', pri);
  });
  console.log(`[xml-plugin] Products sitemap: ${rows.length} URLs`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
}

async function buildCategoriesSitemap(today: string): Promise<string> {
  const cats = await supaRest<CategoryRow>('categories', 'select=slug,name');
  const toSlug = (s: string) => s.toLowerCase().trim().replace(/&/g,'and').replace(/[^\w\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-');
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const c of cats) {
    const sl = c.slug || toSlug(c.name);
    if (seen.has(sl)) continue;
    seen.add(sl);
    const clean = CLEAN_CATEGORY_SLUGS[sl];
    if (clean) urls.push(urlTag(`${BASE_URL}/${clean}`, today, 'weekly', '0.85'));
  }
  console.log(`[xml-plugin] Categories sitemap: ${urls.length} URLs`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
}

async function buildBestsellersSitemap(today: string): Promise<string> {
  const rows = await supaRest<BestsellersRow>('bestsellers', 'select=slug,updated_at&is_active=eq.true');
  const urls = rows.map(b => urlTag(`${BASE_URL}/bestseller/${b.slug}`, b.updated_at?.split('T')[0] || today, 'weekly', '0.9'));
  console.log(`[xml-plugin] Bestsellers sitemap: ${rows.length} URLs`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
}

async function buildCollectionsSitemap(today: string): Promise<string> {
  const rows = await supaRest<CollectionsRow>('seo_collections', 'select=slug,updated_at&is_active=eq.true');
  const urls = rows.map(c => urlTag(`${BASE_URL}/collections/${c.slug}`, c.updated_at?.split('T')[0] || today, 'weekly', '0.85'));
  console.log(`[xml-plugin] Collections sitemap: ${rows.length} URLs`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
}

async function buildBlogSitemap(today: string): Promise<string> {
  const rows = await supaRest<BlogRow>('blog_posts', 'select=slug,published_at&is_published=eq.true&order=published_at.desc');
  const urls = rows.map(p => urlTag(`${BASE_URL}/blog/${p.slug}`, p.published_at?.split('T')[0] || today, 'monthly', '0.6'));
  console.log(`[xml-plugin] Blog sitemap: ${rows.length} URLs`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
}

async function buildGuidesSitemap(today: string): Promise<string> {
  // Combine static fallback guides + published cluster articles from DB
  const dbArticles = await supaRest<{ slug: string; updated_at: string }>(
    'cluster_articles',
    'select=slug,updated_at&status=eq.published&order=updated_at.desc&limit=500'
  );
  const dbSlugs = new Set(dbArticles.map(a => a.slug));
  
  const urls = [
    urlTag(`${BASE_URL}/guides`, today, 'weekly', '0.8'),
    ...FALLBACK_GUIDES
      .filter(slug => !dbSlugs.has(slug))
      .map(slug => urlTag(`${BASE_URL}/guides/${slug}`, today, 'monthly', slug.startsWith('best-') ? '0.8' : '0.7')),
    ...dbArticles.map(a => urlTag(`${BASE_URL}/guides/${a.slug}`, a.updated_at?.split('T')[0] || today, 'weekly', '0.8')),
  ];
  console.log(`[xml-plugin] Guides sitemap: ${urls.length - 1} URLs (${FALLBACK_GUIDES.length} static + ${dbArticles.length} from DB)`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
}

// ── Merchant Feed generation ──────────────────────────────────────────

interface MerchantProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  image_url: string | null;
  images: string[] | null;
  stock: number | null;
  category: string | null;
  sku: string | null;
  slug: string | null;
  weight: number | null;
  is_active: boolean;
}

function getPetType(category: string | null): string {
  if (!category) return 'Pets';
  const c = category.toLowerCase();
  if (c.includes('dog')) return 'Dogs';
  if (c.includes('cat')) return 'Cats';
  if (c.includes('bird')) return 'Birds';
  if (c.includes('hamster') || c.includes('guinea') || c.includes('rabbit') || c.includes('small pet')) return 'Small Pets';
  if (c.includes('fish') || c.includes('aqua')) return 'Fish';
  return 'Pets';
}

function extractBenefit(name: string, desc: string | null): string {
  const n = name.toLowerCase(); const d = (desc||'').toLowerCase();
  if (n.includes('comfort')||d.includes('comfort')) return 'Comfort & Support';
  if (n.includes('interactive')||d.includes('interactive')) return 'Interactive Play';
  if (n.includes('durable')||d.includes('durable')) return 'Long-Lasting Durability';
  if (n.includes('training')||d.includes('training')) return 'Easy Training';
  if (n.includes('calming')||d.includes('calming')||d.includes('anxiety')) return 'Stress Relief';
  if (n.includes('orthopedic')||d.includes('orthopedic')||d.includes('joint')) return 'Joint Support';
  if (n.includes('slow')&&n.includes('feed')) return 'Healthy Eating';
  if (n.includes('grooming')||d.includes('grooming')) return 'Easy Grooming';
  if (n.includes('travel')||d.includes('travel')||d.includes('portable')) return 'Travel-Friendly';
  if (n.includes('waterproof')||d.includes('waterproof')) return 'Waterproof Design';
  if (n.includes('adjustable')||d.includes('adjustable')) return 'Perfect Fit';
  if (n.includes('chew')||d.includes('chew')) return 'Safe Chewing';
  if (n.includes('scratch')||d.includes('scratch')) return 'Scratch-Friendly';
  return 'Premium Quality';
}

function getGoogleProductCategory(cat: string | null): string {
  if (!cat) return 'Animals & Pet Supplies > Pet Supplies';
  const c = cat.toLowerCase();
  if (c.includes('dog') && c.includes('bed')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Beds';
  if (c.includes('dog') && c.includes('toy')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Toys';
  if (c.includes('dog') && c.includes('collar')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Collars & Leads';
  if (c.includes('dog') && c.includes('leash')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Collars & Leads';
  if (c.includes('dog') && c.includes('groom')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Grooming Supplies';
  if (c.includes('dog')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies';
  if (c.includes('cat') && c.includes('tree')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture';
  if (c.includes('cat') && c.includes('tower')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture';
  if (c.includes('cat') && c.includes('litter')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Litter & Accessories';
  if (c.includes('cat') && c.includes('toy')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Toys';
  if (c.includes('cat') && c.includes('scratch')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Scratching Posts';
  if (c.includes('cat')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies';
  if (c.includes('bird')) return 'Animals & Pet Supplies > Pet Supplies > Bird Supplies';
  if (c.includes('hamster')||c.includes('guinea')||c.includes('rabbit')||c.includes('small pet')) return 'Animals & Pet Supplies > Pet Supplies > Small Animal Supplies';
  if (c.includes('fish')||c.includes('aqua')) return 'Animals & Pet Supplies > Pet Supplies > Fish Supplies';
  return 'Animals & Pet Supplies > Pet Supplies';
}

function getProductType(cat: string | null): string {
  if (!cat) return 'Pet Supplies';
  const c = cat.toLowerCase();
  let t = 'Pet Supplies';
  if (c.includes('dog')) t += ' > Dogs';
  else if (c.includes('cat')) t += ' > Cats';
  else if (c.includes('bird')) t += ' > Birds';
  else if (c.includes('hamster')||c.includes('guinea')||c.includes('rabbit')||c.includes('small pet')) t += ' > Small Pets';
  else if (c.includes('fish')||c.includes('aqua')) t += ' > Fish';
  else t += ' > Accessories';
  if (c.includes('bed')) t += ' > Beds';
  else if (c.includes('toy')) t += ' > Toys';
  else if (c.includes('collar')||c.includes('leash')) t += ' > Collars & Leashes';
  else if (c.includes('tree')||c.includes('tower')||c.includes('furniture')) t += ' > Furniture';
  else if (c.includes('litter')) t += ' > Litter & Accessories';
  else if (c.includes('cage')||c.includes('crate')) t += ' > Cages & Crates';
  else if (c.includes('groom')) t += ' > Grooming';
  else if (c.includes('carrier')||c.includes('travel')) t += ' > Travel';
  else if (c.includes('scratch')) t += ' > Scratchers';
  return t;
}

function getAvailability(stock: number | null, isActive: boolean | null): string {
  if (isActive === false) return 'out of stock';
  return (stock !== null && stock !== undefined && stock > 0) ? 'in stock' : 'out of stock';
}

function productItemXml(p: MerchantProduct): string {
  const url = `${BASE_URL}/product/${p.slug || p.id}`;
  const img = p.image_url || (p.images && p.images[0]) || '';
  const pet = getPetType(p.category);
  const benefit = extractBenefit(p.name, p.description);
  const title = truncate(`${p.name} for ${pet} - ${benefit}`, 150);
  let desc = `${benefit} for your ${pet.toLowerCase()}. `;
  if (p.description && stripHtml(p.description).length > 20) {
    desc += truncate(stripHtml(p.description), 4500) + ' ';
  } else {
    desc += `Premium quality ${p.name} designed for comfort and durability. `;
  }
  desc += `Free US shipping on orders over $${FREE_SHIPPING_THRESHOLD}. Fast delivery in 3-7 business days. 30-day hassle-free returns. Shop with confidence at GetPawsy.`;
  desc = truncate(desc, 5000);

  const priceStr = (v: number) => `${v.toFixed(2)} USD`;
  let priceXml: string;
  if (p.compare_at_price && p.compare_at_price > p.price) {
    priceXml = `      <g:price>${priceStr(p.compare_at_price)}</g:price>\n      <g:sale_price>${priceStr(p.price)}</g:sale_price>`;
  } else {
    priceXml = `      <g:price>${priceStr(p.price)}</g:price>`;
  }

  let extra = '';
  if (p.sku) { extra += `      <g:mpn>${esc(p.sku)}</g:mpn>\n`; }
  else { extra += `      <g:identifier_exists>no</g:identifier_exists>\n`; }
  if (p.images && p.images.length > 1) {
    for (const ai of p.images.slice(1, 11)) {
      if (ai && ai !== p.image_url) extra += `      <g:additional_image_link>${esc(ai)}</g:additional_image_link>\n`;
    }
  }
  if (p.weight) { extra += `      <g:shipping_weight>${(p.weight * 2.20462).toFixed(2)} lb</g:shipping_weight>\n`; }
  const avail = getAvailability(p.stock, p.is_active);
  const priceTier = p.price >= 50 ? 'Premium' : p.price >= 25 ? 'Mid-Range' : 'Value';

  return `    <item>
      <g:id>${esc(p.id)}</g:id>
      <g:title>${esc(title)}</g:title>
      <g:description>${esc(desc)}</g:description>
      <g:link>${esc(url)}</g:link>
      <g:image_link>${esc(img)}</g:image_link>
      <g:availability>${avail}</g:availability>
${priceXml}
      <g:condition>new</g:condition>
      <g:brand>GetPawsy</g:brand>
${extra}      <g:product_type>${esc(getProductType(p.category))}</g:product_type>
      <g:google_product_category>${esc(getGoogleProductCategory(p.category))}</g:google_product_category>
      <g:custom_label_0>${esc(pet)}</g:custom_label_0>
      <g:custom_label_1>${priceTier}</g:custom_label_1>
      <g:custom_label_2>${avail === 'in stock' ? 'Available' : 'Out-of-Stock'}</g:custom_label_2>
      <g:custom_label_3>${p.price >= FREE_SHIPPING_THRESHOLD ? 'Free-Shipping' : 'Paid-Shipping'}</g:custom_label_3>
    </item>`;
}

async function buildMerchantFeed(): Promise<string> {
  // Query products_public view (accessible via anon key, no RLS issues)
  const products = await supaRest<MerchantProduct>(
    'products_public',
    'select=id,name,description,price,compare_at_price,image_url,images,stock,category,sku,slug,weight,is_active&is_active=eq.true&is_duplicate=eq.false&order=created_at.desc&limit=5000'
  );
  console.log(`[xml-plugin] Merchant feed: ${products.length} products`);

  const now = new Date().toISOString();
  const items = products.map(p => productItemXml(p)).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>GetPawsy Product Feed</title>
    <link>${BASE_URL}/</link>
    <description>Google Merchant Center feed for GetPawsy.</description>
    <language>en-US</language>
    <lastBuildDate>${now}</lastBuildDate>
${items}
  </channel>
</rss>`;
}

// ── Vite Plugin ───────────────────────────────────────────────────────

const FALLBACK_EMPTY = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>`;
const FALLBACK_FEED = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>GetPawsy Product Feed</title><link>https://getpawsy.pet/</link><description>Google Merchant Center feed for GetPawsy.</description></channel></rss>`;

export default function sitemapPlugin(): Plugin {
  let resolvedOutDir = 'dist';
  return {
    name: 'generate-static-xml',
    apply: 'build',
    configResolved(config) {
      resolvedOutDir = config.build.outDir || 'dist';
    },
    async closeBundle() {
      const outDir = resolvedOutDir;
      mkdirSync(outDir, { recursive: true });
      console.log('[xml-plugin] Generating static XML files from Supabase REST API...');

      const today = new Date().toISOString().split('T')[0];

      // Generate all sitemaps + merchant feed in parallel
      const [index, stat, products, categories, bestsellers, collections, blog, guides, feed] =
        await Promise.all([
          buildSitemapIndex(today).catch(() => FALLBACK_EMPTY),
          Promise.resolve(buildStaticSitemap(today)),
          buildProductsSitemap(today).catch(() => FALLBACK_EMPTY),
          buildCategoriesSitemap(today).catch(() => FALLBACK_EMPTY),
          buildBestsellersSitemap(today).catch(() => FALLBACK_EMPTY),
          buildCollectionsSitemap(today).catch(() => FALLBACK_EMPTY),
          buildBlogSitemap(today).catch(() => FALLBACK_EMPTY),
          buildGuidesSitemap(today).catch(() => FALLBACK_EMPTY),
          buildMerchantFeed().catch(() => FALLBACK_FEED),
        ]);

      const files: [string, string][] = [
        ['sitemap.xml', index],
        ['sitemap-static.xml', stat],
        ['sitemap-products.xml', products],
        ['sitemap-categories.xml', categories],
        ['sitemap-bestsellers.xml', bestsellers],
        ['sitemap-collections.xml', collections],
        ['sitemap-blog.xml', blog],
        ['sitemap-guides.xml', guides],
        ['merchant-feed.xml', feed],
      ];

      for (const [name, xml] of files) {
        writeFileSync(join(outDir, name), xml, 'utf-8');
        console.log(`[xml-plugin] ✓ ${name} (${xml.length} bytes)`);
      }

      console.log('[xml-plugin] Done — all XML files generated at build time.');
    },
  };
}

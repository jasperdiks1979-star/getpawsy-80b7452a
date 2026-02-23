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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout per request
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
    if (!res.ok) {
      console.warn(`[xml-plugin] REST error ${table}: ${res.status}`);
      return [];
    }
    return (await res.json()) as T[];
  } catch (err) {
    clearTimeout(timeout);
    console.warn(`[xml-plugin] REST fetch failed for ${table}:`, err);
    return [];
  }
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

const MAX_URLS_PER_SITEMAP = 500;

function wrapUrlset(urls: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
}

/** Split URL tags into chunks of MAX_URLS_PER_SITEMAP */
function chunkUrls(urls: string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < urls.length; i += MAX_URLS_PER_SITEMAP) {
    chunks.push(urls.slice(i, i + MAX_URLS_PER_SITEMAP));
  }
  return chunks.length ? chunks : [[]];
}

async function buildSitemapIndex(today: string, productChunkCount: number, blogChunkCount: number): Promise<string> {
  const entries: string[] = [];
  entries.push(`  <sitemap>\n    <loc>${BASE_URL}/sitemap-static.xml</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>`);
  for (let i = 1; i <= productChunkCount; i++) {
    entries.push(`  <sitemap>\n    <loc>${BASE_URL}/sitemap-products-${i}.xml</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>`);
  }
  entries.push(`  <sitemap>\n    <loc>${BASE_URL}/sitemap-collections.xml</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>`);
  entries.push(`  <sitemap>\n    <loc>${BASE_URL}/sitemap-clusters.xml</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>`);
  for (let i = 1; i <= blogChunkCount; i++) {
    entries.push(`  <sitemap>\n    <loc>${BASE_URL}/sitemap-blog-${i}.xml</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>`);
  }
  entries.push(`  <sitemap>\n    <loc>${BASE_URL}/sitemap-guides.xml</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</sitemapindex>`;
}

function buildStaticSitemap(today: string): string {
  // NOTE: /cat-trees-condos removed — already in sitemap-categories.xml (duplicate)
  // NOTE: /bestsellers kept here as index-worthy listing page (individual /bestseller/:slug are noindex)
  const pages: [string,string,string][] = [
    ['/',   'daily','1.0'],
    ['/products','daily','0.95'],
    ['/bestsellers','daily','0.90'],
    ['/blog','daily','0.80'],
    ['/guides','daily','0.85'],
  ];
  const urls = pages.map(([p,cf,pr]) => urlTag(`${BASE_URL}${p}`, today, cf, pr)).join('\n');
  return wrapUrlset([urls]);
}

async function buildProductsSitemaps(today: string): Promise<string[]> {
  const rows = await supaRest<ProductRow>('products_public',
    'select=id,slug,updated_at&is_active=eq.true&is_duplicate=eq.false&order=updated_at.desc&limit=5000');
  const urls = rows.map((p, i) => {
    const lm = p.updated_at?.split('T')[0] || today;
    const path = p.slug || p.id;
    const pri = i < 100 ? '0.95' : i < 500 ? '0.85' : '0.75';
    return urlTag(`${BASE_URL}/product/${path}`, lm, 'weekly', pri);
  });
  const chunks = chunkUrls(urls);
  console.log(`[xml-plugin] Products: ${rows.length} URLs → ${chunks.length} sitemap(s)`);
  return chunks.map(chunk => wrapUrlset(chunk));
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

async function buildBlogSitemaps(today: string): Promise<string[]> {
  const rows = await supaRest<BlogRow>('blog_posts', 'select=slug,published_at&is_published=eq.true&order=published_at.desc');
  const urls = rows.map(p => urlTag(`${BASE_URL}/blog/${p.slug}`, p.published_at?.split('T')[0] || today, 'monthly', '0.6'));
  const chunks = chunkUrls(urls);
  console.log(`[xml-plugin] Blog: ${rows.length} URLs → ${chunks.length} sitemap(s)`);
  return chunks.map(chunk => wrapUrlset(chunk));
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

// ── Title optimization helpers ────────────────────────────────────────

/** Remove filler words and CJ junk from product names */
function cleanProductName(name: string): string {
  return name
    .replace(/,?\s*premium quality/gi, '')
    .replace(/,?\s*high quality/gi, '')
    .replace(/,?\s*best quality/gi, '')
    .replace(/,?\s*top quality/gi, '')
    .replace(/,?\s*new arrival/gi, '')
    .replace(/,?\s*hot sale/gi, '')
    .replace(/,?\s*free shipping/gi, '')
    .replace(/,?\s*fast delivery/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
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
  if (n.includes('orthopedic')||d.includes('orthopedic')||d.includes('joint')) return 'Joint & Hip Support';
  if (n.includes('calming')||d.includes('calming')||d.includes('anxiety')) return 'Anxiety Relief';
  if (n.includes('interactive')||d.includes('interactive')) return 'Interactive Enrichment';
  if (n.includes('slow')&&(n.includes('feed')||n.includes('bowl'))) return 'Healthy Slow Feeding';
  if (n.includes('waterproof')||d.includes('waterproof')) return 'Waterproof Protection';
  if (n.includes('scratch')||d.includes('scratch')) return 'Natural Scratching';
  if (n.includes('grooming')||d.includes('grooming')) return 'Easy Grooming';
  if (n.includes('training')||d.includes('training')) return 'Effective Training';
  if (n.includes('travel')||d.includes('travel')||d.includes('portable')) return 'Travel Ready';
  if (n.includes('adjustable')||d.includes('adjustable')) return 'Adjustable Fit';
  if (n.includes('chew')||d.includes('chew')) return 'Safe Chewing';
  if (n.includes('comfort')||d.includes('comfort')) return 'Maximum Comfort';
  if (n.includes('durable')||d.includes('durable')) return 'Built to Last';
  if (n.includes('memory foam')||d.includes('memory foam')) return 'Memory Foam Support';
  if (n.includes('elevated')||d.includes('elevated')) return 'Elevated Design';
  if (n.includes('enclosed')||d.includes('enclosed')||n.includes('covered')) return 'Enclosed Privacy';
  if (n.includes('collapsible')||d.includes('collapsible')||n.includes('foldable')) return 'Space-Saving Design';
  return 'Everyday Comfort';
}

/** Extract a size/variant hint from the product name */
function extractVariant(name: string): string | null {
  // Look for size patterns like S/M/L/XL, dimensions, or color keywords
  const sizeMatch = name.match(/\b(X{0,2}[SML]|XXL|Small|Medium|Large|Extra Large)\b/i);
  if (sizeMatch) return sizeMatch[0];
  const dimMatch = name.match(/\b(\d+["'']?\s*[xX×]\s*\d+)/);
  if (dimMatch) return dimMatch[0];
  return null;
}

/** Category-to-primary-keyword map for feed title optimization */
const CATEGORY_PRIMARY_KEYWORDS: Record<string, string> = {
  'dog-toys': 'Dog Toy',
  'dog-bowls-feeders': 'Dog Bowl',
  'dog-beds': 'Dog Bed',
  'dog-houses': 'Dog House',
  'dog-carriers': 'Dog Carrier',
  'dog-collars-leashes': 'Dog Collar',
  'dog-grooming': 'Dog Grooming',
  'dog-clothing': 'Dog Clothing',
  'dog-food-treats': 'Dog Treats',
  'cat-toys': 'Cat Toy',
  'cat-litter-boxes': 'Cat Litter Box',
  'cat-scratching-posts': 'Cat Scratching Post',
  'cat-trees-and-condos': 'Cat Tree',
  'cat-furniture': 'Cat Furniture',
  'cat-beds': 'Cat Bed',
  'cat-bowls-feeders': 'Cat Feeder',
  'cat-carriers': 'Cat Carrier',
  'cat-hammocks': 'Cat Hammock',
  'cat-houses': 'Cat House',
  'cat-exercise-wheels': 'Cat Exercise Wheel',
  'bird-toys': 'Bird Toy',
  'bird-cages': 'Bird Cage',
  'bird-perches': 'Bird Perch',
  'bird-bowls-feeders': 'Bird Feeder',
};

/** Detect high-intent keyword qualifiers from name/description */
function getKeywordQualifier(name: string, desc: string | null): string | null {
  const n = name.toLowerCase(); const d = (desc||'').toLowerCase();
  if (n.includes('interactive') || d.includes('interactive')) return 'Interactive';
  if (n.includes('indestructible') || d.includes('indestructible')) return 'Indestructible';
  if ((n.includes('aggressive') && n.includes('chew')) || d.includes('aggressive chewer')) return 'Aggressive Chewer';
  if (n.includes('automatic') || d.includes('automatic')) return 'Automatic';
  if (n.includes('slow feed') || n.includes('slow feeder')) return 'Slow Feeder';
  if (n.includes('no spill') || n.includes('no-spill') || d.includes('no spill')) return 'No-Spill';
  if (n.includes('self clean') || n.includes('self-clean') || d.includes('self cleaning')) return 'Self-Cleaning';
  if (n.includes('enclosed') || d.includes('enclosed')) return 'Enclosed';
  if (n.includes('odor') || d.includes('odor control')) return 'Odor Control';
  if (n.includes('wall mount') || d.includes('wall mount')) return 'Wall-Mounted';
  if (n.includes('window perch') || d.includes('window perch')) return 'Window Perch';
  if (n.includes('enrichment') || d.includes('enrichment')) return 'Enrichment';
  return null;
}

/** Build optimized title: [Primary Keyword] – [Benefit] | [Variant] */
function buildOptimizedTitle(p: MerchantProduct): string {
  const cleanName = cleanProductName(p.name);
  const pet = getPetType(p.category);
  const benefit = extractBenefit(p.name, p.description);
  const variant = extractVariant(p.name);
  const catSlug = (p.category || '').toLowerCase().replace(/\s+/g, '-');

  // Get primary keyword from category map
  const primaryKw = CATEGORY_PRIMARY_KEYWORDS[catSlug];
  const qualifier = getKeywordQualifier(p.name, p.description);

  let title: string;
  if (primaryKw && qualifier) {
    // "Interactive Dog Toy – Clean Name – Benefit"
    title = `${qualifier} ${primaryKw} – ${cleanName} – ${benefit}`;
  } else if (primaryKw) {
    // "Dog Toy – Clean Name – Benefit"
    title = `${primaryKw} – ${cleanName} – ${benefit}`;
  } else {
    // Fallback: "Clean Name for Dogs – Benefit"
    title = `${cleanName} for ${pet} – ${benefit}`;
  }

  // Append variant if it fits
  if (variant && title.length + variant.length + 3 <= 150) {
    title += ` | ${variant}`;
  }
  return truncate(title, 150);
}

// ── Description optimization ──────────────────────────────────────────

/** Strip HTML, CJ image URLs, supplier references, and formatting junk */
function cleanDescription(html: string | null): string {
  if (!html) return '';
  return html
    // Remove img tags (CJ product images in descriptions)
    .replace(/<img[^>]*>/gi, '')
    // Remove CJ/supplier URLs
    .replace(/https?:\/\/[^\s<"']*cj(dropshipping|\.com)[^\s<"']*/gi, '')
    .replace(/https?:\/\/oss-cf\.[^\s<"']*/gi, '')
    // Remove common CJ formatting headers
    .replace(/<b>\s*Product Image:?\s*<\/b>/gi, '')
    .replace(/<b>\s*Packing list:?\s*<\/b>/gi, '')
    .replace(/<b>\s*Product information:?\s*<\/b>/gi, '')
    // Strip remaining HTML
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // Clean up whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract meaningful specs from the cleaned description */
function extractSpecs(cleaned: string): string[] {
  const specs: string[] = [];
  // Look for "Material: X" patterns
  const materialMatch = cleaned.match(/Material:\s*([^,.\n]+)/i);
  if (materialMatch) specs.push(`Made with ${materialMatch[1].trim()}`);
  // Look for "Size: X" patterns
  const sizeMatch = cleaned.match(/Size[s]?:\s*([^.\n]+)/i);
  if (sizeMatch) specs.push(`Available sizes: ${sizeMatch[1].trim()}`);
  return specs;
}

/** Build a problem → benefit → bullets → shipping description */
function buildOptimizedDescription(p: MerchantProduct): string {
  const pet = getPetType(p.category).toLowerCase();
  const benefit = extractBenefit(p.name, p.description);
  const cleaned = cleanDescription(p.description);
  const specs = extractSpecs(cleaned);

  // Problem statement based on category
  const problems: Record<string, string> = {
    'dogs': 'Finding the right product for your dog can be overwhelming.',
    'cats': 'Your cat deserves products designed for their unique needs.',
    'birds': 'Keep your feathered friend happy with the right supplies.',
    'small pets': 'Small pets need specialized care products.',
    'fish': 'Create the perfect aquatic environment.',
    'pets': 'Every pet deserves quality products that last.',
  };
  const problem = problems[pet] || problems['pets'];

  // Build benefit bullets
  const bullets: string[] = [
    `✓ ${benefit} for your ${pet}`,
  ];
  if (cleaned.length > 30) {
    // Extract first meaningful sentence from cleaned description
    const firstSentence = cleaned.split(/[.!?]/).filter(s => s.trim().length > 15)[0];
    if (firstSentence) bullets.push(`✓ ${truncate(firstSentence.trim(), 80)}`);
  }
  specs.forEach(s => bullets.push(`✓ ${truncate(s, 80)}`));
  bullets.push('✓ Durable, pet-safe materials');
  if (p.price >= FREE_SHIPPING_THRESHOLD) {
    bullets.push('✓ FREE US shipping included');
  }
  // Cap at 6 bullets
  const finalBullets = bullets.slice(0, 6);

  let desc = `${problem} The ${cleanProductName(p.name)} delivers ${benefit.toLowerCase()} that ${pet} love. `;
  desc += finalBullets.join('. ') + '. ';
  desc += `Ships from US warehouses in 3-7 business days. Free shipping on orders over $${FREE_SHIPPING_THRESHOLD}. 30-day hassle-free returns. Shop GetPawsy – Trusted by US pet parents.`;

  return truncate(desc, 5000);
}

// ── Google taxonomy & product type ────────────────────────────────────

function getGoogleProductCategory(cat: string | null): string {
  if (!cat) return 'Animals & Pet Supplies > Pet Supplies';
  const c = cat.toLowerCase();
  if (c.includes('dog') && c.includes('bed')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Beds';
  if (c.includes('dog') && c.includes('toy')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Toys';
  if (c.includes('dog') && (c.includes('collar')||c.includes('leash'))) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Collars & Leads';
  if (c.includes('dog') && c.includes('groom')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Grooming Supplies';
  if (c.includes('dog') && c.includes('carrier')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Carriers & Travel';
  if (c.includes('dog') && c.includes('bowl')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Bowls & Feeders';
  if (c.includes('dog') && c.includes('house')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Houses';
  if (c.includes('dog') && c.includes('train')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Training Aids';
  if (c.includes('dog') && c.includes('food')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Food';
  if (c.includes('dog')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies';
  if (c.includes('cat') && (c.includes('tree')||c.includes('tower')||c.includes('condo'))) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture';
  if (c.includes('cat') && c.includes('litter')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Litter Box Supplies';
  if (c.includes('cat') && c.includes('toy')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Toys';
  if (c.includes('cat') && c.includes('scratch')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture';
  if (c.includes('cat') && c.includes('bed')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Beds';
  if (c.includes('cat') && c.includes('carrier')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Carriers & Travel';
  if (c.includes('cat') && c.includes('house')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Houses & Condos';
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
  else if (c.includes('tree')||c.includes('tower')||c.includes('furniture')||c.includes('condo')) t += ' > Furniture';
  else if (c.includes('litter')) t += ' > Litter & Accessories';
  else if (c.includes('cage')||c.includes('crate')) t += ' > Cages & Crates';
  else if (c.includes('groom')) t += ' > Grooming';
  else if (c.includes('carrier')||c.includes('travel')) t += ' > Travel';
  else if (c.includes('scratch')) t += ' > Scratchers';
  else if (c.includes('bowl')||c.includes('feed')) t += ' > Bowls & Feeders';
  else if (c.includes('house')) t += ' > Houses';
  else if (c.includes('train')) t += ' > Training';
  return t;
}

function getAvailability(stock: number | null, isActive: boolean | null): string {
  if (isActive === false) return 'out of stock';
  return (stock !== null && stock !== undefined && stock > 0) ? 'in stock' : 'out of stock';
}

/** Determine current season for custom_label_2 */
function getCurrentSeason(): string {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return 'Spring';
  if (month >= 6 && month <= 8) return 'Summer';
  if (month >= 9 && month <= 11) return 'Fall';
  return 'Winter';
}

function productItemXml(p: MerchantProduct, bestsellersSet: Set<string>): string {
  const url = `${BASE_URL}/product/${p.slug || p.id}`;
  const img = p.image_url || (p.images && p.images[0]) || '';
  const title = buildOptimizedTitle(p);
  const desc = buildOptimizedDescription(p);

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
  const season = getCurrentSeason();

  // Custom labels per spec
  // custom_label_0: margin tier (based on price vs compare_at_price)
  const margin = p.compare_at_price && p.compare_at_price > 0
    ? ((p.compare_at_price - p.price) / p.compare_at_price * 100)
    : 0;
  const marginTier = margin >= 40 ? 'High-Margin' : margin >= 20 ? 'Mid-Margin' : 'Low-Margin';

  // custom_label_1: bestseller flag
  const isBestseller = bestsellersSet.has(p.id);

  // Shipping element (US, 3-7 business days)
  const shippingCost = p.price >= FREE_SHIPPING_THRESHOLD ? '0.00' : '5.99';

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
      <g:shipping>
        <g:country>US</g:country>
        <g:service>Standard</g:service>
        <g:price>${shippingCost} USD</g:price>
      </g:shipping>
      <g:custom_label_0>${marginTier}</g:custom_label_0>
      <g:custom_label_1>${isBestseller ? 'Bestseller' : 'Standard'}</g:custom_label_1>
      <g:custom_label_2>${season}</g:custom_label_2>
      <g:custom_label_3>${p.price >= FREE_SHIPPING_THRESHOLD ? 'Free-Shipping' : 'Paid-Shipping'}</g:custom_label_3>
    </item>`;
}

async function buildMerchantFeed(): Promise<string> {
  // Fetch products + bestsellers in parallel
  const [products, bestsellers] = await Promise.all([
    supaRest<MerchantProduct>(
      'products_public',
      'select=id,name,description,price,compare_at_price,image_url,images,stock,category,sku,slug,weight,is_active&is_active=eq.true&is_duplicate=eq.false&order=created_at.desc&limit=5000'
    ),
    supaRest<{ product_id: string }>('bestsellers', 'select=product_id&is_active=eq.true'),
  ]);

  const bestsellersSet = new Set(bestsellers.map(b => b.product_id));
  console.log(`[xml-plugin] Merchant feed: ${products.length} products, ${bestsellersSet.size} bestsellers`);

  const now = new Date().toISOString();
  const items = products.map(p => productItemXml(p, bestsellersSet)).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>GetPawsy Product Feed</title>
    <link>${BASE_URL}/</link>
    <description>Google Merchant Center US Shopping feed – GetPawsy pet supplies.</description>
    <language>en-US</language>
    <lastBuildDate>${now}</lastBuildDate>
${items}
  </channel>
</rss>`;
}

// ── Merchant Diagnostics ──────────────────────────────────────────────

async function buildMerchantDiagnostics(): Promise<string> {
  const products = await supaRest<MerchantProduct>(
    'products_public',
    'select=id,name,description,price,compare_at_price,image_url,images,stock,category,sku,slug,weight,is_active&is_active=eq.true&is_duplicate=eq.false&order=created_at.desc&limit=5000'
  );

  const issues: string[] = [];
  const titlesSeen = new Map<string, string[]>();

  const imagesSeen = new Map<string, string[]>();

  for (const p of products) {
    const pid = p.id;
    const name = p.name || '(unnamed)';

    // Missing GTIN / SKU
    if (!p.sku) {
      issues.push(`    <issue type="missing_gtin" product_id="${esc(pid)}" name="${esc(truncate(name, 80))}" />`);
    }
    // Missing image
    if (!p.image_url && (!p.images || p.images.length === 0)) {
      issues.push(`    <issue type="missing_image" product_id="${esc(pid)}" name="${esc(truncate(name, 80))}" />`);
    }
    // Overlength title (raw name > 150 chars)
    if (name.length > 150) {
      issues.push(`    <issue type="overlength_title" product_id="${esc(pid)}" name="${esc(truncate(name, 80))}" length="${name.length}" />`);
    }
    // Short title (under 40 chars)
    if (name.length < 40) {
      issues.push(`    <issue type="short_title" product_id="${esc(pid)}" name="${esc(truncate(name, 80))}" length="${name.length}" />`);
    }
    // Out of stock
    if (!p.stock || p.stock <= 0) {
      issues.push(`    <issue type="out_of_stock" product_id="${esc(pid)}" name="${esc(truncate(name, 80))}" stock="${p.stock ?? 'null'}" />`);
    }
    // Missing compare_at_price (no margin data)
    if (!p.compare_at_price || p.compare_at_price <= 0) {
      issues.push(`    <issue type="missing_compare_at_price" product_id="${esc(pid)}" name="${esc(truncate(name, 80))}" />`);
    }
    // Track duplicate titles
    const normTitle = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!titlesSeen.has(normTitle)) titlesSeen.set(normTitle, []);
    titlesSeen.get(normTitle)!.push(pid);
    // Track duplicate images
    const primaryImg = p.image_url || '';
    if (primaryImg) {
      if (!imagesSeen.has(primaryImg)) imagesSeen.set(primaryImg, []);
      imagesSeen.get(primaryImg)!.push(pid);
    }
  }

  // Add duplicate title issues
  for (const [, ids] of titlesSeen) {
    if (ids.length > 1) {
      issues.push(`    <issue type="duplicate_title" product_ids="${ids.join(',')}" count="${ids.length}" />`);
    }
  }
  // Add duplicate image issues
  for (const [imgUrl, ids] of imagesSeen) {
    if (ids.length > 1) {
      issues.push(`    <issue type="duplicate_image" image_url="${esc(truncate(imgUrl, 120))}" product_ids="${ids.join(',')}" count="${ids.length}" />`);
    }
  }

  const counts = {
    total: products.length,
    missing_gtin: issues.filter(i => i.includes('missing_gtin')).length,
    missing_image: issues.filter(i => i.includes('missing_image')).length,
    overlength: issues.filter(i => i.includes('overlength_title')).length,
    short_title: issues.filter(i => i.includes('short_title')).length,
    oos: issues.filter(i => i.includes('out_of_stock')).length,
    duplicates: issues.filter(i => i.includes('duplicate_title')).length,
    duplicate_images: issues.filter(i => i.includes('duplicate_image')).length,
    missing_compare_at_price: issues.filter(i => i.includes('missing_compare_at_price')).length,
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<merchant_diagnostics generated="${new Date().toISOString()}" total_products="${counts.total}">
  <summary>
    <missing_gtin>${counts.missing_gtin}</missing_gtin>
    <missing_image>${counts.missing_image}</missing_image>
    <overlength_title>${counts.overlength}</overlength_title>
    <short_title>${counts.short_title}</short_title>
    <out_of_stock>${counts.oos}</out_of_stock>
    <duplicate_titles>${counts.duplicates}</duplicate_titles>
    <duplicate_images>${counts.duplicate_images}</duplicate_images>
    <missing_compare_at_price>${counts.missing_compare_at_price}</missing_compare_at_price>
  </summary>
  <issues>
${issues.join('\n')}
  </issues>
</merchant_diagnostics>`;
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
      console.log('[xml-plugin] Generating static XML files...');

      // Write fallback files FIRST so build always has valid XML
      const fallbackNames = [
        'sitemap-index.xml', 'sitemap.xml', 'sitemap-static.xml',
        'sitemap-products-1.xml', 'sitemap-products-2.xml',
        'sitemap-collections.xml', 'sitemap-clusters.xml',
        'sitemap-blog-1.xml', 'sitemap-blog-2.xml',
        'sitemap-guides.xml',
        'merchant-feed.xml', 'merchant-diagnostics.xml',
      ];
      const FALLBACK_INDEX = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap><loc>${BASE_URL}/sitemap-static.xml</loc></sitemap>\n  <sitemap><loc>${BASE_URL}/sitemap-products-1.xml</loc></sitemap>\n  <sitemap><loc>${BASE_URL}/sitemap-products-2.xml</loc></sitemap>\n  <sitemap><loc>${BASE_URL}/sitemap-collections.xml</loc></sitemap>\n  <sitemap><loc>${BASE_URL}/sitemap-clusters.xml</loc></sitemap>\n  <sitemap><loc>${BASE_URL}/sitemap-blog-1.xml</loc></sitemap>\n  <sitemap><loc>${BASE_URL}/sitemap-guides.xml</loc></sitemap>\n</sitemapindex>`;
      for (const name of fallbackNames) {
        let fallback: string;
        if (name.includes('merchant-feed')) {
          fallback = FALLBACK_FEED;
        } else if (name.includes('merchant-diagnostics')) {
          fallback = `<?xml version="1.0" encoding="UTF-8"?>\n<merchant_diagnostics status="fallback" />`;
        } else if (name === 'sitemap-index.xml' || name === 'sitemap.xml') {
          fallback = FALLBACK_INDEX;
        } else {
          fallback = FALLBACK_EMPTY;
        }
        writeFileSync(join(outDir, name), fallback, 'utf-8');
      }
      console.log('[xml-plugin] ✓ Fallback XML files written');

      // Now try to generate real XML from Supabase (non-blocking)
      try {
        await Promise.race([
          (async () => {
            const today = new Date().toISOString().split('T')[0];

            const [stat, productChunks, collections, blog_chunks, guides, feed, diagnostics] =
              await Promise.all([
                Promise.resolve(buildStaticSitemap(today)),
                buildProductsSitemaps(today).catch(() => [FALLBACK_EMPTY]),
                buildCollectionsSitemap(today).catch(() => FALLBACK_EMPTY),
                buildBlogSitemaps(today).catch(() => [FALLBACK_EMPTY]),
                buildGuidesSitemap(today).catch(() => FALLBACK_EMPTY),
                buildMerchantFeed().catch(() => FALLBACK_FEED),
                buildMerchantDiagnostics().catch(() => `<?xml version="1.0" encoding="UTF-8"?>\n<merchant_diagnostics error="build_failed" />`),
              ]);

            // Build index with actual chunk counts
            const index = await buildSitemapIndex(today, productChunks.length, blog_chunks.length).catch(
              () => `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>`
            );

            const files: [string, string][] = [
              ['sitemap-index.xml', index],
              ['sitemap.xml', index], // keep sitemap.xml as alias for backward compat
              ['sitemap-static.xml', stat],
              ['sitemap-collections.xml', collections],
              ['sitemap-guides.xml', guides],
              ['merchant-feed.xml', feed],
              ['merchant-diagnostics.xml', diagnostics],
            ];

            // Write product chunk files
            productChunks.forEach((xml, i) => {
              files.push([`sitemap-products-${i + 1}.xml`, xml]);
            });

            // Write blog chunk files
            blog_chunks.forEach((xml, i) => {
              files.push([`sitemap-blog-${i + 1}.xml`, xml]);
            });

            for (const [name, xml] of files) {
              writeFileSync(join(outDir, name), xml, 'utf-8');
              console.log(`[xml-plugin] ✓ ${name} (${xml.length} bytes)`);
            }

            console.log('[xml-plugin] Done — all XML files generated.');
          })(),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('XML generation timed out')), 30000)
          ),
        ]);
      } catch (err) {
        console.warn('[xml-plugin] ⚠️ XML generation failed/timed out, fallbacks in place:', err);
      }
    },
  };
}

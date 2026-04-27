/**
 * Vite plugin that:
 * 1. Runs sitemap generation at buildStart (writes into /public so Vite copies to /dist)
 * 2. Generates merchant-feed XML at closeBundle (writes into /dist directly)
 *
 * Sitemap generation is embedded here because Lovable Cloud does NOT run
 * package.json "prebuild" scripts. This ensures sitemaps are always fresh.
 */
import type { Plugin } from 'vite';
import { writeFileSync, mkdirSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { join, relative } from 'path';
import { execSync } from 'child_process';
import { products as staticProducts } from './src/data/products';

const BASE_URL = 'https://getpawsy.pet';
const SUPABASE_URL = 'https://nojvgfbcjgipjxpfatmm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vanZnZmJjamdpcGp4cGZhdG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTMxOTYsImV4cCI6MjA4Mzk4OTE5Nn0.gfjmYf9aB-BCIrCnH14Zmnm6GBEKX7QMWP1ELL_i9dc';
const FREE_SHIPPING_THRESHOLD = 35; // Aligned with site policy ($35+)

// ── Supabase REST helper ──────────────────────────────────────────────

async function supaRest<T>(table: string, params: string): Promise<T[]> {
  const controller = new AbortController();
  const TIMEOUT_MS = 15000;
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
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
    const elapsedMs = Date.now() - startedAt;
    const totalCount = res.headers.get('content-range')?.split('/')?.[1] ?? 'unknown';
    if (!res.ok) {
      const body = await res.text().catch(() => '<unreadable>');
      console.warn(
        `[xml-plugin][supaRest] ❌ HTTP ${res.status} ${res.statusText} on "${table}" after ${elapsedMs}ms — body: ${body.slice(0, 300)}`
      );
      return [];
    }
    const data = (await res.json()) as T[];
    console.log(
      `[xml-plugin][supaRest] ✓ ${table} → ${data.length} rows (server total=${totalCount}) in ${elapsedMs}ms`
    );
    return data;
  } catch (err: unknown) {
    clearTimeout(timeout);
    const elapsedMs = Date.now() - startedAt;
    const e = err as { name?: string; message?: string; cause?: unknown };
    const isAbort = e?.name === 'AbortError';
    const reason = isAbort
      ? `TIMEOUT after ${elapsedMs}ms (limit=${TIMEOUT_MS}ms)`
      : `${e?.name ?? 'Error'}: ${e?.message ?? String(err)}`;
    console.warn(
      `[xml-plugin][supaRest] ❌ fetch failed for "${table}" — ${reason}` +
        (e?.cause ? ` | cause=${JSON.stringify(e.cause).slice(0, 200)}` : '')
    );
    return [];
  }
}

// ── XML helpers ───────────────────────────────────────────────────────

function stripInvalidXmlChars(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\uD800-\uDFFF]/g, '');
}

function esc(text: string): string {
  const safe = stripInvalidXmlChars(text);
  return safe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cdata(text: string): string {
  return `<![CDATA[${stripInvalidXmlChars(text).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

type XmlContent =
  | { type: 'text'; value: string }
  | { type: 'cdata'; value: string };

interface XmlNode {
  name: string;
  attributes?: Record<string, string>;
  children?: Array<XmlNode | XmlContent>;
}

function xmlText(value: string): XmlContent {
  return { type: 'text', value };
}

function xmlCdata(value: string): XmlContent {
  return { type: 'cdata', value };
}

function xmlNode(name: string, children: Array<XmlNode | XmlContent>, attributes?: Record<string, string>): XmlNode {
  return { name, attributes, children };
}

function serializeXmlContent(content: XmlContent): string {
  return content.type === 'cdata' ? cdata(content.value) : esc(content.value);
}

function serializeXmlNode(node: XmlNode, indent = 0): string {
  const spacing = ' '.repeat(indent);
  const attrs = node.attributes
    ? Object.entries(node.attributes)
        .map(([key, value]) => ` ${key}="${esc(value)}"`)
        .join('')
    : '';
  const children = node.children ?? [];

  if (children.length === 0) {
    return `${spacing}<${node.name}${attrs}></${node.name}>`;
  }

  if (children.length === 1 && 'type' in children[0]) {
    return `${spacing}<${node.name}${attrs}>${serializeXmlContent(children[0])}</${node.name}>`;
  }

  const childLines = children.map((child) =>
    'type' in child ? `${' '.repeat(indent + 2)}${serializeXmlContent(child)}` : serializeXmlNode(child, indent + 2)
  );

  return `${spacing}<${node.name}${attrs}>\n${childLines.join('\n')}\n${spacing}</${node.name}>`;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.substring(0, max - 3) + '...';
}

const GOOGLE_FEED_TITLE = 'GetPawsy Product Feed';
const GOOGLE_FEED_DESCRIPTION = 'Google Merchant product feed';
const GOOGLE_FEED_ROOT = '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">';
const FEED_ARTIFACTS = ['merchant-feed.xml', 'google-shopping-feed.xml', 'google-feed.xml'] as const;
const FEED_DEBUG_ARTIFACTS = ['feed-source-preview', 'feed-check'] as const;

function renderGoogleFeedXml(items: XmlNode[], generatedAt = new Date().toISOString()): string {
  const rss = xmlNode(
    'rss',
    [
      xmlNode('channel', [
        xmlNode('title', [xmlText(GOOGLE_FEED_TITLE)]),
        xmlNode('link', [xmlText(BASE_URL)]),
        xmlNode('description', [xmlText(GOOGLE_FEED_DESCRIPTION)]),
        xmlNode('lastBuildDate', [xmlText(generatedAt)]),
        ...items,
      ]),
    ],
    {
      version: '2.0',
      'xmlns:g': 'http://base.google.com/ns/1.0',
    }
  );

  return `<?xml version="1.0" encoding="UTF-8"?>\n${serializeXmlNode(rss)}\n`;
}

function assertGoogleFeedValid(content: string, label: string): void {
  const requiredTokens = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    GOOGLE_FEED_ROOT,
    '<channel>',
    '<item>',
    '</channel>',
    '</rss>',
  ];

  for (const token of requiredTokens) {
    if (!content.includes(token)) {
      throw new Error(`[xml-plugin] ${label} missing required token: ${token}`);
    }
  }

  const lower = content.toLowerCase();
  if (lower.includes('<!doctype html') || lower.includes('<html') || lower.includes('</script>')) {
    throw new Error(`[xml-plugin] ${label} contains HTML instead of XML`);
  }
}

function assertGoogleFeedFirst30Lines(content: string, label: string): string[] {
  const first30Lines = content.split('\n').slice(0, 30);
  const preview = first30Lines.join('\n');

  for (const token of ['<?xml version="1.0" encoding="UTF-8"?>', '<rss', '<channel>', '<item>']) {
    if (!preview.includes(token)) {
      throw new Error(`[xml-plugin] ${label} first 30 lines missing required token: ${token}`);
    }
  }

  return first30Lines;
}

function buildFeedSourcePreview(feedXml: string, sourceFile: string): string {
  const lines = feedXml.split('\n').slice(0, 20);

  return JSON.stringify(
    {
      served_file_path: sourceFile,
      first_20_lines_live_body: lines,
      contains_rss: feedXml.includes('<rss'),
      contains_channel: feedXml.includes('<channel>'),
      contains_item: feedXml.includes('<item>'),
      source_file_used_for_google_feed: sourceFile,
      first_20_lines_of_final_google_feed_file: lines,
      contains_rss_tag: feedXml.includes('<rss'),
      contains_item_tag: feedXml.includes('<item>'),
      deployed_at: new Date().toISOString(),
    },
    null,
    2
  );
}

function buildFeedCheck(feedXml: string): string {
  const normalized = feedXml.trimStart();
  const first30Lines = assertGoogleFeedFirst30Lines(normalized, 'google-feed.xml');

  return JSON.stringify(
    {
      is_xml: normalized.startsWith('<?xml') && normalized.includes('<rss') && normalized.includes('<channel>'),
      contains_rss: feedXml.includes('<rss'),
      contains_channel: feedXml.includes('<channel>'),
      contains_item: feedXml.includes('<item>'),
      content_type: 'application/xml',
      first_30_lines_of_google_feed_xml: first30Lines,
      file_size_bytes: Buffer.byteLength(feedXml, 'utf8'),
    },
    null,
    2
  );
}

function overwriteFile(filePath: string, content: string): void {
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
  writeFileSync(filePath, content, 'utf-8');
}

function clearFeedArtifacts(baseDir: string): void {
  for (const file of FEED_ARTIFACTS) {
    const filePath = join(baseDir, file);
    if (existsSync(filePath)) unlinkSync(filePath);
  }

  for (const file of FEED_DEBUG_ARTIFACTS) {
    const filePath = join(baseDir, 'api', file);
    if (existsSync(filePath)) unlinkSync(filePath);
  }
}

function writeFeedArtifacts(baseDir: string, merchantFeed: string, sourceFile?: string): void {
  const resolvedSourceFile = sourceFile || relative(process.cwd(), join(baseDir, 'google-feed.xml'));
  const feedPreview = buildFeedSourcePreview(merchantFeed, resolvedSourceFile);
  const feedCheck = buildFeedCheck(merchantFeed);

  overwriteFile(join(baseDir, 'merchant-feed.xml'), merchantFeed);
  overwriteFile(join(baseDir, 'google-shopping-feed.xml'), merchantFeed);
  overwriteFile(join(baseDir, 'google-feed.xml'), merchantFeed);
  mkdirSync(join(baseDir, 'api'), { recursive: true });
  overwriteFile(join(baseDir, 'api', 'feed-source-preview'), feedPreview);
  overwriteFile(join(baseDir, 'api', 'feed-check'), feedCheck);
}

function logFeedPreview(label: string, content: string): void {
  const lines = assertGoogleFeedFirst30Lines(content, label);
  console.log(`[xml-plugin] ${label} first 30 lines:`);
  lines.forEach((line, index) => console.log(`[xml-plugin] ${String(index + 1).padStart(2, '0')}: ${line}`));
  console.log(
    `[xml-plugin] ${label} contains tags: <rss>=${content.includes('<rss')} <channel>=${content.includes('<channel>')} <item>=${content.includes('<item>')}`
  );
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

function extractVariant(name: string): string | null {
  const sizeMatch = name.match(/\b(X{0,2}[SML]|XXL|Small|Medium|Large|Extra Large)\b/i);
  if (sizeMatch) return sizeMatch[0];
  const dimMatch = name.match(/\b(\d+["'']?\s*[xX×]\s*\d+)/);
  if (dimMatch) return dimMatch[0];
  return null;
}

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

function buildOptimizedTitle(p: MerchantProduct): string {
  const cleanName = cleanProductName(p.name);
  const pet = getPetType(p.category);
  const benefit = extractBenefit(p.name, p.description);
  const variant = extractVariant(p.name);
  const catSlug = (p.category || '').toLowerCase().replace(/\s+/g, '-');
  const primaryKw = CATEGORY_PRIMARY_KEYWORDS[catSlug];
  const qualifier = getKeywordQualifier(p.name, p.description);

  let title: string;
  if (primaryKw && qualifier) {
    title = `${qualifier} ${primaryKw} – ${cleanName} – ${benefit}`;
  } else if (primaryKw) {
    title = `${primaryKw} – ${cleanName} – ${benefit}`;
  } else {
    title = `${cleanName} for ${pet} – ${benefit}`;
  }
  if (variant && title.length + variant.length + 3 <= 150) {
    title += ` | ${variant}`;
  }
  return truncate(title, 150);
}

// ── Description optimization ──────────────────────────────────────────

function cleanDescription(html: string | null): string {
  if (!html) return '';
  return html
    .replace(/<img[^>]*>/gi, '')
    .replace(/https?:\/\/[^\s<"']*cj(dropshipping|\.com)[^\s<"']*/gi, '')
    .replace(/https?:\/\/oss-cf\.[^\s<"']*/gi, '')
    .replace(/<b>\s*Product Image:?\s*<\/b>/gi, '')
    .replace(/<b>\s*Packing list:?\s*<\/b>/gi, '')
    .replace(/<b>\s*Product information:?\s*<\/b>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSpecs(cleaned: string): string[] {
  const specs: string[] = [];
  const materialMatch = cleaned.match(/Material:\s*([^,.\n]+)/i);
  if (materialMatch) specs.push(`Made with ${materialMatch[1].trim()}`);
  const sizeMatch = cleaned.match(/Size[s]?:\s*([^.\n]+)/i);
  if (sizeMatch) specs.push(`Available sizes: ${sizeMatch[1].trim()}`);
  return specs;
}

function buildOptimizedDescription(p: MerchantProduct): string {
  const pet = getPetType(p.category).toLowerCase();
  const benefit = extractBenefit(p.name, p.description);
  const cleaned = cleanDescription(p.description);
  const specs = extractSpecs(cleaned);

  const problems: Record<string, string> = {
    'dogs': 'Finding the right product for your dog can be overwhelming.',
    'cats': 'Your cat deserves products designed for their unique needs.',
    'birds': 'Keep your feathered friend happy with the right supplies.',
    'small pets': 'Small pets need specialized care products.',
    'fish': 'Create the perfect aquatic environment.',
    'pets': 'Every pet deserves quality products that last.',
  };
  const problem = problems[pet] || problems['pets'];

  const bullets: string[] = [
    `✓ ${benefit} for your ${pet}`,
  ];
  if (cleaned.length > 30) {
    const firstSentence = cleaned.split(/[.!?]/).filter(s => s.trim().length > 15)[0];
    if (firstSentence) bullets.push(`✓ ${truncate(firstSentence.trim(), 80)}`);
  }
  specs.forEach(s => bullets.push(`✓ ${truncate(s, 80)}`));
  bullets.push('✓ Durable, pet-safe materials');
  if (p.price >= FREE_SHIPPING_THRESHOLD) {
    bullets.push('✓ FREE US shipping included');
  }
  const finalBullets = bullets.slice(0, 6);

  let desc = `${problem} The ${cleanProductName(p.name)} delivers ${benefit.toLowerCase()} that ${pet} love. `;
  desc += finalBullets.join('. ') + '. ';
  desc += `Ships to US addresses within 5–10 business days. Free shipping on orders over $${FREE_SHIPPING_THRESHOLD}. 30-day easy returns. Shop GetPawsy.`;

  return truncate(desc, 5000);
}

// ── Google taxonomy — checks BOTH name and category ────────────────

function getGoogleProductCategory(name: string, cat: string | null): string {
  const c = `${name} ${cat || ''}`.toLowerCase();

  // Specific product types first
  if (c.includes('cat tree') || c.includes('cat tower') || c.includes('cat condo'))
    return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Trees';
  if (c.includes('litter box') || c.includes('self cleaning litter') || c.includes('self-cleaning litter'))
    return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Litter Boxes';
  if (c.includes('dog bed') || c.includes('orthopedic dog bed') || c.includes('orthopedic bed'))
    return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Beds';
  if (c.includes('pet stroller') || c.includes('dog stroller') || c.includes('cat stroller'))
    return 'Animals & Pet Supplies > Pet Supplies > Pet Strollers';
  if (c.includes('hamster cage') || c.includes('hamster habitat'))
    return 'Animals & Pet Supplies > Pet Supplies > Small Animal Supplies > Small Animal Habitats';
  if (c.includes('rabbit hutch') || c.includes('bunny hutch'))
    return 'Animals & Pet Supplies > Pet Supplies > Small Animal Supplies > Small Animal Habitats';
  if (c.includes('chicken coop'))
    return 'Animals & Pet Supplies > Pet Supplies > Poultry Supplies';
  if (c.includes('reptile habitat') || c.includes('tortoise habitat') || c.includes('terrarium'))
    return 'Animals & Pet Supplies > Pet Supplies > Reptile & Amphibian Supplies > Terrariums';

  // Bird supplies
  if (c.includes('bird feeder') || c.includes('bird cage') || c.includes('bird perch') || c.includes('bird toy'))
    return 'Animals & Pet Supplies > Pet Supplies > Bird Supplies';

  // Dog sub-categories
  if (c.includes('dog') && c.includes('bed')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Beds';
  if (c.includes('dog') && c.includes('toy')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Toys';
  if (c.includes('dog') && (c.includes('collar') || c.includes('leash'))) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Collars & Leads';
  if (c.includes('dog') && c.includes('groom')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Grooming Supplies';
  if (c.includes('dog') && c.includes('carrier')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Carriers & Travel';
  if (c.includes('dog') && c.includes('bowl')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Bowls & Feeders';
  if (c.includes('dog') && c.includes('house')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Houses';
  if (c.includes('dog') && c.includes('train')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Training Aids';
  if (c.includes('dog') && c.includes('food')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Food';
  if (c.includes('dog')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies';

  // Cat sub-categories
  if (c.includes('cat') && c.includes('scratch')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture';
  if (c.includes('cat') && c.includes('toy')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Toys';
  if (c.includes('cat') && c.includes('bed')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Beds';
  if (c.includes('cat') && c.includes('carrier')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Carriers & Travel';
  if (c.includes('cat') && c.includes('house')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Houses & Condos';
  if (c.includes('cat') && (c.includes('bowl') || c.includes('feeder') || c.includes('fountain')))
    return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Bowls & Feeders';
  if (c.includes('cat') && (c.includes('furniture') || c.includes('perch') || c.includes('hammock')))
    return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture';
  if (c.includes('cat')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies';

  // Small pets / birds / reptiles
  if (c.includes('hamster') || c.includes('guinea') || c.includes('rabbit') || c.includes('small pet'))
    return 'Animals & Pet Supplies > Pet Supplies > Small Animal Supplies';
  if (c.includes('bird')) return 'Animals & Pet Supplies > Pet Supplies > Bird Supplies';
  if (c.includes('reptile') || c.includes('tortoise')) return 'Animals & Pet Supplies > Pet Supplies > Reptile & Amphibian Supplies';
  if (c.includes('fish') || c.includes('aqua')) return 'Animals & Pet Supplies > Pet Supplies > Fish Supplies';

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

function getAvailability(_stock: number | null, isActive: boolean | null): string {
  // Dropship model: only is_active=false marks OOS (stock is informational only)
  if (isActive === false) return 'out of stock';
  return 'in stock';
}

function getCurrentSeason(): string {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return 'Spring';
  if (month >= 6 && month <= 8) return 'Summer';
  if (month >= 9 && month <= 11) return 'Fall';
  return 'Winter';
}

// ── Shipping weight normalizer ────────────────────────────────────────

const LARGE_PRODUCT_PATTERNS = /\b(xl|extra.?large|large|60"|69"|77"|84"|90"|cat.?tree|dog.?bed|stroller|cage|aviary|crate|kennel)\b/i;

function normalizeShippingWeight(rawWeight: number | null, name: string, tags?: string[]): string {
  let weightKg: number;

  if (rawWeight === null || rawWeight === undefined || rawWeight === 0 || isNaN(rawWeight)) {
    weightKg = 1;
  } else if (rawWeight >= 100 && rawWeight <= 200000) {
    // Likely grams
    weightKg = rawWeight / 1000;
  } else if (rawWeight < 100) {
    // Likely kg already
    weightKg = rawWeight;
  } else {
    weightKg = 1;
  }

  // Floor check
  if (weightKg < 0.1) weightKg = 1;
  // Cap
  if (weightKg > 25) weightKg = 25;

  // Large product minimum
  const combined = `${name} ${(tags || []).join(' ')}`;
  if (LARGE_PRODUCT_PATTERNS.test(combined) && weightKg < 5) {
    weightKg = 5;
  }

  // Round to 1 decimal
  weightKg = Math.round(weightKg * 10) / 10;
  return `${weightKg} kg`;
}

// ── Image validation / fallback ──────────────────────────────────────

const PLACEHOLDER_IMAGE = `${BASE_URL}/images/merchant-placeholder.jpg`;

function sanitizeImageUrl(url: string | null): string {
  if (!url || url.trim() === '') return PLACEHOLDER_IMAGE;
  const trimmed = url.trim();
  // Must be absolute https
  if (!trimmed.startsWith('https://')) return PLACEHOLDER_IMAGE;
  // Block known broken CDN patterns
  if (/cjdropshipping\.com\/image\/null/i.test(trimmed)) return PLACEHOLDER_IMAGE;
  if (trimmed.length < 15) return PLACEHOLDER_IMAGE;
  return trimmed;
}

function productItemXml(p: MerchantProduct, bestsellersSet: Set<string>): XmlNode {
  const url = `${BASE_URL}/product/${p.slug || p.id}`;
  const img = sanitizeImageUrl(p.image_url || (p.images && p.images[0]) || null);
  const title = buildOptimizedTitle(p);
  const descSource = cleanDescription(p.description);
  const desc = truncate(descSource || cleanProductName(p.name), 5000);

  const priceStr = (v: number) => `${v.toFixed(2)} USD`;
  const avail = getAvailability(p.stock, p.is_active);
  const shippingWeight = normalizeShippingWeight(p.weight, p.name);
  const season = getCurrentSeason();
  const margin = p.compare_at_price && p.compare_at_price > 0
    ? ((p.compare_at_price - p.price) / p.compare_at_price * 100)
    : 0;
  const marginTier = margin >= 40 ? 'High-Margin' : margin >= 20 ? 'Mid-Margin' : 'Low-Margin';
  const isBestseller = bestsellersSet.has(p.id);

  const tags: XmlNode[] = [
    xmlNode('g:id', [xmlText(p.id)]),
    xmlNode('g:title', [xmlCdata(title)]),
    xmlNode('g:description', [xmlCdata(desc)]),
    xmlNode('g:link', [xmlText(url)]),
    xmlNode('g:image_link', [xmlText(img)]),
    xmlNode('g:availability', [xmlText(avail)]),
    xmlNode('g:price', [xmlText(priceStr(p.price))]),
    xmlNode('g:brand', [xmlText('GetPawsy')]),
    xmlNode('g:condition', [xmlText('new')]),
    xmlNode('g:google_product_category', [xmlText(getGoogleProductCategory(p.name, p.category))]),
    xmlNode('g:shipping_weight', [xmlText(shippingWeight)]),
  ];

  if (p.compare_at_price && p.compare_at_price > p.price) {
    tags.push(xmlNode('g:sale_price', [xmlText(priceStr(p.price))]));
  }

  if (p.sku) {
    tags.push(xmlNode('g:mpn', [xmlText(p.sku)]));
  } else {
    tags.push(xmlNode('g:identifier_exists', [xmlText('no')]));
    tags.push(xmlNode('g:mpn', [xmlText(p.id)]));
  }

  tags.push(xmlNode('g:product_type', [xmlText(getProductType(p.category))]));
  tags.push(xmlNode('g:custom_label_0', [xmlText(marginTier)]));
  tags.push(xmlNode('g:custom_label_1', [xmlText(isBestseller ? 'Bestseller' : 'Standard')]));
  tags.push(xmlNode('g:custom_label_2', [xmlText(season)]));

  return xmlNode('item', tags);
}

async function buildMerchantFeed(maxItems?: number): Promise<string> {
  const feedStartedAt = Date.now();
  console.log('[xml-plugin][feed] ▶ buildMerchantFeed() starting…');
  const [rawProducts, bestsellers] = await Promise.all([
    supaRest<MerchantProduct>(
      'products_public',
      'select=id,name,description,price,compare_at_price,image_url,images,stock,category,sku,slug,weight,is_active&is_active=eq.true&is_duplicate=eq.false&price=gt.0&image_url=not.is.null&slug=not.is.null&description=not.is.null&order=created_at.desc&limit=5000'
    ),
    supaRest<{ product_id: string }>('bestsellers', 'select=product_id&is_active=eq.true'),
  ]);

  // Safety post-filter: exclude products missing required fields (stock is NOT a disqualifier for dropship)
  // Track WHY each product is excluded so the build log explains a 0-item feed.
  const exclusionStats = {
    bad_price: 0,
    inactive: 0,
    no_image: 0,
    no_slug: 0,
    no_description: 0,
  };
  const eligibleProducts = rawProducts.filter(p => {
    let ok = true;
    if (!(p.price > 0)) { exclusionStats.bad_price++; ok = false; }
    if (p.is_active === false) { exclusionStats.inactive++; ok = false; }
    if (!p.image_url || p.image_url.trim() === '') { exclusionStats.no_image++; ok = false; }
    if (!p.slug || p.slug.trim() === '') { exclusionStats.no_slug++; ok = false; }
    if (!p.description || p.description.trim() === '') { exclusionStats.no_description++; ok = false; }
    return ok;
  });

  const products = typeof maxItems === 'number' ? eligibleProducts.slice(0, maxItems) : eligibleProducts;
  const bestsellersSet = new Set(bestsellers.map(b => b.product_id));
  const totalElapsed = Date.now() - feedStartedAt;
  console.log(
    `[xml-plugin][feed] Merchant feed: ${products.length} exported ` +
      `(${eligibleProducts.length} eligible, ${rawProducts.length} raw, ` +
      `${rawProducts.length - eligibleProducts.length} excluded) in ${totalElapsed}ms`
  );
  console.log(
    `[xml-plugin][feed] Exclusion breakdown: ` +
      `bad_price=${exclusionStats.bad_price}, inactive=${exclusionStats.inactive}, ` +
      `no_image=${exclusionStats.no_image}, no_slug=${exclusionStats.no_slug}, ` +
      `no_description=${exclusionStats.no_description}`
  );
  if (rawProducts.length === 0) {
    console.warn(
      `[xml-plugin][feed] ⚠ products_public returned 0 rows. ` +
        `Likely cause: DB unreachable, RLS blocking the anon key, or the table is genuinely empty. ` +
        `Re-check the [supaRest] log line above for HTTP status / timeout.`
    );
  } else if (eligibleProducts.length === 0) {
    console.warn(
      `[xml-plugin][feed] ⚠ ${rawProducts.length} products fetched but ALL excluded by post-filter — see exclusion breakdown above.`
    );
  }

  const now = new Date().toISOString();
  const items = products.map(p => productItemXml(p, bestsellersSet));
  return renderGoogleFeedXml(items, now);
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
    if (!p.sku) {
      issues.push(`    <issue type="missing_gtin" product_id="${esc(pid)}" name="${esc(truncate(name, 80))}" />`);
    }
    if (!p.image_url && (!p.images || p.images.length === 0)) {
      issues.push(`    <issue type="missing_image" product_id="${esc(pid)}" name="${esc(truncate(name, 80))}" />`);
    }
    if (name.length > 150) {
      issues.push(`    <issue type="overlength_title" product_id="${esc(pid)}" name="${esc(truncate(name, 80))}" length="${name.length}" />`);
    }
    if (name.length < 40) {
      issues.push(`    <issue type="short_title" product_id="${esc(pid)}" name="${esc(truncate(name, 80))}" length="${name.length}" />`);
    }
    if (p.is_active === false) {
      issues.push(`    <issue type="inactive_product" product_id="${esc(pid)}" name="${esc(truncate(name, 80))}" />`);
    }
    if (!p.compare_at_price || p.compare_at_price <= 0) {
      issues.push(`    <issue type="missing_compare_at_price" product_id="${esc(pid)}" name="${esc(truncate(name, 80))}" />`);
    }
    const normTitle = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!titlesSeen.has(normTitle)) titlesSeen.set(normTitle, []);
    titlesSeen.get(normTitle)!.push(pid);
    const primaryImg = p.image_url || '';
    if (primaryImg) {
      if (!imagesSeen.has(primaryImg)) imagesSeen.set(primaryImg, []);
      imagesSeen.get(primaryImg)!.push(pid);
    }
  }

  for (const [, ids] of titlesSeen) {
    if (ids.length > 1) {
      issues.push(`    <issue type="duplicate_title" product_ids="${ids.join(',')}" count="${ids.length}" />`);
    }
  }
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
    oos: issues.filter(i => i.includes('inactive_product')).length,
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

// ── Sitemap build-time validation ─────────────────────────────────────

function assertSitemapFileValid(filePath: string, requiredToken: string, label: string): void {
  if (!existsSync(filePath)) {
    throw new Error(`[sitemaps] FATAL: ${label} not found at ${filePath}`);
  }
  const content = readFileSync(filePath, 'utf8');
  if (!content.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) {
    throw new Error(`[sitemaps] FATAL: ${label} missing XML header. First 200 chars: ${content.slice(0, 200)}`);
  }
  if (!content.includes(requiredToken)) {
    throw new Error(`[sitemaps] FATAL: ${label} missing required token: ${requiredToken}`);
  }
  const lower = content.toLowerCase();
  if (lower.includes('<!doctype html') || lower.includes('<html')) {
    throw new Error(`[sitemaps] FATAL: ${label} contains HTML (SPA fallback)`);
  }
  if (content.includes('http') && !content.includes('<url') && !content.includes('<sitemap')) {
    throw new Error(`[sitemaps] FATAL: ${label} is plaintext (URLs without XML tags)`);
  }
}

// ── Vite Plugin ───────────────────────────────────────────────────────

function buildStaticCatalogFallbackFeed(): string {
  const fallbackProducts: MerchantProduct[] = staticProducts
    .filter(p => p.inStock && p.price > 0 && p.image && p.slug && p.description)
    .slice(0, 12)
    .map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      compare_at_price: p.comparePrice ?? null,
      image_url: p.image,
      images: p.images,
      stock: p.inStock ? 25 : 0,
      category: p.category,
      sku: p.id,
      slug: p.slug,
      weight: null,
      is_active: p.inStock,
    }));

  console.warn(
    `[xml-plugin][feed] ⚠ Using static catalog emergency feed: ${fallbackProducts.length} real products from src/data/products.ts`
  );
  return renderGoogleFeedXml(
    fallbackProducts.map(p => productItemXml(p, new Set<string>())),
    new Date().toISOString()
  );
}

export default function merchantFeedPlugin(): Plugin {
  let resolvedOutDir = 'dist';
  const publicDir = join(process.cwd(), 'public');
  return {
    name: 'generate-merchant-feed-and-sitemaps',
    apply: 'build',
    configResolved(config) {
      resolvedOutDir = config.build.outDir || 'dist';
    },

    // ── PHASE 1: Generate sitemaps into /public BEFORE Vite copies to /dist ──
    // CRITICAL: No try/catch around generator — if it fails, the BUILD MUST FAIL.
    // There are NO fallback files in /public (all stale XMLs have been deleted).
    async buildStart() {
      clearFeedArtifacts(publicDir);

      console.log('[sitemaps] ═══════════════════════════════════════════');
      console.log('[sitemaps] Phase 1: Generating sitemaps into /public');
      console.log('[sitemaps] ═══════════════════════════════════════════');

      // FAIL-HARD: Generator must succeed — no fallback files exist
      execSync('node scripts/generate-sitemaps.mjs', {
        cwd: process.cwd(),
        stdio: 'inherit',
        timeout: 60_000,
      });
      console.log('[sitemaps] ✓ generate-sitemaps.mjs completed');

      // Run validator if it exists
      const validatorPath = join(process.cwd(), 'scripts/validate-sitemaps.mjs');
      if (existsSync(validatorPath)) {
        execSync('node scripts/validate-sitemaps.mjs', {
          cwd: process.cwd(),
          stdio: 'inherit',
          timeout: 30_000,
        });
        console.log('[sitemaps] ✓ validate-sitemaps.mjs passed');
      }

      // HARD ASSERTIONS — build FAILS if these don't pass
      const sitemapXml = join(publicDir, 'sitemap.xml');
      const productsXml = join(publicDir, 'sitemap-products-1.xml');

      assertSitemapFileValid(sitemapXml, '<sitemapindex', 'public/sitemap.xml');

      // Products sitemap is required
      assertSitemapFileValid(productsXml, '<urlset', 'public/sitemap-products-1.xml');
      const productsContent = readFileSync(productsXml, 'utf8');
      if (!productsContent.includes('<url>')) {
        throw new Error('[sitemaps] FATAL: sitemap-products-1.xml has 0 <url> entries');
      }

      // Verify at least 3 <sitemap> entries in index (pages + products + at least one more)
      const indexContent = readFileSync(sitemapXml, 'utf8');
      const sitemapCount = (indexContent.match(/<sitemap>/g) || []).length;
      if (sitemapCount < 3) {
        throw new Error(`[sitemaps] FATAL: sitemap.xml has only ${sitemapCount} <sitemap> entries (need ≥3)`);
      }

      // Verify ALL referenced child sitemaps actually exist
      const allRefs = indexContent.match(/sitemap-[a-z]+-?\d*\.xml/g) || [];
      for (const ref of allRefs) {
        if (!existsSync(join(publicDir, ref))) {
          throw new Error(`[sitemaps] FATAL: sitemap.xml references ${ref} but file is missing in /public`);
        }
      }

      console.log(`[sitemaps] ✅ All sitemaps validated (${sitemapCount} index entries, ${allRefs.length} child files verified)`);

      // ── Feed source of truth: generate static XML feeds in /public ──
      const merchantFeed = await Promise.race([
        buildMerchantFeed(),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('Merchant feed generation timed out')), 30000)
        ),
      ]);
      assertGoogleFeedValid(merchantFeed, 'public/google-feed.xml');
      writeFeedArtifacts(publicDir, merchantFeed, 'dist/google-feed.xml');
      console.log(`[xml-plugin] ✓ /public/merchant-feed.xml (${merchantFeed.length} bytes)`);
      console.log(`[xml-plugin] ✓ /public/google-shopping-feed.xml (${merchantFeed.length} bytes)`);
      console.log(`[xml-plugin] ✓ /public/google-feed.xml (${merchantFeed.length} bytes)`);
      console.log('[xml-plugin] ✓ /public/api/feed-source-preview');
      console.log('[xml-plugin] ✓ /public/api/feed-check');
      const finalPublicFeed = readFileSync(join(publicDir, 'google-feed.xml'), 'utf8');
      assertGoogleFeedValid(finalPublicFeed, 'public/google-feed.xml');
      logFeedPreview('public/google-feed.xml', finalPublicFeed);

      // Keep diagnostics static file only
      try {
        const diagnostics = await buildMerchantDiagnostics();
        writeFileSync(join(publicDir, 'merchant-diagnostics.xml'), diagnostics, 'utf-8');
        console.log(`[xml-plugin] ✓ /public/merchant-diagnostics.xml (${diagnostics.length} bytes)`);
      } catch (err) {
        console.warn('[xml-plugin] ⚠️ merchant diagnostics generation failed, writing fallback:', err);
        writeFileSync(
          join(publicDir, 'merchant-diagnostics.xml'),
          `<?xml version="1.0" encoding="UTF-8"?>\n<merchant_diagnostics status="fallback" />`,
          'utf-8'
        );
      }

      console.log('[sitemaps] ═══════════════════════════════════════════\n');
    },

    // ── PHASE 2: Ensure feed files exist in /dist ──
    async closeBundle() {
      const outDir = resolvedOutDir;
      mkdirSync(outDir, { recursive: true });
      clearFeedArtifacts(outDir);

      // Try to regenerate the feed for /dist. If that fails OR produces an
      // invalid (item-less) feed — typically because the DB is briefly
      // unreachable during the build — fall back to the already-validated
      // feed that PHASE 1 wrote into /public. This prevents a transient DB
      // hiccup from killing the entire production build.
      const publicFeedPath = join(publicDir, 'google-feed.xml');
      let merchantFeed: string | null = null;
      try {
        const generated = await Promise.race([
          buildMerchantFeed(),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('Merchant feed generation timed out')), 30000)
          ),
        ]);
        // Validate; if it throws we'll fall through to the fallback below.
        assertGoogleFeedValid(generated, 'dist/google-feed.xml (regen)');
        merchantFeed = generated;
      } catch (err) {
        console.warn(
          '[xml-plugin] ⚠️ closeBundle feed regen failed — falling back to public/google-feed.xml:',
          (err as Error)?.message ?? err
        );
      }

      if (!merchantFeed) {
        if (!existsSync(publicFeedPath)) {
          throw new Error(
            '[xml-plugin] dist feed regen failed AND public/google-feed.xml is missing — cannot recover.'
          );
        }
        merchantFeed = readFileSync(publicFeedPath, 'utf8');
        // The public feed was already validated in PHASE 1, but re-check
        // defensively so we never ship a broken feed to /dist.
        assertGoogleFeedValid(merchantFeed, 'dist/google-feed.xml (fallback from public)');
        console.log('[xml-plugin] ✓ Reused public/google-feed.xml as dist feed source.');
      }

      writeFeedArtifacts(outDir, merchantFeed, 'dist/google-feed.xml');
      console.log(`[xml-plugin] ✓ /dist/merchant-feed.xml (${merchantFeed.length} bytes)`);
      console.log(`[xml-plugin] ✓ /dist/google-shopping-feed.xml (${merchantFeed.length} bytes)`);
      console.log(`[xml-plugin] ✓ /dist/google-feed.xml (${merchantFeed.length} bytes)`);
      console.log('[xml-plugin] ✓ /dist/api/feed-source-preview');
      console.log('[xml-plugin] ✓ /dist/api/feed-check');
      const finalDistFeed = readFileSync(join(outDir, 'google-feed.xml'), 'utf8');
      assertGoogleFeedValid(finalDistFeed, 'dist/google-feed.xml');
      logFeedPreview('dist/google-feed.xml', finalDistFeed);

      try {
        const diagnostics = await Promise.race([
          buildMerchantDiagnostics(),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('Merchant diagnostics generation timed out')), 30000)
          ),
        ]);
        writeFileSync(join(outDir, 'merchant-diagnostics.xml'), diagnostics, 'utf-8');
        console.log(`[xml-plugin] ✓ merchant-diagnostics.xml (${diagnostics.length} bytes)`);
      } catch (err) {
        console.warn('[xml-plugin] ⚠️ Merchant diagnostics generation failed/timed out, fallback in place:', err);
        writeFileSync(
          join(outDir, 'merchant-diagnostics.xml'),
          `<?xml version="1.0" encoding="UTF-8"?>\n<merchant_diagnostics status="fallback" />`,
          'utf-8'
        );
      }

      // ── PHASE 3: Post-build dist verification for sitemaps ──
      console.log('[sitemaps] Verifying dist/ sitemap files...');
      const distSitemap = join(outDir, 'sitemap.xml');

      assertSitemapFileValid(distSitemap, '<sitemapindex', 'dist/sitemap.xml');
      console.log('[sitemaps] ✓ dist/sitemap.xml verified');

      const distProducts = join(outDir, 'sitemap-products-1.xml');
      if (existsSync(distProducts)) {
        assertSitemapFileValid(distProducts, '<urlset', 'dist/sitemap-products-1.xml');
        console.log('[sitemaps] ✓ dist/sitemap-products-1.xml verified');
      }

      console.log('[sitemaps] ✅ dist/ sitemap verification complete');
    },
  };
}

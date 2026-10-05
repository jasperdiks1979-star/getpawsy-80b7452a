import { ROOT_GUIDE_CONSOLIDATION } from './src/lib/seo-root-consolidation';
/**
 * Vite Plugin: Prerender Guide Pages
 *
 * Generates static HTML files for every guide in public/data/guides/
 * so Googlebot receives full semantic content without requiring JS execution.
 *
 * Supports TWO guide formats:
 *   1. Structured JSON: sections[], faq[], buyingCriteria[], etc.
 *   2. Raw HTML content: a single `content` field with full article HTML.
 *
 * Output: dist/guides/{slug}/index.html (directory index, resolved natively
 * by the host before the SPA fallback) plus dist/guides/index.html hub.
 * Programmatic pages are not prerendered.
 */

import fs from 'fs';
import path from 'path';
import type { Plugin } from 'vite';
import { loadSeoPolicy, normalizeProductLinks } from './scripts/seo-indexability.mjs';
import { canonicalizeInternalLinks, type InternalLinkContext } from './src/lib/seo-internal-links';
import { clusterForGuide, SEO_CLUSTERS } from './src/lib/seo-clusters';
import { sanitizeGuideSeoTitle, clampMetaDescription, sanitizeSeoDescription } from './src/lib/seo-title';

/** Link context from the generated sitemaps: only advertised (canonical, indexable) URLs stay linked. */
export function linkContextFromSitemaps(dir: string): InternalLinkContext | undefined {
  const read = (f: string, ns: string) => {
    const file = path.join(dir, f);
    if (!fs.existsSync(file)) return null;
    return new Set([...fs.readFileSync(file, 'utf-8').matchAll(/<loc>[^<]*\/([a-z-]+)\/([a-z0-9-]+)<\/loc>/g)].filter((m) => m[1] === ns).map((m) => m[2]));
  };
  const knownGuides = read('sitemap-guides.xml', 'guides');
  const allowedProducts = read('sitemap-products-1.xml', 'products');
  const allowedCollections = read('sitemap-collections.xml', 'collections');
  if (!knownGuides || !allowedProducts || !allowedCollections) return undefined;
  return { knownGuides, allowedProducts, allowedCollections };
}

interface GuideJson {
  slug: string;
  title: string;
  meta_title?: string;
  seoTitle?: string;
  seoDescription?: string;
  meta_description?: string;
  excerpt?: string;
  category?: string;
  keywords?: string[];
  publishedAt?: string;
  updatedAt?: string;
  featuredImage?: string;
  readingTime?: number;
  content?: string;
  sections?: Array<Record<string, unknown>>;
  faq?: Array<{ question: string; answer: string }>;
  buyingCriteria?: Array<{ criterion: string; description: string }>;
  commonMistakes?: Array<{ mistake: string; fix: string }>;
  quickAnswer?: { recommendation: string; reason: string };
  comparisonProducts?: Array<{ name: string; price?: string; bestFor?: string }>;
}

const SITE = 'https://getpawsy.pet';
const ROBOTS_INDEX = 'index, follow, max-image-preview:large, max-snippet:-1';
const ROBOTS_NOINDEX_FOLLOW = 'noindex, follow';

function extractAssets(spaHtml: string): { assetTags: string; scriptTags: string } {
  const headMatch = spaHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const headContent = headMatch ? headMatch[1] : '';
  const scriptTags = (spaHtml.match(/<script[^>]*src="[^"]*"[^>]*><\/script>/g) || []).join('\n');
  // Drop any canonical from the shell so each page carries exactly one.
  const assetTags = (headContent.match(/<link[^>]*>|<style[^>]*>[\s\S]*?<\/style>/gi) || [])
    .filter((t) => !/rel=["']?canonical/i.test(t) && !/hreflang/i.test(t))
    .join('\n');
  return { assetTags, scriptTags };
}

function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return '';
  const str = typeof s === 'string' ? s : String(s);
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function markdownToHtml(md: string): string {
  let html = md
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/gs, (m) => `<ul>${m}</ul>`)
    .replace(/\n{2,}/g, '</p><p>');
  return `<p>${html}</p>`.replace(/<p>\s*<\/p>/g, '');
}


const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://nojvgfbcjgipjxpfatmm.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vanZnZmJjamdpcGp4cGZhdG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTMxOTYsImV4cCI6MjA4Mzk4OTE5Nn0.gfjmYf9aB-BCIrCnH14Zmnm6GBEKX7QMWP1ELL_i9dc';

/** Paged anon REST read; returns null on any failure so callers can fail loudly. */
async function supaRestAll<T>(table: string, params: string): Promise<T[] | null> {
  const out: T[] = [];
  for (let from = 0; from < 5000; from += 500) {
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Range: `${from}-${from + 499}` },
          signal: ctrl.signal,
        });
        clearTimeout(t);
        if (!res.ok) continue;
        const rows = (await res.json()) as T[];
        out.push(...rows);
        ok = true;
        if (rows.length < 500) return out;
      } catch { /* retry */ }
    }
    if (!ok) return null;
  }
  return out;
}

/** Strip script/style/iframe/object/embed, inline event handlers and javascript: URLs; demote H1 → H2. */
export function sanitizeStoredHtml(html: string, demoteH1 = true): string {
  const out = html
    .replace(/<(script|style|iframe|object|embed|form)[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|iframe|object|embed|form|link|meta)\b[^>]*\/?>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
  return demoteH1 ? out.replace(/<h1(\s[^>]*)?>/gi, '<h2>').replace(/<\/h1>/gi, '</h2>') : out;
}

/** Markdown or HTML stored content → HTML (headings demoted so the page keeps one H1). */
export function storedContentToHtml(content: string): string {
  const c = content || '';
  if (c.trim().startsWith('<')) return sanitizeStoredHtml(c);
  const withHeadings = escapeMdHtml(sanitizeStoredHtml(c))
    .replace(/^#{1,2} (.+)$/gm, '\n\n<h2>$1</h2>\n\n')
    .replace(/^#{3,6} (.+)$/gm, '\n\n<h3>$1</h3>\n\n');
  return sanitizeStoredHtml(markdownToHtml(withHeadings).replace(/<p>\s*(<h[23]>[\s\S]*?<\/h[23]>)\s*<\/p>/g, '$1'));
}
function escapeMdHtml(s: string): string { return s.replace(/<(?!\/?(strong|em|a|ul|li|h2|h3)\b)/g, '&lt;'); }

interface DbGuideRow {
  slug: string; title: string; excerpt: string | null; category: string | null; keywords: string[] | null;
  published_at: string | null; updated_at: string | null; featured_image: string | null;
  reading_time: number | null; guide_data: Record<string, any> | null;
}

/** DB published_guides row → GuideJson, mirroring useGuide() in src/hooks/useGuides.ts. */
export function dbGuideToJson(row: DbGuideRow): GuideJson {
  const gd = row.guide_data || {};
  return {
    slug: row.slug,
    title: gd.title || row.title,
    excerpt: gd.excerpt || row.excerpt || undefined,
    category: row.category || undefined,
    keywords: row.keywords || [],
    publishedAt: row.published_at || undefined,
    updatedAt: row.updated_at || undefined,
    featuredImage: row.featured_image || undefined,
    readingTime: row.reading_time || undefined,
    content: typeof gd.content === 'string' ? gd.content : undefined,
    sections: gd.sections || [],
    faq: gd.faq || [],
    buyingCriteria: gd.buyingCriteria,
    commonMistakes: gd.commonMistakes,
    quickAnswer: gd.quickAnswer,
    comparisonProducts: gd.comparisonProducts,
    seoTitle: gd.seoTitle,
    seoDescription: gd.seoDescription,
  };
}

/** Static guides win over DB on overlapping slugs (useGuide() checks static first). */
export function mergeGuideSources(staticGuides: GuideJson[], dbGuides: GuideJson[]): Map<string, GuideJson> {
  const m = new Map<string, GuideJson>();
  for (const g of dbGuides) if (g.slug) m.set(g.slug, g);
  for (const g of staticGuides) if (g.slug) m.set(g.slug, g);
  return m;
}

interface BlogRow {
  slug: string; title: string; meta_title: string | null; meta_description: string | null; excerpt: string | null;
  content: string | null; author_name: string | null; published_at: string | null; updated_at: string | null;
  featured_image: string | null; category: string | null;
}

export function buildBlogPostPage(post: BlogRow, spaHtml: string, linkCtx?: InternalLinkContext): string {
  const canonical = `${SITE}/blog/${post.slug}`;
  const title = sanitizeGuideSeoTitle(post.meta_title || post.title);
  const description = clampMetaDescription(sanitizeSeoDescription(post.meta_description || post.excerpt || ''));
  const image = post.featured_image
    ? (/^https?:\/\//.test(post.featured_image) ? post.featured_image : `${SITE}${post.featured_image}`)
    : null;
  const body = canonicalizeInternalLinks(normalizeProductLinks(storedContentToHtml(post.content || '')), linkCtx);
  const article = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Article', headline: post.title, description,
    ...(image ? { image } : {}),
    datePublished: post.published_at || undefined, dateModified: post.updated_at || post.published_at || undefined,
    author: { '@type': post.author_name ? 'Person' : 'Organization', name: post.author_name || 'GetPawsy' },
    publisher: { '@type': 'Organization', name: 'GetPawsy', url: SITE },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical }, inLanguage: 'en-US',
  });
  const crumbs = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE}/blog` },
      { '@type': 'ListItem', position: 3, name: post.title, item: canonical },
    ],
  });
  const { assetTags, scriptTags } = extractAssets(spaHtml);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${ROBOTS_INDEX}">
  <meta name="googlebot" content="${ROBOTS_INDEX}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(post.title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  ${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ''}
  <meta property="og:site_name" content="GetPawsy">
  ${assetTags}
  <script type="application/ld+json">${article}</script>
  <script type="application/ld+json">${crumbs}</script>
</head>
<body>
  <div id="root">
    <main>
      <nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/blog">Blog</a> / ${escapeHtml(post.title)}</nav>
      <article>
        <h1>${escapeHtml(post.title)}</h1>
        <p>${post.author_name ? `By ${escapeHtml(post.author_name)}` : ''}${post.published_at ? ` · <time datetime="${escapeHtml(post.published_at)}">${escapeHtml(post.published_at.slice(0, 10))}</time>` : ''}</p>
        ${body}
      </article>
    </main>
  </div>
  ${scriptTags}
</body>
</html>`;
}

/** Every <loc> in a sitemap file must have dist/<path>/index.html. Returns missing paths. */
export function findUnrenderedSitemapPaths(distDir: string, sitemapFile: string): string[] {
  const f = path.join(distDir, sitemapFile);
  if (!fs.existsSync(f)) return [`(missing ${sitemapFile})`];
  const locs = [...fs.readFileSync(f, 'utf-8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  return locs.filter((p) => !fs.existsSync(path.join(distDir, p === '/' ? '' : p, 'index.html')));
}

/** Indexable dist/<dir>/<slug>/index.html pages that the sitemap does not list. */
export function findUnadvertisedIndexablePages(distDir: string, dir: string, sitemapFile: string): string[] {
  const root = path.join(distDir, dir);
  const f = path.join(distDir, sitemapFile);
  if (!fs.existsSync(root) || !fs.existsSync(f)) return [];
  const listed = new Set([...fs.readFileSync(f, 'utf-8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname));
  const out: string[] = [];
  for (const slug of fs.readdirSync(root)) {
    const file = path.join(root, slug, 'index.html');
    if (!fs.existsSync(file)) continue;
    const robots = (fs.readFileSync(file, 'utf-8').match(/name="robots" content="([^"]*)"/) || [])[1] || '';
    if (!/noindex/.test(robots) && !listed.has(`/${dir}/${slug}`)) out.push(`/${dir}/${slug}`);
  }
  return out;
}

/** Sitemap URLs whose prerendered HTML is noindex or not self-canonical (homepage shell excluded). */
export function findNonIndexableSitemapPaths(distDir: string, sitemapFile: string): string[] {
  const f = path.join(distDir, sitemapFile);
  if (!fs.existsSync(f)) return [];
  const out: string[] = [];
  for (const m of fs.readFileSync(f, 'utf-8').matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const url = m[1];
    const p = new URL(url).pathname;
    if (p === '/') continue;
    const file = path.join(distDir, p, 'index.html');
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf-8');
    const robots = (html.match(/name="robots" content="([^"]*)"/) || [])[1] || '';
    const canon = [...html.matchAll(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"/g)].map((x) => x[1]);
    if (/noindex/.test(robots) || canon.length !== 1 || canon[0] !== url) out.push(p);
  }
  return out;
}

function buildArticleBody(guide: GuideJson): string {
  const rawContent = typeof guide.content === 'string' ? guide.content : '';
  // If guide has raw HTML content field, use it directly
  if (rawContent && rawContent.trim().startsWith('<')) {
    return rawContent;
  }

  // Otherwise build from structured fields
  const parts: string[] = [];

  parts.push(`<h1>${escapeHtml(guide.title)}</h1>`);

  if (guide.excerpt) {
    parts.push(`<p class="lead">${escapeHtml(guide.excerpt)}</p>`);
  }

  if (guide.quickAnswer) {
    parts.push(`<section><h2>Quick Answer</h2><p><strong>${escapeHtml(guide.quickAnswer.recommendation)}</strong> — ${escapeHtml(guide.quickAnswer.reason)}</p></section>`);
  }

  if (guide.buyingCriteria?.length) {
    parts.push(`<section><h2>Buying Guide</h2><dl>${guide.buyingCriteria.map(c =>
      `<dt>${escapeHtml(c.criterion)}</dt><dd>${escapeHtml(c.description)}</dd>`
    ).join('')}</dl></section>`);
  }

  if (guide.comparisonProducts?.length) {
    const rows = guide.comparisonProducts.map(p =>
      `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.price || '')}</td><td>${escapeHtml(p.bestFor || '')}</td></tr>`
    ).join('');
    parts.push(`<section><h2>Product Comparison</h2><table><thead><tr><th>Product</th><th>Price</th><th>Best For</th></tr></thead><tbody>${rows}</tbody></table></section>`);
  }

  if (guide.sections?.length) {
    for (const section of guide.sections as Array<Record<string, unknown>>) {
      if (!section || typeof section !== 'object') continue;
      // Guide JSON uses two shapes: {heading, content} and typed blocks
      // ({type:'heading',level,text} | {type:'faq',items} | {type:'comparison',rows} …).
      // Render both defensively — a missing field must never throw.
      const heading = typeof section.heading === 'string' ? section.heading : '';
      const type = typeof section.type === 'string' ? section.type : '';
      const chunks: string[] = [];

      if (type === 'heading') {
        const level = typeof section.level === 'number' && section.level >= 2 && section.level <= 4 ? section.level : 2;
        const text = typeof section.text === 'string' ? section.text : heading;
        if (text) parts.push(`<h${level}>${escapeHtml(text)}</h${level}>`);
        continue;
      }

      if (heading) chunks.push(`<h2>${escapeHtml(heading)}</h2>`);
      if (typeof section.content === 'string' && section.content.trim()) {
        chunks.push(markdownToHtml(section.content));
      }
      if (Array.isArray(section.items)) {
        const items = section.items as Array<unknown>;
        const isFaq = items.every((i) => i && typeof i === 'object' && 'question' in (i as object));
        if (isFaq) {
          chunks.push(
            items
              .map((i) => {
                const f = i as { question?: string; answer?: string };
                return `<details><summary>${escapeHtml(f.question || '')}</summary><p>${escapeHtml(f.answer || '')}</p></details>`;
              })
              .join(''),
          );
        } else {
          chunks.push(
            `<ul>${items
              .map((i) => {
                if (typeof i === 'string') return `<li>${escapeHtml(i)}</li>`;
                const o = i as { title?: string; text?: string; description?: string; name?: string };
                const label = o.title || o.name || '';
                const body = o.text || o.description || '';
                return `<li>${label ? `<strong>${escapeHtml(label)}</strong> ` : ''}${escapeHtml(body)}</li>`;
              })
              .join('')}</ul>`,
          );
        }
      }
      if (Array.isArray(section.rows)) {
        const columns = Array.isArray(section.columns) ? (section.columns as unknown[]).map(String) : [];
        const head = columns.length
          ? `<thead><tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>`
          : '';
        const body = (section.rows as unknown[])
          .map((r) => {
            const cells = Array.isArray(r) ? r.map(String) : Object.values(r as object).map(String);
            return `<tr>${cells.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`;
          })
          .join('');
        chunks.push(`<table>${head}<tbody>${body}</tbody></table>`);
      }

      if (chunks.length) parts.push(`<section>${chunks.join('')}</section>`);
    }
  }

  if (guide.commonMistakes?.length) {
    parts.push(`<section><h2>Common Mistakes to Avoid</h2><dl>${guide.commonMistakes.map(m =>
      `<dt>${escapeHtml(m.mistake)}</dt><dd>${escapeHtml(m.fix)}</dd>`
    ).join('')}</dl></section>`);
  }

  if (guide.faq?.length) {
    parts.push(`<section><h2>Frequently Asked Questions</h2>${guide.faq.map(f =>
      `<details><summary>${escapeHtml(f.question)}</summary><p>${escapeHtml(f.answer)}</p></details>`
    ).join('')}</section>`);
  }

  // Fallback: if content is plain text (not HTML), wrap it
  if (rawContent && !rawContent.trim().startsWith('<')) {
    parts.push(`<section>${markdownToHtml(rawContent)}</section>`);
  }

  return parts.join('\n');
}

/** Extract FAQ items from raw HTML content for schema generation */
function extractFaqFromHtml(html: string): Array<{ question: string; answer: string }> {
  const faqs: Array<{ question: string; answer: string }> = [];
  // Match FAQ schema markup in content
  const qRegex = /itemprop=['"]name['"][^>]*>([^<]+)/g;
  const aRegex = /itemprop=['"]text['"][^>]*>([^<]+)/g;
  const questions = [...html.matchAll(qRegex)].map(m => m[1]);
  const answers = [...html.matchAll(aRegex)].map(m => m[1]);
  for (let i = 0; i < Math.min(questions.length, answers.length); i++) {
    faqs.push({ question: questions[i], answer: answers[i] });
  }
  return faqs;
}

/** First paragraph of stored guide text (verbatim, tags stripped) — used only when no description exists. */
export function firstParagraphText(guide: GuideJson): string {
  const pieces: string[] = [];
  if (typeof guide.content === 'string') pieces.push(guide.content);
  for (const sec of guide.sections || []) for (const v of Object.values(sec)) if (typeof v === 'string') pieces.push(v);
  for (const p of pieces) {
    const txt = p.replace(/<[^>]+>/g, ' ').replace(/[#*_>`\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
    if (txt.length >= 60) return txt;
  }
  return '';
}

/** "More in this topic" block: collection, pillar and sibling guides that are advertised. */
export function buildClusterNav(slug: string, titles: Map<string, string>, linkCtx?: InternalLinkContext): string {
  const c = clusterForGuide(slug);
  if (!c) return '';
  const guides = [c.pillar, ...c.supporting]
    .filter((s) => s !== slug && titles.has(s) && (!linkCtx?.knownGuides || linkCtx.knownGuides.has(s)))
    .map((s) => `<li><a href="/guides/${s}">${escapeHtml(titles.get(s)!)}</a></li>`);
  const shop = !linkCtx?.allowedCollections || linkCtx.allowedCollections.has(c.collection)
    ? `<p><a href="/collections/${c.collection}">Shop ${escapeHtml(c.label.toLowerCase())}</a></p>` : '';
  if (!guides.length && !shop) return '';
  return `\n      <aside aria-label="Related guides"><h2>More on ${escapeHtml(c.label.toLowerCase())}</h2>${shop}${guides.length ? `<ul>${guides.join('')}</ul>` : ''}</aside>`;
}

export function buildGuidePage(guide: GuideJson, spaHtml: string, indexable = true, linkCtx?: InternalLinkContext, titles?: Map<string, string>): string {
  const clusterNav = titles ? buildClusterNav(guide.slug, titles, linkCtx) : '';
  const robots = indexable ? ROBOTS_INDEX : ROBOTS_NOINDEX_FOLLOW;
  const title = sanitizeGuideSeoTitle(guide.meta_title || guide.seoTitle || guide.title);
  const description = clampMetaDescription(sanitizeSeoDescription(guide.meta_description || guide.seoDescription || (guide as { metaDescription?: string }).metaDescription || guide.excerpt || firstParagraphText(guide)));
  const canonical = `${SITE}/guides/${guide.slug}`;
  const ogImage = guide.featuredImage
    ? (/^https?:\/\//.test(guide.featuredImage) ? guide.featuredImage : `${SITE}${guide.featuredImage}`)
    : `${SITE}/og-image.png`;

  const articleContent = sanitizeStoredHtml(canonicalizeInternalLinks(normalizeProductLinks(buildArticleBody(guide)), linkCtx), false);

  // Determine FAQ items for schema
  let faqItems = guide.faq || [];
  if (!faqItems.length && guide.content) {
    faqItems = extractFaqFromHtml(guide.content);
  }

  // Structured data
  const articleSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: guide.title,
    description: description,
    image: ogImage,
    datePublished: guide.publishedAt,
    dateModified: guide.updatedAt || guide.publishedAt,
    author: { '@type': 'Organization', name: 'GetPawsy', url: SITE },
    publisher: { '@type': 'Organization', name: 'GetPawsy', url: SITE, logo: { '@type': 'ImageObject', url: `${SITE}/logo.png` } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    keywords: (guide.keywords || []).join(', '),
    articleSection: guide.category,
    inLanguage: 'en-US',
  });

  const faqSchema = faqItems.length ? JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map(f => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  }) : null;

  const breadcrumbSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
      { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE}/guides` },
      { '@type': 'ListItem', position: 3, name: guide.title, item: canonical },
    ],
  });

  const { assetTags, scriptTags } = extractAssets(spaHtml);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${robots}">
  <meta name="googlebot" content="${robots}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:site_name" content="GetPawsy">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  ${assetTags}
  <script type="application/ld+json">${articleSchema}</script>
  ${faqSchema ? `<script type="application/ld+json">${faqSchema}</script>` : ''}
  <script type="application/ld+json">${breadcrumbSchema}</script>
</head>
<body>
  <div id="root">
    <article itemscope itemtype="https://schema.org/Article">
      <nav aria-label="Breadcrumb">
        <ol>
          <li><a href="/">Home</a></li>
          <li><a href="/guides">Guides</a></li>
          <li>${escapeHtml(guide.title)}</li>
        </ol>
      </nav>
      ${articleContent}${clusterNav}
    </article>
  </div>
  ${scriptTags}
</body>
</html>`;
}

// Programmatic "best-X-for-Y" use-case pages are
// intentionally NOT prerendered (P0 2026-10-05): most have no guide record
// and the template carried unsupported claims. Do not re-add.

/** Raw HTML for the /guides hub (dist/guides/index.html). */
export function buildGuidesHubPage(guides: GuideJson[], spaHtml: string, linkCtx?: InternalLinkContext): string {
  const canonical = `${SITE}/guides`;
  const title = 'Pet Care Guides | GetPawsy';
  const description = 'Buying guides and how-to articles for cat and dog owners from GetPawsy.';
  const { assetTags, scriptTags } = extractAssets(spaHtml);
  const items = guides
    .slice()
    .sort((x, y) => x.title.localeCompare(y.title))
    .map((g) => `<li><a href="/guides/${escapeHtml(g.slug)}">${escapeHtml(g.title)}</a>${g.excerpt ? ` — ${escapeHtml(g.excerpt)}` : ''}</li>`)
    .join('\n');
  const bySlug = new Map(guides.map((g) => [g.slug, g]));
  const topics = SEO_CLUSTERS
    .filter((c) => bySlug.has(c.pillar))
    .map((c) => `<li><a href="/guides/${c.pillar}">${escapeHtml(bySlug.get(c.pillar)!.title)}</a>${linkCtx?.allowedCollections && !linkCtx.allowedCollections.has(c.collection) ? '' : ` — <a href="/collections/${c.collection}">shop ${escapeHtml(c.label.toLowerCase())}</a>`}</li>`)
    .join('\n');
  const breadcrumb = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Guides', item: canonical },
    ],
  });
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta name="robots" content="${ROBOTS_INDEX}">
  <meta name="googlebot" content="${ROBOTS_INDEX}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:site_name" content="GetPawsy">
  ${assetTags}
  <script type="application/ld+json">${breadcrumb}</script>
</head>
<body>
  <div id="root">
    <main>
      <nav aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li>Guides</li></ol></nav>
      <h1>Pet Care Guides</h1>
      <p>${description}</p>
      ${topics ? `<h2>Start here</h2>\n      <ul>\n${topics}\n      </ul>\n      <h2>All guides</h2>` : ''}
      <ul>
${items}
      </ul>
    </main>
  </div>
  ${scriptTags}
</body>
</html>`;
}

export default function prerenderGuidesPlugin(): Plugin {
  return {
    name: 'prerender-guides',
    enforce: 'post',
    apply: 'build',
    async closeBundle() {
      const guidesDir = path.resolve('public/data/guides');
      const distDir = path.resolve('dist');
      const distGuidesDir = path.join(distDir, 'guides');

      const spaHtmlPath = path.join(distDir, 'index.html');
      if (!fs.existsSync(spaHtmlPath)) {
        console.warn('[prerender-guides] dist/index.html not found, skipping');
        return;
      }
      const spaHtml = fs.readFileSync(spaHtmlPath, 'utf-8');

      if (!fs.existsSync(distGuidesDir)) {
        fs.mkdirSync(distGuidesDir, { recursive: true });
      }

      const policy = loadSeoPolicy();
      const linkCtx = linkContextFromSitemaps(path.resolve('public'));
      if (!linkCtx) throw new Error('[prerender-guides] FATAL sitemaps missing — cannot canonicalize internal links');
      const files = fs.readdirSync(guidesDir).filter(f => f.endsWith('.json') && f !== 'index.json');
      const staticGuides: GuideJson[] = [];
      for (const file of files) {
        try {
          const g: GuideJson = JSON.parse(fs.readFileSync(path.join(guidesDir, file), 'utf-8'));
          if (g?.slug) staticGuides.push(g);
        } catch (e) {
          console.warn(`[prerender-guides] Failed to parse ${file}:`, e);
        }
      }
      const dbRows = await supaRestAll<DbGuideRow>('published_guides',
        'select=slug,title,excerpt,category,keywords,published_at,updated_at,featured_image,reading_time,guide_data&is_published=eq.true&slug=not.is.null&order=slug.asc');
      if (dbRows === null) throw new Error('[prerender-guides] FATAL published_guides fetch failed — sitemap guides would ship without HTML');
      const merged = mergeGuideSources(staticGuides, dbRows.map(dbGuideToJson));
      const guideTitles = new Map([...merged.values()].map((g) => [g.slug, g.title] as [string, string]));

      let guideCount = 0;
      let dbOnlyCount = 0;
      let noindexCount = 0;
      const hubGuides: GuideJson[] = [];
      const staticSlugs = new Set(staticGuides.map((g) => g.slug));

      for (const guide of merged.values()) {
        try {
          if (!guide.slug || !/^[a-z0-9-]+$/.test(guide.slug)) continue;
          // Consolidation redirect sources stay SPA-only (React redirects them).
          if (guide.slug in policy.guideRedirects) continue;
          const indexable = !policy.noindexGuides.has(guide.slug);
          const html = buildGuidePage(guide, spaHtml, indexable, linkCtx, guideTitles);
          // Directory-index output: the host resolves /guides/<slug> to <slug>/index.html natively.
          const slugDir = path.join(distGuidesDir, guide.slug);
          fs.mkdirSync(slugDir, { recursive: true });
          fs.writeFileSync(path.join(slugDir, 'index.html'), html, 'utf-8');
          const legacyFlat = path.join(distGuidesDir, `${guide.slug}.html`);
          if (fs.existsSync(legacyFlat)) fs.unlinkSync(legacyFlat);
          guideCount++;
          if (!staticSlugs.has(guide.slug)) dbOnlyCount++;
          if (indexable) hubGuides.push(guide); else noindexCount++;
        } catch (e) {
          console.warn(`[prerender-guides] Failed to prerender ${guide.slug}:`, e);
        }
      }

      fs.writeFileSync(path.join(distGuidesDir, 'index.html'), buildGuidesHubPage(hubGuides, spaHtml, linkCtx), 'utf-8');
      // ── Consolidation stubs: redirect-source guides + root duplicates of a
      // /guides page get raw HTML with noindex,follow + canonical → target.
      // The SPA still hydrates (and redirects guide sources) as before.
      {
        const rootMap = ROOT_GUIDE_CONSOLIDATION;
        const stubs: Array<[string, string]> = [
          ...Object.entries(policy.guideRedirects).map(([src, to]) => [`/guides/${src}`, `/guides/${to}`] as [string, string]),
          ...Object.entries(rootMap),
        ];
        let stubCount = 0;
        for (const [src, to] of stubs) {
          if (!/^\/[a-z0-9/-]+$/.test(src) || !/^\/guides\/[a-z0-9-]+$/.test(to)) continue;
          const file = path.join(distDir, src, 'index.html');
          if (fs.existsSync(file)) continue;
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, buildConsolidationStub(spaHtml, to), 'utf-8');
          stubCount++;
        }
        console.log(`[prerender-guides] ✅ ${stubCount} consolidation stubs (noindex,follow + canonical → target)`);
      }

      console.log(`[prerender-guides] ✅ Prerendered ${guideCount} guides (${dbOnlyCount} DB-only, ${noindexCount} noindex) + /guides hub (${hubGuides.length})`);

      // ── Blog articles (dist/blog/<slug>/index.html) — same filter as sitemap ──
      const { isBlogIndexable } = await import('./scripts/seo-indexability.mjs');
      const posts = await supaRestAll<BlogRow>('blog_posts',
        'select=slug,title,meta_title,meta_description,excerpt,content,author_name,published_at,updated_at,featured_image,category&is_published=eq.true&is_noindexed=eq.false&slug=not.is.null&order=slug.asc');
      if (posts === null) throw new Error('[prerender-guides] FATAL blog_posts fetch failed — sitemap blog articles would ship without HTML');
      let blogCount = 0;
      for (const post of posts) {
        if (!/^[a-z0-9-]+$/.test(post.slug) || !isBlogIndexable(post.slug, policy) || merged.has(post.slug)) continue;
        const dir = path.join(distDir, 'blog', post.slug);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), buildBlogPostPage(post, spaHtml, linkCtx), 'utf-8');
        blogCount++;
      }
      console.log(`[prerender-guides] ✅ Prerendered ${blogCount} blog articles → dist/blog/<slug>/index.html`);
    },
  };
}

/** SPA shell marked noindex,follow with a canonical to the consolidation target. */
export function buildConsolidationStub(spaHtml: string, targetPath: string): string {
  const href = `https://getpawsy.pet${targetPath}`;
  return spaHtml
    .replace(/<meta name="robots" content="[^"]*"\s*\/?>/, '<meta name="robots" content="noindex, follow" />')
    .replace(/<meta name="googlebot" content="[^"]*"\s*\/?>/, '<meta name="googlebot" content="noindex, follow" />')
    .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" id="gp-canonical" href="${href}" />`);
}

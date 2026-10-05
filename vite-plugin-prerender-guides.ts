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

export function buildGuidePage(guide: GuideJson, spaHtml: string, indexable = true): string {
  const robots = indexable ? ROBOTS_INDEX : ROBOTS_NOINDEX_FOLLOW;
  const title = guide.meta_title || guide.seoTitle || guide.title;
  const description = guide.meta_description || guide.seoDescription || guide.excerpt || '';
  const canonical = `${SITE}/guides/${guide.slug}`;
  const ogImage = guide.featuredImage
    ? `${SITE}${guide.featuredImage}`
    : `${SITE}/og-image.png`;

  const articleContent = normalizeProductLinks(buildArticleBody(guide));

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
          <li><a href="/pet-care-guides">Guides</a></li>
          <li>${escapeHtml(guide.title)}</li>
        </ol>
      </nav>
      ${articleContent}
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
export function buildGuidesHubPage(guides: GuideJson[], spaHtml: string): string {
  const canonical = `${SITE}/guides`;
  const title = 'Pet Care Guides | GetPawsy';
  const description = 'Buying guides and how-to articles for cat and dog owners from GetPawsy.';
  const { assetTags, scriptTags } = extractAssets(spaHtml);
  const items = guides
    .slice()
    .sort((x, y) => x.title.localeCompare(y.title))
    .map((g) => `<li><a href="/guides/${escapeHtml(g.slug)}">${escapeHtml(g.title)}</a>${g.excerpt ? ` — ${escapeHtml(g.excerpt)}` : ''}</li>`)
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
      const files = fs.readdirSync(guidesDir).filter(f => f.endsWith('.json') && f !== 'index.json');
      let guideCount = 0;
      let noindexCount = 0;
      const hubGuides: GuideJson[] = [];

      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(guidesDir, file), 'utf-8');
          const guide: GuideJson = JSON.parse(raw);
          if (!guide.slug || !/^[a-z0-9-]+$/.test(guide.slug)) continue;
          // Consolidation redirect sources stay SPA-only (React redirects them).
          if (guide.slug in policy.guideRedirects) continue;
          const indexable = !policy.noindexGuides.has(guide.slug);
          const html = buildGuidePage(guide, spaHtml, indexable);
          // Directory-index output: Lovable hosting resolves /guides/<slug> to
          // <slug>/index.html natively; <slug>.html needed a _redirects rewrite
          // the host does not apply.
          const slugDir = path.join(distGuidesDir, guide.slug);
          fs.mkdirSync(slugDir, { recursive: true });
          fs.writeFileSync(path.join(slugDir, 'index.html'), html, 'utf-8');
          const legacyFlat = path.join(distGuidesDir, `${guide.slug}.html`);
          if (fs.existsSync(legacyFlat)) fs.unlinkSync(legacyFlat);
          guideCount++;
          if (indexable) hubGuides.push(guide); else noindexCount++;
        } catch (e) {
          console.warn(`[prerender-guides] Failed to prerender ${file}:`, e);
        }
      }

      fs.writeFileSync(path.join(distGuidesDir, 'index.html'), buildGuidesHubPage(hubGuides, spaHtml), 'utf-8');

      console.log(`[prerender-guides] ✅ Prerendered ${guideCount} guides (${noindexCount} noindex) + /guides hub → dist/guides/<slug>/index.html`);
    },
  };
}

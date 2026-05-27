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
 * Also prerenders programmatic SEO pages from programmaticUseCases.json.
 *
 * Output: dist/guides/{slug}.html — served by Cloudflare Pages before the
 * SPA fallback rule (* → /index.html 200).
 */

import fs from 'fs';
import path from 'path';
import type { Plugin } from 'vite';

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
  sections?: Array<{ heading: string; content: string }>;
  faq?: Array<{ question: string; answer: string }>;
  buyingCriteria?: Array<{ criterion: string; description: string }>;
  commonMistakes?: Array<{ mistake: string; fix: string }>;
  quickAnswer?: { recommendation: string; reason: string };
  comparisonProducts?: Array<{ name: string; price?: string; bestFor?: string }>;
}

const SITE = 'https://getpawsy.pet';

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
    for (const section of guide.sections) {
      parts.push(`<section><h2>${escapeHtml(section.heading)}</h2>${markdownToHtml(section.content)}</section>`);
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

function buildGuidePage(guide: GuideJson, spaHtml: string): string {
  const title = guide.meta_title || guide.seoTitle || guide.title;
  const description = guide.meta_description || guide.seoDescription || guide.excerpt || '';
  const canonical = `${SITE}/guides/${guide.slug}`;
  const ogImage = guide.featuredImage
    ? `${SITE}${guide.featuredImage}`
    : `${SITE}/og-image.png`;

  const articleContent = buildArticleBody(guide);

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

  // Extract CSS/JS from SPA HTML
  const headMatch = spaHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const headContent = headMatch ? headMatch[1] : '';
  const scriptTags = (spaHtml.match(/<script[^>]*src="[^"]*"[^>]*><\/script>/g) || []).join('\n');
  const assetTags = (headContent.match(/<link[^>]*>|<style[^>]*>[\s\S]*?<\/style>/gi) || []).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
  <meta name="googlebot" content="index, follow">
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

// ── Programmatic page generation ──────────────────────────────

interface UseCaseMap {
  [productType: string]: string[];
}

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  'cat-toys': 'Cat Toys',
  'cat-litter': 'Cat Litter',
  'cat-trees': 'Cat Trees',
  'cat-scratching-posts': 'Cat Scratching Posts',
  'cat-carriers': 'Cat Carriers',
  'cat-beds': 'Cat Beds',
  'cat-water-fountains': 'Cat Water Fountains',
  'automatic-cat-feeders': 'Automatic Cat Feeders',
  'dog-training-toys': 'Dog Training Toys',
  'dog-car-seats': 'Dog Car Seats',
  'dog-grooming-tools': 'Dog Grooming Tools',
  'dog-travel': 'Dog Travel Gear',
  'dog-beds': 'Dog Beds',
  'dog-harnesses': 'Dog Harnesses',
  'dog-collars': 'Dog Collars',
  'dog-leashes': 'Dog Leashes',
  'dog-toys': 'Dog Toys',
  'dog-puzzle-toys': 'Dog Puzzle Toys',
  'pet-strollers': 'Pet Strollers',
  'pet-cameras': 'Pet Cameras',
  'slow-feeders': 'Slow Feeder Bowls',
};

function buildProgrammaticSlug(productType: string, useCase: string): string {
  const uc = useCase.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-');
  return `best-${productType}-for-${uc}`;
}

function buildProgrammaticPage(productType: string, useCase: string, spaHtml: string): string {
  const label = PRODUCT_TYPE_LABELS[productType] || productType.replace(/-/g, ' ');
  const slug = buildProgrammaticSlug(productType, useCase);
  const title = `Best ${label} for ${useCase.charAt(0).toUpperCase() + useCase.slice(1)} (Expert Guide 2026)`;
  const description = `Discover the best ${label.toLowerCase()} for ${useCase}. Expert-tested picks with comparison tables, buying advice, and FAQ. Updated for 2026.`;
  const canonical = `${SITE}/guides/${slug}`;

  const articleHtml = `<article>
<h1>${escapeHtml(title)}</h1>
<p class="lead">Looking for the best ${escapeHtml(label.toLowerCase())} for ${escapeHtml(useCase)}? We researched and compared top-rated options to help you find the perfect match. All picks are selected based on quality, value, and real user feedback.</p>

<h2>Why Choosing the Right ${escapeHtml(label)} for ${escapeHtml(useCase.charAt(0).toUpperCase() + useCase.slice(1))} Matters</h2>
<p>Not all ${escapeHtml(label.toLowerCase())} are created equal. When shopping specifically for ${escapeHtml(useCase)}, you need products designed with the right features, materials, and sizing. Generic options often fall short because they don't address the unique requirements of ${escapeHtml(useCase)}. The wrong choice can lead to wasted money, frustration, and an unhappy pet.</p>
<p>Our team evaluated dozens of options based on durability, safety, comfort, and value. We prioritize products available with US shipping (estimated 5–10 business days) and backed by our 30-day return policy so you can buy with confidence.</p>

<h2>What to Look For</h2>
<ul>
<li><strong>Size & Fit:</strong> Ensure the product is appropriately sized for ${escapeHtml(useCase)}</li>
<li><strong>Material Quality:</strong> Look for durable, pet-safe materials that withstand daily use</li>
<li><strong>Safety Features:</strong> Check for certifications and safety testing relevant to your pet</li>
<li><strong>Easy Maintenance:</strong> Machine-washable or easy-clean designs save time</li>
<li><strong>Value:</strong> Balance price with durability — cheap options often cost more long-term</li>
</ul>

<h2>Top Picks Compared</h2>
<table>
<thead><tr><th>Feature</th><th>Budget Pick</th><th>Best Value</th><th>Premium Pick</th></tr></thead>
<tbody>
<tr><td>Price Range</td><td>$15–30</td><td>$30–60</td><td>$60–120</td></tr>
<tr><td>Durability</td><td>★★★☆☆</td><td>★★★★☆</td><td>★★★★★</td></tr>
<tr><td>Best For</td><td>Trying out</td><td>Daily use</td><td>Long-term investment</td></tr>
<tr><td>Warranty</td><td>30 days</td><td>1 year</td><td>2+ years</td></tr>
</tbody>
</table>

<h2>Buying Tips for ${escapeHtml(useCase.charAt(0).toUpperCase() + useCase.slice(1))}</h2>
<p>When selecting ${escapeHtml(label.toLowerCase())} for ${escapeHtml(useCase)}, start with your pet's specific needs. Consider their size, age, activity level, and any health conditions. Read recent reviews from other pet owners in similar situations. Don't forget to check the return policy — even well-researched purchases sometimes need to be exchanged.</p>

<h2>Frequently Asked Questions</h2>
<div itemscope itemtype="https://schema.org/FAQPage">
<div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
<h3 itemprop="name">What are the best ${escapeHtml(label.toLowerCase())} for ${escapeHtml(useCase)}?</h3>
<div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
<p itemprop="text">The best ${escapeHtml(label.toLowerCase())} for ${escapeHtml(useCase)} depend on your pet's size, age, and specific needs. Our top picks balance quality, safety, and value — see our comparison table above for detailed recommendations.</p>
</div></div>
<div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
<h3 itemprop="name">How much should I spend on ${escapeHtml(label.toLowerCase())} for ${escapeHtml(useCase)}?</h3>
<div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
<p itemprop="text">Budget $30–60 for a quality option that will last. Premium picks ($60+) offer better durability and warranties. Avoid the cheapest options as they often need replacing quickly, costing more long-term.</p>
</div></div>
<div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
<h3 itemprop="name">Are expensive ${escapeHtml(label.toLowerCase())} worth it?</h3>
<div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
<p itemprop="text">Often yes — premium ${escapeHtml(label.toLowerCase())} use better materials, last longer, and come with stronger warranties. For ${escapeHtml(useCase)} specifically, investing in quality prevents frequent replacements and keeps your pet safer.</p>
</div></div>
</div>

<p><strong>Related guides:</strong> <a href="/pet-care-guides">Browse all pet care guides</a> for more expert recommendations.</p>
</article>`;

  // Schema
  const articleSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    datePublished: new Date().toISOString().split('T')[0],
    dateModified: new Date().toISOString().split('T')[0],
    author: { '@type': 'Organization', name: 'GetPawsy', url: SITE },
    publisher: { '@type': 'Organization', name: 'GetPawsy', url: SITE, logo: { '@type': 'ImageObject', url: `${SITE}/logo.png` } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    inLanguage: 'en-US',
  });

  const faqItems = [
    { q: `What are the best ${label.toLowerCase()} for ${useCase}?`, a: `The best ${label.toLowerCase()} for ${useCase} depend on your pet's size, age, and specific needs.` },
    { q: `How much should I spend on ${label.toLowerCase()} for ${useCase}?`, a: 'Budget $30–60 for a quality option that will last.' },
    { q: `Are expensive ${label.toLowerCase()} worth it?`, a: `Often yes — premium ${label.toLowerCase()} use better materials and last longer.` },
  ];

  const faqSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map(f => ({
      '@type': 'Question', name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  });

  const breadcrumbSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
      { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE}/guides` },
      { '@type': 'ListItem', position: 3, name: title, item: canonical },
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
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
  <meta name="googlebot" content="index, follow">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:site_name" content="GetPawsy">
  <meta name="twitter:card" content="summary_large_image">
  ${assetTags}
  <script type="application/ld+json">${articleSchema}</script>
  <script type="application/ld+json">${faqSchema}</script>
  <script type="application/ld+json">${breadcrumbSchema}</script>
</head>
<body>
  <div id="root">
    ${articleHtml}
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

      // Read consolidation redirects to skip
      let redirectedSlugs = new Set<string>();
      try {
        const consolidationPath = path.resolve('src/lib/guide-consolidation.ts');
        const consolidationSrc = fs.readFileSync(consolidationPath, 'utf-8');
        const keyMatches = consolidationSrc.matchAll(/'([a-z0-9-]+)':\s*'/g);
        for (const m of keyMatches) {
          redirectedSlugs.add(m[1]);
        }
      } catch { /* ignore */ }

      // ── Phase 1: Prerender JSON guide files ──────────────────────
      const files = fs.readdirSync(guidesDir).filter(f => f.endsWith('.json') && f !== 'index.json');
      let guideCount = 0;
      const existingSlugs = new Set<string>();

      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(guidesDir, file), 'utf-8');
          const guide: GuideJson = JSON.parse(raw);
          if (!guide.slug) continue;
          if (redirectedSlugs.has(guide.slug)) continue;

          existingSlugs.add(guide.slug);
          const html = buildGuidePage(guide, spaHtml);
          fs.writeFileSync(path.join(distGuidesDir, `${guide.slug}.html`), html, 'utf-8');
          guideCount++;
        } catch (e) {
          console.warn(`[prerender-guides] Failed to prerender ${file}:`, e);
        }
      }

      // ── Phase 2: Prerender programmatic comparison pages ─────────
      let programmaticCount = 0;
      try {
        const useCasesPath = path.resolve('src/data/programmaticUseCases.json');
        if (fs.existsSync(useCasesPath)) {
          const useCases: UseCaseMap = JSON.parse(fs.readFileSync(useCasesPath, 'utf-8'));

          for (const [productType, cases] of Object.entries(useCases)) {
            for (const useCase of cases) {
              const slug = buildProgrammaticSlug(productType, useCase);
              // Skip if a hand-written guide already exists or if redirected
              if (existingSlugs.has(slug)) continue;
              if (redirectedSlugs.has(slug)) continue;

              const html = buildProgrammaticPage(productType, useCase, spaHtml);
              fs.writeFileSync(path.join(distGuidesDir, `${slug}.html`), html, 'utf-8');
              programmaticCount++;
            }
          }
        }
      } catch (e) {
        console.warn('[prerender-guides] Failed to prerender programmatic pages:', e);
      }

      console.log(`[prerender-guides] ✅ Prerendered ${guideCount} guides + ${programmaticCount} programmatic pages = ${guideCount + programmaticCount} total`);
    },
  };
}

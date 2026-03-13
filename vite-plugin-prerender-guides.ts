/**
 * Vite Plugin: Prerender Guide Pages
 *
 * Generates static HTML files for every guide in public/data/guides/
 * so Googlebot receives full semantic content without requiring JS execution.
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
  seoTitle?: string;
  seoDescription?: string;
  excerpt?: string;
  category?: string;
  keywords?: string[];
  publishedAt?: string;
  updatedAt?: string;
  featuredImage?: string;
  readingTime?: number;
  sections?: Array<{ heading: string; content: string }>;
  faq?: Array<{ question: string; answer: string }>;
  buyingCriteria?: Array<{ criterion: string; description: string }>;
  commonMistakes?: Array<{ mistake: string; fix: string }>;
  quickAnswer?: { recommendation: string; reason: string };
  comparisonProducts?: Array<{ name: string; price?: string; bestFor?: string }>;
}

const SITE = 'https://getpawsy.pet';

function stripMarkdown(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')   // [text](url) → text
    .replace(/\*\*([^*]+)\*\*/g, '$1')           // **bold** → bold
    .replace(/\*([^*]+)\*/g, '$1')               // *italic* → italic
    .replace(/#{1,6}\s*/g, '')                    // headings
    .replace(/[`~]/g, '')                         // code ticks
    .replace(/\n{3,}/g, '\n\n');                  // excess newlines
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildGuidePage(guide: GuideJson, spaHtml: string): string {
  const title = guide.seoTitle || guide.title;
  const description = guide.seoDescription || guide.excerpt || '';
  const canonical = `${SITE}/guides/${guide.slug}`;
  const ogImage = guide.featuredImage
    ? `${SITE}${guide.featuredImage}`
    : `${SITE}/og-image.png`;

  // Build rich semantic content
  const contentParts: string[] = [];

  // H1
  contentParts.push(`<h1>${escapeHtml(guide.title)}</h1>`);

  // Introduction
  if (guide.excerpt) {
    contentParts.push(`<p class="lead">${escapeHtml(guide.excerpt)}</p>`);
  }

  // Quick answer
  if (guide.quickAnswer) {
    contentParts.push(`<section><h2>Quick Answer</h2><p><strong>${escapeHtml(guide.quickAnswer.recommendation)}</strong> — ${escapeHtml(guide.quickAnswer.reason)}</p></section>`);
  }

  // Buying criteria
  if (guide.buyingCriteria?.length) {
    contentParts.push(`<section><h2>Buying Guide</h2><dl>${guide.buyingCriteria.map(c =>
      `<dt>${escapeHtml(c.criterion)}</dt><dd>${escapeHtml(c.description)}</dd>`
    ).join('')}</dl></section>`);
  }

  // Comparison table
  if (guide.comparisonProducts?.length) {
    const rows = guide.comparisonProducts.map(p =>
      `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.price || '')}</td><td>${escapeHtml(p.bestFor || '')}</td></tr>`
    ).join('');
    contentParts.push(`<section><h2>Product Comparison</h2><table><thead><tr><th>Product</th><th>Price</th><th>Best For</th></tr></thead><tbody>${rows}</tbody></table></section>`);
  }

  // Main sections (the bulk of content)
  if (guide.sections?.length) {
    for (const section of guide.sections) {
      contentParts.push(`<section><h2>${escapeHtml(section.heading)}</h2>${markdownToHtml(section.content)}</section>`);
    }
  }

  // Common mistakes
  if (guide.commonMistakes?.length) {
    contentParts.push(`<section><h2>Common Mistakes to Avoid</h2><dl>${guide.commonMistakes.map(m =>
      `<dt>${escapeHtml(m.mistake)}</dt><dd>${escapeHtml(m.fix)}</dd>`
    ).join('')}</dl></section>`);
  }

  // FAQ
  if (guide.faq?.length) {
    contentParts.push(`<section><h2>Frequently Asked Questions</h2>${guide.faq.map(f =>
      `<details><summary>${escapeHtml(f.question)}</summary><p>${escapeHtml(f.answer)}</p></details>`
    ).join('')}</section>`);
  }

  const articleContent = contentParts.join('\n');

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

  const faqSchema = guide.faq?.length ? JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: guide.faq.map(f => ({
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

  // Extract <head> assets (CSS, preloads) and scripts from the SPA HTML
  const headMatch = spaHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const headContent = headMatch ? headMatch[1] : '';
  
  // Extract script tags from body
  const scriptTags = (spaHtml.match(/<script[^>]*src="[^"]*"[^>]*><\/script>/g) || []).join('\n');

  // Extract link/style tags from head (CSS, preloads, fonts)
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

export default function prerenderGuidesPlugin(): Plugin {
  return {
    name: 'prerender-guides',
    enforce: 'post',
    apply: 'build',
    async closeBundle() {
      const guidesDir = path.resolve('public/data/guides');
      const distDir = path.resolve('dist');
      const distGuidesDir = path.join(distDir, 'guides');

      // Read the built SPA index.html to extract CSS/JS references
      const spaHtmlPath = path.join(distDir, 'index.html');
      if (!fs.existsSync(spaHtmlPath)) {
        console.warn('[prerender-guides] dist/index.html not found, skipping');
        return;
      }
      const spaHtml = fs.readFileSync(spaHtmlPath, 'utf-8');

      // Ensure guides output directory exists
      if (!fs.existsSync(distGuidesDir)) {
        fs.mkdirSync(distGuidesDir, { recursive: true });
      }

      // Read the consolidation redirects to skip them
      let redirectedSlugs = new Set<string>();
      try {
        const consolidationPath = path.resolve('src/lib/guide-consolidation.ts');
        const consolidationSrc = fs.readFileSync(consolidationPath, 'utf-8');
        const keyMatches = consolidationSrc.matchAll(/'([a-z0-9-]+)':\s*'/g);
        for (const m of keyMatches) {
          redirectedSlugs.add(m[1]);
        }
      } catch { /* ignore */ }

      // Process each guide JSON
      const files = fs.readdirSync(guidesDir).filter(f => f.endsWith('.json') && f !== 'index.json');
      let count = 0;

      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(guidesDir, file), 'utf-8');
          const guide: GuideJson = JSON.parse(raw);

          if (!guide.slug) continue;
          // Skip redirected slugs — they'll 301 anyway
          if (redirectedSlugs.has(guide.slug)) continue;

          const html = buildGuidePage(guide, spaHtml);
          const outPath = path.join(distGuidesDir, `${guide.slug}.html`);
          fs.writeFileSync(outPath, html, 'utf-8');
          count++;
        } catch (e) {
          console.warn(`[prerender-guides] Failed to prerender ${file}:`, e);
        }
      }

      console.log(`[prerender-guides] ✅ Prerendered ${count} guide pages`);
    },
  };
}

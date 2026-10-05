/**
 * Internal-link canonicalizer for stored guide/blog content.
 *
 * Every in-content link is resolved to its final canonical destination:
 *  - /product/<slug>, /bestseller(s)/<slug> → /products/<slug>
 *  - /guides/<redirect source> → /guides/<target>; noindex/unknown guides → unlinked
 *  - /blog/<redirect source> → /blog/<target>; noindex blogs → unlinked
 *  - /collections/<alias> → canonical collection; invalid/withheld → unlinked
 *  - /products/<slug> not in the allowed set (when given) → unlinked
 * Unlinking keeps the anchor text, so no copy is lost.
 * Pure module: used by the hydrated pages and the build-time prerenderers.
 */
import { GUIDE_REDIRECTS } from './guide-consolidation';
import { BLOG_REDIRECTS, NOINDEX_BLOG_SLUGS } from './blog-consolidation';
import { NOINDEX_GUIDE_SLUGS } from './seo-robots-policy';
import { resolveToCanonical } from './canonical-category-registry';

export interface InternalLinkContext {
  /** Known guide slugs; when given, links to other guide slugs are unlinked. */
  knownGuides?: Set<string>;
  /** Allowed product slugs; when given, other product links are unlinked. */
  allowedProducts?: Set<string>;
  /** Allowed canonical collections; defaults to every valid registry slug. */
  allowedCollections?: Set<string>;
}

const NOINDEX_GUIDES = new Set(NOINDEX_GUIDE_SLUGS);
const HOST_RE = /^https?:\/\/(?:www\.)?getpawsy\.pet(?=\/)/i;

/** Returns the canonical href, the original href (external/other), or null to unlink. */
export function canonicalizeInternalHref(href: string, ctx: InternalLinkContext = {}): string | null {
  const local = href.replace(HOST_RE, '');
  const m = local.match(/^\/(guides|blog|collections|collection|products|product|bestsellers?)\/([a-z0-9-]+)\/?([?#].*)?$/i);
  if (!m) {
    // Nested paths under content namespaces (e.g. /guides/cluster/x) are not routes.
    if (/^\/(guides|blog|collections|products|product)\/[^?#]+\/[^?#]/i.test(local)) return null;
    return href;
  }
  const ns = m[1].toLowerCase();
  const slug = m[2].toLowerCase();
  const tail = m[3] || '';
  switch (ns) {
    case 'guides': {
      const target = GUIDE_REDIRECTS[slug] ?? slug;
      if (NOINDEX_GUIDES.has(target) || target in GUIDE_REDIRECTS) return null;
      if (ctx.knownGuides && !ctx.knownGuides.has(target)) return null;
      return `/guides/${target}${tail}`;
    }
    case 'blog': {
      const target = BLOG_REDIRECTS[slug] ?? slug;
      if (NOINDEX_BLOG_SLUGS.has(target) || target in BLOG_REDIRECTS) return null;
      return `/blog/${target}${tail}`;
    }
    case 'collections':
    case 'collection': {
      const canonical = resolveToCanonical(slug);
      if (!canonical) return null;
      if (ctx.allowedCollections && !ctx.allowedCollections.has(canonical)) return null;
      return `/collections/${canonical}${tail}`;
    }
    default: {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(slug)) return null;
      if (ctx.allowedProducts && !ctx.allowedProducts.has(slug)) return null;
      return `/products/${slug}${tail}`;
    }
  }
}

/** Rewrite every internal <a href> and markdown [text](url) link in stored content. */
export function canonicalizeInternalLinks(content: string, ctx: InternalLinkContext = {}): string {
  if (!content) return content;
  const html = content.replace(
    /<a\b([^>]*?)\bhref=(["'])([^"']+)\2([^>]*)>([\s\S]*?)<\/a>/gi,
    (whole, pre, q, href, post, text) => {
      const next = canonicalizeInternalHref(href, ctx);
      if (next === null) return text;
      return next === href ? whole : `<a${pre}href=${q}${next}${q}${post}>${text}</a>`;
    },
  );
  return html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, text, href) => {
    const next = canonicalizeInternalHref(href, ctx);
    if (next === null) return text;
    return next === href ? whole : `[${text}](${next})`;
  });
}

export declare const SITE: string;
export declare const CANONICAL_SITEMAP_COLLECTIONS: readonly string[];
export declare const PRERENDERED_STATIC_ROUTES: readonly string[];
export interface SeoPolicy {
  rootDir: string;
  guideRedirects: Record<string, string>;
  blogRedirects: Record<string, string>;
  noindexGuides: Set<string>;
  noindexBlogs: Set<string>;
  collectionAliases: Record<string, string>;
  activeCollections: Set<string>;
}
export declare function parseStringRecord(src: string, name: string): Record<string, string>;
export declare function parseStringList(src: string, name: string): string[];
export declare function loadSeoPolicy(rootDir?: string): SeoPolicy;
export declare function isProductIndexable(p: { seo_noindex?: boolean | null; seo_tier?: string | null } | null | undefined): boolean;
export declare function isGuideIndexable(slug: string, policy?: SeoPolicy): boolean;
export declare function isBlogIndexable(slug: string, policy?: SeoPolicy): boolean;
export declare function normalizeProductLinks(html: string | null | undefined): string;
export declare function assertStrictSitemapPaths(
  paths: string[],
  ctx?: { noindexProductSlugs?: Set<string>; knownGuideSlugs?: Set<string> },
  policy?: SeoPolicy,
): void;
export declare function findRedirectMapProblems(map: Record<string, string>): string[];

export function isCrawlerExcludedProduct(p: { name?: string | null; category?: string | null; description?: string | null }): boolean;

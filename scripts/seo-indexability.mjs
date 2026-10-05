/**
 * SEO indexability policy shared by the sitemap generator, the prerender
 * plugins and the regression tests. It reads the TypeScript sources that
 * already own each rule (guide/blog consolidation, robots policy, canonical
 * collection registry) so there is no second copy of the lists to drift.
 */
import fs from "node:fs";
import path from "node:path";

export const SITE = "https://getpawsy.pet";

/** Canonical collections the sitemap advertises (locked set). */
export const CANONICAL_SITEMAP_COLLECTIONS = Object.freeze([
  "dogs", "cats", "dog-beds", "cat-trees-and-condos", "cat-litter-boxes", "cat-toys", "cat-beds",
]);

/** Static routes that ship route-specific prerendered HTML. */
export const PRERENDERED_STATIC_ROUTES = Object.freeze(["/", "/products", "/guides", "/blog"]);

function read(rootDir, rel) {
  return fs.readFileSync(path.join(rootDir, rel), "utf8");
}

/** Extract `'key': 'value'` pairs from the object literal following `export const NAME`. */
export function parseStringRecord(src, name) {
  const start = src.indexOf(`export const ${name}`);
  if (start === -1) throw new Error(`[seo-policy] ${name} not found`);
  const open = src.indexOf("{", start);
  const close = src.indexOf("\n};", open);
  const body = src.slice(open, close);
  const out = {};
  for (const m of body.matchAll(/^\s*'([a-z0-9-]+)'\s*:\s*'([a-z0-9-]+)'/gm)) out[m[1]] = m[2];
  return out;
}

/** Extract quoted slugs from the array/Set literal following `const NAME`. */
export function parseStringList(src, name) {
  const start = src.search(new RegExp(`const ${name}\\b`));
  if (start === -1) throw new Error(`[seo-policy] ${name} not found`);
  const eq = src.indexOf("=", start);
  const open = src.indexOf("[", eq);
  const close = src.indexOf("]", open);
  return [...src.slice(open, close).matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
}

let cached = null;
export function loadSeoPolicy(rootDir = process.cwd()) {
  if (cached && cached.rootDir === rootDir) return cached;
  const registry = read(rootDir, "src/lib/canonical-category-registry.ts");
  const activeCollections = new Set();
  for (const m of registry.matchAll(/key:\s*'([a-z0-9-]+)'[\s\S]*?active:\s*(true|false)/g)) {
    if (m[2] === "true") activeCollections.add(m[1]);
  }
  cached = {
    rootDir,
    guideRedirects: parseStringRecord(read(rootDir, "src/lib/guide-consolidation.ts"), "GUIDE_REDIRECTS"),
    blogRedirects: parseStringRecord(read(rootDir, "src/lib/blog-consolidation.ts"), "BLOG_REDIRECTS"),
    noindexGuides: new Set(parseStringList(read(rootDir, "src/lib/seo-robots-policy.ts"), "NOINDEX_GUIDE_SLUGS")),
    noindexBlogs: new Set(parseStringList(read(rootDir, "src/lib/blog-consolidation.ts"), "NOINDEX_BLOG_SLUGS")),
    collectionAliases: parseStringRecord(registry, "SLUG_ALIASES"),
    activeCollections,
  };
  return cached;
}

/** Runtime product SEO policy: seo_noindex=true OR seo_tier='C' → noindex,follow. */
export function isProductIndexable(p) {
  if (!p) return false;
  if (p.seo_noindex === true) return false;
  if (String(p.seo_tier ?? "").trim().toUpperCase() === "C") return false;
  return true;
}

export function isGuideIndexable(slug, policy = loadSeoPolicy()) {
  return !!slug && !(slug in policy.guideRedirects) && !policy.noindexGuides.has(slug);
}

export function isBlogIndexable(slug, policy = loadSeoPolicy()) {
  return !!slug && !(slug in policy.blogRedirects) && !policy.noindexBlogs.has(slug);
}

/** Rewrite legacy singular product links to the canonical /products/ namespace. */
export function normalizeProductLinks(html) {
  return String(html ?? "").replace(/(href=["'])(?:https:\/\/getpawsy\.pet)?\/product\//g, "$1/products/");
}

/**
 * Strict manifest check. Throws on any URL that is not a canonical,
 * indexable page in the correct namespace, or on duplicate locs.
 * @param {string[]} paths site-relative paths
 * @param {{ noindexProductSlugs?: Set<string>, knownGuideSlugs?: Set<string> }} ctx
 */
export function assertStrictSitemapPaths(paths, ctx = {}, policy = loadSeoPolicy()) {
  const errors = [];
  const seen = new Set();
  const allowedCollections = new Set(CANONICAL_SITEMAP_COLLECTIONS);
  for (const p of paths) {
    if (seen.has(p)) errors.push(`duplicate loc ${p}`);
    seen.add(p);
    if (p.includes("?") || p.includes("#")) { errors.push(`query/hash in ${p}`); continue; }
    if (p !== "/" && p.endsWith("/")) errors.push(`trailing slash ${p}`);
    const seg = p.split("/").filter(Boolean);
    if (seg.length === 0) continue;
    const [ns, slug, extra] = seg;
    if (extra !== undefined) { errors.push(`invalid depth ${p}`); continue; }
    if (slug === undefined) {
      if (!PRERENDERED_STATIC_ROUTES.includes(p)) errors.push(`non-prerendered static page ${p}`);
      continue;
    }
    switch (ns) {
      case "products":
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(slug)) errors.push(`UUID product url ${p}`);
        if (ctx.noindexProductSlugs?.has(slug)) errors.push(`noindex/Tier C product ${p}`);
        break;
      case "collections":
        if (!allowedCollections.has(slug)) errors.push(`non-canonical collection ${p}`);
        if (!policy.activeCollections.has(slug)) errors.push(`inactive collection ${p}`);
        break;
      case "guides":
        if (slug in policy.guideRedirects) errors.push(`guide redirect source ${p}`);
        if (policy.noindexGuides.has(slug)) errors.push(`noindex guide ${p}`);
        if (ctx.knownGuideSlugs && !ctx.knownGuideSlugs.has(slug)) errors.push(`unknown guide ${p}`);
        break;
      case "blog":
        if (slug in policy.blogRedirects) errors.push(`blog redirect source ${p}`);
        if (policy.noindexBlogs.has(slug)) errors.push(`noindex blog ${p}`);
        break;
      default:
        errors.push(`invalid namespace ${p}`);
    }
  }
  if (errors.length) {
    throw new Error(`[sitemaps] FATAL strict manifest violations (${errors.length}):\n  ${errors.slice(0, 40).join("\n  ")}`);
  }
}

/** Redirect maps whose targets point at themselves or at another redirect source. */
export function findRedirectMapProblems(map) {
  const problems = [];
  for (const [from, to] of Object.entries(map)) {
    if (from === to) problems.push(`self-redirect ${from}`);
    else if (to in map) problems.push(`chain ${from} -> ${to} -> ${map[to]}`);
  }
  return problems;
}

/** Non-pet exclusion patterns — only cats & dogs allowed */
const NON_PET_RE = [
  /\b(bird|parrot|parakeet|cockatiel|canary|finch|budgie|macaw|aviary|bird\s*cage)\b/i,
  /\b(reptile|snake|lizard|gecko|iguana|turtle|tortoise|terrarium|vivarium)\b/i,
  /\b(chicken|poultry|hen|rooster|coop|egg\s*incubator)\b/i,
  /\b(hamster|gerbil|guinea\s*pig|chinchilla|ferret|rodent|hamster\s*cage|hamster\s*wheel)\b/i,
  /\b(fish\s*tank|aquarium|fish\s*food|fish\s*bowl|betta|goldfish)\b/i,
  /\b(rabbit\s*hutch|rabbit\s*cage|bunny\s*cage)\b/i,
  /\b(sunglasses|nail\s*art|fashion\s*accessor|jewelry|bracelet|necklace|earring)\b/i,
];
const POLICY_UNSAFE_RE = [
  /shock\s*(collar|training|correction)?/i, /static\s*correction/i,
  /electric\s*(fence|collar|training)/i, /aversive\s*training/i,
  /wireless\s*fence/i, /training\s*collar/i, /prong\s*collar/i, /choke\s*chain/i,
];
/** Products never prerendered nor advertised in the sitemap (non-pet / policy-unsafe). */
export function isCrawlerExcludedProduct(p) {
  const text = `${p?.name || ""} ${p?.category || ""} ${p?.description || ""}`;
  return NON_PET_RE.some((r) => r.test(text)) || POLICY_UNSAFE_RE.some((r) => r.test(text));
}

/**
 * Primary merchandised collections (merch_hidden=false only), parsed from the
 * runtime source of truth in src/lib/collection-matching-engine.ts.
 */
export function loadPrimaryMerchandisedCollections(rootDir = process.cwd()) {
  const src = fs.readFileSync(path.join(rootDir, "src/lib/collection-matching-engine.ts"), "utf-8");
  const m = src.match(/PRIMARY_MERCHANDISED_COLLECTIONS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  if (!m) throw new Error("[seo-indexability] PRIMARY_MERCHANDISED_COLLECTIONS not found");
  return new Set([...m[1].matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1]));
}

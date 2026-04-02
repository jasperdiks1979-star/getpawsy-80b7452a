import { supabase } from '@/integrations/supabase/client';
import { CollectionMapEntry } from '@/config/collectionMap';

export interface CollectionProduct {
  id: string;
  name: string;
  price: number;
  compare_at_price: number | null;
  image_url: string | null;
  slug: string | null;
  category: string | null;
  stock: number | null;
  created_at: string;
  updated_at: string;
  primary_species?: string | null;
  primary_intent?: string | null;
}

export interface CollectionMatchResult {
  products: CollectionProduct[];
  fallbackTriggered: boolean;
  appliedFilters: string[];
  debug: {
    slug: string;
    primaryMatches: number;
    fallbackMatches: number;
  };
}

interface SeoCollectionLike {
  slug: string;
  name: string;
  product_category_filter: string | null;
  product_keyword_filter: string | null;
}

interface ScoredProduct extends CollectionProduct {
  _score: number;
}

const MIN_COLLECTION_PRODUCTS = 12;
const HARD_MIN_PRODUCTS = 6;

const CORE_COLLECTION_SYNONYMS: Record<string, string[]> = {
  'cat-trees-and-condos': ['cat tree', 'cat condo', 'cat tower', 'cat furniture'],
  'best-cat-litter-boxes': ['litter', 'litter box', 'self cleaning litter', 'odor control litter'],
};

function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function singularizeToken(token: string): string {
  if (token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.endsWith('ses')) return token.slice(0, -2);
  if (token.endsWith('s') && token.length > 3) return token.slice(0, -1);
  return token;
}

// Generic single-word tokens that match too broadly and cause cross-category contamination
const GENERIC_TOKENS = new Set(['dog', 'cat', 'pet', 'kitten', 'puppy', 'best', 'for', 'and', 'the', 'with', '2026', 'new', 'top']);

function buildKeywordSet(collection: SeoCollectionLike, config?: CollectionMapEntry): string[] {
  const fromDbKeywords = (collection.product_keyword_filter || '')
    .split(',')
    .map(k => k.trim().toLowerCase())
    .filter(Boolean);

  const slugTokens = normalizeSlug(collection.slug)
    .split('-')
    .map(t => singularizeToken(t))
    .filter(t => t.length > 2 && !GENERIC_TOKENS.has(t));

  const slugPhrase = slugTokens.join(' ');

  const merged = new Set<string>([
    ...(config?.keywords || []),
    ...(config?.fallbackKeywords || []),
    ...fromDbKeywords,
    ...(collection.product_category_filter ? [collection.product_category_filter.toLowerCase()] : []),
    ...(CORE_COLLECTION_SYNONYMS[collection.slug] || []),
    // Only add slug phrase (multi-word), never individual generic tokens
    ...(slugPhrase && slugPhrase.includes(' ') ? [slugPhrase] : slugTokens),
  ]);

  // Remove any remaining single generic tokens
  const result = Array.from(merged).filter(k => k && !GENERIC_TOKENS.has(k));
  return result;
}

function textContainsAny(text: string, keywords: string[]): number {
  let score = 0;
  for (const kw of keywords) {
    if (!kw) continue;
    const normalizedKw = kw.toLowerCase();
    if (text.includes(normalizedKw)) {
      score += normalizedKw.includes(' ') ? 3 : 1;
      continue;
    }
    const singular = singularizeToken(normalizedKw);
    if (singular !== normalizedKw && text.includes(singular)) {
      score += singular.includes(' ') ? 2 : 1;
    }
  }
  return score;
}

/**
 * When product_category_filter is set, it acts as a HARD FILTER.
 * Products MUST match the category to be included.
 * This prevents cross-category contamination (e.g., dog travel items in dog beds).
 */
function matchesCategoryFilter(product: CollectionProduct, categoryFilter: string | null): boolean {
  if (!categoryFilter) return true; // No filter = allow all
  const category = (product.category || '').toLowerCase();
  return category.includes(categoryFilter.toLowerCase());
}

function scoreProduct(product: CollectionProduct & Record<string, unknown>, slug: string, keywords: string[], categoryFilter?: string | null): number {
  const name = product.name.toLowerCase();
  const category = (product.category || '').toLowerCase();
  const pSlug = (product.slug || '').toLowerCase();
  const combined = `${name} ${category} ${pSlug}`;
  const normalizedCollection = normalizeSlug(slug);

  let score = 0;

  // Priority 1: exact collection key match (when/if fields exist)
  const collectionKey = String((product as Record<string, unknown>).collection || '').toLowerCase();
  const seoCollectionKey = String((product as Record<string, unknown>).seo_collection_key || '').toLowerCase();
  if (collectionKey && normalizeSlug(collectionKey) === normalizedCollection) score += 16;
  if (seoCollectionKey && normalizeSlug(seoCollectionKey) === normalizedCollection) score += 16;

  // Priority 2: normalized slug match
  if (combined.includes(normalizedCollection.replace(/-/g, ' '))) {
    score += 10;
  }

  // Priority 3: category exact match (strong signal)
  if (categoryFilter && category.includes(categoryFilter.toLowerCase())) {
    score += 10;
  }

  // Priority 4: keyword/tag scoring
  score += textContainsAny(combined, keywords);

  const tagsValue = (product as Record<string, unknown>).tags;
  if (Array.isArray(tagsValue)) {
    const lowerTags = tagsValue.map(t => String(t).toLowerCase());
    for (const kw of keywords) {
      if (lowerTags.some(tag => tag.includes(kw))) score += 2;
    }
  } else if (typeof tagsValue === 'string') {
    score += textContainsAny(tagsValue.toLowerCase(), keywords);
  }

  return score;
}

function similarityScore(product: CollectionProduct, keywords: string[]): number {
  const text = `${product.name} ${product.category || ''} ${product.slug || ''}`.toLowerCase();
  const tokens = new Set(text.split(/[^a-z0-9]+/g).filter(Boolean));
  let score = 0;
  for (const kw of keywords) {
    const kwTokens = kw.toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean);
    const hits = kwTokens.filter(t => tokens.has(singularizeToken(t)) || tokens.has(`${singularizeToken(t)}s`)).length;
    score += hits;
  }
  return score;
}

export async function resolveCollectionProducts(
  collection: SeoCollectionLike,
  config?: CollectionMapEntry,
): Promise<CollectionMatchResult> {
  // ── SPECIAL CASE: "all" collection returns the FULL catalog (no keyword scoring) ──
  if (collection.slug === 'all') {
    const { data: allProducts, error: allErr } = await supabase
      .from('products_public')
      .select('id, name, price, compare_at_price, image_url, slug, category, stock, created_at, updated_at, primary_species, primary_intent')
      .eq('is_active', true)
      .eq('is_duplicate', false)
      .gt('price', 0)
      .not('image_url', 'is', null)
      .order('price', { ascending: false })
      .limit(500);

    const products = (allProducts || []) as CollectionProduct[];

    if (import.meta.env.DEV || typeof window !== 'undefined') {
      console.info('[CollectionEngine] /collections/all', {
        totalInDB: products.length,
        returned: products.length,
        error: allErr?.message || null,
      });
    }

    return {
      products,
      fallbackTriggered: !!allErr,
      appliedFilters: ['is_active = true', 'is_duplicate = false', 'price > 0', 'image_url IS NOT NULL', 'NO keyword filter (show all)'],
      debug: { slug: 'all', primaryMatches: products.length, fallbackMatches: 0 },
    };
  }

  const keywords = buildKeywordSet(collection, config);
  const appliedFilters = [
    "is_active = true",
    'is_duplicate = false',
    'price > 0',
    'image_url IS NOT NULL',
    'exact collection key OR normalized slug OR category OR keyword/tag match',
  ];

  const { data: pool, error } = await supabase
    .from('products_public')
    .select('id, name, price, compare_at_price, image_url, slug, category, stock, created_at, updated_at, primary_species, primary_intent')
    .eq('is_active', true)
    .eq('is_duplicate', false)
    .gt('price', 0)
    .not('image_url', 'is', null)
    .limit(900);

  if (error || !pool) {
    if (import.meta.env.DEV) {
      console.error('[CollectionEngine] Failed product pool fetch', { slug: collection.slug, error });
    }
    return {
      products: [],
      fallbackTriggered: true,
      appliedFilters,
      debug: { slug: collection.slug, primaryMatches: 0, fallbackMatches: 0 },
    };
  }

  // CATEGORY FILTER: When product_category_filter is set, prefer products matching that category.
  // If category-matched products exist, use ONLY those (prevents cross-category contamination).
  // If zero match the category, fall back to keyword-only matching on the full pool.
  const hasCategoryFilter = !!collection.product_category_filter;
  let effectivePool = pool;
  let fallbackTriggered = false;

  if (hasCategoryFilter) {
    const categoryMatched = pool.filter(p => matchesCategoryFilter(p as CollectionProduct, collection.product_category_filter));
    if (categoryMatched.length > 0) {
      effectivePool = categoryMatched;
    } else {
      // No products match the category — fall back to keyword matching
      fallbackTriggered = true;
    }
  }

  const scoredPrimary: ScoredProduct[] = effectivePool
    .map((p) => ({
      ...p,
      _score: scoreProduct(p as CollectionProduct & Record<string, unknown>, collection.slug, keywords, collection.product_category_filter),
    }))
    .filter((p) => p._score > 0);

  scoredPrimary.sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    const aStock = (a.stock ?? 0) > 0 ? 0 : 1;
    const bStock = (b.stock ?? 0) > 0 ? 0 : 1;
    if (aStock !== bStock) return aStock - bStock;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  const products = scoredPrimary.slice(0, 48) as CollectionProduct[];

  if (import.meta.env.DEV) {
    console.info('[CollectionEngine]', {
      slug: collection.slug,
      matchedProducts: products.length,
      fallbackTriggered,
      appliedFilters,
    });
  }

  return {
    products,
    fallbackTriggered,
    appliedFilters,
    debug: {
      slug: collection.slug,
      primaryMatches: scoredPrimary.length,
      fallbackMatches: 0,
    },
  };
}

export function normalizeCollectionSlug(input: string): string {
  return normalizeSlug(input);
}

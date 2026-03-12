const STOPWORDS = new Set(['best', 'for', 'and', 'the', 'with', 'from', 'shop', 'guide', 'collection', 'products', 'product', 'pet', 'pets', '2026']);

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function singularize(token) {
  if (token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.endsWith('ses')) return token.slice(0, -2);
  if (token.endsWith('s') && token.length > 3) return token.slice(0, -1);
  return token;
}

function slugTokens(slug) {
  return normalizeText(slug)
    .split(/[-\s]+/)
    .map(singularize)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function buildCollectionKeywords(collection) {
  const dbKeywords = String(collection.product_keyword_filter || '')
    .split(',')
    .map((k) => normalizeText(k))
    .filter(Boolean);

  const tokens = slugTokens(collection.slug);
  const phrase = tokens.join(' ');
  const categoryFilter = normalizeText(collection.product_category_filter || '');

  return Array.from(
    new Set([
      ...dbKeywords,
      ...tokens,
      ...(phrase ? [phrase] : []),
      ...(categoryFilter ? [categoryFilter] : []),
    ]),
  );
}

function scoreCollectionProduct(product, collection, keywords) {
  const name = normalizeText(product.name || '');
  const category = normalizeText(product.category || '');
  const slug = normalizeText(product.slug || '');
  const haystack = `${name} ${category} ${slug}`;

  let score = 0;

  const categoryFilter = normalizeText(collection.product_category_filter || '');
  if (categoryFilter && category.includes(categoryFilter)) score += 10;

  for (const kw of keywords) {
    if (!kw) continue;
    if (haystack.includes(kw)) {
      score += kw.includes(' ') ? 3 : 1;
    }
  }

  return score;
}

export function filterValidCollectionCandidates(collections, products, options = {}) {
  const minProducts = Math.max(1, Number(options.minProducts || 4));
  const validCollections = [];
  const excludedCollections = [];
  const seen = new Set();

  for (const collection of collections || []) {
    const slug = String(collection?.slug || '').trim();
    if (!slug) {
      excludedCollections.push({ slug: '(missing)', reason: 'missing_slug', matchCount: 0 });
      continue;
    }

    if (seen.has(slug)) {
      excludedCollections.push({ slug, reason: 'duplicate_slug', matchCount: 0 });
      continue;
    }
    seen.add(slug);

    const keywords = buildCollectionKeywords(collection);
    const matches = (products || []).filter((p) => scoreCollectionProduct(p, collection, keywords) > 0);

    if (matches.length < minProducts) {
      excludedCollections.push({ slug, reason: `insufficient_matches_<${minProducts}`, matchCount: matches.length });
      continue;
    }

    validCollections.push({
      slug,
      updated_at: collection.updated_at || null,
      path: `/collections/${slug}`,
      matchCount: matches.length,
    });
  }

  return { validCollections, excludedCollections };
}

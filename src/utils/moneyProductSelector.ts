/**
 * Money Product Selection Engine
 * 
 * Programmatically selects top "money products" using weighted scoring:
 * - marginScore (30%) — proxy via price margin if compare_at_price exists
 * - problemIntensityScore (20%) — title keyword matching
 * - searchIntentScore (20%) — high-intent keyword presence
 * - priceRangeOptimization (15%) — sweet spot $30–$80
 * - categoryCompetitionScore (15%) — high-volume category membership
 */

import { supabase } from '@/integrations/supabase/client';

interface MoneyProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_at_price: number | null;
  image_url: string | null;
  category: string | null;
  variants?: unknown;
  moneyScore: number;
}

// High-intent problem-solving keywords
const PROBLEM_KEYWORDS = [
  'orthopedic', 'anxiety', 'anti bark', 'dental', 'waterproof',
  'automatic', 'travel', 'car seat', 'large dog', 'heavy duty',
  'no pull', 'self cleaning', 'calming', 'cooling', 'indestructible',
  'senior', 'training', 'slow feeder', 'elevated', 'crash tested',
];

// High-volume categories that convert well
const HIGH_VOLUME_CATEGORIES = [
  'dog beds', 'cat beds', 'car seats', 'litter box', 'feeders',
  'harness', 'cat tree', 'cat condo', 'grooming', 'carrier',
  'dog toy', 'cat toy', 'leash', 'bowl', 'crate',
];

function calcMarginScore(price: number, compareAt: number | null): number {
  if (!compareAt || compareAt <= price) return 0.3; // no data → neutral
  const margin = (compareAt - price) / compareAt;
  return Math.min(margin, 1); // 0–1
}

function calcProblemIntensityScore(name: string): number {
  const lower = name.toLowerCase();
  const matches = PROBLEM_KEYWORDS.filter(kw => lower.includes(kw));
  return Math.min(matches.length * 0.25, 1); // each match = 0.25, max 1
}

function calcSearchIntentScore(name: string): number {
  // Same keywords but weighted differently — presence = high search intent
  const lower = name.toLowerCase();
  const matches = PROBLEM_KEYWORDS.filter(kw => lower.includes(kw));
  return matches.length > 0 ? Math.min(0.3 + matches.length * 0.2, 1) : 0.1;
}

function calcPriceRangeScore(price: number): number {
  if (price >= 30 && price <= 80) return 1;
  if (price >= 20 && price < 30) return 0.7;
  if (price > 80 && price <= 120) return 0.6;
  if (price > 120 && price <= 150) return 0.4;
  return 0.2;
}

function calcCategoryScore(category: string | null): number {
  if (!category) return 0.2;
  const lower = category.toLowerCase();
  const match = HIGH_VOLUME_CATEGORIES.some(cat => lower.includes(cat));
  return match ? 1 : 0.3;
}

function scoreProduct(product: {
  name: string;
  price: number;
  compare_at_price: number | null;
  category: string | null;
}): number {
  const margin = calcMarginScore(product.price, product.compare_at_price);
  const problem = calcProblemIntensityScore(product.name);
  const intent = calcSearchIntentScore(product.name);
  const priceRange = calcPriceRangeScore(product.price);
  const catScore = calcCategoryScore(product.category);

  return (
    margin * 0.30 +
    problem * 0.20 +
    intent * 0.20 +
    priceRange * 0.15 +
    catScore * 0.15
  );
}

/**
 * Fetch and score the top money products.
 * Throws if fewer than `minRequired` products available.
 */
export async function getTopMoneyProducts(
  limit = 20,
  minRequired = 15,
): Promise<MoneyProduct[]> {
  const { data, error } = await supabase
    .from('products_public')
    .select('id, name, slug, price, compare_at_price, image_url, category, variants')
    .eq('is_active', true)
    .not('slug', 'is', null)
    .not('image_url', 'is', null)
    .gt('price', 0)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) throw error;
  if (!data || data.length < minRequired) {
    throw new Error(
      `MoneyProductSelector: insufficient products (${data?.length ?? 0} < ${minRequired})`,
    );
  }

  const scored: MoneyProduct[] = data.map(p => ({
    id: p.id,
    name: p.name || '',
    slug: p.slug!,
    price: Number(p.price),
    compare_at_price: p.compare_at_price ? Number(p.compare_at_price) : null,
    image_url: p.image_url,
    category: p.category,
    moneyScore: scoreProduct({
      name: p.name || '',
      price: Number(p.price),
      compare_at_price: p.compare_at_price ? Number(p.compare_at_price) : null,
      category: p.category,
    }),
  }));

  scored.sort((a, b) => b.moneyScore - a.moneyScore);

  return scored.slice(0, limit);
}

/** React Query key */
export const MONEY_PRODUCTS_QUERY_KEY = ['money-products'] as const;

/**
 * Winning Product Finder — Scoring Engine
 *
 * Weights:
 *   Problem-Solving   3×
 *   Perceived Value    2×
 *   Visual Appeal      2×
 *   Viral Potential    2×
 *   Margin Potential   2×
 *   Category Strength  1.5×
 *
 * Total weight = 12.5 → normalised to 0-100.
 */

import { supabase } from '@/integrations/supabase/client';

/* ─── types ─────────────────────────────────────────── */

export interface ScoredProduct {
  id: string;
  name: string;
  slug: string | null;
  price: number;
  compare_at_price: number | null;
  image_url: string | null;
  images: string[] | null;
  category: string | null;
  description: string | null;
  stock: number | null;
  winningScore: number;
  tier: 'winner' | 'test' | 'reject';
  breakdown: ScoreBreakdown;
  hook: string;
  marketingAngle: string;
  emotionalTrigger: string;
  suggestedHeadline: string;
}

export interface ScoreBreakdown {
  problemSolving: number;
  perceivedValue: number;
  visualAppeal: number;
  viralPotential: number;
  marginPotential: number;
  categoryStrength: number;
}

/* ─── keyword dictionaries ──────────────────────────── */

const PROBLEM_KEYWORDS = [
  'orthopedic', 'anxiety', 'anti bark', 'no pull', 'calming',
  'cooling', 'indestructible', 'waterproof', 'training', 'slow feeder',
  'dental', 'joint', 'senior', 'teething', 'scratch', 'odor',
  'potty', 'separation', 'aggressive chewer', 'heavy duty',
  'car seat', 'crash tested', 'elevated', 'self cleaning',
  'anti-pull', 'no-pull', 'stop pulling', 'stop barking',
];

const PREMIUM_CATEGORIES = [
  'dog beds', 'dog training', 'car seat', 'dog crate', 'cat tree',
  'cat condo', 'harness', 'carrier', 'feeder', 'grooming',
];

const LOW_VALUE_CATEGORIES = [
  'leash', 'collar', 'bowl', 'tag', 'bandana', 'scarf',
];

const AD_FRIENDLY_KEYWORDS = [
  'before after', 'no pull', 'stop', 'calm', 'relax', 'sleep',
  'safe', 'protect', 'train', 'control', 'comfort', 'relief',
  'transform', 'upgrade', 'premium',
];

/* ─── hard filters ──────────────────────────────────── */

function passesHardFilter(p: {
  price: number | null;
  name: string | null;
  image_url: string | null;
  is_duplicate: boolean | null;
}): boolean {
  if (!p.price || p.price < 15) return false;
  if (!p.name || p.name.trim().length < 5) return false;
  if (!p.image_url) return false;
  if (p.is_duplicate) return false;
  return true;
}

/* ─── individual scorers (each returns 0-10) ────────── */

function scoreProblemSolving(name: string, desc: string): number {
  const text = `${name} ${desc}`.toLowerCase();
  const hits = PROBLEM_KEYWORDS.filter(k => text.includes(k)).length;
  if (hits >= 4) return 10;
  if (hits >= 3) return 8;
  if (hits >= 2) return 6;
  if (hits >= 1) return 4;
  return 1;
}

function scorePerceivedValue(price: number): number {
  if (price >= 60 && price <= 150) return 10;
  if (price >= 40 && price < 60) return 8;
  if (price >= 30 && price < 40) return 6;
  if (price >= 15 && price < 30) return 3;
  if (price > 150) return 5;
  return 1;
}

function scoreVisualAppeal(imageUrl: string | null, images: string[] | null): number {
  let score = 3; // baseline
  if (imageUrl && imageUrl.length > 10) score += 3;
  if (images && images.length >= 3) score += 2;
  if (images && images.length >= 5) score += 2;
  return Math.min(score, 10);
}

function scoreViralPotential(name: string, desc: string): number {
  const text = `${name} ${desc}`.toLowerCase();
  const hits = AD_FRIENDLY_KEYWORDS.filter(k => text.includes(k)).length;
  if (hits >= 4) return 10;
  if (hits >= 3) return 8;
  if (hits >= 2) return 6;
  if (hits >= 1) return 4;
  return 2;
}

function scoreMarginPotential(price: number, compareAt: number | null): number {
  if (compareAt && compareAt > price) {
    const margin = (compareAt - price) / compareAt;
    if (margin >= 0.5) return 10;
    if (margin >= 0.4) return 8;
    if (margin >= 0.3) return 6;
    return 4;
  }
  // No compare_at → estimate from price (higher price = usually higher margin)
  if (price >= 60) return 7;
  if (price >= 40) return 5;
  return 3;
}

function scoreCategoryStrength(category: string | null): number {
  if (!category) return 3;
  const c = category.toLowerCase();
  if (PREMIUM_CATEGORIES.some(k => c.includes(k))) return 10;
  if (LOW_VALUE_CATEGORIES.some(k => c.includes(k))) return 2;
  return 5;
}

/* ─── composite score (normalised 0-100) ────────────── */

function computeWinningScore(breakdown: ScoreBreakdown): number {
  const raw =
    breakdown.problemSolving * 3 +
    breakdown.perceivedValue * 2 +
    breakdown.visualAppeal * 2 +
    breakdown.viralPotential * 2 +
    breakdown.marginPotential * 2 +
    breakdown.categoryStrength * 1.5;
  // max raw = 10 × 12.5 = 125
  return Math.round((raw / 125) * 100);
}

function classifyTier(score: number): 'winner' | 'test' | 'reject' {
  if (score >= 80) return 'winner';
  if (score >= 60) return 'test';
  return 'reject';
}

/* ─── positioning engine ────────────────────────────── */

function generatePositioning(name: string, category: string | null) {
  const cat = (category || 'pet product').toLowerCase();
  const isTraining = /train|harness|pull|bark|leash/.test(`${name} ${cat}`.toLowerCase());
  const isComfort = /bed|sleep|orthopedic|calm|comfort|crate/.test(`${name} ${cat}`.toLowerCase());
  const isTravel = /car|travel|carrier|booster|seat/.test(`${name} ${cat}`.toLowerCase());
  const isCat = /cat|kitten|feline/.test(`${name} ${cat}`.toLowerCase());

  if (isTraining) {
    return {
      hook: 'Stop the struggle — start enjoying walks again.',
      marketingAngle: 'Problem → Solution: pulling/barking → instant control',
      emotionalTrigger: 'Frustration relief + bond with your dog',
      suggestedHeadline: `${name} — Real Control, Zero Stress`,
    };
  }
  if (isComfort) {
    return {
      hook: 'Your pet deserves deeper rest — starting tonight.',
      marketingAngle: 'Pain/discomfort → premium comfort & joint relief',
      emotionalTrigger: 'Care for aging or active pets',
      suggestedHeadline: `${name} — Deep Sleep & Total Comfort`,
    };
  }
  if (isTravel) {
    return {
      hook: 'Travel safe — every ride, every trip.',
      marketingAngle: 'Fear of car rides → safe, stress-free travel',
      emotionalTrigger: 'Peace of mind during travel',
      suggestedHeadline: `${name} — Safe Rides, Happy Pets`,
    };
  }
  if (isCat) {
    return {
      hook: 'Give your cat the space they actually want.',
      marketingAngle: 'Boredom/destruction → enrichment & play',
      emotionalTrigger: 'Keep indoor cats happy & healthy',
      suggestedHeadline: `${name} — Built for Happy Cats`,
    };
  }
  return {
    hook: 'The upgrade your pet has been waiting for.',
    marketingAngle: 'Generic product → premium solution',
    emotionalTrigger: 'Show your pet you care',
    suggestedHeadline: `${name} — Premium Quality, Real Results`,
  };
}

/* ─── main fetch + score ────────────────────────────── */

export async function findWinningProducts(): Promise<{
  all: ScoredProduct[];
  winners: ScoredProduct[];
  testProducts: ScoredProduct[];
  rejects: ScoredProduct[];
  homepagePicks: ScoredProduct[];
  adWinners: ScoredProduct[];
}> {
  const { data, error } = await supabase
    .from('products_public')
    .select('id, name, slug, price, compare_at_price, image_url, images, category, description, stock, is_duplicate, is_active')
    .eq('is_active', true)
    .not('image_url', 'is', null)
    .gt('price', 0);

  if (error) throw error;

  const filtered = (data ?? []).filter(p =>
    passesHardFilter({
      price: p.price,
      name: p.name,
      image_url: p.image_url,
      is_duplicate: p.is_duplicate,
    }),
  );

  const scored: ScoredProduct[] = filtered.map(p => {
    const name = p.name || '';
    const desc = p.description || '';
    const price = Number(p.price);

    const breakdown: ScoreBreakdown = {
      problemSolving: scoreProblemSolving(name, desc),
      perceivedValue: scorePerceivedValue(price),
      visualAppeal: scoreVisualAppeal(p.image_url, p.images),
      viralPotential: scoreViralPotential(name, desc),
      marginPotential: scoreMarginPotential(price, p.compare_at_price ? Number(p.compare_at_price) : null),
      categoryStrength: scoreCategoryStrength(p.category),
    };

    const winningScore = computeWinningScore(breakdown);
    const positioning = generatePositioning(name, p.category);

    return {
      id: p.id!,
      name,
      slug: p.slug,
      price,
      compare_at_price: p.compare_at_price ? Number(p.compare_at_price) : null,
      image_url: p.image_url,
      images: p.images,
      category: p.category,
      description: desc,
      stock: p.stock,
      winningScore,
      tier: classifyTier(winningScore),
      breakdown,
      ...positioning,
    };
  });

  scored.sort((a, b) => b.winningScore - a.winningScore);

  const winners = scored.filter(p => p.tier === 'winner');
  const testProducts = scored.filter(p => p.tier === 'test');
  const rejects = scored.filter(p => p.tier === 'reject');

  // Homepage picks: top 5 winners with best visual + perceived value
  const homepagePicks = [...winners]
    .sort((a, b) =>
      (b.breakdown.visualAppeal + b.breakdown.perceivedValue) -
      (a.breakdown.visualAppeal + a.breakdown.perceivedValue),
    )
    .slice(0, 5);

  // Ad winners: top 3 by viral potential + problem solving
  const adWinners = [...winners]
    .sort((a, b) =>
      (b.breakdown.viralPotential + b.breakdown.problemSolving) -
      (a.breakdown.viralPotential + a.breakdown.problemSolving),
    )
    .slice(0, 3);

  return { all: scored, winners, testProducts, rejects, homepagePicks, adWinners };
}

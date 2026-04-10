/**
 * Position Boost Engine V2
 * 
 * Targets product URLs ranking 11–20 with:
 * - Title rewrite (55–65 chars): Primary Keyword + Benefit + 2026 Modifier
 * - FAQ schema (2–3 Q/A)
 * - 120-word buyer intent intro
 * - 3 contextual internal links
 */

import { SEO_CONTENT_CLUSTERS } from './seo-content-clusters';

export interface PositionBoostTarget {
  slug: string;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
  originalTitle: string;
  boostedTitle: string;
  buyerIntro: string;
  faqSchema: Array<{ question: string; answer: string }>;
  internalLinks: Array<{ targetSlug: string; anchorText: string }>;
  estimatedLift: string;
}

export interface PositionBoostResult {
  targets: PositionBoostTarget[];
  totalTargets: number;
  avgCurrentPosition: number;
  projectedAvgPosition: number;
}

const BENEFIT_MODIFIERS = [
  'Expert-Tested',
  'Premium Quality',
  'Top-Rated',
  'Best Value',
  'Pet Owner Favorite',
] as const;

function humanize(slug: string): string {
  return slug.replace(/^(product\/|products\/|bestseller\/)/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
}

function buildTitle(slug: string, position: number): string {
  const kw = humanize(slug);
  const hash = slug.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const benefit = BENEFIT_MODIFIERS[hash % BENEFIT_MODIFIERS.length];

  // Format: Primary Keyword + Benefit + 2026
  let title = `${kw} — ${benefit} (2026)`;
  if (title.length > 65) {
    title = `${kw} (2026) — ${benefit}`;
  }
  if (title.length > 65) {
    title = `${kw} — ${benefit}`;
  }
  if (title.length > 65) {
    title = title.slice(0, 62) + '...';
  }
  return title;
}

function buildBuyerIntro(slug: string): string {
  const name = humanize(slug).toLowerCase();
  return `Looking for the best ${name} in 2026? Our team of pet experts and veterinarians have tested and compared the top options available today. Whether you're shopping for a puppy, adult dog, or senior pet, this guide breaks down what actually matters — quality, safety, and real-world durability. We've cut through the marketing hype to bring you honest recommendations based on hands-on testing. Every product featured here meets our strict safety standards and has been verified by real pet owners across the US.`;
}

function buildFaq(slug: string): Array<{ question: string; answer: string }> {
  const name = humanize(slug).toLowerCase();
  return [
    {
      question: `What is the best ${name} for 2026?`,
      answer: `Based on expert testing and customer reviews, the top ${name} options for 2026 combine durability, safety, and great value. See our ranked comparison above for specific product recommendations.`,
    },
    {
      question: `How do I choose the right ${name}?`,
      answer: `Consider your pet's size, age, and activity level. Look for products made from pet-safe materials with positive verified reviews. Our buying guide above covers all key factors.`,
    },
    {
      question: `Is this ${name} worth the price?`,
      answer: `Quality ${name} products are a worthwhile investment in your pet's health and happiness. The options we recommend offer the best balance of quality and value, with free US shipping included.`,
    },
  ];
}

function findInternalLinks(slug: string): Array<{ targetSlug: string; anchorText: string }> {
  const links: Array<{ targetSlug: string; anchorText: string }> = [];
  const kw = slug.replace(/-/g, ' ').toLowerCase();

  for (const cluster of SEO_CONTENT_CLUSTERS) {
    if (cluster.priority === 'deprioritized') continue;
    const match = kw.split(' ').some(w => w.length > 3 && cluster.pillarKeyword.toLowerCase().includes(w));
    if (match) {
      links.push({ targetSlug: cluster.pillarSlug, anchorText: `${humanize(cluster.pillarSlug)} Guide` });
      for (const topic of cluster.blogTopics.slice(0, 2)) {
        links.push({ targetSlug: topic.slug, anchorText: humanize(topic.slug) });
      }
      break;
    }
  }

  return links.slice(0, 3);
}

export function runPositionBoostV2(
  pages: Array<{ slug: string; position: number; impressions: number; clicks: number; ctr: number; title?: string }>
): PositionBoostResult {
  const candidates = pages
    .filter(p => p.position >= 11 && p.position <= 20 && p.impressions >= 5)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 30);

  const targets: PositionBoostTarget[] = candidates.map(p => ({
    slug: p.slug,
    position: p.position,
    impressions: p.impressions,
    clicks: p.clicks,
    ctr: p.ctr,
    originalTitle: p.title || humanize(p.slug),
    boostedTitle: buildTitle(p.slug, p.position),
    buyerIntro: buildBuyerIntro(p.slug),
    faqSchema: buildFaq(p.slug),
    internalLinks: findInternalLinks(p.slug),
    estimatedLift: `Pos ${p.position} → ${Math.max(3, p.position - Math.round(p.position * 0.35))} (est. 35% lift)`,
  }));

  const avgPos = candidates.length > 0
    ? candidates.reduce((s, p) => s + p.position, 0) / candidates.length
    : 0;

  return {
    targets,
    totalTargets: targets.length,
    avgCurrentPosition: Math.round(avgPos * 10) / 10,
    projectedAvgPosition: Math.round(avgPos * 0.65 * 10) / 10,
  };
}

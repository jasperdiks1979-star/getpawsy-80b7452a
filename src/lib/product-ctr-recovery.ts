/**
 * Product CTR Recovery Engine
 * 
 * For products with impressions >20 and CTR <1%:
 * - 150-word SEO intro
 * - Materials + shipping FAQ schema
 * - 3 related guide links
 * - Trust badges metadata
 */

import { SEO_CONTENT_CLUSTERS } from './seo-content-clusters';

export interface ProductRecoveryTarget {
  slug: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
  seoIntro: string;
  faqSchema: Array<{ question: string; answer: string }>;
  relatedGuides: string[];
  trustBadges: string[];
  estimatedCtrLift: string;
}

export interface ProductRecoveryResult {
  targets: ProductRecoveryTarget[];
  totalProducts: number;
  avgCtrBefore: number;
  projectedAvgCtr: number;
}

function humanize(slug: string): string {
  return slug.replace(/^(product\/|products\/|bestseller\/)/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
}

function buildSeoIntro(slug: string): string {
  const name = humanize(slug).toLowerCase();
  return `Discover the ${name} that pet owners across the US trust. At GetPawsy, every product is carefully selected for safety, durability, and real-world performance. This ${name} stands out for its premium materials, thoughtful design, and excellent value. Whether you're upgrading from a budget option or buying for the first time, you'll notice the difference. Backed by our 30-day return policy and free shipping on eligible orders over $35. Our team reviews each item to ensure it meets the standards your pet deserves.`;
}

function buildProductFaq(slug: string): Array<{ question: string; answer: string }> {
  const name = humanize(slug).toLowerCase();
  return [
    {
      question: `What materials is this ${name} made from?`,
      answer: `This ${name} is crafted from premium, pet-safe materials that meet US safety standards. All components are non-toxic, durable, and designed for daily use. Check the product details section for specific material information.`,
    },
    {
      question: `How fast is shipping for this ${name}?`,
      answer: `We offer free standard shipping across the US on all orders. Most items arrive within 7-15 business days. Express shipping is available at checkout for faster delivery.`,
    },
    {
      question: `Can I return this ${name}?`,
      answer: `Absolutely. We offer an easy 30-day return policy. If you or your pet aren't completely satisfied, contact our support team to arrange a return per our policy — per our return policy.`,
    },
    {
      question: `Is this ${name} safe for puppies and kittens?`,
      answer: `Safety is our top priority. This product is designed for pets of appropriate size and age. Always check the recommended age/size guidelines in the product description and supervise initial use.`,
    },
  ];
}

function findGuides(slug: string): string[] {
  const guides: string[] = [];
  const kw = slug.replace(/-/g, ' ').toLowerCase();

  for (const cluster of SEO_CONTENT_CLUSTERS) {
    if (cluster.priority === 'deprioritized') continue;
    const match = kw.split(' ').some(w => w.length > 3 &&
      [cluster.pillarKeyword, ...cluster.secondaryKeywords].join(' ').toLowerCase().includes(w));
    if (match) {
      guides.push(cluster.pillarSlug);
      if (cluster.blogTopics[0]) guides.push(cluster.blogTopics[0].slug);
      if (cluster.blogTopics[1]) guides.push(cluster.blogTopics[1].slug);
      break;
    }
  }

  return [...new Set(guides)].slice(0, 3);
}

export function runProductCtrRecovery(
  pages: Array<{ slug: string; impressions: number; clicks: number; ctr: number; position: number }>
): ProductRecoveryResult {
  const candidates = pages
    .filter(p => p.impressions > 20 && p.ctr < 1)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 50);

  const targets: ProductRecoveryTarget[] = candidates.map(p => ({
    slug: p.slug,
    impressions: p.impressions,
    clicks: p.clicks,
    ctr: p.ctr,
    position: p.position,
    seoIntro: buildSeoIntro(p.slug),
    faqSchema: buildProductFaq(p.slug),
    relatedGuides: findGuides(p.slug),
    trustBadges: ['Free US Shipping', '30-Day Returns', 'Pet-Safe Materials', 'Expert Tested'],
    estimatedCtrLift: `${p.ctr.toFixed(1)}% → ${Math.min(p.ctr + 2.5, 5).toFixed(1)}% (est.)`,
  }));

  const avgCtr = candidates.length > 0
    ? candidates.reduce((s, p) => s + p.ctr, 0) / candidates.length
    : 0;

  return {
    targets,
    totalProducts: targets.length,
    avgCtrBefore: Math.round(avgCtr * 100) / 100,
    projectedAvgCtr: Math.min(avgCtr + 2.5, 5),
  };
}

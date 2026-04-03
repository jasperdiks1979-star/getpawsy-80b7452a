import { Link } from 'react-router-dom';
import { BookOpen, ArrowRight, Trophy } from 'lucide-react';
import { getProductCornerstonePath } from '@/lib/link-sculpt-config';

/**
 * Contextual buying guide link block for product pages.
 * Maps product categories to cornerstone guides for internal authority flow.
 * Also injects a secondary "collection cornerstone" link for link sculpting.
 */

interface GuideMapping {
  anchor: string;
  slug: string;
  description: string;
}

const CATEGORY_GUIDE_MAP: Record<string, GuideMapping> = {
  // ── Cat Litter cluster ──
  'cat-litter-boxes': {
    anchor: 'Best Cat Litter Boxes 2026 – Expert Picks',
    slug: 'best-cat-litter-boxes',
    description: 'Self-cleaning, enclosed & odor control litter boxes compared. Expert-reviewed.',
  },
  'cat litter': {
    anchor: 'Best Cat Litter Boxes 2026 – Expert Picks',
    slug: 'best-cat-litter-boxes',
    description: 'Self-cleaning, enclosed & odor control litter boxes compared. Expert-reviewed.',
  },
  'litter': {
    anchor: 'Best Cat Litter Box Furniture 2026',
    slug: 'best-cat-litter-box-furniture-enclosures-2026',
    description: 'Hidden litter box enclosures tested for odor control and décor.',
  },
  // ── Cat Furniture cluster ──
  'cat-trees-and-condos': {
    anchor: 'Best Cat Trees (2026) — Complete Buyer\'s Guide',
    slug: 'best-cat-trees-2026',
    description: '9 cat trees tested for stability, enrichment & value. Large cats, budget picks & more.',
  },
  'cat-furniture': {
    anchor: 'Best Cat Trees (2026) — Complete Buyer\'s Guide',
    slug: 'best-cat-trees-2026',
    description: '9 cat trees tested for stability, enrichment & value. Expert-reviewed picks.',
  },
  'cat furniture': {
    anchor: 'Best Cat Trees (2026) — Complete Buyer\'s Guide',
    slug: 'best-cat-trees-2026',
    description: '9 cat trees tested for stability, enrichment & value. Expert-reviewed picks.',
  },
  'cat-scratching-posts': {
    anchor: 'Best Cat Scratching Posts for Large Cats',
    slug: 'best-cat-trees-2026',
    description: 'Heavy-duty scratching posts tested for stability and durability.',
  },
  'cat-hammocks': {
    anchor: 'Wall-Mounted Cat Shelves & Perches Guide',
    slug: 'best-cat-toys-for-indoor-cats',
    description: 'Create vertical territory for your indoor cat with shelves and perches.',
  },
  // ── Cat Toys / Indoor Enrichment cluster ──
  'cat-toys': {
    anchor: 'Best Cat Toys for Indoor Cats 2026',
    slug: 'best-cat-toys-for-indoor-cats',
    description: 'Interactive toys tested to beat boredom and keep indoor cats active.',
  },
  'cat toys': {
    anchor: 'Best Cat Toys for Indoor Cats 2026',
    slug: 'best-cat-toys-for-indoor-cats',
    description: 'Interactive toys tested to beat boredom and keep indoor cats active.',
  },
  // ── Dog Enrichment cluster ──
  'dog-toys': {
    anchor: 'Dog Enrichment Toys – Complete Guide 2026',
    slug: 'dog-enrichment-toys',
    description: 'Interactive, puzzle & indestructible toys ranked for bored dogs and aggressive chewers.',
  },
  'dog toys': {
    anchor: 'Dog Enrichment Toys – Complete Guide 2026',
    slug: 'dog-enrichment-toys',
    description: 'Interactive, puzzle & indestructible toys ranked for bored dogs and aggressive chewers.',
  },
  // ── Feeding Solutions cluster ──
  'dog-bowls-feeders': {
    anchor: 'Best Slow Feeder Dog Bowls 2026',
    slug: 'best-slow-feeder-dog-bowls',
    description: 'Slow feeders, no-spill bowls & automatic feeders compared for healthier eating.',
  },
  'dog bowls': {
    anchor: 'Best Slow Feeder Dog Bowls 2026',
    slug: 'best-slow-feeder-dog-bowls',
    description: 'Slow feeders, no-spill bowls & automatic feeders compared for healthier eating.',
  },
  'cat-bowls-feeders': {
    anchor: 'Best Automatic Cat Feeders 2026',
    slug: 'best-slow-feeder-dog-bowls',
    description: 'Timed feeders and slow bowls for portion control and healthier eating.',
  },
  // ── Small Pets ──
  'small-pet-habitats': {
    anchor: 'How to Choose the Right Guinea Pig Cage',
    slug: 'how-to-choose-guinea-pig-cage',
    description: 'Complete guide to cage size, materials and setup.',
  },
  'small pets': {
    anchor: 'Guinea Pig Cage vs Playpen – What\'s Better?',
    slug: 'guinea-pig-cage-vs-playpen',
    description: 'Key differences to give your guinea pig the ideal home.',
  },
  // ── Dog General ──
  'dog-beds': {
    anchor: 'Best Dog Beds for Large Breeds 2026',
    slug: 'dog-enrichment-toys',
    description: 'Orthopedic, calming & durable beds ranked for comfort and joint support.',
  },
  'dog-carriers': {
    anchor: 'Dog Travel Essentials Guide',
    slug: 'dogs',
    description: 'Car seats, carriers & travel bowls compared for safe, stress-free travel.',
  },
};

/**
 * Find the best guide match for a product category string.
 * Tries exact match first, then partial keyword matching.
 */
function findGuide(category: string): GuideMapping | null {
  const cat = category.toLowerCase().trim();

  // Exact match
  if (CATEGORY_GUIDE_MAP[cat]) return CATEGORY_GUIDE_MAP[cat];

  // Partial keyword match
  for (const [key, guide] of Object.entries(CATEGORY_GUIDE_MAP)) {
    if (cat.includes(key) || key.includes(cat)) return guide;
  }

  // Keyword-based fallback
  if (cat.includes('litter') || cat.includes('cat litter')) {
    return CATEGORY_GUIDE_MAP['cat-litter-boxes'];
  }
  if (cat.includes('cat') && (cat.includes('tree') || cat.includes('tower') || cat.includes('condo'))) {
    return CATEGORY_GUIDE_MAP['cat-trees-and-condos'];
  }
  if (cat.includes('guinea') || cat.includes('hamster') || cat.includes('rabbit')) {
    return CATEGORY_GUIDE_MAP['small-pet-habitats'];
  }
  if (cat.includes('dog')) {
    return CATEGORY_GUIDE_MAP['dog-toys'];
  }

  return null;
}

interface BuyingGuideBlockProps {
  category: string;
}

export function BuyingGuideBlock({ category }: BuyingGuideBlockProps) {
  const guide = findGuide(category);
  const collectionLink = getProductCornerstonePath(category);

  if (!guide && !collectionLink) return null;

  return (
    <section className="my-8 space-y-4">
      {/* Guide link */}
      {guide && (
        <Link
          to={`/guides/${guide.slug}`}
          className="group flex items-start gap-4 rounded-xl border border-primary/20 bg-primary/5 p-5 hover:border-primary/40 hover:shadow-md transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-primary uppercase tracking-wide">📘 Buying Guide</span>
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors mt-1 mb-1">
              {guide.anchor}
            </h3>
            <p className="text-sm text-muted-foreground">{guide.description}</p>
          </div>
          <ArrowRight className="w-5 h-5 text-primary flex-shrink-0 mt-2 group-hover:translate-x-1 transition-transform" />
        </Link>
      )}

      {/* Collection cornerstone link — link sculpting */}
      {collectionLink && (
        <Link
          to={collectionLink.path}
          className="group flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-5 py-3 hover:border-primary/30 hover:bg-primary/5 transition-all"
        >
          <Trophy className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
            Explore more top-rated options in our{' '}
            <span className="font-medium text-primary">{collectionLink.anchor}</span>
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-primary/60 flex-shrink-0 ml-auto group-hover:translate-x-1 transition-transform" />
        </Link>
      )}
    </section>
  );
}

import { Link } from 'react-router-dom';
import { BookOpen, ArrowRight } from 'lucide-react';

/**
 * Contextual buying guide link block for product pages.
 * Maps product categories to cornerstone guides for internal authority flow.
 */

interface GuideMapping {
  anchor: string;
  slug: string;
  description: string;
}

const CATEGORY_GUIDE_MAP: Record<string, GuideMapping> = {
  // Cat Litter cluster
  'cat-litter-boxes': {
    anchor: 'Best Cat Litter Box 2026 – Buying Guide',
    slug: 'best-cat-litter-box-2026',
    description: 'See our tested top picks for odor control, large breeds & multi-cat homes.',
  },
  'cat litter': {
    anchor: 'Best Cat Litter Box 2026 – Buying Guide',
    slug: 'best-cat-litter-box-2026',
    description: 'See our tested top picks for odor control, large breeds & multi-cat homes.',
  },
  'litter': {
    anchor: 'Best Cat Litter Box Furniture 2026',
    slug: 'best-cat-litter-box-furniture-enclosures-2026',
    description: 'Hidden litter box enclosures tested for odor control and décor.',
  },
  // Cat Furniture cluster — cornerstone: best-cat-trees-2026
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
  // Small Pets
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
  // Dog cluster
  'dog-toys': {
    anchor: 'Outdoor Dog Games & Safe Enrichment Ideas',
    slug: 'outdoor-dog-games-enrichment',
    description: 'Fun outdoor activities to keep your dog stimulated.',
  },
  'dog toys': {
    anchor: 'Outdoor Dog Games & Safe Enrichment Ideas',
    slug: 'outdoor-dog-games-enrichment',
    description: 'Fun outdoor activities to keep your dog stimulated.',
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
  if (!guide) return null;

  return (
    <section className="my-8">
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
    </section>
  );
}

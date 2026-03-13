/**
 * PillarClusterLinks — Renders internal links between pillar guides and their cluster articles.
 * Automatically maps guide slugs to their parent pillar and sibling clusters.
 */
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen } from 'lucide-react';

/** Pillar → cluster slug mapping */
const PILLAR_CLUSTERS: Record<string, { label: string; slugs: string[] }> = {
  'cat-litter-box-guide': {
    label: 'Cat Litter Box Guides',
    slugs: [
      'best-cat-litter-box-2026',
      'best-self-cleaning-litter-box-2026',
      'best-cat-litter-for-odor-control',
      'best-litter-boxes-multi-cat',
      'best-extra-large-litter-boxes',
      'best-litter-box-kittens',
      'best-litter-box-senior-cats',
      'best-low-tracking-litter-box',
      'best-high-sided-litter-box',
      'best-litter-boxes-apartments-2026',
      'how-many-litter-boxes-per-cat',
      'how-to-clean-cat-litter-box',
    ],
  },
  'cat-tree-buying-guide': {
    label: 'Cat Tree & Furniture Guides',
    slugs: [
      'best-cat-trees-large-cats-2026',
      'best-cat-trees-small-apartments',
      'best-cat-scratching-post',
      'cat-condo-vs-cat-tree-2026',
      'choosing-safe-cat-tree-indoor',
      'how-to-stop-cat-scratching-furniture',
    ],
  },
  'cat-toy-buying-guide': {
    label: 'Cat Toy Guides',
    slugs: [
      'best-automatic-cat-toy',
      'best-toys-for-bored-indoor-cats',
      'best-interactive-cat-toys-that-work',
    ],
  },
  'dog-bed-buying-guide': {
    label: 'Dog Bed Guides',
    slugs: [
      'best-dog-bed-2026',
      'best-orthopedic-dog-bed-2026',
      'best-orthopedic-dog-bed-large-dogs-2026',
      'best-dog-beds-large-breeds-2026',
      'orthopedic-dog-beds-for-senior-dogs',
      'calming-dog-bed-anxiety',
      'best-elevated-dog-bed',
      'waterproof-orthopedic-dog-beds-guide',
      'how-to-choose-the-right-dog-bed-size',
      'memory-foam-vs-egg-crate-dog-beds',
    ],
  },
  'dog-leash-guide': {
    label: 'Dog Leash & Training Guides',
    slugs: [
      'best-dog-training-leash-for-pullers',
      'best-no-pull-dog-harness-2026',
      'leash-training-dog-step-by-step',
      'front-clip-vs-back-clip-harness',
      'best-dog-training-collar',
      'dog-leash-control-guide',
    ],
  },
  'pet-carrier-guide': {
    label: 'Pet Carrier Guides',
    slugs: [
      'best-cat-carrier',
      'best-cat-carrier-backpack',
      'best-dog-carriers-for-travel',
      'how-to-choose-cat-carrier',
    ],
  },
  'pet-travel-guide': {
    label: 'Pet Travel Guides',
    slugs: [
      'best-dog-car-seat',
      'best-dog-stroller',
      'dog-travel-safety-guide',
      'traveling-with-dogs-tips',
      'pet-travel-checklist',
      'how-to-travel-with-cat',
      'dog-car-harness-guide',
    ],
  },
  'pet-grooming-guide': {
    label: 'Pet Grooming Guides',
    slugs: [
      'dog-grooming-essentials',
      'best-dog-brushes-by-coat-type',
      'best-cat-grooming-brush',
      'dog-nail-trimming-guide',
      'best-dog-shampoo-guide',
      'dog-shedding-control-guide',
      'how-often-groom-dog',
    ],
  },
  'pet-feeding-guide': {
    label: 'Pet Feeding Guides',
    slugs: [
      'best-automatic-cat-feeder',
      'best-cat-water-fountain',
      'are-automatic-cat-feeders-safe',
    ],
  },
  'pet-home-products-guide': {
    label: 'Pet Home Product Guides',
    slugs: [
      'best-pet-camera',
      'best-pet-hair-remover',
    ],
  },
};

/** Reverse lookup: cluster slug → pillar slug */
const CLUSTER_TO_PILLAR: Record<string, string> = {};
for (const [pillarSlug, config] of Object.entries(PILLAR_CLUSTERS)) {
  for (const clusterSlug of config.slugs) {
    CLUSTER_TO_PILLAR[clusterSlug] = pillarSlug;
  }
}

/** Related pillar pairs for cross-linking */
const RELATED_PILLARS: Record<string, string[]> = {
  'cat-litter-box-guide': ['cat-tree-buying-guide', 'cat-toy-buying-guide'],
  'cat-tree-buying-guide': ['cat-litter-box-guide', 'cat-toy-buying-guide'],
  'cat-toy-buying-guide': ['cat-tree-buying-guide', 'cat-litter-box-guide'],
  'dog-bed-buying-guide': ['dog-leash-guide', 'pet-grooming-guide'],
  'dog-leash-guide': ['dog-bed-buying-guide', 'pet-travel-guide'],
  'pet-carrier-guide': ['pet-travel-guide', 'pet-grooming-guide'],
  'pet-travel-guide': ['pet-carrier-guide', 'dog-leash-guide'],
  'pet-grooming-guide': ['dog-bed-buying-guide', 'pet-home-products-guide'],
  'pet-feeding-guide': ['pet-home-products-guide', 'cat-litter-box-guide'],
  'pet-home-products-guide': ['pet-feeding-guide', 'pet-grooming-guide'],
};

/** Get pillar slug for a cluster guide */
export function getPillarForGuide(slug: string): string | null {
  return CLUSTER_TO_PILLAR[slug] ?? null;
}

/** Get cluster slugs for a pillar guide */
export function getClusterSlugs(pillarSlug: string): string[] {
  return PILLAR_CLUSTERS[pillarSlug]?.slugs ?? [];
}

interface PillarClusterLinksProps {
  currentSlug: string;
  /** Guide index data for resolving titles */
  guidesIndex: Array<{ slug: string; title: string }>;
}

export function PillarClusterLinks({ currentSlug, guidesIndex }: PillarClusterLinksProps) {
  const titleMap = new Map(guidesIndex.map(g => [g.slug, g.title.split('–')[0].split('|')[0].trim()]));

  // Case 1: Current page IS a pillar → show cluster links
  const pillarConfig = PILLAR_CLUSTERS[currentSlug];
  if (pillarConfig) {
    const relatedPillars = RELATED_PILLARS[currentSlug] ?? [];
    return (
      <section className="my-12 bg-muted/30 rounded-2xl p-6 md:p-10">
        <h2 className="text-2xl font-display font-bold mb-1 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          In-Depth {pillarConfig.label}
        </h2>
        <p className="text-muted-foreground text-sm mb-6">
          Explore our expert cluster guides for specific topics in this category.
        </p>
        <div className="grid sm:grid-cols-2 gap-3 mb-8">
          {pillarConfig.slugs.filter(s => s !== currentSlug).slice(0, 12).map(slug => (
            <Link
              key={slug}
              to={`/guides/${slug}`}
              className="group bg-background border rounded-xl p-4 hover:border-primary/30 hover:shadow-sm transition-all"
            >
              <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">
                {titleMap.get(slug) ?? slug.replace(/-/g, ' ')}
              </h3>
              <span className="inline-flex items-center gap-1 text-xs text-primary mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                Read guide <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
          ))}
        </div>
        {relatedPillars.length > 0 && (
          <div className="border-t border-border/50 pt-5">
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Related Authority Guides</h3>
            <div className="flex flex-wrap gap-3">
              {relatedPillars.map(pSlug => (
                <Link
                  key={pSlug}
                  to={`/guides/${pSlug}`}
                  className="text-sm text-primary hover:underline font-medium"
                >
                  {titleMap.get(pSlug) ?? pSlug.replace(/-/g, ' ')} →
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>
    );
  }

  // Case 2: Current page is a cluster article → link back to pillar + siblings
  const pillarSlug = CLUSTER_TO_PILLAR[currentSlug];
  if (!pillarSlug) return null;

  const siblings = PILLAR_CLUSTERS[pillarSlug]?.slugs.filter(s => s !== currentSlug).slice(0, 4) ?? [];
  const pillarTitle = titleMap.get(pillarSlug) ?? pillarSlug.replace(/-/g, ' ');

  return (
    <section className="my-12 bg-muted/30 rounded-2xl p-6 md:p-8">
      <h2 className="text-xl font-display font-bold mb-4 flex items-center gap-2">
        <BookOpen className="w-5 h-5 text-primary" />
        More From This Guide Series
      </h2>
      <Link
        to={`/guides/${pillarSlug}`}
        className="block bg-primary/5 border border-primary/20 rounded-xl p-4 mb-4 hover:bg-primary/10 transition-colors"
      >
        <span className="text-xs uppercase font-semibold text-primary tracking-wide">Complete Authority Guide</span>
        <h3 className="font-bold text-base mt-1">{pillarTitle}</h3>
      </Link>
      {siblings.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {siblings.map(slug => (
            <Link
              key={slug}
              to={`/guides/${slug}`}
              className="text-sm text-foreground hover:text-primary transition-colors font-medium py-2"
            >
              → {titleMap.get(slug) ?? slug.replace(/-/g, ' ')}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

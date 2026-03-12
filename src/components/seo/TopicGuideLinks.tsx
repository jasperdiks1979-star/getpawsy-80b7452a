/**
 * TopicGuideLinks — "Learn More About This Topic" section for product pages.
 * Maps product categories to pillar guides for contextual internal linking.
 */

import { Link } from 'react-router-dom';
import { BookOpen, ArrowRight } from 'lucide-react';

interface PillarGuide {
  slug: string;
  title: string;
  description: string;
}

const CATEGORY_PILLAR_MAP: Record<string, PillarGuide[]> = {
  // Dog Training
  'dog training': [
    { slug: 'complete-dog-training-guide-2026', title: 'Dog Training Guide', description: 'Stop pulling, barking & bad habits with our expert 7-day plan' },
    { slug: 'best-no-pull-dog-harness-2026', title: 'Best No-Pull Harness', description: 'Tested & ranked for pullers — front-clip picks' },
  ],
  'dog collars & leashes': [
    { slug: 'complete-dog-training-guide-2026', title: 'Dog Training Guide', description: 'Leash training techniques and positive reinforcement methods' },
    { slug: 'best-dog-training-leash-for-pullers', title: 'Best Training Leash', description: 'Anti-pull leashes tested for all dog sizes' },
  ],
  // Dog Travel
  'dog travel': [
    { slug: 'dog-travel-safety-guide', title: 'Dog Travel Safety Guide', description: 'Car seats, harnesses & travel tips for every trip' },
    { slug: 'crash-tested-dog-car-seat-guide', title: 'Crash-Tested Car Seats', description: 'What to look for in a genuinely safe dog car seat' },
  ],
  'dog car seats': [
    { slug: 'dog-travel-safety-guide', title: 'Dog Travel Safety Guide', description: 'Complete guide to safe dog travel by car and plane' },
    { slug: 'dog-booster-seat-vs-car-hammock', title: 'Booster Seat vs Hammock', description: 'Which option is safer for your dog?' },
  ],
  // Dog Grooming
  'dog grooming': [
    { slug: 'dog-grooming-tools-guide', title: 'Dog Grooming Tools Guide', description: 'Brushes, clippers & kits for every coat type' },
  ],
  // Dog Beds
  'dog beds': [
    { slug: 'best-dog-bed-2026', title: 'Best Dog Beds 2026', description: 'Vet-recommended orthopedic picks tested & ranked' },
    { slug: 'best-orthopedic-dog-bed', title: 'Best Orthopedic Dog Beds', description: 'Joint support picks for senior & large dogs' },
  ],
  'pet beds': [
    { slug: 'best-dog-bed-2026', title: 'Best Dog Beds 2026', description: 'Vet-recommended orthopedic picks tested & ranked' },
  ],
  // Cat Litter
  'cat litter': [
    { slug: 'cat-litter-solutions-guide', title: 'Cat Litter Solutions Guide', description: 'Best boxes, odor control & placement tips' },
    { slug: 'best-cat-litter-box-2026', title: 'Best Cat Litter Box 2026', description: '12 tested picks for odor, size & multi-cat use' },
  ],
  'cat litter boxes': [
    { slug: 'cat-litter-solutions-guide', title: 'Cat Litter Solutions Guide', description: 'Complete guide to litter boxes, odor control & setup' },
    { slug: 'how-many-litter-boxes-per-cat', title: 'How Many Litter Boxes Per Cat?', description: 'The vet-backed N+1 rule explained' },
  ],
  // Cat Furniture
  'cat trees': [
    { slug: 'best-cat-trees-for-indoor-cats', title: 'Best Cat Trees for Indoor Cats', description: 'Top picks by size, stability & design' },
  ],
  'cat furniture': [
    { slug: 'best-cat-trees-for-indoor-cats', title: 'Best Cat Trees for Indoor Cats', description: 'Top picks by size, stability & design' },
    { slug: 'best-cat-enrichment-ideas-indoor-cats-2026', title: 'Indoor Cat Enrichment Guide', description: 'Best enrichment ideas for happy indoor cats' },
  ],
  // Cat Toys
  'cat toys': [
    { slug: 'best-cat-enrichment-ideas-indoor-cats-2026', title: 'Indoor Cat Enrichment Guide', description: 'Best enrichment ideas for happy indoor cats' },
    { slug: 'best-interactive-cat-toys-that-work', title: 'Best Interactive Cat Toys', description: 'Toys that actually keep cats engaged' },
  ],
  // Dog Toys
  'dog toys': [
    { slug: 'best-interactive-dog-toys', title: 'Best Interactive Dog Toys', description: 'Puzzle & enrichment toys tested and ranked' },
    { slug: 'how-to-train-dog-with-toys', title: 'Train Your Dog With Toys', description: 'Reward-based toy training techniques' },
  ],
};

/** Normalize category string for lookup */
function normalizeCategory(cat: string): string {
  return cat.toLowerCase().replace(/-/g, ' ').trim();
}

interface TopicGuideLinksProps {
  productCategory: string | null;
}

export function TopicGuideLinks({ productCategory }: TopicGuideLinksProps) {
  if (!productCategory) return null;

  const normalized = normalizeCategory(productCategory);
  const guides = CATEGORY_PILLAR_MAP[normalized];

  if (!guides || guides.length === 0) return null;

  return (
    <section className="mt-12 mb-8">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <BookOpen className="w-4 h-4 text-primary" />
        </div>
        <h2 className="text-lg font-display font-semibold text-foreground">
          Learn More About This Topic
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {guides.map((guide) => (
          <Link
            key={guide.slug}
            to={`/guides/${guide.slug}`}
            className="group flex items-start gap-3 p-4 rounded-xl border border-border/50 bg-card hover:border-primary/30 hover:shadow-sm transition-all"
          >
            <div className="min-w-0">
              <span className="font-medium text-sm text-foreground group-hover:text-primary transition-colors block">
                {guide.title}
              </span>
              <span className="text-xs text-muted-foreground line-clamp-2">
                {guide.description}
              </span>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary flex-shrink-0 mt-0.5 transition-colors" />
          </Link>
        ))}
      </div>
    </section>
  );
}
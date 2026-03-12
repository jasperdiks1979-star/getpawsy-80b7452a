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
    { slug: 'best-dog-training-collar', title: 'Best Dog Training Collar', description: 'Vet-reviewed collar picks ranked by safety & effectiveness' },
    { slug: 'dog-behavior-training-guide', title: 'Dog Behavior Training Guide', description: 'Fix common behavior problems with positive reinforcement' },
  ],
  'dog collars & leashes': [
    { slug: 'dog-leash-control-guide', title: 'Dog Leash Control Guide', description: 'Stop pulling & walk calmly with proven techniques' },
    { slug: 'best-dog-training-collar', title: 'Best Dog Training Collar', description: 'Vet-reviewed collar picks for obedience & recall' },
    { slug: 'best-dog-training-leash-for-pullers', title: 'Best Training Leash', description: 'Anti-pull leashes tested for all dog sizes' },
  ],
  'dog collars': [
    { slug: 'best-dog-training-collar', title: 'Best Dog Training Collar', description: 'Vet-reviewed collar picks ranked by safety & effectiveness' },
    { slug: 'dog-leash-control-guide', title: 'Dog Leash Control Guide', description: 'Stop pulling & walk calmly with proven techniques' },
  ],
  'dog leashes': [
    { slug: 'dog-leash-control-guide', title: 'Dog Leash Control Guide', description: 'Stop pulling & walk calmly with proven techniques' },
    { slug: 'best-dog-training-leash-for-pullers', title: 'Best Training Leash for Pullers', description: 'Anti-pull leashes tested for all dog sizes' },
    { slug: 'leash-training-dog-step-by-step', title: 'Leash Training Step-by-Step', description: 'Complete leash training method for any dog' },
  ],
  // Dog Travel
  'dog travel': [
    { slug: 'dog-travel-safety-guide', title: 'Dog Travel Safety Guide', description: 'Car seats, harnesses & travel tips for every trip' },
    { slug: 'traveling-with-dogs-tips', title: 'Traveling With Dogs Tips', description: 'Essential tips for safe & stress-free trips' },
    { slug: 'dog-travel-safety-equipment-guide', title: 'Dog Travel Safety Equipment', description: 'Car seats, harnesses & crates ranked by crash safety' },
  ],
  'dog car seats': [
    { slug: 'dog-travel-safety-guide', title: 'Dog Travel Safety Guide', description: 'Complete guide to safe dog travel by car and plane' },
    { slug: 'dog-car-harness-guide', title: 'Dog Car Harness Guide', description: 'Crash-tested harness picks for every dog size' },
    { slug: 'crash-tested-dog-car-seat-guide', title: 'Crash-Tested Car Seats', description: 'Safety-rated car seats ranked by crash test data' },
  ],
  'dog carriers': [
    { slug: 'dog-travel-safety-guide', title: 'Dog Travel Safety Guide', description: 'Complete guide to safe dog travel' },
    { slug: 'best-dog-carriers-for-travel', title: 'Best Dog Carriers for Travel', description: 'Airline-approved carriers tested & ranked' },
  ],
  'pet strollers': [
    { slug: 'dog-travel-safety-guide', title: 'Dog Travel Safety Guide', description: 'Car seats, harnesses & travel tips for every trip' },
    { slug: 'traveling-with-dogs-tips', title: 'Traveling With Dogs Tips', description: 'Essential tips for safe & stress-free trips' },
  ],
  // Dog Grooming
  'dog grooming': [
    { slug: 'dog-grooming-tools-guide', title: 'Dog Grooming Tools Guide', description: 'Brushes, clippers & kits for every coat type' },
    { slug: 'dog-grooming-essentials', title: 'Dog Grooming Essentials', description: 'Everything you need to groom at home' },
    { slug: 'dog-shedding-control-guide', title: 'Dog Shedding Control Guide', description: 'Reduce shedding by up to 80% with proven methods' },
  ],
  'dog brushes': [
    { slug: 'best-dog-brushes-by-coat-type', title: 'Best Dog Brushes by Coat Type', description: 'Find the perfect brush for your dog\'s coat' },
    { slug: 'dog-shedding-control-guide', title: 'Dog Shedding Control Guide', description: 'Reduce shedding by up to 80% with proven methods' },
  ],
  'dog shampoo': [
    { slug: 'best-dog-shampoo-guide', title: 'Best Dog Shampoo Guide', description: 'Gentle, effective shampoos for every skin type' },
    { slug: 'dog-grooming-essentials', title: 'Dog Grooming Essentials', description: 'Everything you need to groom at home' },
  ],
  // Dog Beds
  'dog beds': [
    { slug: 'best-dog-bed-2026', title: 'Best Dog Beds 2026', description: 'Vet-recommended orthopedic picks tested & ranked' },
    { slug: 'best-orthopedic-dog-bed', title: 'Best Orthopedic Dog Beds', description: 'Joint support picks for senior & large dogs' },
    { slug: 'how-to-choose-the-right-dog-bed-size', title: 'Dog Bed Size Guide', description: 'Measure & choose the perfect bed size' },
  ],
  'pet beds': [
    { slug: 'best-dog-bed-2026', title: 'Best Dog Beds 2026', description: 'Vet-recommended orthopedic picks tested & ranked' },
  ],
  'dog houses': [
    { slug: 'best-outdoor-dog-bed', title: 'Best Outdoor Dog Beds', description: 'Weather-resistant beds for outdoor use' },
    { slug: 'best-dog-bed-2026', title: 'Best Dog Beds 2026', description: 'Vet-recommended picks tested & ranked' },
  ],
  // Cat Litter
  'cat litter': [
    { slug: 'cat-litter-solutions-guide', title: 'Cat Litter Solutions Guide', description: 'Best boxes, odor control & placement tips' },
    { slug: 'best-cat-litter-box-2026', title: 'Best Cat Litter Box 2026', description: '12 tested picks for odor, size & multi-cat use' },
  ],
  'cat litter boxes': [
    { slug: 'cat-litter-solutions-guide', title: 'Cat Litter Solutions Guide', description: 'Complete guide to litter boxes, odor control & setup' },
    { slug: 'how-many-litter-boxes-per-cat', title: 'How Many Litter Boxes Per Cat?', description: 'The vet-backed N+1 rule explained' },
    { slug: 'how-to-stop-cat-litter-smell', title: 'How to Stop Litter Smell', description: 'Proven odor control strategies that work' },
  ],
  // Cat Furniture
  'cat trees': [
    { slug: 'best-cat-trees-2026', title: 'Best Cat Trees 2026', description: 'Top picks by size, stability & design' },
    { slug: 'cat-tree-stability-guide', title: 'Cat Tree Stability Guide', description: 'How to choose a stable, safe cat tree' },
  ],
  'cat trees & condos': [
    { slug: 'best-cat-trees-2026', title: 'Best Cat Trees 2026', description: 'Top picks by size, stability & design' },
    { slug: 'best-cat-trees-large-cats-2026', title: 'Best Cat Trees for Large Cats', description: 'Heavy-duty picks for Maine Coons & big breeds' },
  ],
  'cat furniture': [
    { slug: 'best-cat-trees-2026', title: 'Best Cat Trees 2026', description: 'Top picks by size, stability & design' },
    { slug: 'best-cat-enrichment-ideas-indoor-cats-2026', title: 'Indoor Cat Enrichment Guide', description: 'Best enrichment ideas for happy indoor cats' },
  ],
  'cat scratching posts': [
    { slug: 'sisal-vs-carpet-scratching-posts', title: 'Sisal vs Carpet Scratching Posts', description: 'Which material lasts longer and cats prefer' },
    { slug: 'best-cat-trees-2026', title: 'Best Cat Trees 2026', description: 'Trees with built-in scratching surfaces' },
  ],
  // Cat Toys
  'cat toys': [
    { slug: 'best-interactive-cat-toys-that-work', title: 'Best Interactive Cat Toys', description: 'Toys that actually keep cats engaged' },
    { slug: 'best-cat-enrichment-ideas-indoor-cats-2026', title: 'Indoor Cat Enrichment Guide', description: 'Best enrichment ideas for happy indoor cats' },
    { slug: 'how-to-entertain-an-indoor-cat', title: 'How to Entertain Indoor Cats', description: 'Games & activities for bored cats' },
  ],
  // Dog Toys
  'dog toys': [
    { slug: 'best-interactive-dog-toys', title: 'Best Interactive Dog Toys', description: 'Puzzle & enrichment toys tested and ranked' },
    { slug: 'best-dog-puzzle-toys', title: 'Best Dog Puzzle Toys', description: 'Mental stimulation toys for smart dogs' },
    { slug: 'best-toys-for-aggressive-chewers', title: 'Best Toys for Power Chewers', description: 'Indestructible toys that actually last' },
  ],
  // Dog Harnesses
  'dog harnesses': [
    { slug: 'best-no-pull-dog-harness-2026', title: 'Best No-Pull Harness', description: 'Tested & ranked for pullers — front-clip picks' },
    { slug: 'dog-car-harness-guide', title: 'Dog Car Harness Guide', description: 'Crash-tested harness picks for safe car travel' },
    { slug: 'front-clip-vs-back-clip-harness', title: 'Front-Clip vs Back-Clip', description: 'Which harness style works for your dog' },
  ],
  // Cat Carriers
  'cat carriers': [
    { slug: 'how-to-choose-cat-carrier', title: 'How to Choose a Cat Carrier', description: 'Size, style & airline requirements explained' },
    { slug: 'best-cat-carrier', title: 'Best Cat Carriers', description: 'Top-rated carriers for vet visits & travel' },
  ],
  // Dog Bowls & Feeders
  'dog bowls': [
    { slug: 'best-dog-training-tools', title: 'Best Dog Training Tools', description: 'Tools including puzzle feeders for training' },
  ],
  'dog bowls & feeders': [
    { slug: 'best-dog-training-tools', title: 'Best Dog Training Tools', description: 'Tools including puzzle feeders for training' },
  ],
  // Puppy-specific
  'puppy essentials': [
    { slug: 'puppy-training-first-30-days', title: 'Puppy Training First 30 Days', description: 'Complete schedule & milestones for new puppies' },
    { slug: 'complete-dog-training-guide-2026', title: 'Dog Training Guide', description: 'Stop pulling, barking & bad habits' },
    { slug: 'dog-potty-training-complete-guide', title: 'Potty Training Guide', description: 'House-train your puppy with proven methods' },
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

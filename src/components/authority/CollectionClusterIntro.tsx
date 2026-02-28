/**
 * CollectionClusterIntro — Contextual intro paragraph for collection pages.
 * 150–200 words, cluster keywords, natural internal links to 3 related guides.
 * No fluff. No keyword stuffing. Human readable.
 */

import { memo } from 'react';
import { Link } from 'react-router-dom';
import { CLUSTERS, type ClusterId, inferClusterFromCategory } from '@/lib/cluster-config';

interface CollectionClusterIntroProps {
  collectionName: string;
  collectionSlug: string;
  category?: string;
}

const INTROS: Record<ClusterId, {
  text: (name: string) => string;
  links: Array<{ label: string; href: string }>;
}> = {
  'dog-training-behavior': {
    text: (name) =>
      `Finding the right ${name.toLowerCase()} can make all the difference in your dog's training journey. Whether you're working on recall, loose-leash walking, or simply building a stronger bond, the tools you choose matter. Our team researches each product for durability, safety, and real-world effectiveness — so you can focus on progress, not guesswork. Every item in this collection is selected to support positive reinforcement methods recommended by certified trainers.`,
    links: [
      { label: 'Dog Training Basics Guide', href: '/dog/training' },
      { label: 'Leash Training Tips', href: '/guides/dog-leash-training' },
      { label: 'Choosing the Right Collar', href: '/guides/dog-collar-guide' },
    ],
  },
  'dog-comfort-recovery': {
    text: (name) =>
      `Your dog deserves comfort that supports their health at every life stage. This ${name.toLowerCase()} collection features products tested for quality materials, ergonomic design, and long-term durability. From orthopedic beds for senior dogs to travel carriers built for safety, each product is evaluated against real pet-owner feedback and veterinary recommendations. We prioritize items that genuinely improve your dog's daily comfort.`,
    links: [
      { label: 'Orthopedic Dog Bed Guide', href: '/guides/orthopedic-dog-beds' },
      { label: 'Dog Travel Safety Tips', href: '/dog/travel' },
      { label: 'Senior Dog Comfort Guide', href: '/guides/senior-dog-care' },
    ],
  },
  'cat-enrichment-furniture': {
    text: (name) =>
      `Indoor cats thrive when their environment stimulates natural behaviors like climbing, scratching, and exploring. This ${name.toLowerCase()} collection is curated to help your cat stay active, engaged, and happy — without compromising your home's aesthetics. Each product is reviewed for stability, material quality, and space efficiency. Whether you have a single kitten or a multi-cat household, you'll find options that match your setup.`,
    links: [
      { label: 'Best Cat Trees Buying Guide', href: '/guides/best-cat-trees' },
      { label: 'Indoor Cat Enrichment Tips', href: '/cat/enrichment' },
      { label: 'Cat Scratching Solutions', href: '/guides/cat-scratching-posts' },
    ],
  },
  'cat-hygiene-litter': {
    text: (name) =>
      `A clean litter setup is essential for your cat's health and your household comfort. This ${name.toLowerCase()} collection covers everything from standard litter boxes to self-cleaning systems with odor control technology. We evaluate each product based on ease of maintenance, odor management, and cat acceptance rates from real user reviews. Find the solution that fits your space and your cat's preferences.`,
    links: [
      { label: 'Best Litter Boxes Compared', href: '/guides/best-cat-litter-boxes' },
      { label: 'Self-Cleaning Litter Guide', href: '/guides/self-cleaning-litter-box-guide' },
      { label: 'Litter Box Odor Control', href: '/guides/litter-box-odor-control' },
    ],
  },
};

export const CollectionClusterIntro = memo(function CollectionClusterIntro({
  collectionName,
  collectionSlug,
  category,
}: CollectionClusterIntroProps) {
  // Infer cluster from category or collection name
  const clusterId = category
    ? inferClusterFromCategory(category)
    : inferFromName(collectionName);

  if (!clusterId) return null;

  const intro = INTROS[clusterId];
  if (!intro) return null;

  return (
    <div className="mb-8 max-w-3xl">
      <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-4">
        {intro.text(collectionName)}
      </p>
      <div className="flex flex-wrap gap-2">
        {intro.links.map((link) => (
          <Link
            key={link.href}
            to={link.href}
            className="text-xs font-medium text-primary hover:underline bg-primary/5 px-2.5 py-1 rounded-full"
          >
            📖 {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
});

function inferFromName(name: string): ClusterId | null {
  const n = name.toLowerCase();
  if (n.includes('training') || n.includes('leash') || n.includes('collar') || n.includes('dog toy')) return 'dog-training-behavior';
  if (n.includes('dog bed') || n.includes('carrier') || n.includes('comfort') || n.includes('orthopedic')) return 'dog-comfort-recovery';
  if (n.includes('cat tree') || n.includes('scratching') || n.includes('cat toy') || n.includes('condo') || n.includes('enrichment')) return 'cat-enrichment-furniture';
  if (n.includes('litter') || n.includes('hygiene') || n.includes('cat groom')) return 'cat-hygiene-litter';
  return null;
}

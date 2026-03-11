import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { BookOpen, ArrowRight, Sparkles, PawPrint } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';

const BASE_URL = 'https://getpawsy.pet';

/**
 * SEO Hub Page: /pet-care-guides
 * Central topical authority page linking to all cornerstone guides and topic clusters.
 */

interface TopicCluster {
  id: string;
  label: string;
  icon: string;
  description: string;
  cornerstoneGuide: { slug: string; title: string; excerpt: string };
  clusterGuides: { slug: string; title: string }[];
  collectionLink?: { href: string; label: string };
}

const TOPIC_CLUSTERS: TopicCluster[] = [
  {
    id: 'cat-toys',
    label: 'Cat Toys',
    icon: '🐱',
    description: 'Interactive, puzzle, and enrichment toys to keep indoor cats stimulated, happy, and mentally sharp.',
    cornerstoneGuide: {
      slug: 'best-interactive-cat-toys-that-work',
      title: 'Best Interactive Cat Toys That Actually Work (2026)',
      excerpt: 'Tested & ranked interactive cat toys for indoor cats. Expert picks for solo play, mental stimulation, and hunting instincts.',
    },
    clusterGuides: [
      { slug: 'best-cat-enrichment-ideas-indoor-cats-2026', title: 'Best Cat Enrichment Ideas for Indoor Cats' },
      { slug: 'best-automatic-cat-toys-2026', title: 'Best Automatic Cat Toys' },
      { slug: 'best-puzzle-cat-toys-2026', title: 'Best Puzzle Cat Toys for Bored Cats' },
      { slug: 'cat-toys-for-bored-cats', title: 'Cat Toys for Bored Indoor Cats' },
      { slug: 'cat-enrichment-toys-guide', title: 'Cat Enrichment Toys Guide' },
    ],
    collectionLink: { href: '/collections/cat-toys', label: 'Shop Cat Toys' },
  },
  {
    id: 'cat-litter',
    label: 'Cat Litter',
    icon: '🧹',
    description: 'Expert guides on choosing, maintaining, and optimizing cat litter boxes for odor control and multi-cat homes.',
    cornerstoneGuide: {
      slug: 'best-cat-litter-box-2026',
      title: 'Best Cat Litter Boxes (2026) – Odor-Free Picks Tested & Ranked',
      excerpt: 'We tested 12 top-rated cat litter boxes for odor, size & multi-cat use. Vet-approved picks with honest pros & cons.',
    },
    clusterGuides: [
      { slug: 'best-self-cleaning-litter-box-2026', title: 'Best Self-Cleaning Litter Boxes' },
      { slug: 'best-cat-litter-box-furniture-enclosures-2026', title: 'Best Litter Box Furniture & Enclosures' },
      { slug: 'best-litter-box-odor-control', title: 'Best Litter Boxes for Odor Control' },
      { slug: 'how-many-litter-boxes-per-cat', title: 'How Many Litter Boxes Per Cat?' },
      { slug: 'best-litter-boxes-multi-cat', title: 'Best Litter Boxes for Multi-Cat Homes' },
    ],
    collectionLink: { href: '/collections/cat-litter-boxes', label: 'Shop Litter Boxes' },
  },
  {
    id: 'cat-trees',
    label: 'Cat Trees & Furniture',
    icon: '🪵',
    description: 'How to choose the right cat trees, condos, scratching posts, and climbing structures for your indoor cat.',
    cornerstoneGuide: {
      slug: 'best-cat-trees-small-apartments',
      title: 'Best Cat Trees for Small Apartments (2026) – Space-Saving Picks',
      excerpt: '7 compact cat trees tested in apartments under 600 sq ft. Space-saving picks for indoor cats.',
    },
    clusterGuides: [
      { slug: 'best-cat-tree-maine-coon', title: 'Best Cat Trees for Maine Coons' },
      { slug: 'best-cat-scratching-post', title: 'Best Cat Scratching Posts' },
      { slug: 'best-modern-cat-furniture', title: 'Best Modern Cat Furniture' },
      { slug: 'best-cat-condo-2026', title: 'Best Cat Condos' },
      { slug: 'best-wall-mounted-cat-shelves', title: 'Best Wall-Mounted Cat Shelves' },
    ],
    collectionLink: { href: '/collections/cat-trees-and-condos', label: 'Shop Cat Trees' },
  },
  {
    id: 'dog-training',
    label: 'Dog Training',
    icon: '🐕',
    description: 'Expert-reviewed tools and guides for dog training, behavior correction, leash training, and obedience.',
    cornerstoneGuide: {
      slug: 'complete-dog-training-guide-2026',
      title: 'The Complete Dog Training Guide (2026) – Stop Pulling, Barking & Bad Habits',
      excerpt: 'Comprehensive dog training guide covering leash manners, barking, potty training, and positive reinforcement methods.',
    },
    clusterGuides: [
      { slug: 'best-no-pull-dog-harness-2026', title: 'Best No-Pull Dog Harness' },
      { slug: 'best-dog-training-leash-for-pullers', title: 'Best Dog Training Leash for Pullers' },
      { slug: 'top-dog-training-tools-for-puppies', title: 'Top Dog Training Tools for Puppies' },
      { slug: 'best-anti-bark-training-methods', title: 'Best Anti-Bark Training Methods' },
      { slug: 'best-dog-puzzle-toys-2026', title: 'Best Dog Puzzle Toys' },
    ],
    collectionLink: { href: '/collections/dog-training-tools', label: 'Shop Training Tools' },
  },
  {
    id: 'dog-travel',
    label: 'Dog Travel',
    icon: '🚗',
    description: 'Safety-tested car seats, carriers, and travel gear to protect your dog on every journey.',
    cornerstoneGuide: {
      slug: 'best-dog-car-seats-safe-travel',
      title: 'Best Dog Car Seats for Safe Travel (2026)',
      excerpt: 'Safety-tested car seats & boosters to protect your dog on every journey. Crash-tested picks for all sizes.',
    },
    clusterGuides: [
      { slug: 'dog-travel-carriers-guide', title: 'Dog Travel Carriers Guide' },
      { slug: 'dog-seat-belt-harness-guide', title: 'Dog Seat Belt Harness Guide' },
      { slug: 'best-dog-bed-for-car', title: 'Best Dog Beds for Car Travel' },
    ],
    collectionLink: { href: '/collections/dog-car-seats', label: 'Shop Dog Car Seats' },
  },
  {
    id: 'dog-grooming',
    label: 'Dog Grooming',
    icon: '✂️',
    description: 'Brushes, nail trimmers, shampoos & grooming techniques for a healthy, happy dog.',
    cornerstoneGuide: {
      slug: 'dog-grooming-essentials-guide',
      title: 'Dog Grooming Essentials Guide (2026)',
      excerpt: 'Complete guide to dog grooming at home — brushes, nail clippers, shampoos & coat care techniques.',
    },
    clusterGuides: [
      { slug: 'dog-grooming-tools-guide', title: 'Best Dog Grooming Tools' },
      { slug: 'dog-nail-clipping-guide', title: 'Dog Nail Clipping Guide' },
      { slug: 'dog-brush-guide', title: 'Best Dog Brushes by Coat Type' },
    ],
    collectionLink: { href: '/collections/dog-grooming', label: 'Shop Grooming Supplies' },
  },
];

const PetCareGuides = () => {
  const guidesConnected = TOPIC_CLUSTERS.reduce(
    (sum, c) => sum + 1 + c.clusterGuides.length,
    0
  );

  return (
    <Layout>
      <Helmet>
        <title>Pet Care Guides – Expert Advice for Dogs & Cats | GetPawsy</title>
        <meta
          name="description"
          content="Expert pet care guides for dogs & cats. Vet-reviewed advice on litter boxes, cat trees, dog training, travel safety, grooming & more. Updated for 2026."
        />
        <link rel="canonical" href={`${BASE_URL}/pet-care-guides`} />
        <meta name="robots" content="index, follow" />
        <meta property="og:title" content="Pet Care Guides – Expert Advice for Dogs & Cats" />
        <meta property="og:description" content="Expert pet care guides covering cat litter, cat trees, dog training, travel & grooming. Vet-reviewed, updated for 2026." />
        <meta property="og:url" content={`${BASE_URL}/pet-care-guides`} />
        <meta property="og:type" content="website" />
      </Helmet>

      <div className="container px-4 md:px-6 py-12 md:py-16">
        {/* Hero / Intro */}
        <header className="max-w-3xl mb-12 md:mb-16">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-sm">
              <BookOpen className="w-6 h-6 text-primary" />
            </div>
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary/80">
              Expert Guides
            </span>
          </div>

          <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold text-foreground leading-tight tracking-tight mb-4">
            Pet Care Guides – Expert Advice for Dogs & Cats
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl">
            Our vet-reviewed guides help you make confident decisions for your pet.
            From choosing the right litter box to mastering leash training, every guide
            is written by pet care experts and updated for 2026.
          </p>
        </header>

        {/* Quick-nav pills */}
        <nav className="flex flex-wrap gap-2 mb-12" aria-label="Guide categories">
          {TOPIC_CLUSTERS.map((cluster) => (
            <a
              key={cluster.id}
              href={`#${cluster.id}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-border bg-card text-sm font-medium text-foreground hover:border-primary/30 hover:bg-accent transition-colors"
            >
              <span>{cluster.icon}</span>
              {cluster.label}
            </a>
          ))}
        </nav>

        {/* Topic Cluster Sections */}
        <div className="space-y-16">
          {TOPIC_CLUSTERS.map((cluster) => (
            <section key={cluster.id} id={cluster.id}>
              <div className="flex items-center gap-3 mb-6">
                <span className="text-2xl">{cluster.icon}</span>
                <div>
                  <h2 className="text-xl md:text-2xl font-display font-bold text-foreground tracking-tight">
                    {cluster.label}
                  </h2>
                  <p className="text-sm text-muted-foreground">{cluster.description}</p>
                </div>
              </div>

              {/* Cornerstone guide — prominent card */}
              <Link
                to={`/guides/${cluster.cornerstoneGuide.slug}`}
                className="group block rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-6 mb-4 hover:border-primary/40 hover:shadow-soft transition-all duration-300"
              >
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-primary mb-2">
                  <Sparkles className="w-3 h-3" />
                  Cornerstone Guide
                </span>
                <h3 className="font-display font-bold text-foreground group-hover:text-primary transition-colors text-base md:text-lg leading-snug mb-2">
                  {cluster.cornerstoneGuide.title}
                </h3>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                  {cluster.cornerstoneGuide.excerpt}
                </p>
                <span className="flex items-center gap-1 text-sm font-semibold text-primary group-hover:gap-2 transition-all duration-300">
                  Read Guide <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </Link>

              {/* Cluster guides grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {cluster.clusterGuides.map((guide) => (
                  <Link
                    key={guide.slug}
                    to={`/guides/${guide.slug}`}
                    className="group flex items-center gap-2 rounded-xl border border-border/40 bg-card p-4 hover:border-primary/30 hover:shadow-sm transition-all"
                  >
                    <PawPrint className="w-4 h-4 text-primary/60 shrink-0" />
                    <span className="font-medium text-foreground group-hover:text-primary transition-colors text-sm leading-snug">
                      {guide.title}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                ))}
              </div>

              {/* Shop CTA */}
              {cluster.collectionLink && (
                <Link
                  to={cluster.collectionLink.href}
                  className="inline-flex items-center gap-2 mt-4 text-sm font-semibold text-primary hover:underline"
                >
                  {cluster.collectionLink.label} <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </section>
          ))}
        </div>

        {/* Bottom authority text */}
        <section className="mt-16 pt-10 border-t border-border/40 max-w-3xl">
          <h2 className="text-lg font-display font-bold text-foreground mb-3">
            Why Trust Our Pet Guides?
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Every guide on GetPawsy is written by experienced pet care professionals and
            reviewed against current veterinary guidelines. We test products hands-on,
            disclose affiliate relationships transparently, and update our content
            regularly to reflect the latest research. Our goal is simple: help you make
            the best decisions for your pet's health, comfort, and happiness.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/guides" className="text-sm font-semibold text-primary hover:underline">
              Browse All Guides →
            </Link>
            <Link to="/why-trust-our-reviews" className="text-sm font-semibold text-primary hover:underline">
              Our Review Process →
            </Link>
            <Link to="/editorial-guidelines" className="text-sm font-semibold text-primary hover:underline">
              Editorial Guidelines →
            </Link>
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default PetCareGuides;

import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { ArrowRight, BookOpen, ShoppingBag, CheckCircle } from 'lucide-react';
import { AUTHOR, getAuthorSchema, getPublisherSchema } from '@/lib/author-entity';

const BASE_URL = 'https://getpawsy.pet';
const PAGE_URL = `${BASE_URL}/resources/indoor-cat-care`;

const CAT_TREE_GUIDES = [
  { title: 'Best Cat Trees for Large Cats (2026)', href: '/guides/best-cat-trees-large-cats-2026', desc: 'Most stable picks for heavy cats — weight capacity, height & durability compared.' },
  { title: 'Best Cat Trees (2026) — Complete Buyer\'s Guide', href: '/guides/best-cat-trees-2026', desc: 'Full comparison of 9 top-rated cat trees for every budget and living space.' },
  { title: 'Best Cat Trees for Small Apartments', href: '/guides/best-cat-trees-small-apartments', desc: 'Space-saving picks tested in apartments under 600 sq ft.' },
  { title: 'Cat Tree Stability Guide', href: '/guides/cat-tree-stability-guide', desc: 'How to test if your cat tree is stable enough for your cat.' },
  { title: 'How Tall Should a Cat Tree Be?', href: '/guides/how-tall-should-cat-tree-be', desc: 'Height recommendations by cat size and ceiling height.' },
  { title: 'Safe Cat Tree for Indoor Cats', href: '/guides/choosing-safe-cat-tree-indoor', desc: 'Stability & safety guide for indoor cat enrichment.' },
  { title: 'Cat Condo vs Cat Tree — Key Differences', href: '/guides/cat-condo-vs-cat-tree-difference', desc: 'Which one does your cat actually need?' },
  { title: 'Are Cat Condos Worth It?', href: '/guides/are-cat-condos-worth-it', desc: 'Honest breakdown of cat condo benefits for indoor cats.' },
  { title: 'Best Cat Condos for Multiple Cats', href: '/guides/best-cat-condo-for-multiple-cats', desc: 'Multi-cat household guide for shared vertical territory.' },
  { title: 'Best Cat Condos for Small Apartments', href: '/guides/best-cat-condo-small-apartments', desc: 'Compact picks tested in real small living spaces.' },
];

const LITTER_BOX_GUIDES = [
  { title: 'Best Cat Litter Box (2026)', href: '/guides/best-cat-litter-box-2026', desc: '12 top-rated boxes tested for odor, size & multi-cat use.' },
  { title: 'Best Self-Cleaning Litter Box (2026)', href: '/guides/best-self-cleaning-litter-box-2026', desc: 'Automatic picks tested for smart control and odor-free operation.' },
  { title: 'Best Litter Boxes for Apartments (2026)', href: '/guides/best-litter-boxes-apartments-2026', desc: 'Space-saving solutions for studios and small spaces.' },
  { title: 'Best Extra Large Litter Boxes', href: '/guides/best-extra-large-litter-boxes', desc: 'Jumbo boxes sized for Maine Coons, Ragdolls & large breeds.' },
  { title: 'Best Litter Box for Senior Cats', href: '/guides/best-litter-box-senior-cats', desc: 'Arthritis-friendly picks with low entry and stability.' },
  { title: 'Best Litter Box for Kittens', href: '/guides/best-litter-box-kittens', desc: 'Safe low-entry picks for new kitten owners.' },
  { title: 'Best Odor Control Litter Box', href: '/guides/best-odor-control-litter-box', desc: 'What actually eliminates litter box smell.' },
  { title: 'Best High-Sided Litter Box', href: '/guides/best-high-sided-litter-box', desc: 'No spray, no scatter — tested for large cats.' },
  { title: 'Litter Box Placement Guide', href: '/guides/litter-box-placement-guide', desc: 'Room-by-room analysis for zero odor issues.' },
  { title: 'How Many Litter Boxes Per Cat?', href: '/guides/how-many-litter-boxes-per-cat', desc: 'The vet-backed N+1 rule explained with placement tips.' },
];

const KEY_COLLECTIONS = [
  { title: 'Cat Trees & Condos', href: '/collections/cat-trees-and-condos', desc: 'Premium cat trees rated for stability and large cats.' },
  { title: 'Best Cat Litter Boxes', href: '/collections/cat-litter-boxes', desc: 'Expert-tested litter boxes for every cat and budget.' },
  { title: 'Cat Furniture', href: '/collections/cat-condos', desc: 'Indoor enrichment furniture for happy, healthy cats.' },
];

const STATS = [
  { stat: '85%', label: 'of indoor cats show reduced stress with vertical territory (ASPCA, 2024)' },
  { stat: '72%', label: 'of cat behavior issues improve with proper environmental enrichment (AAFP)' },
  { stat: '4×', label: 'body weight in impact force when a 15 lb cat jumps — stability testing matters' },
  { stat: '15–25 lbs', label: 'typical weight range for Maine Coons, Ragdolls & Norwegian Forest Cats' },
];

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
    { '@type': 'ListItem', position: 2, name: 'Resources', item: `${BASE_URL}/resources` },
    { '@type': 'ListItem', position: 3, name: 'Indoor Cat Care', item: PAGE_URL },
  ],
};

const articleSchema = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Indoor Cat Care Resource Center — Expert Guides & Product Recommendations',
  description: 'Complete indoor cat care resource hub: cat tree guides, litter box comparisons, enrichment tips, and expert-curated product recommendations.',
  url: PAGE_URL,
  datePublished: '2026-02-25',
  dateModified: '2026-02-25',
  author: getAuthorSchema(),
  publisher: getPublisherSchema(),
  mainEntityOfPage: { '@type': 'WebPage', '@id': PAGE_URL },
};

export default function IndoorCatCareResource() {
  return (
    <Layout>
      <Helmet>
        <title>Indoor Cat Care Resource Center — Expert Guides & Products | GetPawsy</title>
        <meta name="description" content="Complete indoor cat care hub: cat tree stability guides, litter box comparisons, enrichment tips, and expert-curated product recommendations. Updated for 2026." />
        <link rel="canonical" href={PAGE_URL} />
        <meta property="og:title" content="Indoor Cat Care Resource Center | GetPawsy" />
        <meta property="og:description" content="Expert guides, product comparisons, and enrichment tips for indoor cats." />
        <meta property="og:url" content={PAGE_URL} />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(articleSchema)}</script>
      </Helmet>

      <div className="container px-4 md:px-6 py-12 md:py-20 max-w-5xl mx-auto">
        {/* Hero */}
        <header className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4 leading-tight">
            Indoor Cat Care Resource Center
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Everything you need to create a stimulating, safe, and enriching indoor environment for your cat — from cat trees and litter boxes to behavioral enrichment strategies. Expert-curated for 2026.
          </p>
        </header>

        {/* Statistics Section */}
        <section className="mb-16">
          <h2 className="text-2xl font-display font-bold mb-6">Indoor Cat Enrichment — By the Numbers</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {STATS.map((s) => (
              <div key={s.stat} className="bg-primary/5 border border-primary/10 rounded-xl p-5 text-center">
                <div className="text-3xl font-bold text-primary mb-2">{s.stat}</div>
                <p className="text-xs text-muted-foreground leading-snug">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Key Collections */}
        <section className="mb-16">
          <h2 className="text-2xl font-display font-bold mb-6 flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-primary" />
            Shop Indoor Cat Essentials
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {KEY_COLLECTIONS.map((c) => (
              <Link key={c.href} to={c.href} className="group bg-card border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-sm transition-all">
                <h3 className="font-semibold text-base mb-1 group-hover:text-primary transition-colors">{c.title}</h3>
                <p className="text-sm text-muted-foreground mb-3">{c.desc}</p>
                <span className="text-xs font-medium text-primary flex items-center gap-1">
                  Browse collection <ArrowRight className="w-3 h-3" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Cat Tree Guides */}
        <section className="mb-16">
          <h2 className="text-2xl font-display font-bold mb-2 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Cat Tree & Condo Guides
          </h2>
          <p className="text-muted-foreground mb-6">Expert stability testing, height recommendations, and buyer comparisons for every type of cat tree.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {CAT_TREE_GUIDES.map((g) => (
              <Link key={g.href} to={g.href} className="group flex items-start gap-3 p-4 rounded-lg hover:bg-muted/50 transition-colors">
                <CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold group-hover:text-primary transition-colors">{g.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{g.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Litter Box Guides */}
        <section className="mb-16">
          <h2 className="text-2xl font-display font-bold mb-2 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Cat Litter Box Guides
          </h2>
          <p className="text-muted-foreground mb-6">Odor control, sizing, placement, and head-to-head comparisons for every type of litter box.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {LITTER_BOX_GUIDES.map((g) => (
              <Link key={g.href} to={g.href} className="group flex items-start gap-3 p-4 rounded-lg hover:bg-muted/50 transition-colors">
                <CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold group-hover:text-primary transition-colors">{g.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{g.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Indoor Enrichment Checklist */}
        <section className="mb-16 bg-muted/30 border border-border rounded-2xl p-8">
          <h2 className="text-2xl font-display font-bold mb-4">Indoor Cat Enrichment Checklist</h2>
          <p className="text-muted-foreground mb-6">Use this checklist to ensure your indoor cat has everything needed for physical and mental wellbeing:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              'Vertical territory (cat tree or wall shelves) — minimum 48" tall',
              'Multiple scratching surfaces (sisal posts + horizontal cardboard)',
              'Window perch or bird-watching station',
              'Interactive puzzle feeder for mental stimulation',
              'N+1 litter boxes (1 per cat + 1 extra)',
              'Rotating toy collection (swap every 2 weeks)',
              'Dedicated play session (15+ minutes daily)',
              'Hideaway or enclosed space (cat condo or covered bed)',
              'Fresh water fountain (cats prefer running water)',
              'Climbing pathway between rooms (for multi-room enrichment)',
            ].map((item) => (
              <div key={item} className="flex items-start gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="text-center">
          <h2 className="text-2xl font-display font-bold mb-3">Ready to Upgrade Your Indoor Cat's Space?</h2>
          <p className="text-muted-foreground mb-6">Browse our expert-curated collections — all with free US shipping and a 30-day return policy.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/collections/cat-trees-and-condos" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:bg-primary/90 transition-colors">
              Shop Cat Trees & Condos <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/collections/cat-litter-boxes" className="inline-flex items-center gap-2 border border-border px-6 py-3 rounded-lg font-semibold hover:bg-muted transition-colors">
              Shop Litter Boxes <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </div>
    </Layout>
  );
}

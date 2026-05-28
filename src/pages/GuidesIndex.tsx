import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { BookOpen, Clock, ArrowRight, ChevronRight, Sparkles } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { useGuidesList } from '@/hooks/useGuides';
import { Loader2 } from 'lucide-react';
import { getGuideImage } from '@/config/guideImages';
import { getConversionFlag } from '@/lib/conversionFlags';
import { cn } from '@/lib/utils';

const BASE_URL = 'https://getpawsy.pet';

// Category hub metadata for topical authority
const CATEGORY_HUBS: Record<string, { description: string; shopCategory: string; shopLabel: string }> = {
  'Cat Litter': {
    description: 'Expert guides on choosing, maintaining, and optimizing cat litter boxes for odor control and multi-cat homes.',
    shopCategory: 'cat-litter-boxes',
    shopLabel: 'Shop Litter Boxes',
  },
  'Cat Furniture': {
    description: 'How to choose the right cat trees, condos, and climbing structures for your indoor cat.',
    shopCategory: 'cat-trees-and-condos',
    shopLabel: 'Shop Cat Trees & Condos',
  },
  'Cat Carriers': {
    description: 'Reviews and guides for cat carriers, backpacks, and travel gear for safe adventures.',
    shopCategory: 'cat-carriers',
    shopLabel: 'Shop Cat Carriers',
  },
  'Cat Travel': {
    description: 'Tips and products for traveling safely with your cat by car or plane.',
    shopCategory: 'cat-carriers',
    shopLabel: 'Shop Cat Travel Gear',
  },
  'Cat Toys': {
    description: 'Interactive, solo, and enrichment toys to keep indoor cats stimulated and happy.',
    shopCategory: 'cat-toys',
    shopLabel: 'Shop Cat Toys',
  },
  'Cat Feeding': {
    description: 'Automatic feeders, water fountains, and feeding guides for healthier cats.',
    shopCategory: 'automatic-cat-feeders',
    shopLabel: 'Shop Cat Feeders',
  },
  'Cat Beds': {
    description: 'Cozy, calming, and heated cat beds tested for comfort and durability.',
    shopCategory: 'cat-beds',
    shopLabel: 'Shop Cat Beds',
  },
  'Dog Toys': {
    description: 'Interactive, puzzle, and chew toys for bored dogs, aggressive chewers, and training.',
    shopCategory: 'dog-toys',
    shopLabel: 'Shop Dog Toys & Games',
  },
  'Dog Beds': {
    description: 'Orthopedic, elevated, and cooling dog beds for large breeds, arthritis, and everyday comfort.',
    shopCategory: 'dog-beds',
    shopLabel: 'Shop Dog Beds',
  },
  'Dog Training': {
    description: 'Training equipment, methods, and toy-based techniques for every stage of your dog\'s life.',
    shopCategory: 'dog-training-accessories',
    shopLabel: 'Shop Training Equipment',
  },
  'Dog Travel': {
    description: 'Car seats, ramps, carriers, and travel safety gear for dogs on the move.',
    shopCategory: 'dog-carriers',
    shopLabel: 'Shop Dog Travel Gear',
  },
  'Dog Activities': {
    description: 'Enrichment ideas, outdoor games, and training activities to keep your dog happy and healthy.',
    shopCategory: 'dog-toys',
    shopLabel: 'Shop Dog Toys & Games',
  },
  'Cat Care': {
    description: 'General care, enrichment, and wellness tips for indoor and outdoor cats.',
    shopCategory: 'cat-toys',
    shopLabel: 'Shop Cat Enrichment',
  },
  'Cat Accessories': {
    description: 'Harnesses, leashes, and accessories for adventurous cats.',
    shopCategory: 'cat-carriers',
    shopLabel: 'Shop Cat Accessories',
  },
};

const GuidesIndex = () => {
  const premium = getConversionFlag('premiumGuidesHub');
  const { data: guides, isLoading, error } = useGuidesList();

  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  if (error || !guides) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted-foreground">Unable to load guides.</p>
        </div>
      </Layout>
    );
  }

  // Filter out non-core categories that have no matching products
  const HIDDEN_GUIDE_CATEGORIES = new Set([
    'Fish', 'Birds', 'Reptiles', 'Small Pets', 'fish', 'birds', 'reptiles', 'small pets',
  ]);

  const grouped = guides
    .filter(g => !HIDDEN_GUIDE_CATEGORIES.has(g.category))
    .reduce<Record<string, typeof guides>>((acc, g) => {
      (acc[g.category] ??= []).push(g);
      return acc;
    }, {});

  const totalGuideCount = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);
  const categoryKeys = Object.keys(grouped);

  return (
    <Layout>
      <Helmet>
        <title>Pet Care Guides & Expert Advice (2026) | GetPawsy</title>
        <meta name="description" content="Expert pet care guides on dog beds, cat trees, litter boxes & travel gear. Honest advice to choose the best products. Shop now at GetPawsy." /><meta name="robots" content="index, follow, max-image-preview:large" />
        <meta property="og:title" content="Pet Care Guides & Expert Advice (2026) | GetPawsy" />
        <meta property="og:description" content="Browse 200+ expert pet care guides. Honest advice for dog and cat owners." />
        <meta property="og:url" content={`${BASE_URL}/guides`} />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: 'Pet Care Guides & Expert Advice',
            description: 'Expert pet care guides for dog and cat owners — covering beds, trees, litter, travel, and more.',
            url: `${BASE_URL}/guides`,
            publisher: { '@type': 'Organization', name: 'GetPawsy', url: BASE_URL },
            numberOfItems: totalGuideCount,
          })}
        </script>
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
              { '@type': 'ListItem', position: 2, name: 'Guides', item: `${BASE_URL}/guides/` },
            ],
          })}
        </script>
      </Helmet>

      <div className="container mx-auto px-4 py-12 max-w-5xl">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
          <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium">Guides</span>
        </nav>

        {/* Premium Header with SEO intro */}
        <header className="mb-10">
          {premium ? (
            <>
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground mb-3">
                Editorial library
              </p>
              <h1 className="text-3xl md:text-4xl font-display font-semibold text-foreground tracking-tight mb-2">
                Pet Care Guides
              </h1>
              <p className="text-sm text-muted-foreground">
                {totalGuideCount}+ expert guides for dog and cat owners
              </p>
            </>
          ) : (
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-sm">
                <BookOpen className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground tracking-tight">
                  Pet Care Guides
                </h1>
                <p className="text-muted-foreground mt-1">
                  {totalGuideCount}+ expert guides for dog and cat owners
                </p>
              </div>
            </div>
          )}
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl mt-3">
            Whether you're choosing your first dog bed, comparing cat litter boxes, or planning a trip with your pet, our guides provide honest, research-backed advice. Every recommendation is independently selected — never influenced by sponsors.
          </p>
        </header>

        {/* Category quick-nav */}
        <div className="flex flex-wrap gap-2 mb-10">
          {categoryKeys.map(cat => (
            <a
              key={cat}
              href={`#cat-${cat.toLowerCase().replace(/\s+/g, '-')}`}
              className={cn(
                'text-xs rounded-full px-3.5 py-1.5 transition-all',
                premium
                  ? 'border border-border/60 text-foreground/80 hover:border-foreground/40 hover:text-foreground'
                  : 'font-medium bg-card border border-border hover:border-primary/40 hover:text-primary'
              )}
            >
              {cat} ({grouped[cat].length})
            </a>
          ))}
        </div>

        {/* Category Hub Sections */}
        {Object.entries(grouped).map(([category, categoryGuides]) => {
          const hub = CATEGORY_HUBS[category];
          return (
            <section key={category} id={`cat-${category.toLowerCase().replace(/\s+/g, '-')}`} className="mb-16 scroll-mt-20">
              <div className="mb-8">
                {premium ? (
                  <>
                    <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground mb-2">
                      {category} · {categoryGuides.length} guides
                    </p>
                    <h2 className="text-xl md:text-2xl font-display font-semibold text-foreground tracking-tight">
                      {category}
                    </h2>
                    {hub && (
                      <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">{hub.description}</p>
                    )}
                    <div className="mt-4 h-px bg-border/60" />
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3 mb-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <h2 className="text-2xl font-display font-bold text-foreground tracking-tight">
                        {category} <span className="text-sm font-normal text-muted-foreground ml-1">({categoryGuides.length} guides)</span>
                      </h2>
                    </div>
                    {hub && (
                      <p className="text-sm text-muted-foreground ml-7">{hub.description}</p>
                    )}
                    <div className="mt-3 h-px bg-gradient-to-r from-primary/20 via-border to-transparent" />
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {categoryGuides.map((guide) => {
                  const img = getGuideImage(guide.slug);
                  return (
                  <Link
                    key={guide.slug}
                    to={`/guides/${guide.slug}`}
                    className={cn(
                      'group relative block rounded-2xl bg-card overflow-hidden transition-all duration-300',
                      premium
                        ? 'border border-border/60 hover:border-foreground/30'
                        : 'border border-border hover:border-primary/30 hover:shadow-soft hover:-translate-y-1'
                    )}
                  >
                    <div className="aspect-[14/9] overflow-hidden">
                      <img
                        src={img.src}
                        alt={img.alt}
                        width={1400}
                        height={900}
                        loading="lazy"
                        decoding="async"
                        className="aspect-[14/9] w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={(e) => { e.currentTarget.src = '/guides/default-guide.webp'; }}
                      />
                    </div>
                    {premium ? (
                      <div className="p-5">
                        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground mb-2">
                          Guide · {guide.readingTime} min
                        </p>
                        <h3 className="text-[15px] md:text-base font-display font-semibold text-foreground group-hover:text-foreground/80 transition-colors mb-2 leading-snug tracking-tight">
                          {guide.title}
                        </h3>
                        <p className="text-[13px] text-muted-foreground line-clamp-2 leading-relaxed mb-4">
                          {guide.excerpt}
                        </p>
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/80 group-hover:gap-2.5 transition-all duration-300">
                          Read guide <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                        </span>
                      </div>
                    ) : (
                      <div className="p-6">
                        <h3 className="text-lg font-display font-bold text-foreground group-hover:text-primary transition-colors mb-2 leading-snug">
                          {guide.title}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-5 line-clamp-2 leading-relaxed">
                          {guide.excerpt}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                            <Clock className="w-3.5 h-3.5" />
                            {guide.readingTime} min read
                          </span>
                          <span className="flex items-center gap-1.5 text-sm font-semibold text-primary group-hover:gap-2.5 transition-all duration-300">
                            Read Guide <ArrowRight className="w-4 h-4" />
                          </span>
                        </div>
                      </div>
                    )}
                  </Link>
                  );
                })}
              </div>

              {/* Shop CTA for this category hub */}
              {hub && (
                <div className="mt-5">
                  <Link
                    to={`/collections/${hub.shopCategory}`}
                    className={cn(
                      'inline-flex items-center gap-2 text-sm transition-all duration-300 hover:gap-3',
                      premium ? 'font-medium text-foreground/80 hover:text-foreground' : 'font-semibold text-primary'
                    )}
                  >
                    {hub.shopLabel} <ArrowRight className="w-3.5 h-3.5" strokeWidth={premium ? 1.75 : 2} />
                  </Link>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </Layout>
  );
};

export default GuidesIndex;

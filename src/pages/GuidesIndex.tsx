import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { BookOpen, Clock, ArrowRight, ChevronRight, Sparkles } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { useGuidesList } from '@/hooks/useGuides';
import { Loader2 } from 'lucide-react';

const BASE_URL = 'https://getpawsy.pet';

// Category hub metadata for topical authority
const CATEGORY_HUBS: Record<string, { description: string; shopCategory: string; shopLabel: string }> = {
  'Small Pets': {
    description: 'Expert guides on habitats, nutrition, and care for guinea pigs, hamsters, and other small pets.',
    shopCategory: 'small-pet-habitats',
    shopLabel: 'Shop Small Pet Habitats',
  },
  'Cat Furniture': {
    description: 'How to choose the right cat trees, condos, and climbing structures for your indoor cat.',
    shopCategory: 'cat-trees-and-condos',
    shopLabel: 'Shop Cat Trees & Condos',
  },
  'Dog Activities': {
    description: 'Enrichment ideas, outdoor games, and training activities to keep your dog happy and healthy.',
    shopCategory: 'dog-toys',
    shopLabel: 'Shop Dog Toys & Games',
  },
};

const GuidesIndex = () => {
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

  // Group by category for hub sections
  const grouped = guides.reduce<Record<string, typeof guides>>((acc, g) => {
    (acc[g.category] ??= []).push(g);
    return acc;
  }, {});

  return (
    <Layout>
      <Helmet>
        <title>Pet Care Guides | GetPawsy</title>
        <meta name="description" content="Expert pet care guides covering guinea pig cages, cat trees, outdoor dog games, and more. Practical advice for pet parents." />
        <link rel="canonical" href={`${BASE_URL}/guides`} />
        <meta name="robots" content="index, follow, max-image-preview:large" />
        <meta property="og:title" content="Pet Care Guides | GetPawsy" />
        <meta property="og:description" content="Expert pet care guides covering guinea pig cages, cat trees, outdoor dog games, and more." />
        <meta property="og:url" content={`${BASE_URL}/guides`} />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: 'Pet Care Guides',
            description: 'Expert pet care guides for dog, cat, and small pet owners.',
            url: `${BASE_URL}/guides`,
            publisher: { '@type': 'Organization', name: 'GetPawsy', url: BASE_URL },
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

        {/* Premium Header */}
        <header className="mb-14">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-sm">
              <BookOpen className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground tracking-tight">
                Pet Care Guides
              </h1>
              <p className="text-muted-foreground mt-1">
                Practical, expert-backed guides to help you make the best choices for your pets.
              </p>
            </div>
          </div>
        </header>

        {/* Category Hub Sections */}
        {Object.entries(grouped).map(([category, categoryGuides]) => {
          const hub = CATEGORY_HUBS[category];
          return (
            <section key={category} className="mb-16">
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <h2 className="text-2xl font-display font-bold text-foreground tracking-tight">
                    {category}
                  </h2>
                </div>
                {hub && (
                  <p className="text-sm text-muted-foreground ml-7">{hub.description}</p>
                )}
                <div className="mt-3 h-px bg-gradient-to-r from-primary/20 via-border to-transparent" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {categoryGuides.map((guide) => (
                  <Link
                    key={guide.slug}
                    to={`/guides/${guide.slug}`}
                    className="group relative block rounded-2xl border border-border bg-card p-6 hover:border-primary/30 hover:shadow-soft hover:-translate-y-1 transition-all duration-300"
                  >
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
                  </Link>
                ))}
              </div>

              {/* Shop CTA for this category hub */}
              {hub && (
                <div className="mt-5">
                  <Link
                    to={`/products?category=${hub.shopCategory}`}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:gap-3 transition-all duration-300"
                  >
                    {hub.shopLabel} <ArrowRight className="w-3.5 h-3.5" />
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

import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { BookOpen, Clock, ArrowRight, ChevronRight } from 'lucide-react';
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
            publisher: {
              '@type': 'Organization',
              name: 'GetPawsy',
              url: BASE_URL,
            },
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

        <header className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">
              Pet Care Guides
            </h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Practical, expert-backed guides to help you make the best choices for your pets.
          </p>
        </header>

        {/* Category Hub Sections */}
        {Object.entries(grouped).map(([category, categoryGuides]) => {
          const hub = CATEGORY_HUBS[category];
          return (
            <section key={category} className="mb-14">
              <div className="mb-6">
                <h2 className="text-xl font-display font-semibold text-foreground border-b border-border pb-2">
                  {category}
                </h2>
                {hub && (
                  <p className="text-sm text-muted-foreground mt-2">{hub.description}</p>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {categoryGuides.map((guide) => (
                  <Link
                    key={guide.slug}
                    to={`/guides/${guide.slug}`}
                    className="group block rounded-xl border border-border bg-card p-6 hover:border-primary/30 hover:shadow-md transition-all"
                  >
                    <h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors mb-2">
                      {guide.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                      {guide.excerpt}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" />
                        {guide.readingTime} min read
                      </span>
                      <span className="flex items-center gap-1 text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                        Read Guide <ArrowRight className="w-4 h-4" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
              {/* Shop CTA for this category hub */}
              {hub && (
                <div className="mt-4">
                  <Link
                    to={`/products?category=${hub.shopCategory}`}
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
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

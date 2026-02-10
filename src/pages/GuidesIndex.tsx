import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { BookOpen, Clock, ArrowRight } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { useGuidesList } from '@/hooks/useGuides';
import { Loader2 } from 'lucide-react';

const BASE_URL = 'https://getpawsy.pet';

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

  // Group by category
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
              { '@type': 'ListItem', position: 2, name: 'Guides', item: `${BASE_URL}/guides` },
            ],
          })}
        </script>
      </Helmet>

      <div className="container mx-auto px-4 py-12 max-w-5xl">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
          <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
          <span>/</span>
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

        {Object.entries(grouped).map(([category, categoryGuides]) => (
          <section key={category} className="mb-12">
            <h2 className="text-xl font-display font-semibold text-foreground mb-6 border-b border-border pb-2">
              {category}
            </h2>
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
          </section>
        ))}
      </div>
    </Layout>
  );
};

export default GuidesIndex;

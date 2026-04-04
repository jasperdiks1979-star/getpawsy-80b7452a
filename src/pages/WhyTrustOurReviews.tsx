import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { Link } from 'react-router-dom';
import { Shield, Search, BarChart3, Users, ChevronRight, CheckCircle, BookOpen, Eye, Star } from 'lucide-react';
import { AUTHOR, PUBLISHER, getPublisherSchema } from '@/lib/author-entity';

const BASE_URL = 'https://getpawsy.pet';

const WhyTrustOurReviews = () => {
  const orgSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Why Trust Our Reviews – GetPawsy Editorial Standards',
    description: 'Learn how GetPawsy researches, tests, and recommends pet products. Our editorial process ensures honest, unbiased reviews for US pet owners.',
    url: `${BASE_URL}/why-trust-our-reviews`,
    publisher: getPublisherSchema(),
  };

  return (
    <Layout>
      <Helmet>
        <title>Why Trust Our Reviews – Honest Pet Product Testing | GetPawsy</title>
        <meta name="description" content="How GetPawsy tests and reviews pet products. Learn our editorial process, testing methodology, and why US pet owners trust our recommendations." />
        <link rel="canonical" href={`${BASE_URL}/why-trust-our-reviews`} />
        <meta name="robots" content="index, follow" />
        <meta property="og:title" content="Why Trust Our Reviews | GetPawsy" />
        <meta property="og:description" content="Transparent editorial standards. Every product recommendation is backed by research, not sponsorship." />
        <meta property="og:url" content={`${BASE_URL}/why-trust-our-reviews`} />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify(orgSchema)}</script>
      </Helmet>

      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
          <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium">Why Trust Our Reviews</span>
        </nav>

        <header className="mb-12">
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
            Why Trust Our Pet Product Reviews
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl">
            At GetPawsy, every recommendation is earned — not bought. Here's how we research, evaluate, and rank pet products for US pet owners.
          </p>
        </header>

        {/* Research Methodology */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Search className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-2xl font-display font-bold text-foreground">
              Our Research Process
            </h2>
          </div>
          <div className="bg-card rounded-2xl shadow-card p-6 md:p-8 space-y-4">
            <p className="text-foreground text-lg">
              Our lead researcher, <Link to="/about-the-author" className="text-primary hover:underline font-medium">{AUTHOR.name}</Link>, spends an average of <strong>15–20 hours per guide</strong> evaluating products before publishing recommendations.
            </p>
            <div className="space-y-3">
              {[
                'Compare specifications, materials, and construction quality across 10–30+ products per category',
                'Analyze thousands of verified customer reviews for real-world durability and satisfaction data',
                'Evaluate return rates and complaint patterns to identify hidden quality issues',
                'Test for US market fit — sizing, shipping weight, availability, and customer support quality',
                'Cross-reference manufacturer claims against independent testing standards where available',
                'Update guides every 60–90 days to reflect new products and changing market conditions',
              ].map((step) => (
                <div key={step} className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <p className="text-muted-foreground">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Editorial Independence */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-2xl font-display font-bold text-foreground">
              Editorial Independence
            </h2>
          </div>
          <div className="bg-card rounded-2xl shadow-card p-6 md:p-8 space-y-4">
            <p className="text-foreground text-lg">
              Our rankings are never influenced by brand partnerships, sponsorships, or advertising revenue.
            </p>
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-5">
              <h3 className="font-semibold text-foreground mb-3">Our Editorial Policy</h3>
              <ul className="space-y-2 text-muted-foreground">
                <li>• No brand can pay for placement or higher ranking in our guides</li>
                <li>• Affiliate commissions never influence which products we recommend</li>
                <li>• We clearly disclose affiliate relationships on every page</li>
                <li>• Products are ranked by merit: quality, value, durability, and customer satisfaction</li>
                <li>• We remove products that fall below our quality standards, regardless of commission potential</li>
              </ul>
            </div>
            <p className="text-muted-foreground">
              Read our full <Link to="/affiliate-disclosure" className="text-primary hover:underline">Affiliate Disclosure</Link> and <Link to="/editorial-guidelines" className="text-primary hover:underline">Editorial Guidelines</Link> for complete transparency.
            </p>
          </div>
        </section>

        {/* How We Rank Products */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-2xl font-display font-bold text-foreground">
              How We Rank Products
            </h2>
          </div>
          <div className="bg-card rounded-2xl shadow-card p-6 md:p-8">
            <p className="text-foreground text-lg mb-6">
              Every product in our guides is scored across five key dimensions:
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: Star, title: 'Build Quality', desc: 'Materials, durability, and construction standards' },
                { icon: Shield, title: 'Pet Safety', desc: 'Non-toxic materials, stability, and age-appropriate design' },
                { icon: Users, title: 'Customer Satisfaction', desc: 'Verified review scores and long-term owner feedback' },
                { icon: BarChart3, title: 'Value for Money', desc: 'Price-to-quality ratio compared to category averages' },
                { icon: Eye, title: 'Design & Usability', desc: 'Ease of setup, cleaning, and daily use for pet owners' },
                { icon: BookOpen, title: 'Brand Reputation', desc: 'Company track record, warranty support, and return policies' },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-3 bg-muted/30 rounded-lg p-4 border border-border">
                  <item.icon className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground text-sm">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Who Reviews Our Products */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-2xl font-display font-bold text-foreground">
              Meet Our Reviewer
            </h2>
          </div>
          <div className="bg-card rounded-2xl shadow-card p-6 md:p-8">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-foreground">{AUTHOR.name}</h3>
                <p className="text-sm text-primary mb-2">{AUTHOR.jobTitle}</p>
                <p className="text-muted-foreground mb-3">{AUTHOR.bio}</p>
                <div className="flex flex-wrap gap-2">
                  {AUTHOR.expertise.map((area) => (
                    <span key={area} className="text-xs bg-muted px-2.5 py-1 rounded-full text-muted-foreground">{area}</span>
                  ))}
                </div>
                <Link to="/about-the-author" className="inline-flex items-center gap-1 text-primary text-sm mt-3 hover:underline">
                  Full bio <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10 rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-display font-bold text-foreground mb-3">
            Read Our Expert Guides
          </h2>
          <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
            Browse our library of thoroughly researched buying guides to find the perfect products for your pet.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/guides" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-full font-medium hover:opacity-90 transition-opacity">
              <BookOpen className="w-4 h-4" /> Browse Guides
            </Link>
            <Link to="/collections/dogs" className="inline-flex items-center gap-2 bg-card border px-6 py-2.5 rounded-full font-medium hover:border-primary/50 transition-colors">
              Shop Dogs
            </Link>
            <Link to="/collections/cats" className="inline-flex items-center gap-2 bg-card border px-6 py-2.5 rounded-full font-medium hover:border-primary/50 transition-colors">
              Shop Cats
            </Link>
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default WhyTrustOurReviews;

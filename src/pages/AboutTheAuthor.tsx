import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { Link } from 'react-router-dom';
import { BookOpen, Shield, Search, ChevronRight } from 'lucide-react';
import { AUTHOR, PUBLISHER, getPersonSchema } from '@/lib/author-entity';

const BASE_URL = 'https://getpawsy.pet';

const AboutTheAuthor = () => {
  const personSchema = getPersonSchema();

  return (
    <Layout>
      <Helmet>
        <title>{AUTHOR.name} - Pet Product Researcher | GetPawsy</title>
        <meta name="description" content={`${AUTHOR.bio} Read expert pet product guides and recommendations on GetPawsy.`} /><meta name="robots" content="index, follow" />
        <meta property="og:title" content={`${AUTHOR.name} - Pet Product Researcher`} />
        <meta property="og:description" content={AUTHOR.bio} />
        <meta property="og:url" content={`${BASE_URL}/about-the-author`} />
        <meta property="og:type" content="profile" />
        <script type="application/ld+json">{JSON.stringify(personSchema)}</script>
      </Helmet>

      <div className="container mx-auto px-4 py-12 max-w-3xl">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
          <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium">About the Author</span>
        </nav>

        <header className="mb-10">
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
            Meet {AUTHOR.name}
          </h1>
          <p className="text-lg text-muted-foreground">
            {AUTHOR.jobTitle} at {PUBLISHER.name}
          </p>
        </header>

        <section className="mb-10">
          <h2 className="text-2xl font-display font-bold text-foreground mb-4">About Me</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {AUTHOR.bio}
          </p>
          <p className="text-muted-foreground leading-relaxed mb-4">
            Every product recommendation on GetPawsy comes from hands-on research and real-world testing. I compare materials, durability, ease of cleaning, and value for money — because pet parents deserve honest, practical advice, not marketing fluff.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            I'm based in the United States and test products with the needs of American pet owners in mind — from apartment-friendly cat litter solutions to durable dog beds that handle heavy chewers.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-display font-bold text-foreground mb-4">Areas of Expertise</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {AUTHOR.expertise.map((area) => (
              <div key={area} className="flex items-center gap-3 bg-muted/30 rounded-lg p-4 border border-border">
                <BookOpen className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-foreground font-medium text-sm">{area}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-display font-bold text-foreground mb-4">Editorial Independence</h2>
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-6">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-foreground leading-relaxed mb-3">
                  All product evaluations and recommendations are made independently. GetPawsy may earn a commission when you purchase through our links, but this never influences our rankings or recommendations.
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  Our testing methodology and editorial guidelines are transparent and publicly available. We believe trust is earned through honesty, not hidden agendas.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-display font-bold text-foreground mb-4">My Research Process</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Search className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
              <p className="text-muted-foreground leading-relaxed">
                I spend an average of 15–20 hours researching each guide, comparing specifications, reading customer feedback, and evaluating long-term durability. Learn more about our full process on the <Link to="/how-we-test-products" className="text-primary hover:underline">How We Test Products</Link> page.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-display font-bold text-foreground mb-4">Contact</h2>
          <p className="text-muted-foreground leading-relaxed">
            Have a question about a product recommendation or want to suggest a topic? Reach out through our <Link to="/contact" className="text-primary hover:underline">contact page</Link>. I read every message and do my best to respond within 48 hours.
          </p>
        </section>
      </div>
    </Layout>
  );
};

export default AboutTheAuthor;

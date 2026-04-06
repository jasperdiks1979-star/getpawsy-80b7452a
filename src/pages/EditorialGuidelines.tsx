import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { AUTHOR, PUBLISHER } from '@/lib/author-entity';

const BASE_URL = 'https://getpawsy.pet';

const EditorialGuidelines = () => {
  return (
    <Layout>
      <Helmet>
        <title>Editorial Guidelines | GetPawsy</title>
        <meta name="description" content="Learn how GetPawsy researches, evaluates, and recommends pet products. Our editorial standards ensure honest, independent, and practical buying advice." /><meta name="robots" content="index, follow" />
      </Helmet>

      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
          <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium">Editorial Guidelines</span>
        </nav>

        <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-6">
          Editorial Guidelines
        </h1>
        <p className="text-lg text-muted-foreground mb-10">
          How we research, evaluate, and recommend pet products at {PUBLISHER.name}.
        </p>

        <section className="mb-10">
          <h2 className="text-2xl font-display font-bold text-foreground mb-4">How Our Guides Are Researched</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            Every guide published on GetPawsy begins with extensive market research. Our researcher, <Link to="/about-the-author" className="text-primary hover:underline">{AUTHOR.name}</Link>, spends 15–20 hours per guide analyzing product specifications, comparing materials and construction, reading verified customer reviews, and assessing long-term value.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            We focus on products available to US pet parents and evaluate them against practical, real-world criteria — not manufacturer marketing claims.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-display font-bold text-foreground mb-4">How Products Are Compared</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            Our comparison methodology uses consistent evaluation criteria across every product category. For each guide, we define specific criteria relevant to that product type (e.g., odor control and dust levels for cat litter, or support and durability for dog beds).
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Products are scored against these criteria and ranked based on overall performance. We always include options across different price points — budget, mid-range, and premium — so every pet parent can find something that fits their needs and budget.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-display font-bold text-foreground mb-4">How Recommendations Are Selected</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            A product earns a "Best Overall," "Budget Pick," or "Premium Choice" badge based on its performance across our evaluation criteria. We never accept payment for placement or rankings.
          </p>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-4">
            <li><strong className="text-foreground">Best Overall</strong> — Strongest balance of quality, features, and value</li>
            <li><strong className="text-foreground">Budget Pick</strong> — Best quality at the lowest price point</li>
            <li><strong className="text-foreground">Premium Choice</strong> — Top-tier quality for pet parents who want the best</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-display font-bold text-foreground mb-4">Affiliate Disclosure</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            GetPawsy participates in affiliate programs, which means we may earn a commission when you purchase a product through our links. This comes at no extra cost to you.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Important:</strong> Affiliate relationships never influence our product rankings, recommendations, or editorial content. Our full disclosure is available on our <Link to="/affiliate-disclosure" className="text-primary hover:underline">Affiliate Disclosure</Link> page.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-display font-bold text-foreground mb-4">Updates & Corrections</h2>
          <p className="text-muted-foreground leading-relaxed">
            We regularly review and update our guides to reflect product changes, new releases, and evolving market conditions. Each guide displays a "Last updated" date. If you spot an error or outdated information, please <Link to="/contact" className="text-primary hover:underline">contact us</Link> and we'll correct it promptly.
          </p>
        </section>
      </div>
    </Layout>
  );
};

export default EditorialGuidelines;

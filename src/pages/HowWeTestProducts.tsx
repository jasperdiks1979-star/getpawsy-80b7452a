import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { Link } from 'react-router-dom';
import { ChevronRight, Beaker, Eye, Scale, ClipboardCheck } from 'lucide-react';
import { AUTHOR } from '@/lib/author-entity';

const BASE_URL = 'https://getpawsy.pet';

const HowWeTestProducts = () => {
  return (
    <Layout>
      <Helmet>
        <title>How We Test & Evaluate Pet Products | GetPawsy</title>
        <meta name="description" content="Our transparent testing methodology: how GetPawsy evaluates pet products for quality, safety, durability, and value before making recommendations." /><meta name="robots" content="index, follow" />
      </Helmet>

      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
          <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium">How We Test Products</span>
        </nav>

        <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-6">
          How We Test & Evaluate Pet Products
        </h1>
        <p className="text-lg text-muted-foreground mb-10">
          Transparency is the foundation of trust. Here's exactly how we evaluate every product before recommending it.
        </p>

        <section className="mb-10">
          <h2 className="text-2xl font-display font-bold text-foreground mb-4">Our Evaluation Process</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            Every product featured on GetPawsy goes through a structured evaluation process led by <Link to="/about-the-author" className="text-primary hover:underline">{AUTHOR.name}</Link>. We don't rely on manufacturer claims alone — we cross-reference specifications, analyze verified customer feedback patterns, and evaluate real-world performance.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
            <div className="bg-muted/30 rounded-lg p-5 border border-border">
              <Beaker className="w-5 h-5 text-primary mb-3" />
              <h3 className="font-semibold text-foreground text-sm mb-2">Materials & Build</h3>
              <p className="text-sm text-muted-foreground">We examine construction quality, material safety, and manufacturing standards for every product.</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-5 border border-border">
              <Eye className="w-5 h-5 text-primary mb-3" />
              <h3 className="font-semibold text-foreground text-sm mb-2">Real-World Performance</h3>
              <p className="text-sm text-muted-foreground">We analyze how products perform under actual usage conditions, not just lab settings.</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-5 border border-border">
              <Scale className="w-5 h-5 text-primary mb-3" />
              <h3 className="font-semibold text-foreground text-sm mb-2">Value Assessment</h3>
              <p className="text-sm text-muted-foreground">Price per unit of quality matters. We calculate long-term cost and durability, not just sticker price.</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-5 border border-border">
              <ClipboardCheck className="w-5 h-5 text-primary mb-3" />
              <h3 className="font-semibold text-foreground text-sm mb-2">Customer Feedback Audit</h3>
              <p className="text-sm text-muted-foreground">We analyze hundreds of verified reviews to identify patterns in satisfaction, complaints, and durability.</p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-display font-bold text-foreground mb-4">Category-Specific Criteria</h2>

          <div className="mb-6">
            <h3 className="text-lg font-semibold text-foreground mb-2">Cat Litter & Litter Boxes</h3>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>Odor control effectiveness over 7+ days</li>
              <li>Dust level and respiratory safety</li>
              <li>Clumping strength and scoopability</li>
              <li>Tracking reduction outside the box</li>
              <li>Price per pound and monthly cost estimate</li>
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-semibold text-foreground mb-2">Dog Beds & Comfort Products</h3>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>Support quality for joints and orthopedic needs</li>
              <li>Cover durability and machine washability</li>
              <li>Resistance to scratching and chewing</li>
              <li>Non-slip base performance</li>
              <li>Size accuracy vs. manufacturer claims</li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Pet Accessories & Toys</h3>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>Material safety (non-toxic, BPA-free)</li>
              <li>Durability under aggressive play</li>
              <li>Ease of cleaning and maintenance</li>
              <li>Engagement level and interactive value</li>
            </ul>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-display font-bold text-foreground mb-4">Comparison Methodology</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            When comparing products within a guide, we use a standardized scoring framework. Each product is assessed against the same criteria, weighted by importance for that specific product category.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Products that score highest across all criteria earn our "Best Overall" recommendation. We also identify the best options at different price tiers so every budget is covered.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-display font-bold text-foreground mb-4">What We Don't Do</h2>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground">
            <li>We <strong className="text-foreground">never</strong> accept payment for product rankings or reviews</li>
            <li>We <strong className="text-foreground">never</strong> make veterinary or medical claims about products</li>
            <li>We <strong className="text-foreground">never</strong> fabricate testing results or customer testimonials</li>
            <li>We <strong className="text-foreground">never</strong> create fake urgency or scarcity signals</li>
          </ul>
          <p className="text-muted-foreground leading-relaxed mt-4">
            Read our full <Link to="/editorial-guidelines" className="text-primary hover:underline">Editorial Guidelines</Link> and <Link to="/affiliate-disclosure" className="text-primary hover:underline">Affiliate Disclosure</Link> for complete transparency.
          </p>
        </section>
      </div>
    </Layout>
  );
};

export default HowWeTestProducts;

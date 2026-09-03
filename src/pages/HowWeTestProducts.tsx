import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { Link } from 'react-router-dom';
import { ChevronRight, FileText, Eye, Scale, ClipboardCheck } from 'lucide-react';

const HowWeTestProducts = () => {
  return (
    <Layout>
      <Helmet>
        <title>How We Select Pet Products | GetPawsy</title>
        <meta
          name="description"
          content="How GetPawsy selects the pet products it lists: published specifications, materials, supplier documentation and price comparison. No lab or in-home testing claims."
        />
        <meta name="robots" content="index, follow" />
      </Helmet>

      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
          <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium">How We Select Products</span>
        </nav>

        <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-6">
          How We Select Pet Products
        </h1>
        <p className="text-lg text-muted-foreground mb-10">
          We want to be precise about what we do and what we do not do. GetPawsy is an online
          retailer, not a testing laboratory. Our guides and product selections are based on desk
          research, not on physical testing performed by us.
        </p>

        <section className="mb-10">
          <h2 className="text-2xl font-display font-bold text-foreground mb-4">Our Selection Process</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            Every product we list is reviewed against published specifications and supplier
            documentation before it goes into the catalog. We compare products in the same category
            on the same criteria so descriptions stay consistent and comparable.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
            <div className="bg-muted/30 rounded-lg p-5 border border-border">
              <FileText className="w-5 h-5 text-primary mb-3" />
              <h3 className="font-semibold text-foreground text-sm mb-2">Published Specifications</h3>
              <p className="text-sm text-muted-foreground">We read the manufacturer specification sheet: dimensions, materials, weight limits and care instructions.</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-5 border border-border">
              <Eye className="w-5 h-5 text-primary mb-3" />
              <h3 className="font-semibold text-foreground text-sm mb-2">Materials &amp; Build</h3>
              <p className="text-sm text-muted-foreground">We check the stated construction and materials, and we leave out products where that information is missing or contradictory.</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-5 border border-border">
              <Scale className="w-5 h-5 text-primary mb-3" />
              <h3 className="font-semibold text-foreground text-sm mb-2">Price Comparison</h3>
              <p className="text-sm text-muted-foreground">We compare price against comparable products in the same category and size class.</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-5 border border-border">
              <ClipboardCheck className="w-5 h-5 text-primary mb-3" />
              <h3 className="font-semibold text-foreground text-sm mb-2">Availability &amp; Shipping</h3>
              <p className="text-sm text-muted-foreground">We only list products our fulfillment partners can actually ship to customers in the United States.</p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-display font-bold text-foreground mb-4">Category Criteria We Compare</h2>

          <div className="mb-6">
            <h3 className="text-lg font-semibold text-foreground mb-2">Cat Litter &amp; Litter Boxes</h3>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>Stated capacity and interior dimensions</li>
              <li>Enclosure type and stated odor-control design</li>
              <li>Cleaning method and stated maintenance effort</li>
              <li>Price relative to comparable models</li>
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-semibold text-foreground mb-2">Dog Beds &amp; Comfort Products</h3>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>Stated foam type, thickness and support construction</li>
              <li>Cover material and whether it is machine washable</li>
              <li>Stated size range and weight suitability</li>
              <li>Non-slip base as described by the manufacturer</li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Pet Accessories &amp; Toys</h3>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>Stated materials and manufacturer safety declarations</li>
              <li>Stated size and suitability by pet weight</li>
              <li>Cleaning and maintenance instructions</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-display font-bold text-foreground mb-4">What We Don't Claim</h2>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground">
            <li>We do <strong className="text-foreground">not</strong> perform laboratory or in-home product testing ourselves</li>
            <li>We do <strong className="text-foreground">not</strong> claim products are expert-approved, comfort-focused or safety-certified by us</li>
            <li>We do <strong className="text-foreground">not</strong> make veterinary or medical claims about products</li>
            <li>We do <strong className="text-foreground">not</strong> publish invented testing results or customer testimonials</li>
            <li>We do <strong className="text-foreground">not</strong> create artificial urgency or scarcity signals</li>
          </ul>
          <p className="text-muted-foreground leading-relaxed mt-4">
            Read our <Link to="/editorial-guidelines" className="text-primary hover:underline">Editorial Guidelines</Link> and{' '}
            <Link to="/affiliate-disclosure" className="text-primary hover:underline">Affiliate Disclosure</Link> for more detail.
          </p>
        </section>
      </div>
    </Layout>
  );
};

export default HowWeTestProducts;

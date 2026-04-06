import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

const BASE_URL = 'https://getpawsy.pet';

const AffiliateDisclosure = () => {
  return (
    <Layout>
      <Helmet>
        <title>Affiliate Disclosure | GetPawsy</title>
        <meta name="description" content="GetPawsy affiliate disclosure: how we earn commissions, our commitment to editorial independence, and what this means for you." /><meta name="robots" content="index, follow" />
      </Helmet>

      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
          <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium">Affiliate Disclosure</span>
        </nav>

        <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-6">
          Affiliate Disclosure
        </h1>

        <div className="space-y-6 text-muted-foreground leading-relaxed">
          <p>
            <strong className="text-foreground">Last updated:</strong> February 2026
          </p>

          <p>
            GetPawsy (getpawsy.pet) is a participant in various affiliate programs. This means that when you click on a product link on our site and make a purchase, we may receive a small commission at no additional cost to you.
          </p>

          <h2 className="text-2xl font-display font-bold text-foreground mt-8 mb-4">How This Works</h2>
          <p>
            Some of the links on GetPawsy are affiliate links. When you purchase a product through these links, the retailer pays us a small referral fee. This fee comes from the retailer's marketing budget — it does not increase the price you pay.
          </p>

          <h2 className="text-2xl font-display font-bold text-foreground mt-8 mb-4">Our Commitment to You</h2>
          <ul className="list-disc list-inside space-y-2">
            <li>Affiliate relationships <strong className="text-foreground">never</strong> influence our product rankings or recommendations</li>
            <li>We recommend products based on quality, value, and real-world performance — not commission rates</li>
            <li>We often recommend products that offer lower commissions if they provide better value for pet parents</li>
            <li>Every guide follows the same <Link to="/editorial-guidelines" className="text-primary hover:underline">editorial guidelines</Link> and <Link to="/how-we-test-products" className="text-primary hover:underline">testing methodology</Link></li>
          </ul>

          <h2 className="text-2xl font-display font-bold text-foreground mt-8 mb-4">Why We Use Affiliate Links</h2>
          <p>
            Revenue from affiliate commissions helps us maintain GetPawsy, fund product research, and continue publishing free, independent buying guides for pet parents across the United States.
          </p>

          <h2 className="text-2xl font-display font-bold text-foreground mt-8 mb-4">Questions?</h2>
          <p>
            If you have any questions about our affiliate relationships or editorial independence, please <Link to="/contact" className="text-primary hover:underline">contact us</Link>. We're happy to explain how any specific recommendation was made.
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default AffiliateDisclosure;

import { Layout } from '@/components/layout/Layout';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Shield, Mail } from 'lucide-react';
import { SITE_LAST_UPDATED } from '@/lib/shipping-constants';

const PrivacyPolicy = () => {
  const lastUpdated = SITE_LAST_UPDATED;

  return (
    <Layout>
      <Helmet>
        <title>Privacy Policy | GetPawsy</title>
        <meta name="description" content="Read the GetPawsy privacy policy. Learn how we collect, use, and protect your personal data when you shop for pet products. Your privacy matters to us." /></Helmet>
      <div className="min-h-screen py-16 lg:py-24">
        <div className="container px-4 md:px-6 max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* Header */}
            <div className="text-center mb-12">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
                <Shield className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
                Privacy Policy
              </h1>
              <p className="text-muted-foreground">
                Last Updated: {lastUpdated}
              </p>
            </div>

            {/* Content */}
            <div className="prose prose-lg max-w-none">
              <div className="bg-muted/30 rounded-2xl p-6 mb-8">
                <p className="text-foreground m-0">
                  At GetPawsy, we take your privacy seriously. This Privacy Policy explains how we collect, 
                  use, disclose, and safeguard your information when you visit our website or make a purchase.
                </p>
              </div>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  1. Information We Collect
                </h2>
                
                <h3 className="text-xl font-semibold text-foreground mb-3">Personal Information</h3>
                <p className="text-muted-foreground mb-4">
                  When you make a purchase or create an account, we may collect:
                </p>
                <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                  <li>Name and contact information (email address, phone number)</li>
                  <li>Billing and shipping addresses</li>
                  <li>Payment information (processed securely by our payment providers)</li>
                  <li>Order history and preferences</li>
                  <li>Account credentials</li>
                </ul>

                <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">Automatically Collected Information</h3>
                <p className="text-muted-foreground mb-4">
                  When you visit our website, we automatically collect:
                </p>
                <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                  <li>Device information (browser type, operating system)</li>
                  <li>IP address and location data</li>
                  <li>Pages visited and time spent on our site</li>
                  <li>Referring website addresses</li>
                  <li>Cookies and similar tracking technologies</li>
                </ul>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  2. How We Use Your Information
                </h2>
                <p className="text-muted-foreground mb-4">We use the information we collect to:</p>
                <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                  <li>Process and fulfill your orders</li>
                  <li>Communicate with you about your orders and account</li>
                  <li>Send promotional emails (with your consent)</li>
                  <li>Improve our website and customer experience</li>
                  <li>Prevent fraud and ensure security</li>
                  <li>Comply with legal obligations</li>
                  <li>Provide customer support</li>
                </ul>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  3. Information Sharing
                </h2>
                <p className="text-muted-foreground mb-4">
                  We may share your information with:
                </p>
                <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                  <li><strong>Service Providers:</strong> Companies that help us operate our business (shipping carriers, payment processors, email services)</li>
                  <li><strong>Business Partners:</strong> Trusted partners who assist in fulfilling orders</li>
                  <li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
                </ul>
                <p className="text-muted-foreground mt-4">
                  We do not sell, rent, or trade your personal information to third parties for marketing purposes.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  4. Data Security
                </h2>
                <p className="text-muted-foreground">
                  We implement appropriate technical and organizational security measures to protect your personal 
                  information against unauthorized access, alteration, disclosure, or destruction. This includes:
                </p>
                <ul className="list-disc pl-6 text-muted-foreground space-y-2 mt-4">
                  <li>SSL encryption for all data transmissions</li>
                  <li>Secure payment processing through PCI-compliant providers</li>
                  <li>Regular security audits and updates</li>
                  <li>Access controls and authentication measures</li>
                </ul>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  5. Cookies and Tracking
                </h2>
                <p className="text-muted-foreground mb-4">
                  We use cookies and similar technologies to:
                </p>
                <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                  <li>Remember your preferences and settings</li>
                  <li>Keep you logged in</li>
                  <li>Analyze website traffic and usage</li>
                  <li>Personalize content and advertisements</li>
                </ul>
                <p className="text-muted-foreground mt-4">
                  You can control cookies through your browser settings. However, disabling cookies may affect 
                  your experience on our website.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  6. Your Rights
                </h2>
                <p className="text-muted-foreground mb-4">
                  Depending on your location, you may have the right to:
                </p>
                <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                  <li>Access the personal information we hold about you</li>
                  <li>Request correction of inaccurate information</li>
                  <li>Request deletion of your personal information</li>
                  <li>Opt-out of marketing communications</li>
                  <li>Data portability</li>
                  <li>Withdraw consent at any time</li>
                </ul>
                <p className="text-muted-foreground mt-4">
                  To exercise these rights, please contact us at the email address below.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  7. California Privacy Rights (CCPA)
                </h2>
                <p className="text-muted-foreground">
                  If you are a California resident, you have additional rights under the California Consumer 
                  Privacy Act (CCPA), including the right to know what personal information we collect, 
                  the right to delete your information, and the right to opt-out of the sale of your 
                  personal information. We do not sell personal information.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  8. Children's Privacy
                </h2>
                <p className="text-muted-foreground">
                  Our website is not intended for children under 13 years of age. We do not knowingly collect 
                  personal information from children under 13. If you believe we have collected information 
                  from a child, please contact us immediately.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  9. Changes to This Policy
                </h2>
                <p className="text-muted-foreground">
                  We may update this Privacy Policy from time to time. We will notify you of any changes by 
                  posting the new Privacy Policy on this page and updating the "Last Updated" date. We encourage 
                  you to review this Policy periodically.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  10. Contact Us
                </h2>
                <p className="text-muted-foreground mb-4">
                  If you have questions about this Privacy Policy or our privacy practices, please contact us:
                </p>
                <div className="bg-muted/30 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Mail className="w-5 h-5 text-primary" />
                    <a href="mailto:support@getpawsy.pet" className="text-primary hover:underline">
                      support@getpawsy.pet
                    </a>
                  </div>
                  <div className="text-muted-foreground space-y-1">
                    <p className="m-0 font-semibold text-foreground">GetPawsy</p>
                    <p className="m-0">Apeldoorn, Gelderland, Netherlands</p>
                    <p className="m-0 mt-3 text-sm">KVK: 78156955</p>
                    <p className="m-0 text-sm">VAT ID: NL003295015B69</p>
                  </div>
                </div>
              </section>
            </div>
          </motion.div>
        </div>
      </div>
    </Layout>
  );
};

export default PrivacyPolicy;

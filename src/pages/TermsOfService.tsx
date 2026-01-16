import { Layout } from '@/components/layout/Layout';
import { motion } from 'framer-motion';
import { FileText, Mail } from 'lucide-react';

const TermsOfService = () => {
  const lastUpdated = 'January 16, 2026';

  return (
    <Layout>
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
                <FileText className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
                Terms of Service
              </h1>
              <p className="text-muted-foreground">
                Last Updated: {lastUpdated}
              </p>
            </div>

            {/* Content */}
            <div className="prose prose-lg max-w-none">
              <div className="bg-muted/30 rounded-2xl p-6 mb-8">
                <p className="text-foreground m-0">
                  Welcome to GetPawsy. By accessing or using our website, you agree to be bound by these 
                  Terms of Service. Please read them carefully before making any purchase.
                </p>
              </div>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  1. Acceptance of Terms
                </h2>
                <p className="text-muted-foreground">
                  By accessing and using this website, you accept and agree to be bound by these Terms of Service 
                  and our Privacy Policy. If you do not agree to these terms, please do not use our website. 
                  We reserve the right to modify these terms at any time, and such modifications will be effective 
                  immediately upon posting.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  2. Eligibility
                </h2>
                <p className="text-muted-foreground">
                  You must be at least 18 years old to make a purchase on our website. By placing an order, 
                  you represent and warrant that you are at least 18 years of age and have the legal capacity 
                  to enter into a binding contract.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  3. Products and Pricing
                </h2>
                <p className="text-muted-foreground mb-4">
                  We make every effort to display accurate product descriptions, images, and pricing. However:
                </p>
                <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                  <li>Colors may vary slightly due to monitor settings</li>
                  <li>Prices are subject to change without notice</li>
                  <li>We reserve the right to correct pricing errors</li>
                  <li>Products are subject to availability</li>
                  <li>We reserve the right to limit quantities</li>
                </ul>
                <p className="text-muted-foreground mt-4">
                  All prices are displayed in USD and include applicable taxes where required.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  4. Orders and Payment
                </h2>
                <p className="text-muted-foreground mb-4">
                  When you place an order:
                </p>
                <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                  <li>You are making an offer to purchase the products</li>
                  <li>Order confirmation does not constitute acceptance</li>
                  <li>We reserve the right to refuse or cancel any order</li>
                  <li>Payment must be received before order processing</li>
                  <li>We accept major credit cards and other payment methods as displayed</li>
                </ul>
                <p className="text-muted-foreground mt-4">
                  If we cancel an order after payment has been processed, we will issue a full refund.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  5. Shipping and Delivery
                </h2>
                <p className="text-muted-foreground mb-4">
                  We currently ship within the United States. Please note:
                </p>
                <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                  <li>Shipping times are estimates and not guaranteed</li>
                  <li>Delivery times vary based on location and carrier</li>
                  <li>Standard shipping typically takes 7-21 business days</li>
                  <li>We are not responsible for delays caused by carriers or customs</li>
                  <li>Risk of loss passes to you upon delivery to the carrier</li>
                </ul>
                <p className="text-muted-foreground mt-4">
                  You will receive tracking information once your order has shipped.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  6. Returns and Refunds
                </h2>
                <p className="text-muted-foreground mb-4">
                  Please refer to our Return Policy page for detailed information about returns and refunds. 
                  Key points include:
                </p>
                <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                  <li>Returns must be initiated within 30 days of delivery</li>
                  <li>Products must be unused and in original packaging</li>
                  <li>Some products may not be eligible for return</li>
                  <li>Refunds are processed to the original payment method</li>
                </ul>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  7. Intellectual Property
                </h2>
                <p className="text-muted-foreground">
                  All content on this website, including text, graphics, logos, images, and software, is the 
                  property of GetPawsy or its content suppliers and is protected by United States and international 
                  copyright laws. You may not reproduce, distribute, modify, or create derivative works from any 
                  content without our express written permission.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  8. User Accounts
                </h2>
                <p className="text-muted-foreground mb-4">
                  If you create an account with us, you are responsible for:
                </p>
                <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                  <li>Maintaining the confidentiality of your account information</li>
                  <li>All activities that occur under your account</li>
                  <li>Notifying us immediately of any unauthorized use</li>
                </ul>
                <p className="text-muted-foreground mt-4">
                  We reserve the right to terminate accounts at our discretion.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  9. Limitation of Liability
                </h2>
                <p className="text-muted-foreground">
                  To the fullest extent permitted by law, GetPawsy shall not be liable for any indirect, incidental, 
                  special, consequential, or punitive damages arising out of or relating to your use of our website 
                  or products. Our total liability shall not exceed the amount you paid for the product in question.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  10. Disclaimer of Warranties
                </h2>
                <p className="text-muted-foreground">
                  Our website and products are provided "as is" without warranties of any kind, either express or 
                  implied. We do not warrant that our website will be uninterrupted, error-free, or free of viruses. 
                  We disclaim all warranties, including implied warranties of merchantability and fitness for a 
                  particular purpose.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  11. Indemnification
                </h2>
                <p className="text-muted-foreground">
                  You agree to indemnify, defend, and hold harmless GetPawsy and its officers, directors, employees, 
                  and agents from any claims, liabilities, damages, losses, or expenses arising out of your use of 
                  our website, violation of these terms, or infringement of any third-party rights.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  12. Governing Law
                </h2>
                <p className="text-muted-foreground">
                  These Terms of Service shall be governed by and construed in accordance with the laws of the 
                  United States, without regard to conflict of law principles. Any disputes arising from these 
                  terms shall be resolved exclusively in the courts of the United States.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  13. Severability
                </h2>
                <p className="text-muted-foreground">
                  If any provision of these Terms of Service is found to be unenforceable, the remaining provisions 
                  will continue in full force and effect. Our failure to enforce any right or provision of these 
                  terms shall not constitute a waiver.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  14. Contact Us
                </h2>
                <p className="text-muted-foreground mb-4">
                  If you have questions about these Terms of Service, please contact us:
                </p>
                <div className="bg-muted/30 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <Mail className="w-5 h-5 text-primary" />
                    <a href="mailto:legal@getpawsy.pet" className="text-primary hover:underline">
                      legal@getpawsy.pet
                    </a>
                  </div>
                  <p className="text-muted-foreground m-0">
                    GetPawsy LLC<br />
                    United States
                  </p>
                </div>
              </section>
            </div>
          </motion.div>
        </div>
      </div>
    </Layout>
  );
};

export default TermsOfService;

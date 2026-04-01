import { Layout } from '@/components/layout/Layout';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { FileText, Mail, AlertTriangle } from 'lucide-react';
import {
  DELIVERY_TIME_STANDARD,
  FREE_SHIPPING_THRESHOLD,
  RETURN_WINDOW_DAYS,
  US_FULFILLMENT_NOTE,
  SITE_LAST_UPDATED,
} from '@/lib/shipping-constants';

const TermsOfService = () => {
  const lastUpdated = SITE_LAST_UPDATED;

  return (
    <Layout>
      <Helmet>
        <title>Terms of Service | GetPawsy</title>
        <meta name="description" content="GetPawsy terms of service. Read our terms and conditions for using the GetPawsy online store." />
        <link rel="canonical" href="https://getpawsy.pet/terms" />
      </Helmet>
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

              {/* Important Liability Notice */}
              <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-2xl p-6 mb-8">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-lg font-bold text-red-800 dark:text-red-300 m-0 mb-2">
                      IMPORTANT NOTICE - PLEASE READ CAREFULLY
                    </h3>
                    <p className="text-red-700 dark:text-red-300 m-0 text-sm">
                      By purchasing products from GetPawsy, you acknowledge and agree that GetPawsy acts solely 
                      as a retailer and is not the manufacturer of the products sold. You expressly waive any 
                      and all claims against GetPawsy for product liability, injuries, damages, or any other 
                      incidents arising from the use of products purchased through our website. Please read 
                      Sections 9, 10, and 11 carefully.
                    </p>
                  </div>
                </div>
              </div>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  1. Acceptance of Terms
                </h2>
                <p className="text-muted-foreground">
                  By accessing and using this website, you accept and agree to be bound by these Terms of Service 
                  and our Privacy Policy. If you do not agree to these terms, please do not use our website. 
                  We reserve the right to modify these terms at any time, and such modifications will be effective 
                  immediately upon posting. Your continued use of the website after any changes constitutes 
                  acceptance of those changes.
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
                  <li>Product dimensions and specifications are approximate</li>
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
                  We ship to customers within the United States. Please note:
                </p>
                <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                  <li>Shipping times are estimates and not guaranteed</li>
                  <li>Estimated delivery: {DELIVERY_TIME_STANDARD}</li>
                  <li>Free shipping on eligible orders over ${FREE_SHIPPING_THRESHOLD}</li>
                  <li>{US_FULFILLMENT_NOTE}</li>
                  <li>We are not responsible for delays caused by carriers</li>
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
                  <li>Returns must be initiated within {RETURN_WINDOW_DAYS} days of delivery</li>
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
                  property of GetPawsy or its content suppliers and is protected by international copyright 
                  laws. You may not reproduce, distribute, modify, or create derivative works from any 
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

              {/* Enhanced Product Liability Disclaimer */}
              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  9. Product Liability Disclaimer
                </h2>
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-4">
                  <p className="text-amber-800 dark:text-amber-200 m-0 font-semibold">
                    THIS SECTION CONTAINS IMPORTANT LIMITATIONS ON LIABILITY. PLEASE READ CAREFULLY.
                  </p>
                </div>
                <p className="text-muted-foreground mb-4">
                  GetPawsy operates as a retail platform and is NOT the manufacturer, designer, or producer 
                  of the products sold on this website. By making a purchase, you acknowledge and agree to 
                  the following:
                </p>
                <ul className="list-disc pl-6 text-muted-foreground space-y-3">
                  <li>
                    <strong>No Manufacturer Liability:</strong> GetPawsy is not liable for any defects, 
                    malfunctions, or issues arising from the manufacturing process of any product.
                  </li>
                  <li>
                    <strong>Use at Your Own Risk:</strong> All products are purchased and used at your own 
                    risk. You assume full responsibility for proper use and supervision of products, 
                    especially those used by or around pets.
                  </li>
                  <li>
                    <strong>Pet Supervision:</strong> You are solely responsible for supervising your pet 
                    during the use of any product. GetPawsy is not liable for any injuries, choking hazards, 
                    allergic reactions, or other incidents involving your pet.
                  </li>
                  <li>
                    <strong>No Guarantee of Safety:</strong> While we strive to offer quality products, 
                    we do not guarantee that any product is suitable for your specific pet. Different pets 
                    may react differently to products.
                  </li>
                  <li>
                    <strong>Third-Party Products:</strong> All products are sourced from third-party 
                    suppliers. Any claims regarding product quality, safety, or performance should be 
                    directed to the original manufacturer.
                  </li>
                  <li>
                    <strong>No Medical Claims:</strong> Product descriptions are for informational purposes 
                    only. GetPawsy does not make any medical or health claims about products. Consult your 
                    veterinarian before using any product.
                  </li>
                </ul>
              </section>

              {/* Enhanced Limitation of Liability */}
              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  10. Limitation of Liability
                </h2>
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-4">
                  <p className="text-amber-800 dark:text-amber-200 m-0 font-semibold">
                    IMPORTANT: BY USING THIS WEBSITE AND PURCHASING PRODUCTS, YOU WAIVE CERTAIN LEGAL RIGHTS.
                  </p>
                </div>
                <p className="text-muted-foreground mb-4">
                  TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW:
                </p>
                <ul className="list-disc pl-6 text-muted-foreground space-y-3">
                  <li>
                    GetPawsy, its owners, officers, directors, employees, agents, and affiliates shall NOT 
                    be liable for any direct, indirect, incidental, special, consequential, punitive, or 
                    exemplary damages arising from:
                    <ul className="list-circle pl-6 mt-2 space-y-1">
                      <li>The use or inability to use any product purchased from our website</li>
                      <li>Any injury, illness, or death of any person or pet</li>
                      <li>Property damage or destruction</li>
                      <li>Loss of profits, revenue, or data</li>
                      <li>Emotional distress or mental anguish</li>
                      <li>Any other damages of any kind</li>
                    </ul>
                  </li>
                  <li>
                    Our total liability for any claim arising from a product shall not exceed the purchase 
                    price you paid for that specific product.
                  </li>
                  <li>
                    You expressly waive and release GetPawsy from any and all claims, demands, causes of 
                    action, damages, losses, costs, and expenses arising from product use.
                  </li>
                  <li>
                    This limitation applies regardless of the theory of liability (contract, tort, strict 
                    liability, negligence, or otherwise) and even if GetPawsy has been advised of the 
                    possibility of such damages.
                  </li>
                </ul>
              </section>

              {/* Assumption of Risk */}
              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  11. Assumption of Risk and Waiver
                </h2>
                <p className="text-muted-foreground mb-4">
                  By purchasing and using products from GetPawsy, you expressly acknowledge and agree that:
                </p>
                <ul className="list-disc pl-6 text-muted-foreground space-y-3">
                  <li>
                    <strong>Voluntary Assumption:</strong> You voluntarily assume all risks associated with 
                    the purchase, possession, and use of products, including but not limited to risks of 
                    injury, illness, property damage, or death to yourself, your family members, your pets, 
                    or third parties.
                  </li>
                  <li>
                    <strong>Waiver of Claims:</strong> You hereby waive, release, and forever discharge 
                    GetPawsy and its owners, officers, employees, agents, and affiliates from any and all 
                    claims, demands, rights, and causes of action that you may have or acquire against 
                    GetPawsy arising from any incident related to product use.
                  </li>
                  <li>
                    <strong>Agreement to Indemnify:</strong> You agree to indemnify and hold harmless 
                    GetPawsy from any claims, lawsuits, damages, costs, and expenses (including attorney 
                    fees) arising from your use of products or any breach of these terms.
                  </li>
                  <li>
                    <strong>No Warranty of Fitness:</strong> You acknowledge that GetPawsy has not made and 
                    does not make any representations about the fitness of products for any particular 
                    purpose, pet type, or use case.
                  </li>
                  <li>
                    <strong>Binding Agreement:</strong> This waiver and release is binding upon you, your 
                    heirs, executors, administrators, and assigns.
                  </li>
                </ul>
              </section>

              {/* Disclaimer of Warranties */}
              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  12. Disclaimer of Warranties
                </h2>
                <p className="text-muted-foreground mb-4">
                  ALL PRODUCTS AND SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES 
                  OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO:
                </p>
                <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                  <li>Implied warranties of merchantability</li>
                  <li>Fitness for a particular purpose</li>
                  <li>Non-infringement</li>
                  <li>Accuracy, reliability, or completeness of product information</li>
                  <li>Safety or suitability for any pet or use</li>
                  <li>That products will meet your expectations</li>
                  <li>That products are free from defects</li>
                </ul>
                <p className="text-muted-foreground mt-4">
                  GetPawsy does not warrant that the website will be uninterrupted, error-free, secure, 
                  or free of viruses or other harmful components.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  13. Indemnification
                </h2>
                <p className="text-muted-foreground">
                  You agree to indemnify, defend, and hold harmless GetPawsy and its owners, officers, 
                  directors, employees, agents, affiliates, successors, and assigns from and against any 
                  and all claims, liabilities, damages, losses, costs, and expenses (including reasonable 
                  attorney fees) arising out of or relating to: (a) your use of our website or products; 
                  (b) your violation of these Terms of Service; (c) your violation of any rights of another 
                  party; (d) any injury or damage to persons or property caused by products purchased from 
                  our website; or (e) any claim that a product caused injury, illness, or death.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  14. Governing Law and Dispute Resolution
                </h2>
                <p className="text-muted-foreground mb-4">
                  These Terms of Service shall be governed by and construed in accordance with the laws of 
                  the Netherlands, without regard to conflict of law principles.
                </p>
                <p className="text-muted-foreground mb-4">
                  <strong>Dispute Resolution:</strong> Any dispute, controversy, or claim arising out of 
                  or relating to these Terms of Service or any product purchased through our website shall 
                  first be attempted to be resolved through good faith negotiations. If negotiations fail, 
                  disputes shall be submitted to the competent court in the Netherlands.
                </p>
                <p className="text-muted-foreground">
                  For EU consumers: You may also be entitled to use the EU Online Dispute Resolution platform 
                  at <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" 
                  className="text-primary hover:underline">https://ec.europa.eu/consumers/odr</a>.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  15. Severability
                </h2>
                <p className="text-muted-foreground">
                  If any provision of these Terms of Service is found to be unenforceable or invalid by a 
                  court of competent jurisdiction, that provision shall be limited or eliminated to the 
                  minimum extent necessary, and the remaining provisions shall continue in full force and 
                  effect. Our failure to enforce any right or provision of these terms shall not constitute 
                  a waiver of such right or provision.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  16. Entire Agreement
                </h2>
                <p className="text-muted-foreground">
                  These Terms of Service, together with our Privacy Policy, Return Policy, and any other 
                  legal notices published by us on the website, constitute the entire agreement between 
                  you and GetPawsy concerning your use of the website and purchase of products. These terms 
                  supersede any prior agreements or understandings.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  17. Contact Us
                </h2>
                <p className="text-muted-foreground mb-4">
                  If you have questions about these Terms of Service, please contact us:
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

export default TermsOfService;

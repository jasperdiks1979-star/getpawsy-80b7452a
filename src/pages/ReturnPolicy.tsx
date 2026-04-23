import { Layout } from '@/components/layout/Layout';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { RotateCcw, Mail, Clock, Package, AlertCircle, CheckCircle, XCircle, HelpCircle, Building2, Camera, ShieldCheck } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SUPPORT_EMAIL, RETURN_WINDOW_DAYS, SITE_LAST_UPDATED } from '@/lib/shipping-constants';
import { PageChangelog } from '@/components/seo/PageChangelog';

const ReturnPolicy = () => {
  const lastUpdated = SITE_LAST_UPDATED;

  const eligibleReturns = [
    'Products that are unused, in their original condition, and in original packaging',
    'Products damaged during shipping',
    'Incorrect products received (wrong item or wrong size)',
    'Products with missing parts that affect functionality',
    'Defective or malfunctioning products',
    'Products significantly different from their description on the website',
  ];

  const nonEligibleReturns = [
    'Products that have been used, worn, washed, or altered',
    'Products returned without original packaging',
    'Products returned after the 30-day return window',
    'Personalized or customized items',
    'Products damaged due to misuse, neglect, or pet damage after delivery',
    'Hygiene-sensitive products (e.g., grooming tools, feeding accessories) that have been opened and used',
  ];

  const faqItems = [
    {
      question: 'How long do I have to request a return?',
      answer: `You have ${RETURN_WINDOW_DAYS} days from the date of delivery to request a return. Please contact our support team as soon as you notice any issue with your order.`,
    },
    {
      question: 'How long does it take to process a refund?',
      answer: 'Once your return is approved, refunds are processed within 5 business days. The refund will be credited to your original payment method. Your bank or payment provider may take additional time to reflect the credit in your account.',
    },
    {
      question: 'Who pays for return shipping?',
      answer: 'If the return is due to a defective, damaged, or incorrect product, GetPawsy covers the return shipping cost. For other returns (e.g., change of mind on an eligible product), the customer is responsible for return shipping fees.',
    },
    {
      question: 'Can I exchange a product?',
      answer: 'We do not offer direct exchanges at this time. To get a different product or size, please initiate a return for the original item and place a new order for the item you want.',
    },
    {
      question: 'What if my package never arrived?',
      answer: 'If your order has not arrived within 14 business days of the estimated delivery date, please contact us. We will investigate with the carrier and provide either a full refund or a replacement.',
    },
    {
      question: 'Can I cancel my order before it ships?',
      answer: 'Yes. Orders that have not yet been processed or dispatched can be cancelled for a full refund. Once an order has shipped, it cannot be cancelled—but you can return it once it arrives.',
    },
  ];

  return (
    <Layout>
      <Helmet>
        <title>Return & Refund Policy – GetPawsy</title>
        <meta name="description" content="GetPawsy 30-day return policy. Easy returns by mail with refunds to your original payment method. Learn more about our hassle-free process." /></Helmet>
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
                <RotateCcw className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
                Return & Refund Policy
              </h1>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                We want you and your pet to be happy with every purchase. If something is not right, we will make it right.
              </p>
              <p className="text-sm text-muted-foreground mt-2">Last updated: {lastUpdated}</p>
            </div>

            <PageChangelog pageKey="returns" />

            {/* Quick Info Cards */}
            <div className="grid sm:grid-cols-3 gap-4 mb-12">
              <div className="bg-muted/30 rounded-2xl p-6 text-center">
                <Clock className="w-8 h-8 text-primary mx-auto mb-3" />
                <h3 className="font-semibold text-foreground mb-1">{RETURN_WINDOW_DAYS}-Day Return Window</h3>
                <p className="text-sm text-muted-foreground">From the date of delivery</p>
              </div>
              <div className="bg-muted/30 rounded-2xl p-6 text-center">
                <Package className="w-8 h-8 text-primary mx-auto mb-3" />
                <h3 className="font-semibold text-foreground mb-1">Simple Process</h3>
                <p className="text-sm text-muted-foreground">Email us to start your return</p>
              </div>
              <div className="bg-muted/30 rounded-2xl p-6 text-center">
                <ShieldCheck className="w-8 h-8 text-primary mx-auto mb-3" />
                <h3 className="font-semibold text-foreground mb-1">5-Day Refunds</h3>
                <p className="text-sm text-muted-foreground">After return is approved</p>
              </div>
            </div>

            {/* Important Notice */}
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 mb-12">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-foreground">
                  <strong>Our commitment:</strong> If there is any issue with your order—damaged, defective, or incorrect—please contact us within {RETURN_WINDOW_DAYS} days of delivery at <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline font-medium">{SUPPORT_EMAIL}</a>. We will work with you to find a fair resolution as quickly as possible.
                </p>
              </div>
            </div>

            {/* Return Window & Eligibility */}
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-display font-bold text-foreground">
                  Return Window & Eligibility
                </h2>
              </div>
              <div className="bg-card rounded-2xl shadow-card p-6">
                <p className="text-foreground mb-4">
                  You may request a return within <strong>{RETURN_WINDOW_DAYS} days of delivery</strong>. To be eligible for a return, items must meet the following conditions:
                </p>
                <ul className="space-y-3 mb-6">
                  {eligibleReturns.map((item, index) => (
                    <li key={index} className="flex items-start gap-3 text-foreground">
                      <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {/* Not Eligible */}
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <XCircle className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-display font-bold text-foreground">
                  Not Eligible for Return
                </h2>
              </div>
              <div className="bg-card rounded-2xl shadow-card p-6">
                <p className="text-muted-foreground mb-4">
                  Unfortunately, we cannot accept returns for:
                </p>
                <ul className="space-y-3">
                  {nonEligibleReturns.map((item, index) => (
                    <li key={index} className="flex items-start gap-3 text-muted-foreground">
                      <XCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {/* How to Initiate a Return */}
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-display font-bold text-foreground">
                  How to Initiate a Return
                </h2>
              </div>
              <div className="bg-card rounded-2xl shadow-card p-6">
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">1</div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">Email Our Support Team</h3>
                      <p className="text-muted-foreground">
                        Send an email to <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline font-medium">{SUPPORT_EMAIL}</a> with your order number and a clear description of the issue.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">2</div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">Provide Photos (If Applicable)</h3>
                      <p className="text-muted-foreground">
                        For damaged or incorrect items, please include clear photos showing the issue. This helps us resolve your case faster.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">3</div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">Receive a Resolution</h3>
                      <p className="text-muted-foreground">
                        Our team will review your request within 1–2 business days and respond with next steps. Depending on the situation, we may issue a refund, send a replacement, or provide a return shipping label.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Refund Details */}
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-display font-bold text-foreground">
                  Refund Timeline & Details
                </h2>
              </div>
              <div className="bg-card rounded-2xl shadow-card p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <p className="text-foreground">
                    Refunds are processed within <strong>5 business days</strong> after your return is approved.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <p className="text-foreground">
                    Refunds are credited to your <strong>original payment method</strong>. Your bank may take additional time to process the credit.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <p className="text-foreground">
                    Original shipping costs are <strong>non-refundable</strong>, unless the return is due to our error (wrong or defective item).
                  </p>
                </div>
              </div>
            </section>

            {/* Damaged or Incorrect Items */}
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Camera className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-display font-bold text-foreground">
                  Damaged or Incorrect Items
                </h2>
              </div>
              <div className="bg-card rounded-2xl shadow-card p-6">
                <p className="text-foreground mb-4">
                  If your order arrives damaged or you received the wrong item, please report it within <strong>48 hours of delivery</strong> for the fastest resolution.
                </p>
                <div className="space-y-3 mb-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <p className="text-muted-foreground">
                      Email <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline font-medium">{SUPPORT_EMAIL}</a> with your order number
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <p className="text-muted-foreground">
                      Include clear photos of the damage or the incorrect item received
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <p className="text-muted-foreground">
                      We will respond within 1–2 business days with a full refund or replacement at no extra cost
                    </p>
                  </div>
                </div>
                <div className="p-4 bg-muted/50 rounded-xl">
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-foreground">Note:</strong> While we strongly encourage reporting issues within 48 hours, you can still request a return for damaged items within the full {RETURN_WINDOW_DAYS}-day return window.
                  </p>
                </div>
              </div>
            </section>

            {/* Exchanges */}
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <RotateCcw className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-display font-bold text-foreground">
                  Exchanges
                </h2>
              </div>
              <div className="bg-card rounded-2xl shadow-card p-6">
                <p className="text-foreground">
                  We do not offer direct exchanges at this time. If you need a different product or size, simply initiate a return for the original item and place a new order. This ensures the fastest processing time and that you receive exactly what you need.
                </p>
              </div>
            </section>

            {/* Business Transparency */}
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-display font-bold text-foreground">
                  Who Is Responsible
                </h2>
              </div>
              <div className="bg-card rounded-2xl shadow-card p-6">
                <p className="text-foreground mb-3">
                  <strong>GetPawsy LLC</strong> is a US-based online pet supply retailer headquartered in New York, NY.
                </p>
                <p className="text-muted-foreground">
                  GetPawsy LLC is responsible for processing all returns, issuing refunds, and handling customer service inquiries. When you contact us about a return, you are dealing directly with our team.
                </p>
              </div>
            </section>

            {/* FAQ Section */}
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <HelpCircle className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-display font-bold text-foreground">
                  Frequently Asked Questions
                </h2>
              </div>
              <div className="bg-card rounded-2xl shadow-card overflow-hidden">
                <Accordion type="single" collapsible className="w-full">
                  {faqItems.map((item, index) => (
                    <AccordionItem key={index} value={`item-${index}`} className="px-6">
                      <AccordionTrigger className="text-left font-semibold">
                        {item.question}
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground">
                        {item.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            </section>

            {/* CTA */}
            <div className="text-center">
              <p className="text-muted-foreground mb-4">
                Have questions about returns? We are here to help.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild>
                  <Link to="/contact">Contact Us</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/shipping">Shipping Policy</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/faq">View FAQ</Link>
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </Layout>
  );
};

export default ReturnPolicy;
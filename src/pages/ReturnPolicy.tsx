import { Layout } from '@/components/layout/Layout';
import { motion } from 'framer-motion';
import { RotateCcw, Mail, Clock, Package, AlertCircle, CheckCircle, XCircle, HelpCircle } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const ReturnPolicy = () => {
  const lastUpdated = 'January 16, 2026';

  const eligibleReturns = [
    'Products damaged during shipping',
    'Incorrect products received',
    'Products missing parts that affect functionality',
    'Defective or malfunctioning products',
    'Significantly different from product description',
  ];

  const nonEligibleReturns = [
    'Products damaged due to misuse or negligence',
    'Products without original packaging',
    'Products returned after 30 days of delivery',
    'Products with only minor cosmetic imperfections (slight scratches, threads)',
    'Customized or personalized products',
    'Products affected by pet damage after delivery',
    'Change of mind without product defect',
  ];

  const faqItems = [
    {
      question: 'How long do I have to request a return?',
      answer: 'You have 30 days from the delivery date to request a return for eligible products. Please contact our customer service team as soon as you notice any issues with your order.',
    },
    {
      question: 'How long does it take to process a refund?',
      answer: 'Once your return is approved, refunds are typically processed within 5-7 business days. The refund will be credited to your original payment method. Please note that your bank may take additional time to reflect the refund in your account.',
    },
    {
      question: 'Do I need to return the product?',
      answer: 'For most cases, we do not require products to be returned due to the high cost of international shipping. However, in certain cases, our team may request photos or videos as proof of the issue. Occasionally, for high-value items, we may arrange a return pickup.',
    },
    {
      question: 'What if my package never arrived?',
      answer: 'For packages shipped to the USA that have not arrived within 45 days of dispatch, please contact us. We will investigate with the carrier and provide either a refund or replacement. Please note that tracking must show the package was not delivered.',
    },
    {
      question: 'Can I cancel my order?',
      answer: 'Orders can be cancelled for a full refund before they are processed and shipped. Once an order has been dispatched, it cannot be cancelled. Please contact us as soon as possible if you wish to cancel.',
    },
    {
      question: 'What if I received the wrong item?',
      answer: 'If you received an incorrect product, please contact us immediately with photos of what you received. We will arrange for the correct item to be sent to you at no additional cost.',
    },
  ];

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
                <RotateCcw className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
                Return & Refund Policy
              </h1>
              <p className="text-muted-foreground">
                Last Updated: {lastUpdated}
              </p>
            </div>

            {/* Quick Info Cards */}
            <div className="grid md:grid-cols-3 gap-4 mb-12">
              <div className="bg-muted/30 rounded-2xl p-6 text-center">
                <Clock className="w-8 h-8 text-primary mx-auto mb-3" />
                <h3 className="font-semibold text-foreground mb-1">30-Day Window</h3>
                <p className="text-sm text-muted-foreground">Request returns within 30 days of delivery</p>
              </div>
              <div className="bg-muted/30 rounded-2xl p-6 text-center">
                <Package className="w-8 h-8 text-primary mx-auto mb-3" />
                <h3 className="font-semibold text-foreground mb-1">Easy Process</h3>
                <p className="text-sm text-muted-foreground">Simple 3-step return request</p>
              </div>
              <div className="bg-muted/30 rounded-2xl p-6 text-center">
                <RotateCcw className="w-8 h-8 text-primary mx-auto mb-3" />
                <h3 className="font-semibold text-foreground mb-1">Full Refund</h3>
                <p className="text-sm text-muted-foreground">For eligible damaged products</p>
              </div>
            </div>

            {/* Content */}
            <div className="prose prose-lg max-w-none">
              <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 mb-8">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-foreground m-0">
                      <strong>Important:</strong> We want you and your pet to be completely satisfied with your 
                      purchase. If there's any issue with your order, please contact us within 30 days of 
                      delivery, and we'll work to resolve it quickly.
                    </p>
                  </div>
                </div>
              </div>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  Our Commitment to You
                </h2>
                <p className="text-muted-foreground">
                  At GetPawsy, customer satisfaction is our top priority. We carefully inspect all products 
                  before shipping to ensure quality. However, we understand that issues can sometimes occur 
                  during transit or that products may not meet your expectations. Our return policy is designed 
                  to make the process as smooth as possible.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4 flex items-center gap-2">
                  <CheckCircle className="w-6 h-6 text-green-500" />
                  Eligible for Return/Refund
                </h2>
                <p className="text-muted-foreground mb-4">
                  We offer refunds, replacements, or partial refunds for the following situations:
                </p>
                <ul className="space-y-3">
                  {eligibleReturns.map((item, index) => (
                    <li key={index} className="flex items-start gap-3 text-muted-foreground">
                      <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4 flex items-center gap-2">
                  <XCircle className="w-6 h-6 text-red-500" />
                  Not Eligible for Return/Refund
                </h2>
                <p className="text-muted-foreground mb-4">
                  Unfortunately, we cannot offer refunds or replacements for:
                </p>
                <ul className="space-y-3">
                  {nonEligibleReturns.map((item, index) => (
                    <li key={index} className="flex items-start gap-3 text-muted-foreground">
                      <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  How to Request a Return
                </h2>
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">
                      1
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">Contact Our Support Team</h3>
                      <p className="text-muted-foreground">
                        Email us at <a href="mailto:support@getpawsy.pet" className="text-primary hover:underline">
                        support@getpawsy.pet</a> with your order number and a description of the issue.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">
                      2
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">Provide Evidence</h3>
                      <p className="text-muted-foreground">
                        Include clear photos or videos showing the issue. For damaged products, show the 
                        damage clearly. For incorrect items, show what you received.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">
                      3
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">Receive Resolution</h3>
                      <p className="text-muted-foreground">
                        Our team will review your request within 1-2 business days and provide a resolution, 
                        which may include a refund, replacement, or partial refund.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  Shipping Delays
                </h2>
                <p className="text-muted-foreground mb-4">
                  We understand that waiting for your order can be frustrating. Our shipping delay policy is as follows:
                </p>
                <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                  <li><strong>USA Orders:</strong> If your order has not arrived within 45 days of dispatch, 
                  you may request a refund or replacement.</li>
                  <li><strong>Tracking Issues:</strong> If tracking shows no updates for an extended period, 
                  please contact us so we can investigate.</li>
                  <li><strong>Customs Delays:</strong> We are not responsible for delays caused by customs 
                  clearance, but we will assist where possible.</li>
                </ul>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  Damaged Products
                </h2>
                <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                  <li><strong>Severely Damaged:</strong> Full refund or replacement</li>
                  <li><strong>Partially Damaged:</strong> Partial refund or replacement (depending on extent of damage)</li>
                  <li><strong>Packaging Damage Only:</strong> Not eligible for refund if product is undamaged</li>
                </ul>
                <p className="text-muted-foreground mt-4">
                  Please report any damage within 30 days of delivery with photographic evidence.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  Order Cancellation
                </h2>
                <p className="text-muted-foreground mb-4">
                  You may cancel your order for a full refund under the following conditions:
                </p>
                <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                  <li>Order has not yet been processed/shipped</li>
                  <li>Product is not a customized/personalized item</li>
                </ul>
                <p className="text-muted-foreground mt-4">
                  Once an order has been dispatched, it cannot be cancelled. Please contact us as soon as 
                  possible if you wish to cancel.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  Force Majeure
                </h2>
                <p className="text-muted-foreground">
                  We are not responsible for delays or damage caused by circumstances beyond our control, 
                  including but not limited to: natural disasters, epidemics, war, strikes, customs inspections, 
                  or severe weather conditions. We will notify customers of any significant disruptions 
                  affecting their orders.
                </p>
              </section>

              {/* FAQ Section */}
              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-6 flex items-center gap-2">
                  <HelpCircle className="w-6 h-6 text-primary" />
                  Frequently Asked Questions
                </h2>
                <Accordion type="single" collapsible className="w-full">
                  {faqItems.map((item, index) => (
                    <AccordionItem key={index} value={`item-${index}`}>
                      <AccordionTrigger className="text-left font-semibold">
                        {item.question}
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground">
                        {item.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  Contact Us
                </h2>
                <p className="text-muted-foreground mb-4">
                  Have questions about our return policy? We're here to help!
                </p>
                <div className="bg-muted/30 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <Mail className="w-5 h-5 text-primary" />
                    <a href="mailto:support@getpawsy.pet" className="text-primary hover:underline">
                      support@getpawsy.pet
                    </a>
                  </div>
                  <p className="text-muted-foreground m-0">
                    Response time: Within 24-48 hours<br />
                    Available: Monday - Friday, 9 AM - 6 PM EST
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

export default ReturnPolicy;

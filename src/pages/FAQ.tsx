import { Layout } from '@/components/layout/Layout';
import { motion } from 'framer-motion';
import { HelpCircle, Truck, RotateCcw, PawPrint, CreditCard, MessageCircle } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  FREE_SHIPPING_THRESHOLD,
  FLAT_SHIPPING_RATE,
  DELIVERY_TIME_STANDARD,
  RETURN_WINDOW_DAYS,
  SUPPORT_EMAIL,
  FLAT_RATE_MESSAGE,
} from '@/lib/shipping-constants';

const FAQ = () => {
  const faqCategories = [
    {
      title: 'Orders & Shipping',
      icon: Truck,
      questions: [
        {
          question: 'How long does shipping take?',
          answer: `Orders typically arrive within ${DELIVERY_TIME_STANDARD}. Delivery times are shown on each product page.`,
        },
        {
          question: 'Do you offer free shipping?',
          answer: `Yes! We offer free US shipping on orders over $${FREE_SHIPPING_THRESHOLD}. Orders under $${FREE_SHIPPING_THRESHOLD} ship for a flat rate of $${FLAT_SHIPPING_RATE.toFixed(2)}.`,
        },
        {
          question: 'Where do you ship from?',
          answer: 'We ship to customers across the United States from multiple international warehouses to ensure US delivery.',
        },
        {
          question: 'Will I receive tracking information?',
          answer: 'Yes, once your order ships you will receive a tracking email so you can follow your package every step of the way.',
        },
      ],
    },
    {
      title: 'Returns & Refunds',
      icon: RotateCcw,
      questions: [
        {
          question: 'What is your return policy?',
          answer: `We offer a ${RETURN_WINDOW_DAYS}-day easy return policy. If you are not completely satisfied, we will make it right.`,
        },
        {
          question: 'How do I start a return?',
          answer: `Simply email ${SUPPORT_EMAIL} and our team will help you through the process. Returns are easy and stress-free.`,
        },
        {
          question: 'When will I receive my refund?',
          answer: 'Once we receive and inspect your return, refunds are processed back to your original payment method within 5 business days.',
        },
      ],
    },
    {
      title: 'Products & Safety',
      icon: PawPrint,
      questions: [
        {
          question: 'Are your products safe for pets?',
          answer: 'Yes. All products are carefully selected with comfort, safety, and everyday use in mind. We only offer products we would trust with our own pets.',
        },
        {
          question: 'Do your products fit all pets?',
          answer: 'Many products come in multiple sizes. Please check the size guide on each product page to find the perfect fit for your pet.',
        },
        {
          question: 'What if a product does not fit my pet?',
          answer: `No worries! Our ${RETURN_WINDOW_DAYS}-day return policy has you covered. Contact us and we will help you find the right size or process a return.`,
        },
      ],
    },
    {
      title: 'Payments & Security',
      icon: CreditCard,
      questions: [
        {
          question: 'Is checkout secure?',
          answer: 'Yes. All payments are processed securely using industry-standard encryption powered by Stripe. Your payment information is always protected.',
        },
        {
          question: 'What payment methods do you accept?',
          answer: 'We accept major credit cards (Visa, Mastercard, American Express) and secure online payment methods including PayPal.',
        },
      ],
    },
    {
      title: 'Support',
      icon: MessageCircle,
      questions: [
        {
          question: 'How can I contact customer support?',
          answer: `Email us at ${SUPPORT_EMAIL}. We respond within 24 hours and are always happy to help. Email is our primary contact method.`,
        },
        {
          question: 'Can I change or cancel my order?',
          answer: `If you need to change or cancel your order, email us at ${SUPPORT_EMAIL} as soon as possible. We will do our best to accommodate your request before it ships.`,
        },
      ],
    },
  ];

   return (
    <Layout>
      <Helmet>
        <title>FAQ – Shipping, Returns & Orders | GetPawsy</title>
        <meta name="description" content="Answers to common questions about GetPawsy orders, shipping times, returns, and pet product quality. Free US shipping on orders over $35." />
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
                <HelpCircle className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
                Frequently Asked Questions
              </h1>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Quick answers to common questions. Can't find what you're looking for? We're just an email away.
              </p>
            </div>

            {/* FAQ Categories */}
            <div className="space-y-8">
              {faqCategories.map((category, categoryIndex) => (
                <motion.section
                  key={category.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: categoryIndex * 0.1 }}
                  className="bg-card rounded-2xl shadow-card p-6"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <category.icon className="w-5 h-5 text-primary" />
                    </div>
                    <h2 className="text-xl font-display font-bold text-foreground">
                      {category.title}
                    </h2>
                  </div>
                  <Accordion type="single" collapsible className="w-full">
                    {category.questions.map((faq, index) => (
                      <AccordionItem key={index} value={`${category.title}-${index}`}>
                        <AccordionTrigger className="text-left font-medium">
                          {faq.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-muted-foreground">
                          {faq.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </motion.section>
              ))}
            </div>

            {/* Still Need Help */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-12 bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10 rounded-2xl p-8 text-center"
            >
              <PawPrint className="w-12 h-12 text-primary mx-auto mb-4" />
              <h3 className="text-2xl font-display font-bold text-foreground mb-4">
                Still Have Questions?
              </h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                We're here to help! Our friendly support team responds within 24 business hours.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild size="lg">
                  <Link to="/contact">Contact Us</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <a href={`mailto:${SUPPORT_EMAIL}`}>Email Support</a>
                </Button>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </Layout>
  );
};

export default FAQ;

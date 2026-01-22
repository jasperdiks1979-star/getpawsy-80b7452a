import { Layout } from '@/components/layout/Layout';
import { motion } from 'framer-motion';
import { HelpCircle, Package, Truck, RotateCcw, CreditCard, ShieldCheck, PawPrint } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const FAQ = () => {
  const faqCategories = [
    {
      title: 'Orders & Payment',
      icon: CreditCard,
      questions: [
        {
          question: 'How do I place an order?',
          answer: 'Simply browse our products, add items to your cart, and proceed to checkout. You can pay securely using credit card, debit card, or PayPal through our Stripe payment system.',
        },
        {
          question: 'What payment methods do you accept?',
          answer: 'We accept all major credit cards (Visa, Mastercard, American Express), debit cards, and PayPal. All payments are processed securely through Stripe.',
        },
        {
          question: 'Is my payment information secure?',
          answer: 'Absolutely! We use Stripe for payment processing, which is PCI-DSS compliant. Your payment information is encrypted and never stored on our servers.',
        },
        {
          question: 'Can I modify or cancel my order?',
          answer: 'Orders can be modified or cancelled before they are shipped. Once an order has been dispatched, it cannot be cancelled. Please contact us as soon as possible if you need to make changes.',
        },
        {
          question: 'Will I receive an order confirmation?',
          answer: 'Yes! You will receive an email confirmation immediately after placing your order. This email will include your order number and a summary of your purchase.',
        },
      ],
    },
    {
      title: 'Shipping & Delivery',
      icon: Truck,
      questions: [
        {
          question: 'How long does shipping take?',
          answer: 'Standard shipping typically takes 7-21 business days depending on your location. Processing time is 1-3 business days before your order ships.',
        },
        {
          question: 'Do you offer free shipping?',
          answer: 'Yes! We offer FREE standard shipping on all orders worldwide. No minimum purchase required.',
        },
        {
          question: 'Do you ship internationally?',
          answer: 'Yes! We ship to most countries worldwide. Delivery times vary by location, typically 7-21 business days. International orders may be subject to customs fees and import duties.',
        },
        {
          question: 'How can I track my order?',
          answer: 'Once your order ships, you will receive an email with a tracking number. You can also track your order on our Track Order page using your order number and email address.',
        },
        {
          question: 'What carriers do you use?',
          answer: 'We work with DHL, UPS, FedEx, PostNL, and regional delivery partners. The carrier is selected based on your location and the items ordered.',
        },
        {
          question: 'What if my package is lost or delayed?',
          answer: 'If your package has not arrived within 45 days of dispatch, please contact us. We will investigate with the carrier and provide a resolution.',
        },
      ],
    },
    {
      title: 'Returns & Refunds',
      icon: RotateCcw,
      questions: [
        {
          question: 'What is your return policy?',
          answer: 'We accept returns within 30 days of delivery for damaged, defective, or incorrect products. Please visit our Return Policy page for complete details.',
        },
        {
          question: 'How do I request a return?',
          answer: 'Contact our customer support at support@getpawsy.pet with your order number, photos of the issue, and a description of the problem. We will process your request within 1-2 business days.',
        },
        {
          question: 'Do I need to return the product?',
          answer: 'In most cases, we do not require products to be returned due to high shipping costs. However, we may request photos or videos as proof of the issue.',
        },
        {
          question: 'How long does it take to receive a refund?',
          answer: 'Once your return is approved, refunds are typically processed within 5-7 business days. The refund will be credited to your original payment method.',
        },
        {
          question: 'Can I exchange a product?',
          answer: 'For size or color issues with functional products, we can arrange an exchange. Please contact us with details of what you would like to exchange.',
        },
      ],
    },
    {
      title: 'Products',
      icon: Package,
      questions: [
        {
          question: 'Are your products safe for my pet?',
          answer: 'We carefully curate products from trusted suppliers. However, every pet is different. Always supervise your pet with new products and consult your veterinarian if you have concerns.',
        },
        {
          question: 'How do I choose the right size?',
          answer: 'Each product page includes size guides and measurements. If you are unsure, please contact us before ordering and we will help you choose the right size for your pet.',
        },
        {
          question: 'Are product colors accurate?',
          answer: 'We strive to display accurate colors, but slight variations may occur due to monitor settings and lighting. Please refer to product descriptions for detailed color information.',
        },
        {
          question: 'Do you test products on animals?',
          answer: 'We never support animal testing. Our products are designed to enhance the lives of pets, and we only partner with ethical suppliers.',
        },
      ],
    },
    {
      title: 'Account & Privacy',
      icon: ShieldCheck,
      questions: [
        {
          question: 'Do I need an account to order?',
          answer: 'No, you can checkout as a guest. However, creating an account allows you to track orders, save favorites, and enjoy a faster checkout experience.',
        },
        {
          question: 'How do I reset my password?',
          answer: 'Click on "Sign In" and then "Forgot Password". Enter your email address and we will send you a link to reset your password.',
        },
        {
          question: 'How do you protect my data?',
          answer: 'We take privacy seriously. Your data is encrypted and stored securely. We never sell your information to third parties. Read our Privacy Policy for complete details.',
        },
        {
          question: 'How can I unsubscribe from emails?',
          answer: 'You can unsubscribe by clicking the "Unsubscribe" link at the bottom of any marketing email, or by contacting our support team.',
        },
      ],
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
                <HelpCircle className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
                Frequently Asked Questions
              </h1>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Find answers to common questions about orders, shipping, returns, and more.
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
                Could not find what you are looking for? Our friendly support team is here to help!
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild size="lg">
                  <Link to="/contact">Contact Us</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <a href="mailto:support@getpawsy.pet">Email Support</a>
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

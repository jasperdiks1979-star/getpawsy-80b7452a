import { Layout } from '@/components/layout/Layout';
import { motion } from 'framer-motion';
import { Truck, Package, RotateCcw, Shield, Mail, Clock, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  FREE_SHIPPING_THRESHOLD,
  FLAT_SHIPPING_RATE,
  DELIVERY_TIME_STANDARD,
  PROCESSING_TIME,
  RETURN_WINDOW_DAYS,
  SUPPORT_EMAIL,
} from '@/lib/shipping-constants';

const Shipping = () => {
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
              <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
                Shipping & Returns
              </h1>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Everything you need to know about getting your order and our hassle-free return policy.
              </p>
            </div>

            {/* Shipping Information */}
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Truck className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-display font-bold text-foreground">
                  Shipping Information
                </h2>
              </div>
              
              <div className="bg-card rounded-2xl shadow-card p-6 space-y-4">
                <div className="grid gap-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <p className="text-foreground">
                      We ship to customers within the United States.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <p className="text-foreground">
                      <strong>Free US shipping</strong> on orders over ${FREE_SHIPPING_THRESHOLD}.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <p className="text-foreground">
                      Orders under ${FREE_SHIPPING_THRESHOLD} ship for a <strong>flat rate of ${FLAT_SHIPPING_RATE.toFixed(2)}</strong>.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <p className="text-foreground">
                      Orders are typically delivered within <strong>{DELIVERY_TIME_STANDARD}</strong>.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <p className="text-foreground">
                      Orders ship from US fulfillment centers when available.
                    </p>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-muted/50 rounded-xl">
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-foreground">Please note:</strong> If a product is temporarily not available at a US fulfillment center, delivery may take slightly longer. Delivery estimates are always shown on each product page so you know exactly what to expect.
                  </p>
                </div>
              </div>
            </section>

            {/* Order Processing */}
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Package className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-display font-bold text-foreground">
                  Order Processing
                </h2>
              </div>
              
              <div className="bg-card rounded-2xl shadow-card p-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                    <p className="text-foreground">
                      Orders are processed within <strong>{PROCESSING_TIME}</strong>.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <Mail className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                    <p className="text-foreground">
                      You will receive a confirmation email with tracking information once your order ships.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Returns & Refunds */}
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <RotateCcw className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-display font-bold text-foreground">
                  Returns & Refunds
                </h2>
              </div>
              
              <div className="bg-card rounded-2xl shadow-card p-6">
                <div className="space-y-4">
                  <p className="text-foreground">
                    We offer a <strong>{RETURN_WINDOW_DAYS}-day hassle-free return policy</strong>. If you're not completely satisfied with your purchase, we're here to help.
                  </p>
                  
                  <div className="border-t border-border pt-4 mt-4">
                    <h3 className="font-semibold text-foreground mb-3">How returns work:</h3>
                    <ul className="space-y-3 text-foreground">
                      <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary flex-shrink-0">1</span>
                        <span>Items must be unused and in their original packaging.</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary flex-shrink-0">2</span>
                        <span>Contact us at <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline font-medium">{SUPPORT_EMAIL}</a> to start your return.</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary flex-shrink-0">3</span>
                        <span>Once we receive and inspect your return, refunds are processed back to your original payment method.</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            {/* Our Promise */}
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-display font-bold text-foreground">
                  Our Promise
                </h2>
              </div>
              
              <div className="bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10 rounded-2xl p-6">
                <div className="grid sm:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full bg-background shadow-sm flex items-center justify-center mx-auto mb-3">
                      <Shield className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-foreground mb-1">Secure Checkout</h3>
                    <p className="text-sm text-muted-foreground">Your payment information is always protected.</p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full bg-background shadow-sm flex items-center justify-center mx-auto mb-3">
                      <CheckCircle className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-foreground mb-1">Transparent Policies</h3>
                    <p className="text-sm text-muted-foreground">No hidden fees or surprise charges.</p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full bg-background shadow-sm flex items-center justify-center mx-auto mb-3">
                      <Mail className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-foreground mb-1">Real Support</h3>
                    <p className="text-sm text-muted-foreground">We respond within 24 business hours.</p>
                  </div>
                </div>
              </div>
            </section>

            {/* CTA */}
            <div className="text-center">
              <p className="text-muted-foreground mb-4">
                Have more questions? We're happy to help.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild>
                  <Link to="/contact">Contact Us</Link>
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

export default Shipping;

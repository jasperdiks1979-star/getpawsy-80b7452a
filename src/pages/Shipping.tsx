import { Layout } from '@/components/layout/Layout';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Truck, Package, Shield, Mail, Clock, CheckCircle, AlertTriangle, MapPin, Building2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  FREE_SHIPPING_THRESHOLD,
  FLAT_SHIPPING_RATE,
  DELIVERY_TIME_STANDARD,
  PROCESSING_TIME,
  SUPPORT_EMAIL,
  SITE_LAST_UPDATED,
} from '@/lib/shipping-constants';

const Shipping = () => {
  const lastUpdated = SITE_LAST_UPDATED;

  return (
    <Layout>
      <Helmet>
        <title>Shipping Policy | GetPawsy</title>
        <meta name="description" content="GetPawsy shipping policy. Orders processed in 1–2 business days, delivered in 5–10 business days to the US. Free shipping on orders over $35." />
        <link rel="canonical" href="https://getpawsy.pet/shipping" />
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
                <Truck className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
                Shipping Policy
              </h1>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Clear, honest information about how we get your order to you.
              </p>
              <p className="text-sm text-muted-foreground mt-2">Last updated: {lastUpdated}</p>
            </div>

            {/* Quick Overview Cards */}
            <div className="grid sm:grid-cols-3 gap-4 mb-12">
              <div className="bg-muted/30 rounded-2xl p-6 text-center">
                <MapPin className="w-8 h-8 text-primary mx-auto mb-3" />
                <h3 className="font-semibold text-foreground mb-1">United States</h3>
                <p className="text-sm text-muted-foreground">We primarily serve US customers</p>
              </div>
              <div className="bg-muted/30 rounded-2xl p-6 text-center">
                <Clock className="w-8 h-8 text-primary mx-auto mb-3" />
                <h3 className="font-semibold text-foreground mb-1">{DELIVERY_TIME_STANDARD}</h3>
                <p className="text-sm text-muted-foreground">Estimated delivery after dispatch</p>
              </div>
              <div className="bg-muted/30 rounded-2xl p-6 text-center">
                <Truck className="w-8 h-8 text-primary mx-auto mb-3" />
                <h3 className="font-semibold text-foreground mb-1">Free Over ${FREE_SHIPPING_THRESHOLD}</h3>
                <p className="text-sm text-muted-foreground">No hidden fees or surcharges</p>
              </div>
            </div>

            {/* Shipping Locations */}
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <MapPin className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-display font-bold text-foreground">
                  Shipping Locations
                </h2>
              </div>
              <div className="bg-card rounded-2xl shadow-card p-6">
                <p className="text-foreground mb-4">
                  GetPawsy primarily serves customers across the United States. We ship to all 50 U.S. states, including Alaska, Hawaii, and U.S. territories. International shipping may be available for select destinations — please contact us for details.
                </p>
                <p className="text-muted-foreground">
                  All shipping rates, delivery estimates, and policies on this page apply to domestic U.S. orders.
                </p>
              </div>
            </section>

            {/* Processing Time */}
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-display font-bold text-foreground">
                  Processing Time
                </h2>
              </div>
              <div className="bg-card rounded-2xl shadow-card p-6">
                <p className="text-foreground mb-4">
                  Orders are processed within <strong>1–2 business days</strong> after payment is confirmed. Orders placed on weekends or U.S. holidays will be processed on the next business day.
                </p>
              </div>
            </section>

            {/* Shipping Time */}
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Truck className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-display font-bold text-foreground">
                  Shipping Time
                </h2>
              </div>
              <div className="bg-card rounded-2xl shadow-card p-6">
                <p className="text-foreground mb-4">
                  Delivery typically takes <strong>{DELIVERY_TIME_STANDARD}</strong> to the United States after your order has been dispatched. Delivery estimates are also shown on each product page so you know what to expect before you order.
                </p>
                <p className="text-muted-foreground mb-4">
                  <strong>Shipping:</strong> Orders are shipped via trusted carrier partners, selected based on package size, weight, and destination to ensure the best delivery experience.
                </p>
                <p className="text-muted-foreground mb-4">
                  <strong>Order Tracking:</strong> All orders include tracking numbers sent by email so you can follow your package from dispatch to delivery.
                </p>
                <div className="p-4 bg-muted/50 rounded-xl mt-4">
                  <p className="text-sm text-muted-foreground">
                    We work with carefully selected fulfillment partners to ensure fast and reliable delivery. Delivery times may vary depending on location and product availability.
                  </p>
                </div>
              </div>
            </section>

            {/* Fulfillment */}
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Package className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-display font-bold text-foreground">
                  Fulfillment
                </h2>
              </div>
              <div className="bg-card rounded-2xl shadow-card p-6">
                <p className="text-foreground mb-4">
                  Orders are fulfilled through trusted logistics partners and shipped directly to customers across the United States. Every order includes tracking information so you can follow your package from dispatch to delivery.
                </p>
                <p className="text-muted-foreground mb-4">
                  GetPawsy coordinates all fulfillment logistics and is fully responsible for ensuring your order reaches you safely and on time.
                </p>
                <div className="p-4 bg-muted/50 rounded-xl">
                  <p className="text-sm text-muted-foreground">
                    Estimated delivery time shown on the product page will reflect any variations based on destination or product availability.
                  </p>
                </div>
              </div>
            </section>

            {/* Shipping Costs */}
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Truck className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-display font-bold text-foreground">
                  Shipping Costs
                </h2>
              </div>
              <div className="bg-card rounded-2xl shadow-card p-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <p className="text-foreground">
                      <strong>Free shipping</strong> on all orders over ${FREE_SHIPPING_THRESHOLD}.
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
                      <strong>No hidden fees.</strong> The shipping cost shown at checkout is the total shipping cost—no surcharges, no surprises.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Summary Block - keyword-rich for crawlers */}
            <section className="mb-12">
              <div className="bg-muted/40 rounded-2xl p-6">
                <h2 className="text-lg font-display font-semibold text-foreground mb-3">Shipping Summary</h2>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• <strong className="text-foreground">Processing time:</strong> Orders are processed within {PROCESSING_TIME}.</li>
                  <li>• <strong className="text-foreground">Delivery time:</strong> Estimated delivery: {DELIVERY_TIME_STANDARD} to the United States.</li>
                  <li>• <strong className="text-foreground">Tracking:</strong> All orders receive a tracking number.</li>
                  <li>• <strong className="text-foreground">Carriers:</strong> Orders are delivered via trusted carrier partners.</li>
                  <li>• <strong className="text-foreground">Free shipping</strong> on orders over ${FREE_SHIPPING_THRESHOLD}.</li>
                </ul>
              </div>
            </section>

            {/* Order Tracking */}
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-display font-bold text-foreground">
                  Order Tracking
                </h2>
              </div>
              <div className="bg-card rounded-2xl shadow-card p-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <p className="text-foreground">
                      You will receive an <strong>order confirmation email</strong> immediately after placing your order.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <p className="text-foreground">
                      Once your order ships, you will receive a <strong>shipping confirmation email with a tracking number</strong>.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <p className="text-foreground">
                      You can also track your order anytime on our <Link to="/track" className="text-primary hover:underline font-medium">Track Order</Link> page.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Possible Delays */}
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-display font-bold text-foreground">
                  Possible Delays
                </h2>
              </div>
              <div className="bg-card rounded-2xl shadow-card p-6">
                <p className="text-muted-foreground mb-4">
                  While we work hard to deliver every order on time, certain circumstances outside our control may occasionally cause delays:
                </p>
                <ul className="space-y-3 text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground mt-2 flex-shrink-0" />
                    <span><strong className="text-foreground">Severe weather</strong> or natural events affecting carrier routes</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground mt-2 flex-shrink-0" />
                    <span><strong className="text-foreground">Peak seasons</strong> (such as holidays) when carrier volumes are higher than usual</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground mt-2 flex-shrink-0" />
                    <span><strong className="text-foreground">Carrier service disruptions</strong> beyond our control</span>
                  </li>
                </ul>
                <p className="text-muted-foreground mt-4">
                  If your order is significantly delayed, please reach out to us and we will investigate promptly.
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
                  <strong>GetPawsy</strong> is a registered business (KVK: 78156955).
                </p>
                <p className="text-muted-foreground mb-4">
                  GetPawsy is responsible for all shipping operations, fulfillment coordination, and customer service related to your order. If you have any questions or concerns about your shipment, our customer support team is here to help.
                </p>
                <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-xl">
                  <Mail className="w-5 h-5 text-primary flex-shrink-0" />
                  <div>
                    <p className="font-medium text-foreground">Customer Support</p>
                    <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">{SUPPORT_EMAIL}</a>
                    <p className="text-sm text-muted-foreground">We respond within 24 business hours.</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Our Promise */}
            <section className="mb-12">
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
                    <h3 className="font-semibold text-foreground mb-1">No Hidden Fees</h3>
                    <p className="text-sm text-muted-foreground">What you see at checkout is what you pay.</p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full bg-background shadow-sm flex items-center justify-center mx-auto mb-3">
                      <Mail className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-foreground mb-1">Real Support</h3>
                    <p className="text-sm text-muted-foreground">A real person responds within 24 hours.</p>
                  </div>
                </div>
              </div>
            </section>

            {/* CTA */}
            <div className="text-center">
              <p className="text-muted-foreground mb-4">
                Have more questions about shipping? We are happy to help.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild>
                  <Link to="/contact">Contact Us</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/returns">Return Policy</Link>
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
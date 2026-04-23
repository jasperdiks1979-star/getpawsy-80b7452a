import { Layout } from '@/components/layout/Layout';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Heart, Shield, Truck, PawPrint, CheckCircle, Mail, Clock, Package, Building2, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import logoIcon from '@/assets/logo-getpawsy.png';
import {
  FREE_SHIPPING_THRESHOLD,
  DELIVERY_TIME_STANDARD,
  RETURN_WINDOW_DAYS,
  SUPPORT_EMAIL,
} from '@/lib/shipping-constants';
import { PageChangelog } from '@/components/seo/PageChangelog';

const About = () => {
  return (
    <Layout>
      <Helmet>
        <title>About GetPawsy | Trusted Pet Supplies for US Pet Owners</title>
        <meta name="description" content="GetPawsy is a pet-first online store serving US customers. Free shipping on orders $35+, 30-day returns, and real customer support." /></Helmet>
      <div className="min-h-screen">
        {/* Hero Section */}
        <section className="relative py-20 lg:py-28 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-secondary/5 to-accent/5" />
          
          <div className="container px-4 md:px-6 relative">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="max-w-3xl mx-auto text-center"
            >
              <div className="flex items-center justify-center mb-8">
                <img 
                  src={logoIcon} 
                  alt="GetPawsy Logo" 
                  className="w-20 h-20 rounded-2xl shadow-lg"
                />
              </div>
              
              <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-6">
                About GetPawsy
              </h1>
              
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-4">
                GetPawsy is an online pet supply store focused on high-quality products for dogs and cats in the United States.
              </p>
              <p className="text-base text-muted-foreground max-w-2xl mx-auto mb-2">
                We started because we were tired of generic pet stores with endless listings and zero curation. Instead, we hand-select a focused range of high-quality products for dogs and cats — tested for comfort, safety, and real everyday use — and ship them directly to pet owners across the United States.
              </p>
              <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
                GetPawsy is an online-only business. We do not operate physical retail stores.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Who We Are */}
        <section className="py-16 lg:py-20">
          <div className="container px-4 md:px-6 max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <PawPrint className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
                  Who We Are
                </h2>
              </div>
              
              <div className="bg-card rounded-2xl shadow-card p-6 md:p-8">
                <p className="text-foreground text-lg mb-4">
                  GetPawsy is a dedicated pet supply brand serving pet owners across the United States.
                </p>
                <p className="text-muted-foreground mb-4">
                  We focus on practical, well-reviewed pet products and ship them to US customers through trusted fulfillment partners.
                </p>
                <p className="text-muted-foreground mb-4">
                  We test product quality, delivery reliability, and customer feedback before adding items to our store. Not everything makes the cut — and that's the point.
                </p>
                <p className="text-muted-foreground">
                  If something isn't right with your order, our support team responds within 24–48 hours. We handle returns, replacements, and questions directly.
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Legal Entity & Business Operations */}
        <section className="py-16 lg:py-20 bg-muted/30">
          <div className="container px-4 md:px-6 max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
                  Our Business & Legal Information
                </h2>
              </div>
              
              <div className="bg-card rounded-2xl shadow-card p-6 md:p-8">
                <p className="text-foreground text-lg mb-4">
                  <strong>GetPawsy LLC</strong> is a US-based online pet supply company serving customers across the United States.
                </p>
                
                <div className="bg-muted/50 rounded-xl p-5 mb-6">
                  <h3 className="font-semibold text-foreground mb-3">Business Registration</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-[140px]">Legal entity:</span>
                      <span className="text-foreground font-medium">GetPawsy LLC</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-[140px]">Trading name:</span>
                      <span className="text-foreground font-medium">GetPawsy</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-[140px]">Location:</span>
                      <span className="text-foreground font-medium">New York, NY · United States</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-[140px]">Business type:</span>
                      <span className="text-foreground font-medium">Online-only retailer</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-[140px]">Website:</span>
                      <a href="https://getpawsy.pet" className="text-primary hover:underline font-medium">getpawsy.pet</a>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-[140px]">Customer support:</span>
                      <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline font-medium">{SUPPORT_EMAIL}</a>
                    </div>
                  </div>
                </div>

                <p className="text-muted-foreground mb-4">
                  GetPawsy LLC is responsible for all operations of the webshop, including:
                </p>
                
                <div className="space-y-3">
                  {[
                    'Webshop operations and website management',
                    'Payment processing and transaction security',
                    'Customer service and support',
                    'Shipping coordination and order fulfillment',
                    'Returns, refunds, and warranty handling',
                    'Compliance with consumer protection regulations',
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <p className="text-foreground">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            <PageChangelog pageKey="about" />
          </div>
        </section>

        {/* Our Mission */}
        <section className="py-16 lg:py-20">
          <div className="container px-4 md:px-6 max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Heart className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
                  Our Mission
                </h2>
              </div>
              
              <div className="bg-card rounded-2xl shadow-card p-6 md:p-8">
                <p className="text-foreground text-lg mb-6">
                  We exist to make pet care easier and more enjoyable for pet parents across the United States.
                </p>
                
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-1 flex-shrink-0" />
                    <p className="text-foreground">
                      <strong>Thoughtfully selected products</strong> that pet parents can trust
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-1 flex-shrink-0" />
                    <p className="text-foreground">
                      <strong>Clear, honest information</strong> on every product page
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-1 flex-shrink-0" />
                    <p className="text-foreground">
                      <strong>A smooth, reliable shopping experience</strong> from browse to delivery
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Quality & Safety */}
        <section className="py-16 lg:py-20 bg-muted/30">
          <div className="container px-4 md:px-6 max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
                  Quality & Safety
                </h2>
              </div>
              
              <div className="bg-card rounded-2xl shadow-card p-6 md:p-8">
                <p className="text-foreground text-lg mb-4">
                  Every product in our catalog is chosen based on usability, comfort, and safety.
                </p>
                <p className="text-muted-foreground mb-6">
                  We provide clear sizing guides, material information, and care instructions on each product page—so you always know exactly what you are getting.
                </p>
                
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="bg-muted/50 rounded-xl p-4 text-center">
                    <Package className="w-8 h-8 text-primary mx-auto mb-2" />
                    <p className="font-medium text-foreground">Quality Materials</p>
                    <p className="text-sm text-muted-foreground">Selected for durability</p>
                  </div>
                  <div className="bg-muted/50 rounded-xl p-4 text-center">
                    <Shield className="w-8 h-8 text-primary mx-auto mb-2" />
                    <p className="font-medium text-foreground">Pet-Safe</p>
                    <p className="text-sm text-muted-foreground">Comfort-focused design</p>
                  </div>
                  <div className="bg-muted/50 rounded-xl p-4 text-center">
                    <CheckCircle className="w-8 h-8 text-primary mx-auto mb-2" />
                    <p className="font-medium text-foreground">Clear Details</p>
                    <p className="text-sm text-muted-foreground">Sizing & care info</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Shipping & Fulfillment Transparency */}
        <section className="py-16 lg:py-20">
          <div className="container px-4 md:px-6 max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Truck className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
                  Shipping & Fulfillment
                </h2>
              </div>
              
              <div className="bg-card rounded-2xl shadow-card p-6 md:p-8">
                <p className="text-foreground text-lg mb-4">
                  We work with trusted logistics and carrier partners to ensure your orders are delivered reliably to the United States.
                </p>
                
                <div className="space-y-4 mb-6">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-1 flex-shrink-0" />
                    <p className="text-foreground">
                      <strong>Shipping:</strong> Serving customers across the United States with reliable delivery
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-1 flex-shrink-0" />
                    <p className="text-foreground">
                      <strong>Free shipping</strong> on orders over ${FREE_SHIPPING_THRESHOLD}.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-1 flex-shrink-0" />
                    <p className="text-foreground">
                      Estimated delivery: <strong>{DELIVERY_TIME_STANDARD}</strong>.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-1 flex-shrink-0" />
                    <p className="text-foreground">
                      <strong>{RETURN_WINDOW_DAYS}-day return policy</strong> on all orders.
                    </p>
                  </div>
                </div>
                
                <div className="p-4 bg-muted/50 rounded-xl">
                  <p className="text-sm text-muted-foreground">
                    GetPawsy coordinates all shipping and fulfillment. If you have any questions about your order, please contact us at <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">{SUPPORT_EMAIL}</a>.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Real Support */}
        <section className="py-16 lg:py-20 bg-muted/30">
          <div className="container px-4 md:px-6 max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
                  Real Support
                </h2>
              </div>
              
              <div className="bg-card rounded-2xl shadow-card p-6 md:p-8">
                <p className="text-foreground text-lg mb-6">
                  When you reach out, a real person responds. No bots, no runaround.
                </p>
                
                <div className="grid sm:grid-cols-2 gap-4 mb-6">
                  <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-xl">
                    <Mail className="w-6 h-6 text-primary flex-shrink-0" />
                    <div>
                      <p className="font-medium text-foreground">Email Us</p>
                      <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
                        {SUPPORT_EMAIL}
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-xl">
                    <Clock className="w-6 h-6 text-primary flex-shrink-0" />
                    <div>
                      <p className="font-medium text-foreground">Response Time</p>
                      <p className="text-muted-foreground">Within 24 business hours</p>
                    </div>
                  </div>
                </div>
                
                <p className="text-muted-foreground">
                  Whether you have questions about an order, need help choosing the right size, or just want to say hi—we are here to help.
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Why Customers Choose GetPawsy */}
        <section className="py-16 lg:py-20">
          <div className="container px-4 md:px-6 max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Heart className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
                  Why Customers Choose GetPawsy
                </h2>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  { title: 'Pet comfort first', desc: 'Every product is selected with your pet\'s comfort and safety in mind.' },
                  { title: 'Reliable delivery', desc: 'Orders ship within 1–2 business days with tracking to the United States.' },
                  { title: 'Customer-first approach', desc: 'Real support from real people — we respond within 24 hours.' },
                  { title: 'Transparent policies', desc: '30-day returns, clear pricing, and no hidden fees.' },
                ].map((item) => (
                  <div key={item.title} className="bg-card rounded-xl shadow-card p-5">
                    <p className="font-medium text-foreground mb-1">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* Closing Promise */}
        <section className="py-16 lg:py-20 bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10">
          <div className="container px-4 md:px-6 max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <PawPrint className="w-16 h-16 text-primary mx-auto mb-6" />
              
              <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-4">
                A Brand Pet Parents Can Rely On
              </h2>
              
              <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
                We know there are a lot of pet stores out there. That is exactly why we work hard to earn your trust—through quality products, honest policies, and support that actually helps. Thank you for considering GetPawsy for your pet.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild size="lg" className="btn-organic">
                  <Link to="/products">Shop Products</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/contact">Contact Us</Link>
                </Button>
              </div>
            </motion.div>
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default About;
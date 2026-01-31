import { Layout } from '@/components/layout/Layout';
import { motion } from 'framer-motion';
import { Truck, Clock, MapPin, Package, CheckCircle, AlertCircle, Globe } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  FREE_SHIPPING_THRESHOLD,
  DELIVERY_TIME_STANDARD,
  DELIVERY_TIME_EXPRESS,
  PROCESSING_TIME,
  US_WAREHOUSE_NOTE,
} from '@/lib/shipping-constants';

const Shipping = () => {
  const shippingMethods = [
    {
      name: 'Standard US Shipping',
      time: DELIVERY_TIME_STANDARD,
      price: `FREE on orders $${FREE_SHIPPING_THRESHOLD}+`,
      description: `Fast delivery from US warehouses. ${US_WAREHOUSE_NOTE}.`,
      icon: Truck,
    },
    {
      name: 'Express Shipping',
      time: DELIVERY_TIME_EXPRESS,
      price: 'From $9.99',
      description: 'Priority handling for urgent orders (where available)',
      icon: Package,
    },
  ];

  const deliverySteps = [
    {
      step: 1,
      title: 'Order Processing',
      description: 'Your order is received and prepared for shipment',
      time: PROCESSING_TIME,
    },
    {
      step: 2,
      title: 'Shipped',
      description: 'Your package leaves our US fulfillment center',
      time: 'Tracking number provided via email',
    },
    {
      step: 3,
      title: 'In Transit',
      description: 'Your package is on its way to you',
      time: '3-7 business days (US)',
    },
    {
      step: 4,
      title: 'Delivered',
      description: 'Your package arrives at your doorstep',
      time: 'Signature may be required',
    },
  ];

  const carriers = [
    { name: 'USPS', description: 'United States Postal Service' },
    { name: 'UPS', description: 'United Parcel Service' },
    { name: 'FedEx', description: 'Federal Express' },
    { name: 'DHL', description: 'DHL Express' },
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
                <Truck className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
                Shipping Information
              </h1>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Everything you need to know about shipping, delivery times, and tracking your order.
              </p>
            </div>

            {/* Free Shipping Banner */}
            <div className="bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 rounded-2xl p-6 mb-12 text-center">
              <div className="flex items-center justify-center gap-3 mb-2">
                <CheckCircle className="w-6 h-6 text-green-600" />
                <span className="text-2xl font-display font-bold text-foreground">
                  FREE US Shipping on Orders ${FREE_SHIPPING_THRESHOLD}+
                </span>
              </div>
              <p className="text-muted-foreground">
                Enjoy fast, reliable delivery from our US warehouses. Most orders arrive within {DELIVERY_TIME_STANDARD}.
              </p>
            </div>

            {/* Shipping Methods */}
            <section className="mb-12">
              <h2 className="text-2xl font-display font-bold text-foreground mb-6">
                Shipping Methods
              </h2>
              <div className="grid md:grid-cols-2 gap-6">
                {shippingMethods.map((method) => (
                  <div 
                    key={method.name}
                    className="bg-card rounded-xl shadow-card p-6"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <method.icon className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-foreground">{method.name}</h3>
                          <span className="text-primary font-bold">{method.price}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                          <Clock className="w-4 h-4" />
                          <span>{method.time}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{method.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Delivery Timeline */}
            <section className="mb-12">
              <h2 className="text-2xl font-display font-bold text-foreground mb-6">
                Delivery Timeline
              </h2>
              <div className="bg-card rounded-xl shadow-card p-6">
                <div className="space-y-6">
                  {deliverySteps.map((step, index) => (
                    <div key={step.step} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                          {step.step}
                        </div>
                        {index < deliverySteps.length - 1 && (
                          <div className="w-0.5 h-full bg-primary/20 mt-2" />
                        )}
                      </div>
                      <div className="flex-1 pb-6">
                        <h3 className="font-semibold text-foreground mb-1">{step.title}</h3>
                        <p className="text-muted-foreground text-sm mb-1">{step.description}</p>
                        <span className="text-xs text-primary font-medium">{step.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Shipping Carriers */}
            <section className="mb-12">
              <h2 className="text-2xl font-display font-bold text-foreground mb-6">
                Our Shipping Partners
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {carriers.map((carrier) => (
                  <div 
                    key={carrier.name}
                    className="bg-muted/30 rounded-xl p-4 text-center"
                  >
                    <p className="font-semibold text-foreground">{carrier.name}</p>
                    <p className="text-xs text-muted-foreground">{carrier.description}</p>
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                The carrier for your order is selected based on your location and the items ordered. 
                You will receive tracking information once your order ships.
              </p>
            </section>

            {/* Service Areas */}
            <section className="mb-12">
              <h2 className="text-2xl font-display font-bold text-foreground mb-6 flex items-center gap-2">
                <Globe className="w-6 h-6" />
                Service Areas
              </h2>
              <div className="bg-card rounded-xl shadow-card p-6">
                <div className="flex items-start gap-4 mb-4">
                  <MapPin className="w-6 h-6 text-primary flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-foreground mb-2">US-Focused Shipping</h3>
                    <p className="text-muted-foreground">
                      We primarily serve customers in the United States with fast domestic shipping from US warehouses. 
                      Most US orders arrive within {DELIVERY_TIME_STANDARD}.
                    </p>
                  </div>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-blue-800 dark:text-blue-200 font-medium mb-1">
                        International Orders
                      </p>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        We do ship internationally, but delivery times are longer (10-20 business days). 
                        International orders may be subject to customs fees and import duties, which are the responsibility of the recipient.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Important Notes */}
            <section className="mb-12">
              <h2 className="text-2xl font-display font-bold text-foreground mb-6">
                Important Information
              </h2>
              <div className="prose prose-lg max-w-none">
                <ul className="space-y-3 text-muted-foreground">
                  <li>
                    <strong className="text-foreground">Processing Time:</strong> Orders are typically 
                    processed within 1-3 business days before shipping.
                  </li>
                  <li>
                    <strong className="text-foreground">Tracking:</strong> You will receive an email 
                    with tracking information once your order has shipped.
                  </li>
                  <li>
                    <strong className="text-foreground">Delivery Attempts:</strong> Carriers typically 
                    make 1-3 delivery attempts. After that, packages may be held at a local facility.
                  </li>
                  <li>
                    <strong className="text-foreground">Signature Required:</strong> Some orders may 
                    require a signature upon delivery for security purposes.
                  </li>
                  <li>
                    <strong className="text-foreground">PO Boxes:</strong> We can ship to PO Boxes, 
                    but delivery times may be longer.
                  </li>
                  <li>
                    <strong className="text-foreground">Address Accuracy:</strong> Please ensure your 
                    shipping address is correct. We are not responsible for packages delivered to 
                    incorrect addresses provided by the customer.
                  </li>
                </ul>
              </div>
            </section>

            {/* CTA */}
            <div className="text-center">
              <h3 className="text-xl font-semibold text-foreground mb-4">
                Have questions about shipping?
              </h3>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild>
                  <Link to="/contact">Contact Us</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/track">Track Your Order</Link>
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

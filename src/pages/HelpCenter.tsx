import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import {
  Package,
  RotateCcw,
  Truck,
  Mail,
  Building2,
  ExternalLink,
} from 'lucide-react';
import {
  DELIVERY_TIME_STANDARD,
  PROCESSING_TIME,
  RETURN_WINDOW_DAYS,
  SUPPORT_EMAIL,
} from '@/lib/shipping-constants';

/* ── Section data ──────────────────────────────────────────────────── */

const sections = [
  {
    icon: Package,
    title: 'Order Help',
    items: [
      { heading: 'Track Your Order', text: 'After your order ships you will receive a tracking number via email.' },
      { heading: 'Order Processing', text: `Orders are processed within ${PROCESSING_TIME}.` },
      { heading: 'Delivery Time', text: `Most orders arrive within ${DELIVERY_TIME_STANDARD} within the United States.` },
    ],
  },
  {
    icon: RotateCcw,
    title: 'Returns & Refunds',
    items: [
      { heading: `${RETURN_WINDOW_DAYS}-Day Returns`, text: `You may return your order within ${RETURN_WINDOW_DAYS} days of delivery.` },
      { heading: 'Refund Processing', text: 'Refunds are issued after the returned item is received and inspected.' },
      { heading: 'How To Request A Return', text: `Contact ${SUPPORT_EMAIL} with your order number.` },
    ],
  },
  {
    icon: Truck,
    title: 'Shipping Information',
    items: [
      { heading: 'Order Fulfillment', text: 'Orders are shipped to customers across the United States via trusted carrier partners.' },
      { heading: 'Processing Time', text: PROCESSING_TIME + '.' },
      { heading: 'Delivery Time', text: `${DELIVERY_TIME_STANDARD} depending on location.` },
    ],
  },
  {
    icon: Mail,
    title: 'Customer Support',
    items: [
      { heading: 'Email Support', text: SUPPORT_EMAIL },
      { heading: 'Support Hours', text: 'Monday–Friday.' },
      { heading: 'Response Time', text: 'Within 24 hours.' },
    ],
  },
];

const policyLinks = [
  { label: 'Shipping Policy', href: '/shipping' },
  { label: 'Returns Policy', href: '/returns' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Contact Page', href: '/contact' },
];

/* ── Page component ────────────────────────────────────────────────── */

const HelpCenter = () => (
  <Layout>
    <Helmet>
      <title>Customer Help Center | GetPawsy</title>
      <meta
        name="description"
        content="Find answers about orders, shipping, returns and customer support at GetPawsy. US shipping, 30-day returns, secure checkout."
      />
      <link rel="canonical" href="https://getpawsy.pet/help" />
    </Helmet>

    <div className="min-h-screen py-14 md:py-20">
      <div className="container px-4 md:px-6 max-w-4xl mx-auto">
        {/* Header */}
        <header className="text-center mb-10 md:mb-14">
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">
            Customer Help Center
          </h1>
          <p className="mt-3 text-muted-foreground text-base md:text-lg max-w-2xl mx-auto">
            Find answers about orders, shipping, returns and customer support.
          </p>
        </header>

        {/* Help sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {sections.map(({ icon: Icon, title, items }) => (
            <div
              key={title}
              className="rounded-xl bg-card border border-border/50 p-5 md:p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <h2 className="font-display font-semibold text-foreground text-lg">
                  {title}
                </h2>
              </div>

              <ul className="space-y-4">
                {items.map(({ heading, text }) => (
                  <li key={heading}>
                    <h3 className="font-semibold text-foreground text-sm">
                      {heading}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {text}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Business transparency */}
        <section className="rounded-xl bg-sand/30 border border-border/40 p-5 md:p-8 mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <h2 className="font-display font-semibold text-foreground text-lg">
              Business Information
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            GetPawsy is operated by Skidzo.
          </p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Registration:</dt>
              <dd className="text-foreground font-medium">KVK 78156955</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Customer support:</dt>
              <dd className="text-foreground font-medium">{SUPPORT_EMAIL}</dd>
            </div>
          </dl>
        </section>

        {/* Policy links */}
        <nav aria-label="Policy pages" className="rounded-xl bg-card border border-border/50 p-5 md:p-6">
          <h2 className="font-display font-semibold text-foreground text-lg mb-4">
            Policies & Information
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {policyLinks.map(({ label, href }) => (
              <li key={href}>
                <Link
                  to={href}
                  className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors font-medium"
                >
                  <ExternalLink className="w-4 h-4" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  </Layout>
);

export default HelpCenter;

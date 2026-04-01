import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Truck, RotateCcw, ShieldCheck, Heart, CheckCircle, ChevronRight } from 'lucide-react';
import { CATEGORY_SEO_DATA, type CategorySeoEntry } from '@/lib/category-seo-data';
import {
  FREE_SHIPPING_THRESHOLD,
  DELIVERY_TIME_STANDARD,
  RETURN_WINDOW_DAYS,
} from '@/lib/shipping-constants';

interface CategorySeoContentProps {
  categorySlug: string;
}

export function CategorySeoContent({ categorySlug }: CategorySeoContentProps) {
  const entry = CATEGORY_SEO_DATA[categorySlug];
  if (!entry) return null;

  // FAQ structured data
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entry.faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };

  return (
    <>
      {/* FAQ Schema */}
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
      </Helmet>

      <div className="mt-10 mb-8 max-w-4xl space-y-10">
        {/* Intro */}
        <p className="text-muted-foreground leading-relaxed text-base">
          {entry.intro}
        </p>

        {/* Why It Matters */}
        <section>
          <h2 className="text-xl font-display font-semibold text-foreground mb-3">
            Why This Matters for Your Pet
          </h2>
          <div className="text-muted-foreground leading-relaxed text-sm whitespace-pre-line">
            {entry.whyItMatters}
          </div>
        </section>

        {/* Buying Guide */}
        <section>
          <h2 className="text-xl font-display font-semibold text-foreground mb-4">
            How to Choose — Buying Guide
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {entry.buyingGuide.map((criterion) => (
              <div
                key={criterion.title}
                className="rounded-xl border border-border bg-card p-4"
              >
                <h3 className="font-semibold text-foreground text-sm mb-1.5">
                  {criterion.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {criterion.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How to Choose narrative */}
        <section>
          <h2 className="text-xl font-display font-semibold text-foreground mb-3">
            What to Look For
          </h2>
          <div className="text-muted-foreground leading-relaxed text-sm whitespace-pre-line">
            {entry.howToChoose}
          </div>
        </section>

        {/* Common Mistakes */}
        <section>
          <h2 className="text-xl font-display font-semibold text-foreground mb-3">
            Common Mistakes to Avoid
          </h2>
          <ul className="space-y-2">
            {entry.commonMistakes.map((mistake, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <span className="text-destructive mt-0.5 flex-shrink-0 font-bold">✗</span>
                <span>{mistake}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Perfect For */}
        <section className="bg-secondary/20 rounded-2xl p-5">
          <h3 className="font-display font-semibold text-foreground flex items-center gap-2 mb-4">
            <Heart className="w-5 h-5 text-primary" aria-hidden="true" />
            Perfect For
          </h3>
          <ul className="space-y-2">
            {entry.perfectFor.map((use, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" aria-hidden="true" />
                <span>{use}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Trust / Conversion Strip */}
        <section className="bg-muted/40 rounded-2xl p-5">
          <h3 className="font-display font-semibold text-foreground mb-4">
            Why US Pet Owners Choose GetPawsy
          </h3>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <Truck className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div>
                <p className="font-medium text-foreground text-sm">Free Shipping Available</p>
                <p className="text-xs text-muted-foreground">
                  On orders over ${FREE_SHIPPING_THRESHOLD} · {DELIVERY_TIME_STANDARD}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <RotateCcw className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div>
                <p className="font-medium text-foreground text-sm">{RETURN_WINDOW_DAYS}-Day Returns</p>
                <p className="text-xs text-muted-foreground">Easy return process</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div>
                <p className="font-medium text-foreground text-sm">Quality Commitment</p>
                <p className="text-xs text-muted-foreground">Carefully curated products for your pet</p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section>
          <h2 className="text-xl font-display font-semibold text-foreground mb-4">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {entry.faqs.map((faq, i) => (
              <details
                key={i}
                className="group rounded-xl border border-border bg-card overflow-hidden"
              >
                <summary className="flex items-center justify-between cursor-pointer px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/30 transition-colors">
                  <span>{faq.question}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-90 flex-shrink-0 ml-2" aria-hidden="true" />
                </summary>
                <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">
                  {faq.answer}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* Related Links */}
        <section>
          <h3 className="font-display font-semibold text-foreground mb-3 text-sm">
            Related Categories & Guides
          </h3>
          <div className="flex flex-wrap gap-3">
            {entry.relatedLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-sm font-medium text-primary hover:underline"
              >
                📖 {link.text}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

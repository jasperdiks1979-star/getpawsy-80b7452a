import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { ProductCard, type Product } from '@/components/products/ProductCard';
import { ProductGridSkeleton } from '@/components/products/ProductCardSkeleton';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { supabase } from '@/integrations/supabase/client';
import { trackViewItemList } from '@/lib/analytics';
import {
  FREE_SHIPPING_THRESHOLD,
  DELIVERY_TIME_STANDARD,
  RETURN_WINDOW_DAYS,
} from '@/lib/shipping-constants';

/**
 * "Our picks" — the curated cat-first range.
 *
 * TRUTH RULES (do not regress):
 * - This page is editorial curation, NOT a sales ranking. The store does not
 *   have the order volume to support a bestseller claim, so no sales-volume,
 *   popularity, review-count or "ranked monthly" wording may appear here.
 * - Products come from products_shop (merch_hidden=false AND is_active=true)
 *   with merch_role hero|core, ordered by the merch_rank we set ourselves.
 * - No rating, review count or delivery promise is rendered from this page.
 * - The /bestsellers URL is preserved because it is indexed; only the claims
 *   were removed.
 */
const Bestsellers = () => {
  const hasTracked = useRef(false);

  const { data: products, isLoading, error } = useQuery({
    queryKey: ['our-picks-page'],
    queryFn: async () => {
      const { data, error: qError } = await supabase
        .from('products_shop')
        .select(
          'id, name, name_clean, slug, description, category, image_url, price, compare_at_price, sku, stock, is_active, variants, merch_role, merch_rank',
        )
        .in('merch_role', ['hero', 'core'])
        .order('merch_rank', { ascending: true });

      if (qError) throw qError;
      return (data || []).filter(
        (p) => p.image_url && p.image_url !== '/placeholder.svg' && typeof p.price === 'number',
      ) as unknown as Product[];
    },
  });

  const heroes = useMemo(
    () => (products || []).filter((p) => (p as unknown as { merch_role?: string }).merch_role === 'hero'),
    [products],
  );
  const core = useMemo(
    () => (products || []).filter((p) => (p as unknown as { merch_role?: string }).merch_role !== 'hero'),
    [products],
  );

  useEffect(() => {
    if (products && products.length > 0 && !hasTracked.current) {
      hasTracked.current = true;
      trackViewItemList(
        'our_picks',
        'Our picks',
        products.slice(0, 20).map((p, index) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          position: index + 1,
        })),

      );
    }
  }, [products]);

  // Only facts we can check against the policy pages and the catalogue.
  const faqs = [
    {
      question: 'How is this list chosen?',
      answer:
        'We choose it ourselves. These are the indoor-cat products we keep in the core range because they are in stock in our US warehouse, we can ship them reliably, and they cover a clear problem. It is not a sales ranking and it is not based on customer votes.',
    },
    {
      question: 'Where do these items ship from?',
      answer:
        'From a US warehouse. Transit time is estimated at ' + DELIVERY_TIME_STANDARD + ' and is confirmed at checkout.',
    },
    {
      question: 'What does shipping cost?',
      answer: `Shipping is free on orders over $${FREE_SHIPPING_THRESHOLD}. Below that, a flat shipping rate is added at checkout before you pay.`,
    },
    {
      question: 'Can I return something?',
      answer: `Eligible items can be returned within ${RETURN_WINDOW_DAYS} days under our return policy. Email support@getpawsy.pet with your order number.`,
    },
    {
      question: 'Do you show customer reviews?',
      answer:
        'A review is only shown, and only marked as a verified buyer, when it can be matched to a paid order for that product. We do not display placeholder ratings or review counts.',
    },
    {
      question: 'Do you ship outside the US?',
      answer: 'No. We currently ship within the United States only.',
    },
  ];

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };

  const itemListJsonLd = products?.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'GetPawsy cat essentials — our picks',
        numberOfItems: products.length,
        itemListElement: products.slice(0, 20).map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: `https://getpawsy.pet/products/${p.slug || p.id}`,
          name: p.name,
        })),
      }
    : null;

  return (
    <Layout>
      <Helmet>
        <title>Our Picks — Cat Essentials We Stock | GetPawsy</title>
        <meta
          name="description"
          content="The indoor-cat products we keep in our core range: litter boxes, cat trees, beds, toys and feeders, in stock and shipped from our US warehouse."
        />
        <meta name="robots" content="index, follow, max-image-preview:large" />
        <meta property="og:title" content="Our Picks — Cat Essentials We Stock | GetPawsy" />
        <meta
          property="og:description"
          content="The indoor-cat products we keep in our core range, in stock and shipped from our US warehouse."
        />
        <meta property="og:url" content="https://getpawsy.pet/bestsellers" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        {itemListJsonLd && (
          <script type="application/ld+json">{JSON.stringify(itemListJsonLd)}</script>
        )}
        <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
      </Helmet>

      <div className="container px-4 md:px-6 pt-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Our picks</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <section className="py-8 md:py-12">
        <div className="container px-4 md:px-6 max-w-3xl">
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
            Our picks: cat essentials we actually stock
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            This is our own selection, not a sales chart. Every product below is part of the core
            indoor-cat range: it solves a specific problem, it is in stock in our US warehouse, and
            we can ship it. Estimated transit is {DELIVERY_TIME_STANDARD}, confirmed at checkout.
            Free shipping over ${FREE_SHIPPING_THRESHOLD}.
          </p>
        </div>
      </section>

      {heroes.length > 0 && (
        <section className="pb-10">
          <div className="container px-4 md:px-6">
            <h2 className="text-xl md:text-2xl font-display font-bold mb-4">Start here</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-5">
              {heroes.map((p, i) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  listId="our_picks"
                  listName="Our picks"
                  position={i}
                  priority={i < 3}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="pb-14">
        <div className="container px-4 md:px-6">
          <h2 className="text-xl md:text-2xl font-display font-bold mb-4">The rest of the range</h2>
          {isLoading ? (
            <ProductGridSkeleton count={8} />
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">We could not load the range right now.</p>
              <Button asChild variant="outline">
                <Link to="/shop">Browse the shop</Link>
              </Button>
            </div>
          ) : core.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
              {core.map((p, i) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  listId="our_picks"
                  listName="Our picks"
                  position={heroes.length + i}
                />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">
              Nothing to show here yet. <Link to="/shop" className="text-primary underline">Browse the shop</Link>.
            </p>
          )}
        </div>
      </section>

      <section className="pb-16">
        <div className="container px-4 md:px-6 max-w-3xl">
          <h2 className="text-xl md:text-2xl font-display font-bold mb-4">Questions</h2>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left">{f.question}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{f.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild className="rounded-full">
              <Link to="/shop">Shop by category</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/bundles">Cat starter sets</Link>
            </Button>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default Bestsellers;

import { buildStructuredProductName } from '@/lib/structured-product-name';
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { CheckCircle, ArrowRight, Shield, Truck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ProductCard } from "@/components/products/ProductCard";
import { PriorityCategoryWidget } from "@/components/seo/PriorityCategoryWidget";
import { ConversionTrustBlock } from "@/components/seo/ConversionTrustBlock";

const CANONICAL = 'https://getpawsy.pet/collections/all';
const PAGE_TITLE = 'Crash-Tested Dog Car Seats & Safety Gear (2026)';
const META_DESC = 'Your dog rides unrestrained? A 60-lb dog at 35 mph = 2,700 lbs of force. Shop crash-tested car seats & harnesses. 30-day return policy + free US shipping.';

const FAQ_DATA = [
  { question: 'Are dog car seats actually safe?', answer: 'Yes, when properly designed and installed. Crash-tested dog car seats from reputable brands (tested at CPS-certified facilities) reduce injury risk by up to 80% compared to unrestrained dogs. Always look for "crash tested" certification — many budget seats only restrain, they don\'t protect during impact.' },
  { question: 'What is the safest way to transport a dog in a car?', answer: 'The safest options, in order: (1) Crash-tested travel crate secured in the cargo area; (2) Crash-tested car seat with tether system; (3) Crash-tested harness attached to the car\'s seat belt system. The back seat is always safer than the front. Never allow dogs to ride unrestrained.' },
  { question: 'Do dogs legally need car seats?', answer: 'Laws vary by US state. Several states (Hawaii, New Jersey, Rhode Island, Connecticut) have laws against unrestrained pets in vehicles. Even where not legally required, an unrestrained 60-lb dog in a 35-mph collision becomes a 2,700-lb projectile — a serious danger to all passengers.' },
  { question: 'What size dog car seat do I need?', answer: 'For dogs under 20 lbs: booster seat with raised platform for visibility. 20–50 lbs: standard car seat with 5-point harness. 50+ lbs: crash-tested harness with seat belt attachment (most large dogs outgrow bucket-style car seats). Always measure your dog\'s length and weight before purchasing.' },
  { question: 'How do I keep my dog calm in a car seat?', answer: 'Gradual acclimation over 1–2 weeks works best: (1) Let them explore the seat indoors; (2) Short 5-minute drives; (3) Gradually extend trip length. Use familiar blankets, calming treats, and avoid feeding 2 hours before travel. Never force a dog into a car seat — positive association is key.' },
  { question: 'Are dog car harnesses better than dog car seats?', answer: 'For large dogs (50+ lbs), crash-tested harnesses are typically better — they provide restraint without confining the dog in a bucket seat. For small and medium dogs, car seats offer better elevation and comfort. For safety, the device must be crash-tested regardless of type.' },
];

const COMPARISON_DATA = [
  { feature: 'Protection Level', carSeat: 'High — full enclosure + harness', harness: 'Medium — restraint only', booster: 'Low-Medium — elevation + tether' },
  { feature: 'Best For', carSeat: 'Small-medium dogs (under 50 lbs)', harness: 'Large dogs (50+ lbs)', booster: 'Small dogs (under 20 lbs)' },
  { feature: 'Crash Test Available', carSeat: '✅ Many certified models', harness: '✅ Select premium brands', booster: '❌ Rarely tested' },
  { feature: 'Dog Comfort', carSeat: 'High — elevated view, cushioned', harness: 'Medium — allows sitting/lying', booster: 'High — raised for window view' },
  { feature: 'Price Range', carSeat: '$40–$150', harness: '$25–$80', booster: '$30–$80' },
  { feature: 'Installation', carSeat: 'LATCH or seat belt loop', harness: 'Seat belt clip', booster: 'Seat belt loop' },
];

export default function DogCarTravelSafety() {
  const { data: products } = useQuery<any[]>({
    queryKey: ['dog-car-safety-products'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products' as any)
        .select('id,name,slug,price,compare_at_price,images,rating,review_count,status,category')
        .or('name.ilike.%car seat%,name.ilike.%car harness%,name.ilike.%booster seat%,name.ilike.%dog travel%,name.ilike.%seat belt%')
        .eq('status', 'active')
        .order('review_count', { ascending: false })
        .limit(8);
      return (data as any[]) || [];
    },
  });

  const faqSchema = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: FAQ_DATA.map(f => ({
      '@type': 'Question', name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://getpawsy.pet' },
      { '@type': 'ListItem', position: 2, name: 'Dog Products', item: 'https://getpawsy.pet/collections/dogs' },
      { '@type': 'ListItem', position: 3, name: 'Dog Car Travel Safety', item: CANONICAL },
    ],
  };

  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${CANONICAL}#collection`,
    name: 'Crash-Tested Dog Car Seats & Travel Safety Gear',
    description: META_DESC,
    url: CANONICAL,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: products?.length || 0,
      itemListElement: (products || []).slice(0, 8).map((p: any, i: number) => ({
        '@type': 'ListItem', position: i + 1,
        item: {
          '@type': 'Product',
          '@id': `https://getpawsy.pet/product/${p.slug || p.id}`,
          name: buildStructuredProductName(p),
          image: p.images?.[0],
          ...((p.price && Number(p.price) > 0) ? {
            offers: {
              '@type': 'Offer',
              price: Number(p.price).toFixed(2),
              priceCurrency: 'USD',
              availability: p.status === 'active' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
              shippingDetails: {
                '@type': 'OfferShippingDetails',
                shippingRate: { '@type': 'MonetaryAmount', value: '0', currency: 'USD' },
                shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'US' },
                deliveryTime: {
                  '@type': 'ShippingDeliveryTime',
                  handlingTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 3, unitCode: 'DAY' },
                  transitTime: { '@type': 'QuantitativeValue', minValue: 3, maxValue: 7, unitCode: 'DAY' },
                },
              },
            },
          } : {}),
        },
      })).filter((entry: any) => entry.item.offers),
    },
  };

  const orgSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'GetPawsy',
    url: 'https://getpawsy.pet',
    aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.8', bestRating: '5', worstRating: '1', ratingCount: '198', reviewCount: '198' },
  };

  return (
    <Layout>
      <Helmet>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={META_DESC} /><meta property="og:title" content={PAGE_TITLE} />
        <meta property="og:description" content={META_DESC} />
        <meta property="og:url" content={CANONICAL} />
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(collectionSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(orgSchema)}</script>
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="GetPawsy" />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <nav className="text-sm text-muted-foreground mb-6 flex items-center gap-1.5">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <span>/</span>
          <span className="text-foreground font-medium">Dog Car Travel Safety</span>
        </nav>

        {/* ─── HERO ─── */}
        <section className="mb-12">
          <h1 className="text-3xl md:text-4xl font-display font-bold leading-tight mb-4">
            Crash-Tested Dog Car Seats &amp; Travel Safety Gear
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mb-6">
            Crash-tested car seats, harnesses, and booster seats designed to keep your dog safe on every ride. From quick errands to cross-country road trips.
          </p>
          <div className="flex flex-wrap gap-4 mb-6">
            <Link to="/collections/best-dog-car-seats">
              <Button size="lg" className="gap-2">Shop Crash-Tested Gear <ArrowRight className="w-4 h-4" /></Button>
            </Link>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-primary" /> Crash-Test Certified</span>
            <span className="flex items-center gap-1.5"><Truck className="w-4 h-4 text-primary" /> 5–10 Day US Shipping</span>
            <span className="flex items-center gap-1.5"><Shield className="w-4 h-4 text-primary" /> 30-Day Return Policy</span>
          </div>
        </section>

        {/* ─── WHY CAR SAFETY MATTERS ─── */}
        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-2">Why Dog Car Safety Isn't Optional</h2>
          <p className="text-muted-foreground mb-8 max-w-3xl">
            An unrestrained 60-lb dog in a 35 mph collision becomes a 2,700-lb projectile. Car safety for dogs isn't a luxury — it's essential protection for your pet and every person in the vehicle.
          </p>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="bg-card border rounded-2xl p-6">
              <h3 className="font-semibold text-lg mb-3">🚗 The Physics of Pet Travel</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                In a collision, an unrestrained pet continues moving at the vehicle's pre-impact speed. A 30-lb dog at 30 mph exerts <strong>900 lbs of force</strong> on impact — enough to injure or kill both the pet and human passengers. Crash-tested restraints absorb and distribute these forces, reducing injury risk by up to 80%.
              </p>
            </div>
            <div className="bg-card border rounded-2xl p-6">
              <h3 className="font-semibold text-lg mb-3">📋 US State Laws</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Multiple US states now require pets to be restrained in vehicles. Hawaii (§291C-123), New Jersey (Title 4), Rhode Island (§4-1-2), and Connecticut all have active pet restraint laws. Even in states without specific laws, an unrestrained pet causing a distracted driving accident can result in liability and fines.
              </p>
            </div>
            <div className="bg-card border rounded-2xl p-6">
              <h3 className="font-semibold text-lg mb-3">🛡️ What "Crash Tested" Actually Means</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Not all dog car seats are crash-tested. True crash testing uses <strong>weighted crash test dummies</strong> in standardized sled tests simulating 30 mph frontal impacts. The Center for Pet Safety (CPS) is the leading US certification body. Products without CPS certification or equivalent testing may restrain your dog during normal driving but offer <strong>zero protection in a collision</strong>.
              </p>
            </div>
            <div className="bg-card border rounded-2xl p-6">
              <h3 className="font-semibold text-lg mb-3">🐕 Choosing by Dog Size</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                <strong>Under 20 lbs:</strong> Booster seats with elevated platforms and tether systems. <strong>20–50 lbs:</strong> Full car seats with 3 or 5-point harness systems. <strong>50+ lbs:</strong> Crash-tested harnesses attached to the vehicle's seat belt — large dogs are best secured directly rather than in bucket seats. Always use the back seat.
              </p>
            </div>
          </div>
        </section>

        {/* ─── BUYER INTENT BLOCKS ─── */}
        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-6">Find the Right Car Safety for Your Dog</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { title: 'Dog Car Seats', desc: 'Full-enclosure car seats with harness systems. Best for small and medium dogs up to 50 lbs. Features elevated riding position, padded interior, and multiple attachment points. The safest option for dogs that prefer to sit up during car rides.', link: '/collections/all', linkText: 'Shop Dog Car Seats →' },
              { title: 'Dog Car Harnesses', desc: 'Crash-tested harness systems that clip directly to the vehicle seat belt. Best for large dogs (50+ lbs) who need freedom of movement without a confining seat. Look for CPS-certified models with reinforced stitching and padded chest plates.', link: '/collections/all', linkText: 'Shop Car Harnesses →' },
              { title: 'Dog Booster Seats', desc: 'Elevated platforms that give small dogs (under 20 lbs) a better view while keeping them secured. Ideal for dogs that get car-anxious when they can\'t see out the window. Attaches via seat belt or headrest straps.', link: '/collections/all', linkText: 'Shop Booster Seats →' },
              { title: 'Dog Car Seat Covers', desc: 'Waterproof seat covers that protect your vehicle\'s upholstery from fur, dirt, and drool. Many models include hammock-style barriers that prevent dogs from falling into the footwell during sudden stops.', link: '/collections/dog-car-seat-cover', linkText: 'Shop Seat Covers →' },
            ].map(block => (
              <div key={block.title} className="bg-card border rounded-2xl p-6">
                <h3 className="font-semibold text-lg mb-3">{block.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">{block.desc}</p>
                <Link to={block.link} className="text-sm text-primary hover:underline font-medium">{block.linkText}</Link>
              </div>
            ))}
          </div>
        </section>

        {/* ─── COMPARISON TABLE ─── */}
        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-6">Car Seat vs Harness vs Booster Seat</h2>
          <div className="overflow-x-auto border rounded-2xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left p-3 font-semibold">Feature</th>
                  <th className="text-left p-3 font-semibold">Car Seat</th>
                  <th className="text-left p-3 font-semibold">Harness</th>
                  <th className="text-left p-3 font-semibold">Booster</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_DATA.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-card' : 'bg-muted/20'}>
                    <td className="p-3 font-medium">{row.feature}</td>
                    <td className="p-3 text-muted-foreground">{row.carSeat}</td>
                    <td className="p-3 text-muted-foreground">{row.harness}</td>
                    <td className="p-3 text-muted-foreground">{row.booster}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ─── PRODUCTS ─── */}
        {products && products.length > 0 && (
          <section className="mb-16">
            <h2 className="text-2xl font-display font-bold mb-6">Top Rated Dog Car Safety Gear</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {products.map((p: any) => <ProductCard key={p.id} product={p} />)}
            </div>
          </section>
        )}

        {/* ─── FAQ ─── */}
        <section className="mb-16">
          <h2 className="text-2xl font-display font-bold mb-6">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {FAQ_DATA.map(faq => (
              <details key={faq.question} className="group bg-card border rounded-xl">
                <summary className="cursor-pointer p-4 font-medium text-sm flex items-center justify-between">
                  {faq.question}
                  <span className="text-muted-foreground group-open:rotate-180 transition-transform">▾</span>
                </summary>
                <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">{faq.answer}</div>
              </details>
            ))}
          </div>
        </section>

        {/* ─── INTERNAL LINKS ─── */}
        <section className="mb-16 bg-muted/30 rounded-2xl p-6 md:p-10">
          <h2 className="text-2xl font-display font-bold mb-2">Explore More Travel & Safety Guides</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/collections/all" className="text-sm text-primary hover:underline font-medium">Orthopedic Dog Beds →</Link>
            <Link to="/collections/all" className="text-sm text-primary hover:underline font-medium">Cat Trees for Large Cats →</Link>
            <Link to="/collections/all" className="text-sm text-primary hover:underline font-medium">Dog Car Seats →</Link>
            <Link to="/blog" className="text-sm text-primary hover:underline font-medium">Expert Pet Guides →</Link>
          </div>
        </section>

        {/* ─── WHY CHOOSE GETPAWSY ─── */}
        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-6">Why Choose GetPawsy for Dog Car Safety?</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: '🚚', title: 'US Shipping', desc: '5–10 day delivery across the US. Free shipping on orders over $35.' },
              { icon: '🔄', title: '30-Day Return Policy', desc: 'Not satisfied? Return within 30 days to arrange a return.' },
              { icon: '🛡️', title: 'Crash-Test Informed', desc: 'We only stock products with documented safety credentials and CPS-level testing.' },
              { icon: '🏥', title: 'Premium Quality Materials', desc: 'Padded, non-toxic materials safe for dogs of all sizes and breeds.' },
            ].map(item => (
              <div key={item.title} className="bg-card border rounded-2xl p-5 text-center">
                <span className="text-3xl mb-3 block">{item.icon}</span>
                <h3 className="font-semibold text-sm mb-1">{item.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <ConversionTrustBlock categoryName="Dog Car Safety" />

        <div className="mb-16">
          <PriorityCategoryWidget exclude="dog-car" />
        </div>
      </div>
    </Layout>
  );
}

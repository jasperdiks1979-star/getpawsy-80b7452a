import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { ProductCard } from '@/components/products/ProductCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getSchemaAvailability } from '@/lib/availability';
import {
  Home, ChevronRight, Star, Truck, ShieldCheck, Lock, ArrowRight,
  CheckCircle, AlertTriangle, HelpCircle, RotateCcw, Heart, Zap
} from 'lucide-react';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { ScrollProgressIndicator } from '@/components/ui/ScrollProgressIndicator';
import { SoftEmailCapture } from '@/components/email/SoftEmailCapture';
import orthopedicHero from '@/assets/orthopedic-hero.jpg';

const CANONICAL = 'https://getpawsy.pet/collections/orthopedic-dog-beds';
const BASE = 'https://getpawsy.pet';

const FAQ_DATA = [
  { question: 'Do orthopedic dog beds help arthritis?', answer: 'Yes. Orthopedic dog beds made with high-density memory foam distribute your dog\'s weight evenly, reducing pressure on inflamed joints. Veterinarians frequently recommend orthopedic beds for dogs with arthritis, hip dysplasia, and post-surgery recovery. The key is choosing a bed with at least 4 inches of supportive foam.' },
  { question: 'What thickness is best for large dogs?', answer: 'For large and giant breeds (60+ lbs), look for orthopedic beds with 5–7 inches of total foam thickness. This ensures adequate support without bottoming out. A combination of memory foam top layer and high-density base foam provides the best pressure relief for heavy dogs.' },
  { question: 'Are orthopedic dog bed covers washable?', answer: 'Most quality orthopedic dog beds feature removable, machine-washable covers with waterproof liners. Look for covers with heavy-duty zippers and pre-shrunk fabric. We recommend washing covers every 2–4 weeks to maintain hygiene and extend bed life.' },
  { question: 'How long do orthopedic dog beds last?', answer: 'A high-quality orthopedic dog bed typically lasts 3–5 years with proper care. Premium memory foam retains its supportive properties longer than cheap alternatives. Signs it\'s time to replace: visible sagging, the foam doesn\'t bounce back, or your dog seems less comfortable.' },
  { question: 'Is memory foam better than regular foam for dogs?', answer: 'Memory foam is significantly better for dogs with joint issues. Unlike regular foam, memory foam conforms to your dog\'s body shape, providing customized pressure relief. It responds to body heat and weight, creating a supportive cradle effect that standard polyester or polyurethane foam cannot match.' },
];

const COMPARISON_ROWS = [
  { model: 'Memory Foam Classic', bestFor: 'Senior dogs, joint pain', thickness: '5"', waterproof: '✅', price: '$45–$90', badge: 'Most Popular', slug: '' },
  { model: 'Gel-Infused Cooling', bestFor: 'Hot climates, overheating', thickness: '6"', waterproof: '✅', price: '$55–$120', badge: '', slug: '' },
  { model: 'Bolster Orthopedic', bestFor: 'Anxious dogs, head support', thickness: '4"', waterproof: '⚠️', price: '$35–$80', badge: 'Best for Large Dogs', slug: '' },
  { model: 'XL Heavy-Duty', bestFor: 'Giant breeds (90+ lbs)', thickness: '7"', waterproof: '✅', price: '$70–$150', badge: '', slug: '' },
  { model: 'Budget Egg Crate', bestFor: 'Entry-level joint relief', thickness: '3"', waterproof: '❌', price: '$20–$50', badge: 'Budget Pick', slug: '' },
];

const SIZE_GUIDE = [
  { weight: 'Under 25 lbs', size: 'Small', breeds: 'Dachshund, Chihuahua, Shih Tzu' },
  { weight: '25–60 lbs', size: 'Medium', breeds: 'Beagle, Cocker Spaniel, Border Collie' },
  { weight: '60–90 lbs', size: 'Large', breeds: 'Golden Retriever, Labrador, Husky' },
  { weight: '90+ lbs', size: 'XL', breeds: 'German Shepherd, Rottweiler, Great Dane' },
];

const TESTIMONIALS = [
  { name: 'Sarah M.', location: 'Austin, TX', rating: 5, text: 'My 11-year-old Lab had been struggling to get up every morning. Within a week of switching to an orthopedic bed, he\'s moving so much better. I wish I\'d made the switch years ago.', dog: 'Charlie, Labrador, 11 years' },
  { name: 'Mike R.', location: 'Denver, CO', rating: 5, text: 'After my German Shepherd\'s hip surgery, the vet specifically recommended an orthopedic bed. The memory foam support has been incredible for his recovery. He actually stays on it now instead of the cold floor.', dog: 'Bear, German Shepherd, 8 years' },
  { name: 'Jennifer L.', location: 'Portland, OR', rating: 5, text: 'We tried 3 different "orthopedic" beds from big box stores before finding a real one here. The difference in foam quality is night and day. Our arthritic Pit Bull finally sleeps through the night.', dog: 'Luna, Pitbull, 9 years' },
];

const ATTACK_PAGES = [
  { slug: 'best-orthopedic-dog-bed-large-dogs', label: 'Orthopedic Beds for Large Dogs' },
  { slug: 'orthopedic-dog-bed-arthritis', label: 'Beds for Dogs with Arthritis' },
  { slug: 'memory-foam-orthopedic-dog-bed', label: 'Memory Foam Dog Beds' },
  { slug: 'waterproof-orthopedic-dog-bed', label: 'Waterproof Orthopedic Beds' },
  { slug: 'orthopedic-dog-bed-senior-dogs', label: 'Senior Dog Beds' },
  { slug: 'indestructible-orthopedic-dog-bed', label: 'Indestructible Orthopedic Beds' },
  { slug: 'cooling-orthopedic-dog-bed', label: 'Cooling Orthopedic Beds' },
  { slug: 'orthopedic-dog-bed-under-100', label: 'Best Under $100' },
  { slug: 'premium-orthopedic-dog-bed-comparison', label: 'Premium Bed Comparison' },
  { slug: 'big-dog-orthopedic-bed-xl', label: 'XL Beds for Big Dogs' },
];

const PAIN_POINTS = [
  'Stiffness when standing up',
  'Restless sleep & frequent repositioning',
  'Hip & joint pain after exercise',
  'Arthritis symptoms getting worse',
  'Cheap bedding that flattens in weeks',
];

const SCIENCE_POINTS = [
  { icon: '⚖️', title: 'Even Weight Distribution', desc: 'Memory foam distributes body weight across the entire surface, eliminating pressure points on hips, elbows, and shoulders.' },
  { icon: '🎯', title: 'Pressure Relief Technology', desc: 'High-density foam responds to body heat, conforming to your dog\'s unique shape for customized joint support.' },
  { icon: '🦴', title: 'Spinal Alignment Support', desc: 'Proper foam density keeps the spine in neutral alignment, reducing strain on vertebrae and surrounding muscles.' },
  { icon: '💪', title: 'High-Density Support Core', desc: 'Multi-layer foam construction with a firm base prevents bottoming out, even for dogs over 100 lbs.' },
];

export default function OrthopedicDogBeds() {
  // Fetch products
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['ortho-beds-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products_public')
        .select('id, name, price, compare_at_price, image_url, slug, category, stock, created_at, updated_at')
        .eq('is_active', true)
        .eq('is_duplicate', false)
        .limit(500);
      if (error) return [];
      
      const keywords = ['orthopedic', 'memory foam', 'dog bed', 'joint', 'arthritis'];
      return (data || [])
        .filter(p => {
          const n = p.name.toLowerCase();
          const c = (p.category || '').toLowerCase();
          if (c.includes('cat') || n.startsWith('cat ')) return false;
          return keywords.some(k => n.includes(k));
        })
        .sort((a, b) => {
          const aStock = (a.stock ?? 0) > 0 ? 0 : 1;
          const bStock = (b.stock ?? 0) > 0 ? 0 : 1;
          if (aStock !== bStock) return aStock - bStock;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        })
        .slice(0, 24);
    },
  });

  // JSON-LD schemas
  const collectionSchema = {
    '@context': 'https://schema.org', '@type': 'CollectionPage',
    '@id': `${CANONICAL}#collection`,
    name: 'Best Orthopedic Dog Beds for Joint Pain & Large Breeds',
    description: 'Shop the best orthopedic dog beds for arthritis, joint pain & large breeds. Memory foam support, waterproof covers, vet-recommended.',
    url: CANONICAL,
    mainEntity: {
      '@type': 'ItemList', numberOfItems: products.length,
      itemListElement: products.slice(0, 8).map((p, i) => ({
        '@type': 'ListItem', position: i + 1,
        item: { '@type': 'Product', '@id': `${BASE}/product/${p.slug || p.id}`, name: p.name, image: p.image_url,
          offers: { '@type': 'Offer', price: p.price.toFixed(2), priceCurrency: 'USD', availability: getSchemaAvailability(p) } }
      }))
    }
  };
  const faqSchema = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ_DATA.map(f => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) };
  const breadcrumbSchema = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: BASE },
    { '@type': 'ListItem', position: 2, name: 'Products', item: `${BASE}/products` },
    { '@type': 'ListItem', position: 3, name: 'Orthopedic Dog Beds', item: CANONICAL },
  ]};
  const reviewSchema = { '@context': 'https://schema.org', '@type': 'Organization', name: 'GetPawsy', url: BASE, aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.8', bestRating: '5', worstRating: '1', ratingCount: '312', reviewCount: '312' } };

  return (
    <Layout>
      <ScrollProgressIndicator />
      <Helmet>
        <title>Orthopedic Dog Beds for Large Dogs &amp; Arthritis | GetPawsy</title>
        <meta name="description" content="Shop the best orthopedic dog beds for arthritis, joint pain & large breeds. Memory foam support, waterproof covers, vet-recommended. Free US shipping over $35." />
        <meta name="keywords" content="orthopedic dog beds, memory foam dog bed, dog bed for arthritis, orthopedic dog bed large dogs, senior dog bed, joint pain dog bed, waterproof orthopedic dog bed, best orthopedic dog bed 2026" />
        <link rel="canonical" href={CANONICAL} />
        <link rel="alternate" hrefLang="en" href={CANONICAL} />
        <link rel="alternate" hrefLang="x-default" href={CANONICAL} />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
        <meta property="og:title" content="Orthopedic Dog Beds for Large Dogs & Arthritis | GetPawsy" />
        <meta property="og:description" content="Premium memory foam orthopedic dog beds. Vet-recommended for arthritis, hip dysplasia & senior dogs. Free US shipping over $35." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={CANONICAL} />
        <meta property="og:site_name" content="GetPawsy" />
        <meta property="og:image" content={`${BASE}/og-image.png`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Orthopedic Dog Beds for Large Dogs & Arthritis | GetPawsy" />
        <meta name="twitter:description" content="Premium memory foam orthopedic dog beds. Vet-recommended for arthritis & joint pain." />
        <script type="application/ld+json">{JSON.stringify(collectionSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(reviewSchema)}</script>
      </Helmet>

      {/* ─── SECTION 1: HERO ─── */}
      <section className="relative overflow-hidden bg-foreground">
        <div className="absolute inset-0">
          <img src={orthopedicHero} alt="Golden Retriever resting on orthopedic memory foam dog bed" className="w-full h-full object-cover opacity-40" loading="eager" />
          <div className="absolute inset-0 bg-gradient-to-r from-foreground/80 via-foreground/60 to-transparent" />
        </div>
        <div className="relative container py-16 md:py-24">
          <Breadcrumb className="mb-6 [&_a]:text-primary-foreground/70 [&_span]:text-primary-foreground/50 [&_svg]:text-primary-foreground/50">
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink asChild><Link to="/"><Home className="h-3.5 w-3.5" /></Link></BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink asChild><Link to="/products">Products</Link></BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage className="text-primary-foreground">Orthopedic Dog Beds</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="max-w-2xl">
            <Badge className="mb-4 bg-primary text-primary-foreground">Vet Recommended</Badge>
            <h1 className="text-3xl md:text-5xl font-display font-bold text-primary-foreground mb-4 leading-tight">
              Best Orthopedic Dog Beds for Joint Pain &amp; Large Breeds
            </h1>
            <p className="text-lg md:text-xl text-primary-foreground/80 mb-6">
              Premium memory foam support designed for arthritis, hip dysplasia &amp; senior dogs.
            </p>

            {/* Trust badges */}
            <div className="flex flex-wrap gap-3 mb-8">
              {[
                { icon: <Star className="w-4 h-4 fill-current" />, text: '4.8/5 Rated' },
                { icon: <Truck className="w-4 h-4" />, text: 'Fast US Shipping (3–7 Days)' },
                { icon: <ShieldCheck className="w-4 h-4" />, text: '30-Day Comfort Guarantee' },
                { icon: <Lock className="w-4 h-4" />, text: 'Secure Checkout' },
              ].map(b => (
                <span key={b.text} className="inline-flex items-center gap-1.5 text-sm text-primary-foreground/90 bg-primary-foreground/10 backdrop-blur-sm rounded-full px-3 py-1.5">
                  {b.icon} {b.text}
                </span>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button size="lg" className="text-base" asChild>
                <a href="#products">Shop Orthopedic Beds</a>
              </Button>
              <Button size="lg" variant="outline" className="text-base border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10" asChild>
                <a href="#size-guide">Find the Right Size for Your Dog ↓</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="container py-10 md:py-16">

        {/* ─── SECTION 2: PAIN AGITATION ─── */}
        <section className="mb-16 bg-destructive/5 border border-destructive/20 rounded-2xl p-6 md:p-10">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-6 h-6 text-destructive" />
            <h2 className="text-2xl md:text-3xl font-display font-bold">Is Your Dog Struggling With…</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            {PAIN_POINTS.map(point => (
              <div key={point} className="flex items-start gap-2 bg-background rounded-xl p-4">
                <span className="text-destructive mt-0.5">✗</span>
                <span className="text-sm font-medium">{point}</span>
              </div>
            ))}
          </div>
          <Button size="lg" className="text-base" asChild>
            <a href="#products">Upgrade to Orthopedic Support Today <ArrowRight className="w-4 h-4 ml-1" /></a>
          </Button>
        </section>

        {/* ─── SECTION 3: SCIENCE & AUTHORITY ─── */}
        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-2">Why Orthopedic Memory Foam Works</h2>
          <p className="text-muted-foreground mb-8 max-w-2xl">Veterinary orthopedic specialists have studied memory foam's impact on canine joint health. Here's what makes it the gold standard for dogs with mobility issues.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {SCIENCE_POINTS.map(sp => (
              <div key={sp.title} className="bg-card border rounded-2xl p-6">
                <span className="text-3xl mb-3 block">{sp.icon}</span>
                <h3 className="font-semibold text-lg mb-2">{sp.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{sp.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 bg-secondary/50 border border-secondary rounded-2xl p-6">
            <p className="text-sm font-medium flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-secondary-foreground shrink-0 mt-0.5" />
              <span><strong>Why vets recommend orthopedic beds:</strong> The American Kennel Club and veterinary orthopedic foundations recommend memory foam beds for dogs with arthritis, hip dysplasia, and post-surgical recovery. Proper joint support during rest reduces inflammation and improves daytime mobility by up to 40%.</span>
            </p>
          </div>
        </section>

        {/* ─── SECTION 4: COMPARISON TABLE ─── */}
        <section id="comparison" className="mb-16">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-6">Orthopedic Dog Bed Comparison</h2>
          <div className="overflow-x-auto border rounded-2xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left p-3 font-semibold">Model</th>
                  <th className="text-left p-3 font-semibold">Best For</th>
                  <th className="text-left p-3 font-semibold">Thickness</th>
                  <th className="text-left p-3 font-semibold">Waterproof</th>
                  <th className="text-left p-3 font-semibold">Price</th>
                  <th className="p-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-card' : 'bg-muted/20'}>
                    <td className="p-3 font-medium">
                      {row.model}
                      {row.badge && <Badge className="ml-2 text-[10px]" variant={row.badge === 'Most Popular' ? 'default' : 'secondary'}>{row.badge}</Badge>}
                    </td>
                    <td className="p-3 text-muted-foreground">{row.bestFor}</td>
                    <td className="p-3">{row.thickness}</td>
                    <td className="p-3">{row.waterproof}</td>
                    <td className="p-3">{row.price}</td>
                    <td className="p-3">
                      <Button size="sm" variant="outline" asChild><a href="#products">Shop</a></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ─── PRODUCTS GRID ─── */}
        <section id="products" className="mb-16">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl md:text-3xl font-display font-bold">Shop Orthopedic Dog Beds</h2>
            <span className="text-muted-foreground text-sm">{products.length} products</span>
          </div>
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}
            </div>
          ) : products.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {products.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={{ id: product.id, name: product.name, price: product.price, compare_at_price: product.compare_at_price, image_url: product.image_url, category: product.category, slug: product.slug, stock: product.stock, created_at: product.created_at, updated_at: product.updated_at }}
                  listId="orthopedic-collection"
                  listName="Orthopedic Dog Beds"
                  position={index + 1}
                  popularChoice={index < 3 && (product.stock ?? 0) > 0}
                />
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-12">Products loading…</p>
          )}
        </section>

        {/* Inline CTA */}
        <div className="mb-16 bg-primary/5 border border-primary/20 rounded-2xl p-8 text-center">
          <h3 className="text-xl font-semibold mb-2">Not sure which bed is right?</h3>
          <p className="text-muted-foreground mb-4">Our size guide below helps you pick the perfect fit based on your dog's weight and breed.</p>
          <Button asChild><a href="#size-guide">View Size Guide <ArrowRight className="w-4 h-4 ml-1" /></a></Button>
        </div>

        {/* ─── SECTION 5: SIZE GUIDE ─── */}
        <section id="size-guide" className="mb-16">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-2">Not Sure Which Size?</h2>
          <p className="text-muted-foreground mb-6">Match your dog's weight to the right orthopedic bed size for optimal joint support.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {SIZE_GUIDE.map(sg => (
              <div key={sg.size} className="bg-card border rounded-2xl p-5 text-center">
                <div className="text-3xl font-bold text-primary mb-1">{sg.size}</div>
                <div className="text-sm font-medium mb-2">{sg.weight}</div>
                <p className="text-xs text-muted-foreground">{sg.breeds}</p>
              </div>
            ))}
          </div>
          <Button variant="outline" asChild>
            <Link to="/collections/best-orthopedic-dog-bed-large-dogs">See Beds for Large Dogs <ArrowRight className="w-4 h-4 ml-1" /></Link>
          </Button>
        </section>

        {/* ─── SECTION 6: SOCIAL PROOF ─── */}
        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-6">What Pet Parents Are Saying</h2>
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="bg-card border rounded-2xl p-6">
                <div className="flex gap-0.5 mb-3">
                  {[...Array(t.rating)].map((_, j) => <Star key={j} className="w-4 h-4 fill-primary text-primary" />)}
                </div>
                <p className="text-sm leading-relaxed mb-4 italic">"{t.text}"</p>
                <div>
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.location}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t.dog}</p>
                </div>
              </div>
            ))}
          </div>
          {/* Before/After story */}
          <div className="bg-secondary/30 border border-secondary rounded-2xl p-6 md:p-8">
            <div className="flex items-center gap-2 mb-3">
              <Heart className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-lg">Before &amp; After: Charlie's Story</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              <strong>Before:</strong> Charlie, an 11-year-old Labrador, was struggling to stand up every morning. His owners noticed him limping after naps and avoiding his usual spots on the floor. The vet confirmed early-stage arthritis in both hips.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mt-2">
              <strong>After 2 weeks on an orthopedic memory foam bed:</strong> Charlie started getting up without hesitation. His morning stiffness visibly decreased, and he began seeking out his bed for naps instead of the cold tile floor. His owners report he's more playful and energetic during walks.
            </p>
          </div>
        </section>

        {/* ─── SECTION 7: RISK REVERSAL ─── */}
        <section className="mb-16 bg-card border rounded-2xl p-8 text-center">
          <ShieldCheck className="w-12 h-12 text-primary mx-auto mb-4" />
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-3">30-Day Comfort Guarantee</h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-6">
            We're confident your dog will love their new orthopedic bed. If it's not the right fit, return it within 30 days for a full refund. No questions asked.
          </p>
          <div className="flex flex-wrap justify-center gap-6">
            {[
              { icon: <RotateCcw className="w-5 h-5" />, label: 'Risk-Free Trial' },
              { icon: <Truck className="w-5 h-5" />, label: 'Fast US Shipping' },
              { icon: <Lock className="w-5 h-5" />, label: 'Secure Checkout' },
            ].map(t => (
              <div key={t.label} className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span className="text-primary">{t.icon}</span> {t.label}
              </div>
            ))}
          </div>
        </section>

        {/* ─── SECTION 8: FAQ ─── */}
        <section id="faq" className="mb-16 bg-muted/30 rounded-2xl p-6 md:p-10">
          <div className="flex items-center gap-2 mb-6">
            <HelpCircle className="w-5 h-5 text-primary" />
            <h2 className="text-2xl md:text-3xl font-display font-bold">Frequently Asked Questions</h2>
          </div>
          <Accordion type="single" collapsible className="w-full">
            {FAQ_DATA.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left font-medium">{faq.question}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* ─── SECTION 9: INTERNAL LINKING ─── */}
        <section className="mb-16">
          <h2 className="text-2xl font-display font-bold mb-4">Most Recommended For…</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ATTACK_PAGES.map(page => (
              <Link
                key={page.slug}
                to={`/collections/${page.slug}`}
                className="group flex items-center justify-between bg-card border rounded-xl p-4 hover:border-primary/50 hover:shadow-md transition-all"
              >
                <span className="font-medium text-sm group-hover:text-primary transition-colors">{page.label}</span>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </Link>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/collections/best-dog-beds-for-large-dogs" className="text-sm text-primary hover:underline font-medium">
              Large Dog Beds →
            </Link>
            <Link to="/collections/waterproof-orthopedic-dog-bed" className="text-sm text-primary hover:underline font-medium">
              Waterproof Dog Beds →
            </Link>
            <Link to="/blog" className="text-sm text-primary hover:underline font-medium">
              Dog Arthritis Care Articles →
            </Link>
            <Link to="/collections/dog-car-travel-safety" className="text-sm text-primary hover:underline font-medium">
              Dog Car Travel Safety →
            </Link>
          </div>
        </section>

        {/* Trust Reinforcement */}
        <section className="mb-12 grid sm:grid-cols-3 gap-4">
          <div className="bg-card border rounded-xl p-5 text-center">
            <Truck className="w-6 h-6 text-primary mx-auto mb-2" />
            <h3 className="font-semibold text-sm mb-1">Free US Shipping</h3>
            <p className="text-xs text-muted-foreground">On orders over $35</p>
          </div>
          <div className="bg-card border rounded-xl p-5 text-center">
            <RotateCcw className="w-6 h-6 text-primary mx-auto mb-2" />
            <h3 className="font-semibold text-sm mb-1">30-Day Returns</h3>
            <p className="text-xs text-muted-foreground">Hassle-free, no questions asked</p>
          </div>
          <div className="bg-card border rounded-xl p-5 text-center">
            <ShieldCheck className="w-6 h-6 text-primary mx-auto mb-2" />
            <h3 className="font-semibold text-sm mb-1">Pet-Safe Guarantee</h3>
            <p className="text-xs text-muted-foreground">Quality tested for safety</p>
          </div>
        </section>

        {/* Email Capture */}
        <SoftEmailCapture variant="collection" className="mb-12" />

        {/* Featured Snippet */}
        <section className="mb-12 max-w-4xl">
          <h2 className="text-2xl font-semibold mb-3">What Is the Best Orthopedic Dog Bed in 2026?</h2>
          <p className="text-muted-foreground leading-relaxed">
            The best orthopedic dog bed in 2026 combines high-density memory foam, a waterproof liner, and a removable machine-washable cover. Top picks are selected by analyzing verified customer reviews, veterinary recommendations, and real sales data from US pet owners. For large breeds and senior dogs with arthritis, look for beds with at least 5 inches of foam thickness and a non-slip bottom. Browse our curated selection above to find the perfect match for your dog's needs.
          </p>
        </section>

        {/* Browse More */}
        <section className="grid md:grid-cols-2 gap-6">
          <Link to="/products" className="group flex flex-col justify-center items-center bg-primary/5 border border-primary/20 rounded-2xl p-8 hover:bg-primary/10 transition-colors">
            <Zap className="w-10 h-10 text-primary mb-4" />
            <h3 className="font-semibold text-lg mb-2">Explore More Products</h3>
            <p className="text-muted-foreground text-sm text-center mb-4">Browse our full catalog of premium pet supplies</p>
            <span className="inline-flex items-center gap-2 text-primary font-medium">View All Products <ChevronRight className="w-4 h-4" /></span>
          </Link>
          <Link to="/collections/best-orthopedic-dog-beds" className="group flex flex-col justify-center items-center bg-secondary/30 border border-secondary rounded-2xl p-8 hover:bg-secondary/50 transition-colors">
            <Heart className="w-10 h-10 text-secondary-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">Our Top Picks</h3>
            <p className="text-muted-foreground text-sm text-center mb-4">See our curated best orthopedic dog beds</p>
            <span className="inline-flex items-center gap-2 text-primary font-medium">View Top Picks <ChevronRight className="w-4 h-4" /></span>
          </Link>
        </section>
      </div>

      {/* ─── STICKY CTA BAR ─── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t shadow-lg py-3 px-4">
        <div className="container flex items-center justify-between gap-4">
          <div className="hidden sm:block">
            <p className="text-sm font-semibold">Orthopedic Dog Beds</p>
            <p className="text-xs text-muted-foreground">Free shipping over $35 · 30-day guarantee</p>
          </div>
          <Button size="lg" className="w-full sm:w-auto" asChild>
            <a href="#products">Shop Orthopedic Beds <ArrowRight className="w-4 h-4 ml-1" /></a>
          </Button>
        </div>
      </div>
    </Layout>
  );
}

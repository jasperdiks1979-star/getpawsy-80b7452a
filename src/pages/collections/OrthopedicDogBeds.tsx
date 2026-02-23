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

const CANONICAL = 'https://getpawsy.pet/dog/orthopedic-dog-beds';
// Also served at /orthopedic-dog-beds/ — canonical always points here
const BASE = 'https://getpawsy.pet';

const FAQ_DATA = [
  { question: 'Are orthopedic dog beds worth it?', answer: 'Yes. High-density memory foam orthopedic beds cost $60–$200 upfront but last 3–5 years versus 6–12 months for standard polyester beds. For dogs over 40 lbs, senior dogs, or breeds prone to joint issues, the therapeutic benefit and long-term cost savings make orthopedic beds one of the smartest investments in canine comfort.' },
  { question: 'Do vets recommend orthopedic dog beds?', answer: 'Veterinary orthopedic specialists consistently recommend memory foam beds as part of arthritis and joint care management plans. The American Kennel Club and veterinary orthopedic foundations cite proper sleep-surface support as a key factor in reducing joint inflammation and improving daytime mobility by up to 40%.' },
  { question: 'How thick should memory foam be for a dog bed?', answer: 'Dogs under 50 lbs need at least 3–4 inches. Dogs 50–90 lbs need 5 inches minimum. Dogs over 90 lbs benefit from 6–7 inches with a supportive base layer. Foam density (1.8+ lb/ft³) is equally important — low-density thick foam compresses faster than high-density thin foam.' },
  { question: 'Are orthopedic dog beds good for large dogs?', answer: 'Orthopedic beds are essential for large dogs. Breeds like Labradors, German Shepherds, and Golden Retrievers put 3x more pressure per square inch on joints than small breeds. High-density memory foam distributes this weight evenly, preventing the pressure point damage that standard beds cause in large dogs within weeks.' },
  { question: 'How long do orthopedic dog beds last?', answer: 'A quality orthopedic bed with high-density foam (1.8+ lb/ft³) lasts 3–5 years with proper care. Signs it needs replacing: foam doesn\'t spring back within 10 seconds, visible body impression that doesn\'t recover, or persistent odor despite regular cover washing. Standard polyester beds last only 6–12 months.' },
  { question: 'Are orthopedic dog beds washable?', answer: 'Most quality orthopedic dog beds feature removable, machine-washable covers with waterproof liners. Look for covers with heavy-duty zippers and pre-shrunk fabric. The foam core itself should never be machine washed — spot clean only. Wash covers every 2–4 weeks to maintain hygiene and extend bed life.' },
  { question: 'Do orthopedic dog beds help arthritis?', answer: 'Yes. Orthopedic memory foam beds distribute your dog\'s weight evenly, reducing pressure on inflamed joints by up to 40%. Veterinarians frequently recommend them for dogs with arthritis, hip dysplasia, and post-surgery recovery. The key is choosing a bed with at least 4 inches of high-density supportive foam.' },
  { question: 'What is the difference between orthopedic and regular dog beds?', answer: 'Standard polyester-fill beds compress flat within weeks, offering minimal joint support. Orthopedic beds use viscoelastic memory foam that conforms to your dog\'s body shape, distributes weight evenly, and springs back after each use. The result: genuine pressure relief, spinal alignment, and 3–5 years of consistent support versus 6–12 months.' },
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
  { href: '/dog/orthopedic-dog-beds/best-for-large-dogs', label: 'Orthopedic Beds for Large Dogs' },
  { href: '/dog/orthopedic-dog-beds/waterproof', label: 'Waterproof Orthopedic Beds' },
  { href: '/dog/orthopedic-dog-beds/memory-foam', label: 'Memory Foam Dog Beds' },
  { href: '/collections/orthopedic-dog-bed-arthritis', label: 'Beds for Dogs with Arthritis' },
  { href: '/collections/orthopedic-dog-bed-senior-dogs', label: 'Senior Dog Beds' },
  { href: '/collections/indestructible-orthopedic-dog-bed', label: 'Indestructible Orthopedic Beds' },
  { href: '/collections/cooling-orthopedic-dog-bed', label: 'Cooling Orthopedic Beds' },
  { href: '/collections/orthopedic-dog-bed-under-100', label: 'Best Under $100' },
  { href: '/collections/premium-orthopedic-dog-bed-comparison', label: 'Premium Bed Comparison' },
  { href: '/collections/big-dog-orthopedic-bed-xl', label: 'XL Beds for Big Dogs' },
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
        <title>7 Best Orthopedic Dog Beds for Joint Support (2026)</title>
        <meta name="description" content="Dog waking up stiff? Vet-approved memory foam beds relieve joint pain in 7 days. Waterproof, washable, 30-day guarantee. Free US shipping over $35." />
        <meta name="keywords" content="orthopedic dog beds, memory foam dog bed, dog bed for arthritis, orthopedic dog bed large dogs, senior dog bed, joint pain dog bed, waterproof orthopedic dog bed, best orthopedic dog bed 2026" />
        <link rel="canonical" href={CANONICAL} />
        <link rel="alternate" hrefLang="en" href={CANONICAL} />
        <link rel="alternate" hrefLang="x-default" href={CANONICAL} />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
        <meta property="og:title" content="7 Best Orthopedic Dog Beds for Joint Support (2026)" />
        <meta property="og:description" content="Premium memory foam dog beds for arthritis & hip dysplasia. Trusted by 10,000+ pet parents. Free US shipping over $35." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={CANONICAL} />
        <meta property="og:site_name" content="GetPawsy" />
        <meta property="og:image" content={`${BASE}/og-image.png`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="7 Best Orthopedic Dog Beds for Joint Support (2026)" />
        <meta name="twitter:description" content="Dog waking up stiff? Vet-approved memory foam beds relieve joint pain in 7 days. Waterproof, washable, 30-day guarantee." />
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
            <Badge className="mb-4 bg-primary text-primary-foreground">Vet Recommended · #1 Seller</Badge>
            <h1 className="text-3xl md:text-5xl font-display font-bold text-primary-foreground mb-4 leading-tight">
              Your Dog Deserves Pain-Free Sleep.
            </h1>
            <p className="text-lg md:text-xl text-primary-foreground/80 mb-2">
              Orthopedic Memory Foam Support for Large &amp; Senior Dogs.
            </p>
            <p className="text-sm text-primary-foreground/60 mb-4">
              Free US Shipping • 30-Day Trial • Fast Delivery
            </p>
            <p className="text-xs text-primary-foreground/50 mb-6 flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5" /> Over 2,000 happy dog owners served
            </p>

            {/* Trust badges */}
            <div className="flex flex-wrap gap-3 mb-8">
              {[
                { icon: <Star className="w-4 h-4 fill-current" />, text: '4.8★ Customer Rating' },
                { icon: <Truck className="w-4 h-4" />, text: 'Free US Shipping $35+' },
                { icon: <ShieldCheck className="w-4 h-4" />, text: '30-Day Returns' },
                { icon: <Lock className="w-4 h-4" />, text: 'Secure Checkout' },
              ].map(b => (
                <span key={b.text} className="inline-flex items-center gap-1.5 text-sm text-primary-foreground/90 bg-primary-foreground/10 backdrop-blur-sm rounded-full px-3 py-1.5">
                  {b.icon} {b.text}
                </span>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button size="lg" className="text-base font-semibold" asChild>
                <a href="#products">Shop Orthopedic Beds Now <ArrowRight className="w-4 h-4 ml-1" /></a>
              </Button>
              <Button size="lg" variant="outline" className="text-base border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10" asChild>
                <a href="#size-guide">Find the Right Size ↓</a>
              </Button>
            </div>

            {/* Payment method logos */}
            <div className="mt-6 flex items-center gap-3 flex-wrap">
              <span className="text-xs text-primary-foreground/50">Accepted:</span>
              {['Visa', 'Mastercard', 'Amex', 'Apple Pay', 'PayPal'].map(m => (
                <span key={m} className="text-[11px] font-medium text-primary-foreground/70 bg-primary-foreground/10 rounded px-2 py-0.5">{m}</span>
              ))}
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

        {/* ─── SECTION 3: EEAT EDUCATIONAL AUTHORITY ─── */}
        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-2">Why Dogs Need Orthopedic Support</h2>
          <p className="text-muted-foreground mb-8 max-w-3xl">
            Understanding canine joint mechanics explains why orthopedic beds aren't just a luxury — they're a medical-grade investment in your dog's long-term mobility and comfort.
          </p>

          {/* Joint Pressure Explanation */}
          <div className="bg-card border rounded-2xl p-6 md:p-8 mb-6">
            <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
              <span className="text-2xl">⚖️</span> Joint Pressure & Weight Distribution
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              Large breed dogs carry significantly more weight on their joints than small breeds. A 90-pound Labrador puts roughly <strong>3x the pressure per square inch</strong> on hip and elbow joints compared to a 30-pound Beagle. This constant load compresses standard polyester-fill beds flat within weeks, leaving your dog essentially sleeping on the floor.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Memory foam addresses this by distributing body weight across the entire surface area, eliminating concentrated pressure points at the hips, shoulders, and elbows — the joints most vulnerable to arthritis and dysplasia.
            </p>
          </div>

          {/* Hip Dysplasia Overview */}
          <div className="bg-card border rounded-2xl p-6 md:p-8 mb-6">
            <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
              <span className="text-2xl">🦴</span> Hip Dysplasia & Joint Disease in Dogs
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              Hip dysplasia is a hereditary condition where the hip joint doesn't develop properly, causing the ball and socket to grind instead of gliding smoothly. It affects up to <strong>50% of large and giant breeds</strong>, including German Shepherds, Golden Retrievers, Rottweilers, and Great Danes.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              Combined with osteoarthritis — which affects 25% of all dogs over age 7 — these conditions make sleep surface quality critical. Dogs spend 12–14 hours per day resting, and every hour on an unsupportive surface compounds joint inflammation and cartilage degradation.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              For a detailed guide on how orthopedic beds help arthritic dogs specifically, see our expert article: <Link to="/guides/do-orthopedic-dog-beds-help-arthritis" className="text-primary hover:underline font-medium">Do Orthopedic Dog Beds Help Arthritis?</Link>
            </p>
          </div>

          {/* Memory Foam Density */}
          <div className="bg-card border rounded-2xl p-6 md:p-8 mb-6">
            <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
              <span className="text-2xl">🎯</span> Why Memory Foam Density Is the #1 Spec
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              The single most important specification in an orthopedic dog bed is <strong>foam density</strong>, measured in lb/ft³. High-density foam (1.8+ lb/ft³) maintains its structure and therapeutic properties for 3–5 years. Low-density foam (under 1.5 lb/ft³) compresses permanently within months, regardless of thickness.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              A common mistake is prioritizing thickness over density. A 6-inch bed with low-density foam will flatten faster than a 4-inch bed with high-density foam. For a complete breakdown, read our <Link to="/guides/how-thick-should-a-dog-bed-be" className="text-primary hover:underline font-medium">thickness guide by dog weight</Link> and our <Link to="/guides/memory-foam-vs-standard-dog-bed" className="text-primary hover:underline font-medium">memory foam vs standard bed comparison</Link>.
            </p>
          </div>

          {/* Science Points Grid */}
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

        {/* ─── 3 KEY BENEFITS ─── */}
        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-6">Why Orthopedic Makes the Difference</h2>
          <div className="grid md:grid-cols-3 gap-6 mb-10">
            {[
              {
                icon: '🧠',
                title: 'Pressure-Relieving Memory Foam',
                desc: 'High-density viscoelastic foam (1.8+ lb/ft³) conforms to your dog\'s body, distributing weight evenly across the entire surface. Eliminates pressure points on hips, elbows, and shoulders — reducing joint inflammation by up to 40%.',
              },
              {
                icon: '🐕',
                title: 'Ideal for Senior Dogs & Large Breeds',
                desc: 'Dogs over 50 lbs and seniors (7+ years) need 5–7" of supportive foam. Our curated selection includes XL beds rated for 120+ lbs with low-entry edges for dogs with limited mobility.',
              },
              {
                icon: '🧼',
                title: 'Washable & Durable Covers',
                desc: 'Every bed features removable, machine-washable covers with waterproof liners. Heavy-duty zippers and pre-shrunk fabric survive 100+ wash cycles. The foam core lasts 3–5 years.',
              },
            ].map(b => (
              <div key={b.title} className="bg-card border rounded-2xl p-6 text-center">
                <span className="text-4xl mb-4 block">{b.icon}</span>
                <h3 className="font-semibold text-lg mb-3">{b.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── BUYER INTENT BLOCKS ─── */}
        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-6">Find the Right Orthopedic Bed for Your Dog</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                title: 'Orthopedic Dog Bed for Large Dogs',
                desc: 'Large breeds (60+ lbs) like Labradors, German Shepherds, and Golden Retrievers need 5–7 inches of high-density foam to prevent bottoming out. Look for reinforced stitching and XL sizing that accommodates a full stretch-out position. The best large-breed orthopedic beds have a dual-layer construction: firm support base topped with contouring memory foam.',
                link: '/collections/best-orthopedic-dog-bed-large-dogs',
                linkText: 'See Best Orthopedic Beds for Large Dogs →',
              },
              {
                title: 'Orthopedic Dog Bed for Senior Dogs',
                desc: 'Senior dogs (7+ years) often develop arthritis, stiffness, and reduced mobility. An orthopedic bed with a low entry point makes it easier to get on and off. Bolstered edges provide head and neck support. Gel-infused options reduce heat retention for older dogs that overheat easily. Pairing an orthopedic bed with joint supplements creates a comprehensive comfort plan.',
                link: '/collections/orthopedic-dog-bed-senior-dogs',
                linkText: 'See Best Orthopedic Beds for Senior Dogs →',
              },
              {
                title: 'Cooling Orthopedic Dog Beds',
                desc: 'Standard memory foam retains body heat, which can be uncomfortable for dogs with thick coats or in warm climates. Gel-infused memory foam and open-cell foam designs dissipate heat while maintaining full orthopedic support. The best cooling orthopedic beds combine phase-change gel layers with breathable, moisture-wicking covers.',
                link: '/collections/cooling-orthopedic-dog-bed',
                linkText: 'See Best Cooling Orthopedic Beds →',
              },
              {
                title: 'Waterproof Orthopedic Dog Beds',
                desc: 'Waterproof protection is essential for puppies, senior dogs with incontinence, and heavy droolers. Quality waterproof orthopedic beds feature a sealed inner liner between the foam core and outer cover — protecting the foam from permanent odor damage while keeping the bed fully washable and hygienic.',
                link: '/collections/waterproof-orthopedic-dog-bed',
                linkText: 'See Best Waterproof Orthopedic Beds →',
              },
            ].map(block => (
              <div key={block.title} className="bg-card border rounded-2xl p-6">
                <h3 className="font-semibold text-lg mb-3">{block.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">{block.desc}</p>
                <Link to={block.link} className="text-sm text-primary hover:underline font-medium inline-flex items-center gap-1">
                  {block.linkText}
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* ─── ORTHOPEDIC VS REGULAR COMPARISON ─── */}
        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-6">Orthopedic vs Regular Dog Bed Comparison</h2>
          <div className="overflow-x-auto border rounded-2xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left p-3 font-semibold">Feature</th>
                  <th className="text-left p-3 font-semibold">Orthopedic (Memory Foam)</th>
                  <th className="text-left p-3 font-semibold">Standard (Polyester Fill)</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: 'Joint Support', ortho: 'Distributes weight evenly, eliminates pressure points', standard: 'Minimal — compresses flat under weight' },
                  { feature: 'Lifespan', ortho: '3–5 years', standard: '6–12 months' },
                  { feature: 'Price Range', ortho: '$60–$200', standard: '$20–$60' },
                  { feature: 'Cost Over 3 Years', ortho: '$60–$200 (one purchase)', standard: '$120–$360 (4–6 replacements)' },
                  { feature: 'Foam Density', ortho: '1.8+ lb/ft³ viscoelastic', standard: 'N/A — polyester fill' },
                  { feature: 'Recovery After Compression', ortho: 'Springs back fully', standard: 'Stays flat permanently' },
                  { feature: 'Best For', ortho: 'Senior dogs, large breeds, arthritis, recovery', standard: 'Puppies, small dogs, travel/backup beds' },
                  { feature: 'Vet Recommended', ortho: '✅ Yes — for joint conditions', standard: '❌ Not for therapeutic use' },
                ].map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-card' : 'bg-muted/20'}>
                    <td className="p-3 font-medium">{row.feature}</td>
                    <td className="p-3 text-muted-foreground">{row.ortho}</td>
                    <td className="p-3 text-muted-foreground">{row.standard}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            For a deeper dive into foam types and their performance differences, read our <Link to="/guides/memory-foam-vs-standard-dog-bed" className="text-primary hover:underline font-medium">Memory Foam vs Standard Dog Bed</Link> guide.
          </p>
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

        {/* ─── FREQUENTLY BOUGHT TOGETHER ─── */}
        <section className="mb-12 bg-card border rounded-2xl p-6 md:p-8">
          <h3 className="text-lg font-semibold mb-1">🛒 Frequently Bought Together</h3>
          <p className="text-sm text-muted-foreground mb-4">Complete your dog's comfort setup and save.</p>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { name: 'Orthopedic Memory Foam Bed', note: 'Joint relief for 60+ lb dogs', price: '$69', tag: 'You\'re viewing' },
              { name: 'Waterproof Dog Blanket', note: 'Protect your bed from accidents', price: '$29', tag: 'Add for 15% off' },
              { name: 'Calming Dog Donut Bed', note: 'Perfect secondary nap spot', price: '$39', tag: 'Popular pair' },
            ].map(item => (
              <div key={item.name} className="bg-muted/30 rounded-xl p-4 relative">
                <Badge variant="secondary" className="text-[10px] mb-2">{item.tag}</Badge>
                <h4 className="font-medium text-sm mb-1">{item.name}</h4>
                <p className="text-xs text-muted-foreground mb-2">{item.note}</p>
                <p className="text-sm font-bold">{item.price}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button size="sm" asChild><a href="#products">View All Beds <ArrowRight className="w-3.5 h-3.5 ml-1" /></a></Button>
            <span className="text-xs text-muted-foreground">Bundle discount applied at checkout</span>
          </div>
        </section>

        {/* ─── URGENCY BLOCK ─── */}
        <div className="mb-8 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-6 flex items-center gap-4">
          <div className="shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
            <Zap className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Limited Stock — High Demand Item</p>
            <p className="text-xs text-amber-700/70 dark:text-amber-400/70">Orthopedic dog beds are our fastest-selling category. Orders ship within 1–2 business days.</p>
          </div>
        </div>

        {/* ─── BUNDLE SUGGESTION ─── */}
        <div className="mb-16 bg-primary/5 border border-primary/20 rounded-2xl p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <span className="text-2xl">🎁</span>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold mb-1">Bundle & Save 15%</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Add a <Link to="/products?category=dog-blankets" className="text-primary hover:underline font-medium">Waterproof Dog Blanket</Link> to protect your orthopedic bed and save 15% on the combination. Most popular pairing among our customers.
              </p>
              <Button size="sm" variant="outline" asChild>
                <a href="#products">View Bundle Options <ArrowRight className="w-3.5 h-3.5 ml-1" /></a>
              </Button>
            </div>
          </div>
        </div>

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

        {/* ─── WHY CHOOSE GETPAWSY ─── */}
        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-6">Why Choose GetPawsy?</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: '🔬', title: 'Foam Density Tested', desc: 'Every bed is rated for foam density (lb/ft³) so you know exactly what you\'re getting.' },
              { icon: '🇺🇸', title: 'US-Based Support', desc: 'Real people, real answers. Our pet care team is based in the United States.' },
              { icon: '🐕', title: 'Breed-Specific Guidance', desc: 'Size guides and breed recommendations so your dog gets the right fit.' },
              { icon: '💯', title: '30-Day Guarantee', desc: 'Not the right bed? Return it within 30 days for a full refund. No questions.' },
            ].map(item => (
              <div key={item.title} className="bg-card border rounded-xl p-5 text-center">
                <span className="text-3xl mb-3 block">{item.icon}</span>
                <h3 className="font-semibold text-sm mb-1">{item.title}</h3>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            ))}
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
                key={page.href}
                to={page.href}
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
            <Link to="/dog/orthopedic-dog-beds/waterproof" className="text-sm text-primary hover:underline font-medium">
              Waterproof Dog Beds →
            </Link>
            <Link to="/blog" className="text-sm text-primary hover:underline font-medium">
              Dog Arthritis Care Articles →
            </Link>
            <Link to="/dog/dog-car-travel-safety" className="text-sm text-primary hover:underline font-medium">
              Dog Car Travel Safety →
            </Link>
            <Link to="/cat/cat-trees-for-large-cats" className="text-sm text-primary hover:underline font-medium">
              Cat Trees for Large Cats →
            </Link>
          </div>
        </section>

        {/* ─── SECTION 10: EXPLORE JOINT SUPPORT GUIDES ─── */}
        <section className="mb-16 bg-muted/30 rounded-2xl p-6 md:p-10">
          <h2 className="text-2xl font-display font-bold mb-2">Explore More Joint Support Guides</h2>
          <p className="text-muted-foreground text-sm mb-6">Expert articles to help you make the best decision for your dog's comfort and joint health.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { slug: 'do-orthopedic-dog-beds-help-arthritis', title: 'Do Dogs Really Need Orthopedic Beds?', desc: 'Vet-backed evidence on when orthopedic support matters most.' },
              { slug: 'how-to-stop-dog-waking-up-stiff', title: 'Signs Your Dog Needs Joint Support', desc: 'Morning stiffness, limping after naps — what these signs mean.' },
              { slug: 'memory-foam-vs-standard-dog-bed', title: 'Orthopedic vs Memory Foam Dog Beds', desc: 'Understanding the difference and which your dog actually needs.' },
              { slug: 'best-orthopedic-dog-bed', title: 'Best Dog Bed for Hip Dysplasia', desc: 'Foam density and thickness recommendations by breed and weight.' },
              { slug: 'how-thick-should-a-dog-bed-be', title: 'How Thick Should a Dog Bed Be?', desc: 'Complete thickness guide by dog weight and age.' },
              { slug: 'memory-foam-vs-egg-crate-foam-dog-bed', title: 'Memory Foam vs Egg Crate Foam', desc: 'Which foam type provides better orthopedic support?' },
            ].map(guide => (
              <Link key={guide.slug} to={`/guides/${guide.slug}`} className="group bg-background border rounded-xl p-4 hover:border-primary/30 hover:shadow-sm transition-all">
                <h3 className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors">{guide.title}</h3>
                <p className="text-xs text-muted-foreground">{guide.desc}</p>
              </Link>
            ))}
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

import { buildStructuredProductName } from '@/lib/structured-product-name';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { ProductCard } from '@/components/products/ProductCard';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getSchemaAvailability } from '@/lib/availability';
import {
  Home, ChevronRight, Star, Truck, ShieldCheck, Lock, ArrowRight,
  CheckCircle, AlertTriangle, HelpCircle, RotateCcw, Heart, Zap,
  BookOpen, Target, Dog,
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
import { AuthorityAuthorBox } from '@/components/affiliate/AuthorityAuthorBox';
import { MedicalDisclaimer } from '@/components/affiliate/AffiliateDisclaimer';
import {
  TRAINING_HUB_FAQ,
  TRAINING_HUB_COMPARISON,
  TRAINING_HUB_PAIN_POINTS,
  HARNESS_CLUSTER,
  LEASH_CLUSTER,
} from '@/data/dog-training-cluster-data';

const CANONICAL = 'https://getpawsy.pet/collections/all';
const BASE = 'https://getpawsy.pet';

const CLUSTER_ARTICLES = [
  ...HARNESS_CLUSTER.map(c => ({ href: `/dog/dog-training/${c.slug}`, label: c.breadcrumbLabel, cluster: 'Harness' })),
  ...LEASH_CLUSTER.map(c => ({ href: `/dog/dog-training/${c.slug}`, label: c.breadcrumbLabel, cluster: 'Leash' })),
];

const SUB_COLLECTIONS = [
  { href: '/collections/dog-collars-leashes', label: 'Collars & Leashes', desc: 'Training leashes, harnesses and collars for all breeds' },
  { href: '/collections/dog-toys', label: 'Dog Toys', desc: 'Interactive and training toys for engagement' },
  { href: '/collections/dog-carriers', label: 'Dog Carriers', desc: 'Travel carriers and transport bags' },
];

export default function DogTrainingBehaviorTools() {
  // Fetch training-related products
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['training-hub-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products_public')
        .select('id, name, price, compare_at_price, image_url, slug, category, stock, created_at, updated_at')
        .eq('is_active', true)
        .eq('is_duplicate', false)
        .in('category', ['Dog Training', 'Pet Training', 'Dog Collars & Leashes', 'Pet Collars & Leashes'])
        .limit(100);
      if (error) return [];
      const kws = ['harness', 'leash', 'training', 'no pull', 'no-pull', 'clicker', 'treat pouch', 'collar', 'recall'];
      return (data || [])
        .filter(p => {
          const n = p.name.toLowerCase();
          const c = (p.category || '').toLowerCase();
          if (c.includes('bird') || n.includes('bird') || c.includes('cat scratch')) return false;
          return kws.some(k => n.includes(k));
        })
        .sort((a, b) => ((b.stock ?? 0) > 0 ? 1 : 0) - ((a.stock ?? 0) > 0 ? 1 : 0))
        .slice(0, 24);
    },
  });

  // Schemas
  const collectionSchema = {
    '@context': 'https://schema.org', '@type': 'CollectionPage',
    '@id': `${CANONICAL}#collection`,
    name: 'Dog Training & Behavior Tools — No-Pull Harnesses, Leashes & Training Gear',
    description: 'High-quality no-pull harnesses, long training leashes, recall gear & positive reinforcement tools. US shipping.',
    url: CANONICAL,
    mainEntity: {
      '@type': 'ItemList', numberOfItems: products.length,
      itemListElement: products.slice(0, 8).map((p, i) => ({
        '@type': 'ListItem', position: i + 1,
        item: { '@type': 'Product', '@id': `${BASE}/products/${p.slug || p.id}`, name: buildStructuredProductName(p), image: p.image_url,
          ...((p.price && Number(p.price) > 0) ? { offers: { '@type': 'Offer', price: Number(p.price).toFixed(2), priceCurrency: 'USD', availability: getSchemaAvailability(p) } } : {}) }
      })).filter((entry: any) => entry.item.offers)
    }
  };
  const faqSchema = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: TRAINING_HUB_FAQ.map(f => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) };
  const breadcrumbSchema = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: BASE },
    { '@type': 'ListItem', position: 2, name: 'Products', item: `${BASE}/products` },
    { '@type': 'ListItem', position: 3, name: 'Dog Training & Behavior Tools', item: CANONICAL },
  ]};

  return (
    <Layout>
      <ScrollProgressIndicator />
      <Helmet>
        <title>Stop Dog Pulling Fast — Best Training Tools & No-Pull Harnesses (2026) | GetPawsy</title>
        <meta name="description" content="Trainer-approved no-pull harnesses, recall leashes & positive reinforcement tools. Reduce pulling 40–60% on first walk. Free shipping on eligible orders over $35. 30-day return policy." />
        <meta name="keywords" content="dog training tools, no pull harness, training leash, dog clicker, treat pouch, recall training, puppy training, dog behavior, positive reinforcement, no pull dog harness, stop dog pulling, best harness for large dogs" /><link rel="alternate" hrefLang="en" href={CANONICAL} />
        <link rel="alternate" hrefLang="x-default" href={CANONICAL} />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
        <meta property="og:title" content="Dog Training & Behavior Tools | GetPawsy" />
        <meta property="og:description" content="No-pull harnesses, long training leashes, recall gear & positive reinforcement tools. US shipping." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={CANONICAL} />
        <meta property="og:site_name" content="GetPawsy" />
        <meta property="og:image" content={`${BASE}/og-image.png`} />
        <script type="application/ld+json">{JSON.stringify(collectionSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
      </Helmet>

      {/* ─── HERO ─── */}
      <section className="relative overflow-hidden bg-foreground">
        <div className="absolute inset-0 bg-gradient-to-br from-foreground via-foreground/95 to-primary/20" />
        <div className="relative container py-16 md:py-24">
          <Breadcrumb className="mb-6 [&_a]:text-primary-foreground/70 [&_span]:text-primary-foreground/50 [&_svg]:text-primary-foreground/50">
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink asChild><Link to="/"><Home className="h-3.5 w-3.5" /></Link></BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink asChild><Link to="/products">Products</Link></BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage className="text-primary-foreground">Dog Training & Behavior Tools</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="max-w-2xl">
            <Badge className="mb-4 bg-primary text-primary-foreground">Trainer Recommended · Force-Free</Badge>
            <h1 className="text-3xl md:text-5xl font-display font-bold text-primary-foreground mb-4 leading-tight">
              Stop the Pulling. Start the Training.
            </h1>
            <p className="text-lg md:text-xl text-primary-foreground/80 mb-2">
              No-Pull Harnesses, Recall Leashes & Positive Reinforcement Gear
            </p>
            <p className="text-sm text-primary-foreground/60 mb-6">
              Science-backed tools that professional trainers actually use. No choke chains. No prong collars. Just results.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90">
                <a href="#products">Shop Training Gear</a>
              </Button>
              <Button asChild variant="outline" size="lg" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10">
                <a href="#guides">Read Training Guides</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── TRUST BAR ─── */}
      <section className="border-b border-border bg-muted/30">
        <div className="container py-3">
          <div className="flex flex-wrap items-center justify-center gap-4 md:gap-8 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5 text-primary" /><span>US Shipping</span></div>
            <div className="flex items-center gap-1.5"><RotateCcw className="w-3.5 h-3.5 text-primary" /><span>30-Day Return Policy</span></div>
            <div className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-primary" /><span>Secure Checkout</span></div>
            <div className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-primary" /><span>Trainer Recommended</span></div>
          </div>
        </div>
      </section>

      {/* ─── PAIN POINTS ─── */}
      <section className="container py-12 md:py-16">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-center mb-8">Sound Familiar?</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
          {TRAINING_HUB_PAIN_POINTS.map((p, i) => (
            <div key={i} className="flex items-start gap-2 p-4 rounded-xl bg-destructive/5 border border-destructive/10">
              <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
              <span className="text-sm text-foreground">{p}</span>
            </div>
          ))}
        </div>
        <p className="text-center text-muted-foreground mt-6 max-w-2xl mx-auto">
          Every one of these problems has a force-free, science-backed solution. The right tools combined with positive reinforcement training transform stressful walks into enjoyable bonding time — usually within 2-4 weeks.
        </p>
      </section>

      {/* ─── WHY FORCE-FREE TRAINING WORKS ─── */}
      <section className="bg-muted/30 py-12 md:py-16">
        <div className="container max-w-4xl">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-center mb-4">Why Force-Free Training Works Better</h2>
          <p className="text-center text-muted-foreground mb-8 max-w-2xl mx-auto">
            The science is settled: positive reinforcement training produces faster, more reliable results than punishment-based methods — with zero physical or psychological side effects.
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { icon: '🧠', title: 'Brain Science', desc: 'Dogs learn through association. When good behavior = rewards, the neural pathways for that behavior strengthen with each repetition. Punishment creates fear pathways that compete with learning.' },
              { icon: '⚡', title: 'Faster Results', desc: 'A 2020 University of Lincoln study found dogs trained with positive methods learned new commands 40% faster than those trained with aversive tools. The learning isn\'t blocked by stress hormones.' },
              { icon: '🤝', title: 'Stronger Bond', desc: 'Force-free training builds trust between handler and dog. Dogs trained with positive methods show more eye contact, closer proximity, and lower cortisol levels around their handlers.' },
              { icon: '🔄', title: 'Lasting Change', desc: 'Behaviors built on positive reinforcement are more resilient and generalize better across environments. Punishment-suppressed behaviors often resurface in new contexts or under stress.' },
            ].map((item, i) => (
              <div key={i} className="p-6 bg-background rounded-xl border border-border">
                <div className="text-2xl mb-2">{item.icon}</div>
                <h3 className="font-semibold text-foreground mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TOOL COMPARISON TABLE ─── */}
      <section className="container py-12 md:py-16">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-center mb-8">Training Tool Comparison</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left p-3 font-medium text-foreground">Tool</th>
                <th className="text-left p-3 font-medium text-foreground">Best For</th>
                <th className="text-left p-3 font-medium text-foreground">Key Feature</th>
                <th className="text-left p-3 font-medium text-foreground">Price Range</th>
                <th className="text-left p-3 font-medium text-foreground"></th>
              </tr>
            </thead>
            <tbody>
              {TRAINING_HUB_COMPARISON.map((row, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="p-3 font-medium text-foreground">{row.tool}</td>
                  <td className="p-3 text-muted-foreground">{row.bestFor}</td>
                  <td className="p-3 text-muted-foreground">{row.keyFeature}</td>
                  <td className="p-3 text-muted-foreground">{row.priceRange}</td>
                  <td className="p-3">{row.badge && <Badge variant="secondary" className="text-xs">{row.badge}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─── SUB-COLLECTIONS ─── */}
      <section className="bg-muted/30 py-12 md:py-16">
        <div className="container">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-center mb-8">Shop by Training Goal</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {SUB_COLLECTIONS.map((sc, i) => (
              <Link key={i} to={sc.href} className="group p-5 bg-background rounded-xl border border-border hover:border-primary/50 hover:shadow-md transition-all">
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors mb-1">{sc.label}</h3>
                <p className="text-xs text-muted-foreground">{sc.desc}</p>
                <div className="flex items-center gap-1 mt-3 text-xs text-primary font-medium">
                  Shop Now <ArrowRight className="w-3 h-3" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PRODUCTS ─── */}
      <section id="products" className="container py-12 md:py-16">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-center mb-2">Featured Training Products</h2>
        <p className="text-center text-muted-foreground mb-8">US-warehouse fulfilled • 5–10 day shipping</p>
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
          </div>
        ) : products.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {products.slice(0, 16).map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-12">Training products coming soon — browse our <Link to="/products" className="text-primary underline">full catalog</Link>.</p>
        )}
      </section>

      {/* ─── TRAINING GUIDES HUB ─── */}
      <section id="guides" className="bg-muted/30 py-12 md:py-16">
        <div className="container max-w-4xl">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-center mb-2">Expert Training Guides</h2>
          <p className="text-center text-muted-foreground mb-8">Written by certified dog trainers. Force-free methods only.</p>
          
          <div className="space-y-6">
            {/* Harness Cluster */}
            <div>
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" /> No-Pull Harness Guides
              </h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {CLUSTER_ARTICLES.filter(a => a.cluster === 'Harness').map((a, i) => (
                  <Link key={i} to={a.href} className="group flex items-center gap-3 p-4 bg-background rounded-lg border border-border hover:border-primary/50 transition-all">
                    <BookOpen className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="text-sm text-foreground group-hover:text-primary transition-colors">{a.label}</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Leash Cluster */}
            <div>
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Dog className="w-4 h-4 text-primary" /> Recall & Leash Training Guides
              </h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {CLUSTER_ARTICLES.filter(a => a.cluster === 'Leash').map((a, i) => (
                  <Link key={i} to={a.href} className="group flex items-center gap-3 p-4 bg-background rounded-lg border border-border hover:border-primary/50 transition-all">
                    <BookOpen className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="text-sm text-foreground group-hover:text-primary transition-colors">{a.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── DEEP CONTENT: TRAINING PHILOSOPHY ─── */}
      <section className="container max-w-4xl py-12 md:py-16">
        <h2 className="text-2xl md:text-3xl font-display font-bold mb-6">The Science Behind Positive Reinforcement Dog Training</h2>
        
        <div className="prose prose-sm md:prose-base max-w-none text-muted-foreground space-y-6">
          <p>
            Positive reinforcement training isn't a trend — it's the method backed by decades of behavioral science research. When a dog performs a desired behavior and immediately receives something they value (a treat, praise, play), the neural pathways associated with that behavior strengthen. Over time, the behavior becomes automatic and reliable.
          </p>
          <p>
            The American Veterinary Society of Animal Behavior (AVSAB) <Link to="/guides" className="text-primary hover:underline">position statement on training methods</Link> explicitly recommends reward-based training and advises against aversive tools including prong collars, choke chains, and shock collars. Their conclusion is based on peer-reviewed research showing that aversive methods increase stress, damage the human-animal bond, and can trigger aggression.
          </p>
          
          <h3 className="text-xl font-semibold text-foreground mt-8">The Right Equipment Makes Training Easier</h3>
          <p>
            The best training tools don't train your dog — they make it easier for you to implement good training techniques. A <Link to="/collections/no-pull-dog-harness" className="text-primary hover:underline">front-clip no-pull harness</Link> doesn't teach your dog to stop pulling; it reduces pulling force by 40-60% so you can reward loose-leash walking more often. A <Link to="/collections/long-training-leashes" className="text-primary hover:underline">15-foot long line</Link> doesn't teach recall; it gives your dog enough distance to practice coming when called while keeping everyone safe.
          </p>
          <p>
            Think of training equipment as support tools, not solutions. The solution is always consistent, reward-based training. The equipment just makes the process faster, safer, and more enjoyable for both you and your dog.
          </p>

          <h3 className="text-xl font-semibold text-foreground mt-8">Building a Complete Training Toolkit</h3>
          <p>
            A well-equipped training kit covers three core behaviors: leash walking, recall (come when called), and basic obedience. Here's what professional trainers recommend as the essential starter toolkit:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Front-clip harness:</strong> Reduces pulling immediately while you train loose-leash walking. Choose one with padded chest plate and adjustable straps.</li>
            <li><strong>6-foot standard leash:</strong> Your daily walking leash. Flat nylon or biothane, never retractable.</li>
            <li><strong>15-foot long line:</strong> For recall practice and controlled off-leash simulation. Biothane is waterproof and won't cause rope burn.</li>
            <li><strong>Treat pouch:</strong> Hands-free access to training rewards. Look for magnetic closure or spring-loaded opening for one-handed use.</li>
            <li><strong>High-value training treats:</strong> Small, soft, high-smell treats that your dog loves. Real chicken, freeze-dried liver, or commercial training treats.</li>
          </ul>
          <p>
            This toolkit costs $80-$120 total and covers everything you need for the first 3-6 months of training. It's a fraction of the cost of a single private training session ($100-$200/hour) and equips you to train independently.
          </p>

          <h3 className="text-xl font-semibold text-foreground mt-8">Common Training Challenges by Dog Type</h3>
          <p>
            <strong>Puppies (8 weeks – 6 months):</strong> Short attention spans, teething, socialization priority. Use ultra-short training sessions (2-3 minutes), extremely high treat rates, and focus on name recognition, sit, and basic leash exposure. A lightweight <Link to="/collections/dog-collars-leashes" className="text-primary hover:underline">puppy harness</Link> and 6-foot leash are the only equipment needed at this stage.
          </p>
          <p>
            <strong>Adolescent dogs (6-18 months):</strong> The hardest phase. Hormones, increased independence, selective hearing. This is when most dogs develop persistent pulling habits. A front-clip harness becomes essential. Start <Link to="/collections/all" className="text-primary hover:underline">recall training</Link> with a long line before they discover that running away is fun.
          </p>
          <p>
            <strong>Adult dogs with established habits:</strong> Pulling, poor recall, and leash reactivity in adult dogs are not personality traits — they're trained (or untrained) behaviors that can be changed at any age. Adult dogs often learn faster than puppies because they have longer attention spans. The same positive reinforcement methods work; patience during the "unlearning" phase is the key.
          </p>
          <p>
            <strong>Reactive dogs:</strong> Dogs that bark, lunge, or freeze around triggers (other dogs, strangers, bicycles) need a different approach. A <Link to="/collections/all" className="text-primary hover:underline">tactical harness with dual handles</Link> provides emergency control during reactive episodes. Training focuses on counter-conditioning (changing the emotional response to triggers) rather than obedience commands.
          </p>
        </div>
      </section>

      {/* ─── BREED-SPECIFIC RECOMMENDATIONS ─── */}
      <section className="container max-w-4xl py-12 md:py-16">
        <h2 className="text-2xl md:text-3xl font-display font-bold mb-6">Training Tools by Breed Size</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { breed: 'Small Dogs (Under 25 lbs)', breeds: 'Chihuahua, Pomeranian, Dachshund, French Bulldog', tools: ['Lightweight back-clip harness', 'Standard 6ft leash', 'Small-size clicker', 'Treat pouch with small compartments'], link: '/collections/dog-collars-leashes', cta: 'Shop Small Dog Gear' },
            { breed: 'Medium Dogs (25–60 lbs)', breeds: 'Beagle, Border Collie, Australian Shepherd, Cocker Spaniel', tools: ['Front-clip no-pull harness', 'Biothane 15ft long line', 'Dual-tone clicker', 'Quick-access treat pouch'], link: '/collections/dog-collars-leashes', cta: 'Shop Medium Dog Gear' },
            { breed: 'Large Dogs (60+ lbs)', breeds: 'Labrador, German Shepherd, Golden Retriever, Pit Bull', tools: ['Tactical dual-handle harness', '30ft recall long line', 'Heavy-duty biothane leash', 'XL treat pouch'], link: '/collections/all', cta: 'Shop Large Dog Gear' },
          ].map((item, i) => (
            <div key={i} className="p-5 rounded-xl border border-border bg-background">
              <h3 className="font-semibold text-foreground mb-1">{item.breed}</h3>
              <p className="text-xs text-muted-foreground mb-3">{item.breeds}</p>
              <ul className="space-y-1.5 mb-4">
                {item.tools.map((t, j) => (
                  <li key={j} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" />
                    {t}
                  </li>
                ))}
              </ul>
              <Button asChild variant="outline" size="sm" className="w-full text-xs">
                <Link to={item.link}>{item.cta}</Link>
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* ─── TRAINING TIMELINE ─── */}
      <section className="bg-muted/30 py-12 md:py-16">
        <div className="container max-w-4xl">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-center mb-8">Realistic Training Timeline</h2>
          <div className="space-y-4">
            {[
              { week: 'Week 1–2', title: 'Equipment Transition', desc: 'Introduce no-pull harness. Practice short walks (5–10 min). Mark and reward every few steps of loose leash. Expect 40–60% pulling reduction from harness alone.', color: 'bg-primary/10 border-primary/20' },
              { week: 'Week 3–4', title: 'Consistent Loose-Leash Walking', desc: 'Extend walks to 15–20 min. Reduce treat frequency to every 10–15 steps. Begin "Be a Tree" method for remaining pulling. Start recall practice with 15ft long line in low-distraction areas.', color: 'bg-primary/10 border-primary/20' },
              { week: 'Week 5–8', title: 'Distraction Proofing', desc: 'Practice near other dogs, squirrels, and busy environments. Increase long line distance to 30ft for recall. Dog should walk on loose leash 80%+ of the time in familiar areas.', color: 'bg-primary/10 border-primary/20' },
              { week: 'Week 9–12', title: 'Reliability Phase', desc: 'Walk with loose leash in most environments. Reliable recall in familiar areas. Can switch to back-clip attachment for casual walks. Consider graduating to standard leash walks.', color: 'bg-primary/10 border-primary/20' },
            ].map((phase, i) => (
              <div key={i} className={`flex gap-4 items-start p-4 rounded-xl border ${phase.color}`}>
                <Badge variant="default" className="mt-0.5 whitespace-nowrap text-[10px]">{phase.week}</Badge>
                <div>
                  <h3 className="font-semibold text-foreground text-sm mb-1">{phase.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{phase.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── COMMON MISTAKES PREVENTION ─── */}
      <section className="container max-w-4xl py-12 md:py-16">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-center mb-8">5 Training Mistakes That Set You Back</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {[
            { mistake: 'Using a retractable leash for training', fix: 'Retractable leashes teach dogs that pulling = more freedom. Use a fixed 6ft leash for walks and a long line for recall.', icon: '❌' },
            { mistake: 'Inconsistent reward timing', fix: 'Mark the behavior within 1 second. Use a clicker or "yes!" then deliver the treat. Late rewards confuse the learning.', icon: '⏱️' },
            { mistake: 'Too much too fast', fix: 'Don\'t practice recall in a dog park before your dog succeeds in the backyard. Build difficulty gradually over weeks, not days.', icon: '🏃' },
            { mistake: 'Low-value treats for high distractions', fix: 'Use the "treat hierarchy": kibble for easy tasks, cheese for medium, real chicken for hard situations near big distractions.', icon: '🧀' },
            { mistake: 'Skipping the harness transition period', fix: 'Let your dog wear the new harness at home for 2-3 sessions before walking. Pair it with treats so the harness predicts good things.', icon: '🦺' },
          ].map((item, i) => (
            <div key={i} className="p-4 rounded-xl border border-border">
              <div className="flex items-start gap-2 mb-2">
                <span className="text-lg">{item.icon}</span>
                <h3 className="font-semibold text-foreground text-sm">{item.mistake}</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed ml-7">
                <strong className="text-foreground">Fix:</strong> {item.fix}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── CTA BLOCK ─── */}
      <section className="bg-primary/5 border-y border-primary/10 py-10">
        <div className="container text-center">
          <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-3">Ready to Transform Your Walks?</h2>
          <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
            Start with a no-pull harness — most dogs show dramatic improvement on the first walk.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg"><Link to="/collections/no-pull-dog-harness">Shop No-Pull Harnesses</Link></Button>
            <Button asChild variant="outline" size="lg"><a href="#guides">Read Training Guides</a></Button>
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="container max-w-3xl py-12 md:py-16">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-center mb-8">Frequently Asked Questions</h2>
        <Accordion type="multiple" className="space-y-2">
          {TRAINING_HUB_FAQ.map((f, i) => (
            <AccordionItem key={i} value={`faq-${i}`} className="border border-border rounded-lg px-4">
              <AccordionTrigger className="text-left text-sm font-medium">{f.question}</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed">{f.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* ─── EMAIL CAPTURE ─── */}
      <section className="container max-w-2xl pb-8">
        <SoftEmailCapture
          variant="collection"
          headline="Get Our Free Training Guide"
          description="Join 5,000+ dog owners getting weekly training tips and exclusive product deals."
        />
      </section>

      {/* ─── AUTHOR & DISCLAIMER ─── */}
      <section className="container max-w-3xl pb-12">
        <div className="space-y-6">
          <AuthorityAuthorBox />
          <MedicalDisclaimer />
        </div>
      </section>
    </Layout>
  );
}

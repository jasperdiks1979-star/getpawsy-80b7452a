import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { BookOpen, ArrowRight, Sparkles, PawPrint, Shield, Award, CheckCircle } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const BASE_URL = 'https://getpawsy.pet';

/**
 * SEO Hub Page: /pet-care-guides
 * Central topical authority page linking to all cornerstone guides and topic clusters.
 * 2000+ words of substantive educational content for topical authority.
 */

interface TopicCluster {
  id: string;
  label: string;
  icon: string;
  description: string;
  seoIntro: string;
  cornerstoneGuide: { slug: string; title: string; excerpt: string };
  clusterGuides: { slug: string; title: string }[];
  collectionLink?: { href: string; label: string };
}

const TOPIC_CLUSTERS: TopicCluster[] = [
  {
    id: 'dog-training',
    label: 'Dog Training',
    icon: '🐕',
    description: 'Expert-reviewed tools and guides for dog training, behavior correction, leash training, and obedience.',
    seoIntro: 'Effective dog training starts with understanding your dog\'s natural behavior and using the right tools. Whether you\'re dealing with a puppy who hasn\'t learned basic commands or an adult dog with stubborn habits like excessive barking, pulling on the leash, or ignoring recall, our training guides provide step-by-step methods backed by professional trainers and veterinary behaviorists. We cover positive reinforcement techniques, the proper use of training collars and harnesses, and age-appropriate training schedules that set your dog up for lifelong success.',
    cornerstoneGuide: {
      slug: 'complete-dog-training-guide-2026',
      title: 'The Complete Dog Training Guide (2026) – Stop Pulling, Barking & Bad Habits',
      excerpt: 'Comprehensive dog training guide covering leash manners, barking, potty training, and positive reinforcement methods.',
    },
    clusterGuides: [
      { slug: 'best-dog-training-collar', title: 'Best Dog Training Collar' },
      { slug: 'dog-leash-control-guide', title: 'Dog Leash Control Guide' },
      { slug: 'dog-behavior-training-guide', title: 'Dog Behavior Training Guide' },
      { slug: 'best-no-pull-dog-harness-2026', title: 'Best No-Pull Dog Harness' },
      { slug: 'best-dog-training-leash-for-pullers', title: 'Best Dog Training Leash for Pullers' },
      { slug: 'puppy-training-first-30-days', title: 'Puppy Training: First 30 Days' },
      { slug: 'how-to-stop-dog-barking-guide', title: 'How to Stop Dog Barking' },
      { slug: 'dog-potty-training-complete-guide', title: 'Dog Potty Training Complete Guide' },
      { slug: 'leash-training-dog-step-by-step', title: 'Leash Training Step-by-Step' },
      { slug: 'best-anti-bark-training-methods', title: 'Best Anti-Bark Training Methods' },
    ],
    collectionLink: { href: '/collections/dog-training-tools', label: 'Shop Training Tools' },
  },
  {
    id: 'dog-travel',
    label: 'Dog Travel Safety',
    icon: '🚗',
    description: 'Safety-tested car seats, carriers, and travel gear to protect your dog on every journey.',
    seoIntro: 'Traveling with your dog — whether a short drive to the vet or a cross-country road trip — requires the right safety equipment. Unrestrained dogs are at serious risk during sudden stops, and many states now require pet restraint systems in vehicles. Our travel safety guides cover crash-tested car seats, safety-rated harnesses, airline-approved carriers, and practical tips for reducing travel anxiety. Every product recommendation is evaluated based on safety certifications, real crash test data, and veterinarian input.',
    cornerstoneGuide: {
      slug: 'dog-travel-safety-guide',
      title: 'Dog Travel Safety Guide (2026) – Car Seats, Harnesses & Tips',
      excerpt: 'Complete guide to safe dog travel by car and plane — crash-tested car seats, safety harnesses & expert tips.',
    },
    clusterGuides: [
      { slug: 'best-dog-car-seat', title: 'Best Dog Car Seats' },
      { slug: 'traveling-with-dogs-tips', title: 'Traveling With Dogs Tips' },
      { slug: 'dog-travel-safety-equipment-guide', title: 'Dog Travel Safety Equipment' },
      { slug: 'dog-car-harness-guide', title: 'Dog Car Harness Guide' },
      { slug: 'crash-tested-dog-car-seat-guide', title: 'Crash-Tested Dog Car Seat Guide' },
      { slug: 'dog-booster-seat-vs-car-hammock', title: 'Booster Seat vs Car Hammock' },
    ],
    collectionLink: { href: '/collections/dog-travel-accessories', label: 'Shop Travel Gear' },
  },
  {
    id: 'dog-grooming',
    label: 'Dog Grooming',
    icon: '✂️',
    description: 'Brushes, nail trimmers, shampoos & grooming techniques for a healthy, happy dog.',
    seoIntro: 'Regular grooming is essential for your dog\'s health — it\'s not just about keeping their coat clean. Proper grooming prevents skin infections, reduces shedding by up to 80%, allows you to spot lumps or parasites early, and strengthens the bond between you and your pet. Our grooming guides cover everything from choosing the right brush for your dog\'s coat type (smooth, double, wire, or curly) to safe nail trimming techniques and selecting shampoos that won\'t irritate sensitive skin. We test products across multiple breeds and coat conditions to give you honest, practical recommendations.',
    cornerstoneGuide: {
      slug: 'dog-grooming-tools-guide',
      title: 'Dog Grooming Tools Guide (2026) – Brushes, Clippers & Kits',
      excerpt: 'Complete guide to dog grooming at home — brushes, nail clippers, shampoos & coat care techniques.',
    },
    clusterGuides: [
      { slug: 'dog-grooming-essentials', title: 'Dog Grooming Essentials' },
      { slug: 'best-dog-brushes-by-coat-type', title: 'Best Dog Brushes by Coat Type' },
      { slug: 'dog-nail-trimming-guide', title: 'Dog Nail Trimming Guide' },
      { slug: 'best-dog-shampoo-guide', title: 'Best Dog Shampoo Guide' },
      { slug: 'dog-shedding-control-guide', title: 'Dog Shedding Control Guide' },
      { slug: 'how-often-groom-dog', title: 'How Often Should You Groom Your Dog?' },
    ],
    collectionLink: { href: '/collections/dogs', label: 'Shop Dog Products' },
  },
  {
    id: 'cat-litter',
    label: 'Cat Litter Solutions',
    icon: '🧹',
    description: 'Expert guides on choosing, maintaining, and optimizing cat litter boxes for odor control and multi-cat homes.',
    seoIntro: 'The litter box is the single most important piece of equipment for indoor cat owners, yet it\'s the most common source of frustration. Odor problems, litter tracking, and cats refusing to use the box are issues that stem from choosing the wrong box, placing it incorrectly, or using the wrong type of litter. Our cat litter guides cover the science behind odor control, the N+1 rule for multi-cat homes, self-cleaning vs. traditional box trade-offs, and placement strategies that encourage consistent use. We test litter boxes in real homes with real cats to provide recommendations you can trust.',
    cornerstoneGuide: {
      slug: 'cat-litter-solutions-guide',
      title: 'Cat Litter Solutions Guide (2026) – Best Boxes, Odor Control & Tips',
      excerpt: 'Complete guide to cat litter boxes, odor control, and setup for single and multi-cat homes.',
    },
    clusterGuides: [
      { slug: 'best-cat-litter-box-2026', title: 'Best Cat Litter Boxes 2026' },
      { slug: 'best-self-cleaning-litter-box-2026', title: 'Best Self-Cleaning Litter Boxes' },
      { slug: 'how-to-stop-cat-litter-smell', title: 'How to Stop Cat Litter Smell' },
      { slug: 'how-many-litter-boxes-per-cat', title: 'How Many Litter Boxes Per Cat?' },
      { slug: 'best-litter-box-for-multiple-cats', title: 'Best Litter Box for Multiple Cats' },
      { slug: 'litter-box-placement-guide', title: 'Litter Box Placement Guide' },
      { slug: 'covered-vs-open-litter-box', title: 'Covered vs Open Litter Box' },
      { slug: 'best-litter-boxes-apartments-2026', title: 'Best Litter Boxes for Apartments' },
    ],
    collectionLink: { href: '/collections/cat-litter-boxes', label: 'Shop Litter Boxes' },
  },
  {
    id: 'cat-toys',
    label: 'Cat Toys & Enrichment',
    icon: '🐱',
    description: 'Interactive, puzzle, and enrichment toys to keep indoor cats stimulated, happy, and mentally sharp.',
    seoIntro: 'Indoor cats need daily mental and physical stimulation to prevent boredom, obesity, and destructive behavior. The right toys can satisfy your cat\'s natural hunting instincts, encourage exercise, and reduce stress-related issues like over-grooming. Our guides cover everything from electronic motion toys that engage solo cats to puzzle feeders that slow down fast eaters and provide cognitive enrichment. We test toys with cats of different breeds, ages, and energy levels to find which ones actually hold attention beyond the first five minutes.',
    cornerstoneGuide: {
      slug: 'best-interactive-cat-toys-that-work',
      title: 'Best Interactive Cat Toys That Actually Work (2026)',
      excerpt: 'Tested & ranked interactive cat toys for indoor cats. Expert picks for solo play, mental stimulation, and hunting instincts.',
    },
    clusterGuides: [
      { slug: 'best-cat-enrichment-ideas-indoor-cats-2026', title: 'Best Cat Enrichment Ideas for Indoor Cats' },
      { slug: 'how-to-entertain-an-indoor-cat', title: 'How to Entertain an Indoor Cat' },
      { slug: 'best-cat-toys', title: 'Best Cat Toys' },
    ],
    collectionLink: { href: '/collections/cats', label: 'Shop Cat Toys' },
  },
  {
    id: 'cat-trees',
    label: 'Cat Trees & Furniture',
    icon: '🪵',
    description: 'How to choose the right cat trees, condos, scratching posts, and climbing structures for your indoor cat.',
    seoIntro: 'Cat trees serve a critical function beyond decoration — they provide vertical territory that reduces inter-cat conflict, satisfy scratching instincts that protect your furniture, and give cats elevated perching spots where they feel safe and in control. Choosing the right cat tree means considering your cat\'s weight and activity level, your available floor space, and the stability of the structure. Our guides break down the differences between carpet-covered traditional trees, modern sisal-wrapped designs, and wall-mounted alternatives, with specific recommendations by cat size and living situation.',
    cornerstoneGuide: {
      slug: 'best-cat-trees-small-apartments',
      title: 'Best Cat Trees for Small Apartments (2026) – Space-Saving Picks',
      excerpt: '7 compact cat trees tested in apartments under 600 sq ft. Space-saving picks for indoor cats.',
    },
    clusterGuides: [
      { slug: 'best-cat-trees-2026', title: 'Best Cat Trees 2026' },
      { slug: 'best-cat-trees-large-cats-2026', title: 'Best Cat Trees for Large Cats' },
      { slug: 'cat-tree-stability-guide', title: 'Cat Tree Stability Guide' },
      { slug: 'how-tall-should-cat-tree-be', title: 'How Tall Should a Cat Tree Be?' },
      { slug: 'sisal-vs-carpet-scratching-posts', title: 'Sisal vs Carpet Scratching Posts' },
      { slug: 'modern-cat-trees-home-design', title: 'Modern Cat Trees for Home Design' },
    ],
    collectionLink: { href: '/collections/cat-trees-and-condos', label: 'Shop Cat Trees' },
  },
  {
    id: 'dog-beds',
    label: 'Dog Beds & Joint Support',
    icon: '🛏️',
    description: 'Orthopedic, calming, and specialty dog beds for every breed, age, and health condition.',
    seoIntro: 'The right dog bed does more than provide comfort — for senior dogs and breeds prone to hip dysplasia and arthritis, an orthopedic bed with proper support can significantly improve mobility and reduce pain. Memory foam density, waterproof liners, and non-slip bottoms are features that separate a quality therapeutic bed from a standard cushion. Our guides cover how to choose the right size and support level for your dog\'s weight and health needs, with specific recommendations for large breeds, anxious dogs who benefit from bolstered calming beds, and outdoor-ready options for active lifestyles.',
    cornerstoneGuide: {
      slug: 'best-dog-bed-2026',
      title: 'Best Dog Beds 2026 – Vet-Recommended Orthopedic Picks',
      excerpt: 'Vet-recommended orthopedic dog beds tested and ranked for comfort, durability, and joint support.',
    },
    clusterGuides: [
      { slug: 'best-orthopedic-dog-bed', title: 'Best Orthopedic Dog Beds' },
      { slug: 'best-dog-beds-for-large-dogs', title: 'Best Dog Beds for Large Dogs' },
      { slug: 'how-to-choose-the-right-dog-bed-size', title: 'How to Choose the Right Dog Bed Size' },
      { slug: 'best-dog-bed-materials-explained', title: 'Best Dog Bed Materials Explained' },
      { slug: 'dog-bed-for-anxiety-do-they-work', title: 'Do Calming Dog Beds Actually Work?' },
      { slug: 'signs-dog-needs-joint-support', title: 'Signs Your Dog Needs Joint Support' },
    ],
    collectionLink: { href: '/collections/dog-beds', label: 'Shop Dog Beds' },
  },
];

const PetCareGuides = () => {
  const { data: dbGuides } = useQuery({
    queryKey: ['published-guides-hub'],
    queryFn: async () => {
      const { data } = await supabase
        .from('published_guides')
        .select('slug,title,cluster')
        .eq('is_published', true)
        .order('published_at', { ascending: false });
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const enrichedClusters = TOPIC_CLUSTERS.map(cluster => {
    const existingSlugs = new Set([
      cluster.cornerstoneGuide.slug,
      ...cluster.clusterGuides.map(g => g.slug),
    ]);
    const newGuides = (dbGuides || [])
      .filter(g => g.cluster === cluster.id && !existingSlugs.has(g.slug))
      .map(g => ({ slug: g.slug, title: g.title }));
    return {
      ...cluster,
      clusterGuides: [...cluster.clusterGuides, ...newGuides],
    };
  });

  const totalGuides = enrichedClusters.reduce(
    (sum, c) => sum + 1 + c.clusterGuides.length,
    0
  );

  // JSON-LD: ItemList schema for the hub
  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${BASE_URL}/pet-care-guides#webpage`,
    name: 'Pet Care Guides – Expert Advice for Dogs & Cats',
    description: 'Comprehensive vet-reviewed pet care guides covering dog training, travel safety, grooming, cat litter solutions, cat trees, and more. Updated for 2026.',
    url: `${BASE_URL}/pet-care-guides`,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: enrichedClusters.length,
      itemListElement: enrichedClusters.map((cluster, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${BASE_URL}/guides/${cluster.cornerstoneGuide.slug}`,
        name: cluster.cornerstoneGuide.title,
      })),
    },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
        { '@type': 'ListItem', position: 2, name: 'Guides', item: `${BASE_URL}/guides` },
        { '@type': 'ListItem', position: 3, name: 'Pet Care Guides', item: `${BASE_URL}/pet-care-guides` },
      ],
    },
  };

  return (
    <Layout>
      <Helmet>
        <title>Pet Care Guides – Expert Advice for Dogs & Cats (2026) | GetPawsy</title>
        <meta
          name="description"
          content="Expert pet care guides for dogs & cats. Vet-reviewed advice on training, travel safety, grooming, litter boxes, cat trees & more. Updated for 2026."
        />
        <link rel="canonical" href={`${BASE_URL}/pet-care-guides`} />
        <meta name="robots" content="index, follow" />
        <meta property="og:title" content="Pet Care Guides – Expert Advice for Dogs & Cats (2026)" />
        <meta property="og:description" content="Expert pet care guides covering dog training, travel, grooming, cat litter & cat trees. Vet-reviewed, updated for 2026." />
        <meta property="og:url" content={`${BASE_URL}/pet-care-guides`} />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify(itemListSchema)}</script>
      </Helmet>

      <div className="container px-4 md:px-6 py-12 md:py-16">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
          <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
          <span>/</span>
          <Link to="/guides" className="hover:text-foreground transition-colors">Guides</Link>
          <span>/</span>
          <span className="text-foreground font-medium">Pet Care Guides</span>
        </nav>

        {/* Hero */}
        <header className="max-w-3xl mb-12 md:mb-16">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-sm">
              <BookOpen className="w-6 h-6 text-primary" />
            </div>
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary/80">
              Expert Guides
            </span>
          </div>

          <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold text-foreground leading-tight tracking-tight mb-4">
            Pet Care Guides – Expert Advice for Dogs & Cats
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mb-6">
            Our vet-reviewed guides help you make confident decisions for your pet.
            From choosing the right litter box to mastering leash training, every guide
            is written by pet care experts and updated for 2026.
          </p>
          <p className="text-base text-muted-foreground leading-relaxed max-w-2xl">
            Owning a pet is one of life's greatest joys — but it also comes with real
            responsibility. Whether you're a first-time puppy parent navigating potty
            training at 3 AM or a seasoned cat owner dealing with a stubborn litter box
            refusal, the right information makes all the difference. That's why we
            created this comprehensive resource library: to give you practical, evidence-based
            guidance on the topics that matter most to pet owners across the United States.
          </p>
        </header>

        {/* Authority badges */}
        <div className="flex flex-wrap gap-4 mb-12">
          {[
            { icon: Shield, label: 'Vet-Reviewed Content', sub: 'Every guide fact-checked' },
            { icon: Award, label: `${totalGuides}+ Expert Guides`, sub: 'Updated for 2026' },
            { icon: CheckCircle, label: 'Products Tested', sub: 'Hands-on evaluations' },
          ].map(({ icon: Icon, label, sub }) => (
            <div key={label} className="flex items-center gap-3 rounded-xl border border-border/50 bg-card p-3 pr-5">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <span className="block text-sm font-semibold text-foreground">{label}</span>
                <span className="block text-xs text-muted-foreground">{sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Quick-nav pills */}
        <nav className="flex flex-wrap gap-2 mb-12" aria-label="Guide categories">
          {enrichedClusters.map((cluster) => (
            <a
              key={cluster.id}
              href={`#${cluster.id}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-border bg-card text-sm font-medium text-foreground hover:border-primary/30 hover:bg-accent transition-colors"
            >
              <span>{cluster.icon}</span>
              {cluster.label}
            </a>
          ))}
        </nav>

        {/* Introductory SEO content section */}
        <section className="max-w-3xl mb-16 space-y-4">
          <h2 className="text-xl md:text-2xl font-display font-bold text-foreground tracking-tight">
            How Our Pet Care Guides Are Built
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Every guide in our library follows a rigorous editorial process. We start by identifying the
            questions pet owners actually ask — using search data, veterinarian consultations, and feedback
            from our community of over 50,000 pet parents. From there, our writers research current
            veterinary guidelines, test products hands-on when possible, and structure each guide around
            actionable advice rather than filler content.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            We organize our guides into topical clusters — groups of related articles that together cover
            a subject comprehensively. For example, our <Link to="/guides/complete-dog-training-guide-2026" className="text-primary font-medium hover:underline">dog training hub</Link> connects
            to specific guides on <Link to="/guides/dog-leash-control-guide" className="text-primary font-medium hover:underline">leash control</Link>,{' '}
            <Link to="/guides/best-dog-training-collar" className="text-primary font-medium hover:underline">training collars</Link>,{' '}
            <Link to="/guides/puppy-training-first-30-days" className="text-primary font-medium hover:underline">puppy training schedules</Link>, and{' '}
            <Link to="/guides/dog-behavior-training-guide" className="text-primary font-medium hover:underline">behavior correction</Link>.
            This structure ensures you can dive deep into any subtopic while always having a clear path
            back to the bigger picture.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Product recommendations are clearly separated from educational content. When we suggest a
            specific <Link to="/collections/dog-training-tools" className="text-primary font-medium hover:underline">training tool</Link>,{' '}
            <Link to="/collections/cat-litter-boxes" className="text-primary font-medium hover:underline">litter box</Link>, or{' '}
            <Link to="/collections/dog-beds" className="text-primary font-medium hover:underline">orthopedic dog bed</Link>,
            we explain exactly why it earned our recommendation based on testing criteria like durability,
            safety certifications, and real-world performance. We disclose affiliate relationships
            transparently and never let them influence our rankings.
          </p>
        </section>

        {/* Topic Cluster Sections */}
        <div className="space-y-20">
          {enrichedClusters.map((cluster) => (
            <section key={cluster.id} id={cluster.id}>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">{cluster.icon}</span>
                <div>
                  <h2 className="text-xl md:text-2xl font-display font-bold text-foreground tracking-tight">
                    {cluster.label}
                  </h2>
                  <p className="text-sm text-muted-foreground">{cluster.description}</p>
                </div>
              </div>

              {/* SEO intro paragraph for each cluster */}
              <p className="text-muted-foreground leading-relaxed max-w-3xl mb-6">
                {cluster.seoIntro}
              </p>

              {/* Cornerstone guide — prominent card */}
              <Link
                to={`/guides/${cluster.cornerstoneGuide.slug}`}
                className="group block rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-6 mb-4 hover:border-primary/40 hover:shadow-soft transition-all duration-300"
              >
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-primary mb-2">
                  <Sparkles className="w-3 h-3" />
                  Cornerstone Guide
                </span>
                <h3 className="font-display font-bold text-foreground group-hover:text-primary transition-colors text-base md:text-lg leading-snug mb-2">
                  {cluster.cornerstoneGuide.title}
                </h3>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                  {cluster.cornerstoneGuide.excerpt}
                </p>
                <span className="flex items-center gap-1 text-sm font-semibold text-primary group-hover:gap-2 transition-all duration-300">
                  Read Guide <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </Link>

              {/* Cluster guides grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {cluster.clusterGuides.map((guide) => (
                  <Link
                    key={guide.slug}
                    to={`/guides/${guide.slug}`}
                    className="group flex items-center gap-2 rounded-xl border border-border/40 bg-card p-4 hover:border-primary/30 hover:shadow-sm transition-all"
                  >
                    <PawPrint className="w-4 h-4 text-primary/60 shrink-0" />
                    <span className="font-medium text-foreground group-hover:text-primary transition-colors text-sm leading-snug">
                      {guide.title}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                ))}
              </div>

              {/* Shop CTA */}
              {cluster.collectionLink && (
                <Link
                  to={cluster.collectionLink.href}
                  className="inline-flex items-center gap-2 mt-4 text-sm font-semibold text-primary hover:underline"
                >
                  {cluster.collectionLink.label} <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </section>
          ))}
        </div>

        {/* Additional SEO content: Choosing Guides */}
        <section className="mt-20 pt-12 border-t border-border/40 max-w-3xl space-y-6">
          <h2 className="text-xl md:text-2xl font-display font-bold text-foreground tracking-tight">
            How to Use Our Guide Library
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Our guide library is organized around the topics that matter most to US pet owners.
            Start with a cornerstone guide for a comprehensive overview of a topic — like our{' '}
            <Link to="/guides/dog-travel-safety-guide" className="text-primary font-medium hover:underline">dog travel safety guide</Link> or{' '}
            <Link to="/guides/cat-litter-solutions-guide" className="text-primary font-medium hover:underline">cat litter solutions guide</Link>.
            These pillar articles give you the full picture: what to look for, common mistakes to avoid,
            and how to evaluate products objectively.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            From there, explore cluster guides that go deep on specific subtopics. If you're training a new puppy,
            start with the <Link to="/guides/complete-dog-training-guide-2026" className="text-primary font-medium hover:underline">complete training guide</Link>,
            then branch into <Link to="/guides/puppy-training-first-30-days" className="text-primary font-medium hover:underline">your first 30 days</Link>,{' '}
            <Link to="/guides/dog-potty-training-complete-guide" className="text-primary font-medium hover:underline">potty training</Link>, and{' '}
            <Link to="/guides/leash-training-dog-step-by-step" className="text-primary font-medium hover:underline">leash training</Link>. Each guide links
            to related articles and product recommendations so you always know your next step.
          </p>

          <h2 className="text-xl md:text-2xl font-display font-bold text-foreground tracking-tight pt-4">
            Frequently Asked Questions
          </h2>

          <div className="space-y-4">
            {[
              {
                q: 'Are your pet care guides vet-reviewed?',
                a: 'Yes. Every guide is reviewed against current veterinary guidelines before publication. We consult with licensed veterinarians and certified animal behaviorists to ensure our recommendations are safe and evidence-based.',
              },
              {
                q: 'How often are guides updated?',
                a: 'We review and update our cornerstone guides quarterly and cluster guides at least twice per year. Product recommendations are refreshed whenever new models are released or prices change significantly.',
              },
              {
                q: 'Do you test the products you recommend?',
                a: 'Whenever possible, yes. For categories like dog car seats, litter boxes, and grooming tools, we conduct hands-on testing with real pets. For products we can\'t test directly, we analyze verified customer reviews, manufacturer specifications, and safety certifications.',
              },
              {
                q: 'Can I suggest a guide topic?',
                a: 'Absolutely. We welcome topic suggestions from our community. Contact us through our help center and we\'ll consider it for our editorial calendar.',
              },
              {
                q: 'Are your product recommendations influenced by affiliate commissions?',
                a: 'No. We disclose affiliate relationships transparently, but our rankings are based solely on product quality, safety, and value. Many of our top picks are from brands with no affiliate relationship.',
              },
            ].map(({ q, a }) => (
              <div key={q} className="rounded-xl border border-border/50 bg-card p-5">
                <h3 className="font-semibold text-foreground text-sm mb-2">{q}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Bottom authority text */}
        <section className="mt-16 pt-10 border-t border-border/40 max-w-3xl">
          <h2 className="text-lg font-display font-bold text-foreground mb-3">
            Why Trust GetPawsy Pet Guides?
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            GetPawsy is built by pet owners, for pet owners. Our editorial team includes experienced
            writers who specialize in pet health, nutrition, and behavior. We follow strict editorial
            guidelines that prioritize accuracy over sensationalism, and we never publish content that
            hasn't been reviewed for factual correctness. When we recommend a{' '}
            <Link to="/collections/dog-training-tools" className="text-primary hover:underline">training tool</Link>,{' '}
            <Link to="/collections/cat-trees-and-condos" className="text-primary hover:underline">cat tree</Link>, or{' '}
            <Link to="/collections/cat-litter-boxes" className="text-primary hover:underline">litter box</Link>,
            it's because our team has evaluated it against clear, published criteria — not because
            a brand paid for placement.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/guides" className="text-sm font-semibold text-primary hover:underline">
              Browse All Guides →
            </Link>
            <Link to="/why-trust-our-reviews" className="text-sm font-semibold text-primary hover:underline">
              Our Review Process →
            </Link>
            <Link to="/editorial-guidelines" className="text-sm font-semibold text-primary hover:underline">
              Editorial Guidelines →
            </Link>
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default PetCareGuides;

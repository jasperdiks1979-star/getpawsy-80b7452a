import { Link } from 'react-router-dom';
import { BookOpen, ArrowRight } from 'lucide-react';
import { useMemo } from 'react';
import { SCALING_GUIDES } from '@/lib/guide-scaling-150';

interface GuideLink {
  slug: string;
  title: string;
  excerpt: string;
}

// ── Static curated map for high-priority collections ──
const COLLECTION_GUIDE_MAP: Record<string, GuideLink[]> = {
  // ── Dog Beds Cluster ──
  'best-orthopedic-dog-beds': [
    { slug: 'are-orthopedic-dog-beds-worth-it', title: 'Are Orthopedic Dog Beds Worth the Investment?', excerpt: 'Vet-backed cost analysis and foam science to help you decide.' },
    { slug: 'best-dog-bed-materials-explained', title: 'Dog Bed Materials Guide: Foam, Fiber & Fabric', excerpt: 'Understand memory foam density, thickness, and cover durability.' },
  ],
  'memory-foam-dog-beds': [
    { slug: 'memory-foam-vs-standard-dog-bed', title: 'Memory Foam vs Standard Dog Bed – Which Lasts?', excerpt: 'Real cost-per-year comparison and durability testing results.' },
    { slug: 'are-orthopedic-dog-beds-worth-it', title: 'Is an Orthopedic Bed Worth the Extra Cost?', excerpt: 'Vet insights and 3-year cost analysis for memory foam beds.' },
  ],
  'waterproof-dog-beds': [
    { slug: 'best-dog-bed-materials-explained', title: 'Waterproof vs Water-Resistant: Materials Explained', excerpt: 'Cover fabric types ranked by durability and washability.' },
    { slug: 'how-to-wash-a-dog-bed-properly', title: 'How to Clean & Maintain a Waterproof Dog Bed', excerpt: 'Step-by-step care instructions to extend bed lifespan.' },
  ],
  'dog-beds-for-anxiety': [
    { slug: 'dog-bed-for-anxiety-do-they-work', title: 'Do Calming Dog Beds Actually Work? The Science', excerpt: 'Deep pressure stimulation research and real owner results.' },
    { slug: 'how-to-choose-the-right-dog-bed-size', title: 'Sizing a Calming Bed: Why It Matters More', excerpt: 'Calming beds need snug sizing — here\'s how to measure.' },
  ],
  'best-dog-beds-for-large-dogs': [
    { slug: 'how-to-choose-the-right-dog-bed-size', title: 'Dog Bed Size Chart for Large & Giant Breeds', excerpt: 'Exact measurements for Labs, Shepherds, Danes and more.' },
    { slug: 'are-orthopedic-dog-beds-worth-it', title: 'Why Large Dogs Need Orthopedic Support', excerpt: 'Foam density requirements for 50+ lb breeds explained.' },
  ],
  'dog-beds': [
    { slug: 'how-to-choose-the-right-dog-bed-size', title: 'Complete Dog Bed Sizing Guide by Breed', excerpt: 'Exact measurements and the #1 sizing mistake to avoid.' },
    { slug: 'best-dog-bed-materials-explained', title: 'Dog Bed Materials: What Lasts Longest?', excerpt: 'Foam, fiber, and fabric types compared for durability.' },
  ],
  'orthopedic-calming-dog-beds': [
    { slug: 'are-orthopedic-dog-beds-worth-it', title: 'Are Orthopedic Dog Beds Worth It? Vet Insights', excerpt: 'Foam density science, cost-per-year analysis, and breed-specific recommendations.' },
    { slug: 'how-to-choose-the-right-dog-bed-size', title: 'Dog Bed Sizing Guide: Get It Right First Time', excerpt: 'Measure once, buy once — the complete sizing chart for every breed.' },
  ],
  // ── Slow Feeder Dog Bowls ──
  'best-slow-feeder-dog-bowls': [
    { slug: 'slow-feeder-bowl-benefits-dogs', title: 'Why Slow Feeder Bowls Prevent Bloat in Dogs', excerpt: 'Veterinary science behind anti-gulp feeding and GDV prevention.' },
    { slug: 'best-bowl-for-fast-eating-dog', title: 'Best Bowls for Fast-Eating Dogs – 2026 Picks', excerpt: 'Maze, puzzle, and lick mat options tested for durability and effectiveness.' },
  ],
  // ── Cat Litter Boxes ──
  'best-cat-litter-boxes': [
    { slug: 'best-cat-litter-box-2026', title: 'Best Cat Litter Boxes 2026 – Complete Buyer\'s Guide', excerpt: 'Self-cleaning, covered, and jumbo litter boxes compared side-by-side.' },
    { slug: 'litter-box-placement-tips', title: 'Where to Place a Litter Box: Room-by-Room Guide', excerpt: 'Avoid the #1 placement mistake that causes litter box avoidance.' },
  ],
  // ── Cat Trees & Condos ──
  'cat-trees-and-condos': [
    { slug: 'best-cat-trees-large-cats-2026', title: 'Best Cat Trees for Large Cats – 9 Tested for Stability', excerpt: 'Weight-tested cat trees rated for 25+ lb cats with zero wobble.' },
    { slug: 'where-to-place-cat-tree-living-room', title: 'Where to Place a Cat Tree in Your Home', excerpt: 'Window vs corner placement and how it affects your cat\'s usage.' },
  ],
  // ── Dog Toys ──
  'best-interactive-dog-toys': [
    { slug: 'best-puzzle-toys-for-dogs-2026', title: 'Best Puzzle Toys for Dogs – 2026 Rankings', excerpt: 'Stimulate your dog\'s brain with vet-recommended enrichment toys.' },
    { slug: 'mental-stimulation-games-for-dogs', title: '10 Mental Stimulation Games for Bored Dogs', excerpt: 'DIY and store-bought activities to tire out your pup without a walk.' },
  ],
  // ── Cat Toys ──
  'best-interactive-cat-toys': [
    { slug: 'indoor-cat-enrichment-guide', title: 'Indoor Cat Enrichment: The Complete Guide', excerpt: 'Beat boredom and obesity with structured play and environmental enrichment.' },
    { slug: 'best-electronic-cat-toys-2026', title: 'Best Electronic Cat Toys 2026 – Hands-Free Play', excerpt: 'Automated feather wands, laser toys, and motion sensors reviewed.' },
  ],
  // ── Dog Training ──
  'dog-training-tools': [
    { slug: 'best-dog-training-tools', title: 'Best Dog Training Tools – Expert Picks 2026', excerpt: 'Clickers, treat pouches, and behavior correction aids ranked by trainers.' },
    { slug: 'puppy-training-first-30-days', title: 'Puppy Training: Your First 30 Days Roadmap', excerpt: 'Week-by-week training schedule for new puppy owners.' },
    { slug: 'leash-training-dog-step-by-step', title: 'Leash Training Your Dog – Step by Step', excerpt: 'From first walk to loose-leash mastery in 4 weeks.' },
  ],
  'dog-leash-control': [
    { slug: 'leash-training-dog-step-by-step', title: 'Leash Training Your Dog – Complete Guide', excerpt: 'From pulling to perfect loose-leash walks in 4 weeks.' },
    { slug: 'best-dog-training-tools', title: 'Best Dog Training Tools for Leash Work', excerpt: 'No-pull harnesses, training leashes, and reward systems compared.' },
  ],
  'dog-anti-bark': [
    { slug: 'how-to-stop-dog-barking', title: 'How to Stop Dog Barking – Humane Methods', excerpt: 'Positive reinforcement techniques that actually work long-term.' },
    { slug: 'best-dog-training-tools', title: 'Training Tools for Bark Control', excerpt: 'Ultrasonic devices, citronella collars, and distraction toys reviewed.' },
  ],
  'puppy-training-essentials': [
    { slug: 'puppy-training-first-30-days', title: 'Puppy Training First 30 Days – Complete Plan', excerpt: 'Day-by-day schedule covering potty, crate, and basic commands.' },
    { slug: 'dog-potty-training-complete-guide', title: 'Potty Training Made Simple', excerpt: 'Accident-proof your home with this proven potty training method.' },
  ],
  'dog-potty-training': [
    { slug: 'dog-potty-training-complete-guide', title: 'Complete Dog Potty Training Guide', excerpt: 'Indoor pads, outdoor training, and bell method explained step-by-step.' },
    { slug: 'puppy-training-first-30-days', title: 'First 30 Days: When to Start Potty Training', excerpt: 'Age-appropriate potty training milestones for new puppy owners.' },
  ],
  // ── Dog Travel ──
  'dog-travel-accessories': [
    { slug: 'dog-travel-checklist-2026', title: 'Dog Travel Checklist – Everything You Need', excerpt: 'Pack list for road trips, flights, and hotel stays with your dog.' },
    { slug: 'flying-with-a-dog-guide', title: 'Flying with a Dog: Airline Rules & Tips', excerpt: 'Airline-by-airline pet policies and in-cabin carrier requirements.' },
  ],
  'best-dog-car-seats': [
    { slug: 'dog-car-seat-safety-guide-2026', title: 'Dog Car Seat Safety: What Actually Works', excerpt: 'Crash test results and NHTSA-style ratings for pet car seats.' },
    { slug: 'dog-travel-checklist-2026', title: 'Road Trip with Your Dog – Essential Packing List', excerpt: 'Car seats, harnesses, water bottles, and rest stop tips.' },
  ],
  // ── Pet Strollers ──
  'best-pet-strollers': [
    { slug: 'pet-stroller-buying-guide-2026', title: 'Pet Stroller Buying Guide – Which Type Is Best?', excerpt: 'Standard vs jogging vs double pet strollers compared for terrain and dog size.' },
    { slug: 'pet-stroller-for-senior-dogs', title: 'Pet Strollers for Senior Dogs – Mobility Freedom', excerpt: 'Help aging dogs enjoy outdoor time safely with the right stroller.' },
  ],
  // ── Cat Carriers ──
  'best-cat-carriers': [
    { slug: 'airline-approved-cat-carrier-guide', title: 'Airline-Approved Cat Carriers – 2026 Guide', excerpt: 'Size specs, airline policies, and top picks for in-cabin cat travel.' },
    { slug: 'how-to-get-cat-used-to-carrier', title: 'How to Get Your Cat Used to a Carrier', excerpt: 'Stress-free carrier training in 7 days using positive association.' },
  ],
  // ── Dog Harnesses ──
  'best-dog-harnesses': [
    { slug: 'no-pull-harness-vs-collar-2026', title: 'No-Pull Harness vs Collar – Which Is Safer?', excerpt: 'Veterinary perspective on neck strain, tracheal damage, and control.' },
    { slug: 'how-to-measure-dog-for-harness', title: 'How to Measure Your Dog for a Harness', excerpt: 'Get the perfect fit with our breed-specific measurement guide.' },
  ],
  // ── Cat Scratching Posts ──
  'best-cat-scratching-posts': [
    { slug: 'sisal-vs-cardboard-scratching-post', title: 'Sisal vs Cardboard Scratching Posts – Which Lasts?', excerpt: 'Material durability, cat preferences, and cost-per-year analysis.' },
    { slug: 'how-to-stop-cat-scratching-furniture', title: 'How to Stop Cats Scratching Furniture', excerpt: 'Redirect scratching behavior with strategic post placement.' },
  ],
};

// ── Keyword-based slug → cluster mapping for auto-matching ──
const SLUG_KEYWORD_CLUSTERS: { keywords: string[]; cluster: string }[] = [
  { keywords: ['litter', 'litter-box'], cluster: 'cat-litter' },
  { keywords: ['cat-tree', 'cat-condo', 'cat-furniture', 'scratching', 'cat-shelf'], cluster: 'cat-furniture' },
  { keywords: ['cat-toy', 'cat-play', 'cat-enrichment', 'cat-laser', 'cat-feather'], cluster: 'cat-enrichment' },
  { keywords: ['dog-bed', 'orthopedic', 'calming-bed', 'memory-foam'], cluster: 'dog-beds' },
  { keywords: ['dog-train', 'leash', 'harness', 'collar', 'bark', 'puppy', 'potty'], cluster: 'dog-training' },
  { keywords: ['dog-toy', 'puzzle', 'chew', 'interactive-dog'], cluster: 'micro-intent' },
  { keywords: ['stroller', 'carrier', 'travel', 'car-seat'], cluster: 'micro-intent' },
  { keywords: ['slow-feeder', 'dog-bowl', 'feeder'], cluster: 'micro-intent' },
  { keywords: ['cat-carrier', 'cat-travel'], cluster: 'cat-enrichment' },
];

/**
 * Auto-detect relevant guides for any collection slug using keyword matching
 * against SCALING_GUIDES. Returns 2–4 guides prioritized by role and relevance.
 */
function autoDetectGuides(collectionSlug: string): GuideLink[] {
  const slugLower = collectionSlug.toLowerCase();

  // Find matching cluster
  let matchedCluster: string | null = null;
  for (const entry of SLUG_KEYWORD_CLUSTERS) {
    if (entry.keywords.some(kw => slugLower.includes(kw))) {
      matchedCluster = entry.cluster;
      break;
    }
  }

  if (!matchedCluster) {
    // Fallback: tokenize slug and find guides with highest keyword overlap
    const slugTokens = slugLower.split('-').filter(w => w.length > 2);
    const scored = SCALING_GUIDES
      .map(g => {
        const guideTokens = [
          ...g.slug.split('-'),
          ...g.primaryKW.toLowerCase().split(' '),
        ].filter(w => w.length > 2);
        const overlap = slugTokens.filter(t => guideTokens.includes(t)).length;
        return { guide: g, score: overlap };
      })
      .filter(s => s.score >= 2)
      .sort((a, b) => {
        // Prioritize by role, then score
        const roleOrder = { cornerstone: 0, hub: 1, subguide: 2 };
        const roleDiff = roleOrder[a.guide.role] - roleOrder[b.guide.role];
        return roleDiff !== 0 ? roleDiff : b.score - a.score;
      })
      .slice(0, 4);

    return scored.map(s => ({
      slug: s.guide.slug,
      title: s.guide.title,
      excerpt: s.guide.secondaryKWs.slice(0, 2).join(', ') || s.guide.primaryKW,
    }));
  }

  // Get guides from matched cluster, prioritized by role
  const clusterGuides = SCALING_GUIDES
    .filter(g => g.cluster === matchedCluster)
    .sort((a, b) => {
      const roleOrder = { cornerstone: 0, hub: 1, subguide: 2 };
      return roleOrder[a.role] - roleOrder[b.role] || b.priority - a.priority;
    });

  // Pick cornerstone + hub + top subguides (2-4 total)
  const picked: GuideLink[] = [];
  const cornerstone = clusterGuides.find(g => g.role === 'cornerstone');
  if (cornerstone) {
    picked.push({ slug: cornerstone.slug, title: cornerstone.title, excerpt: cornerstone.secondaryKWs.slice(0, 2).join(', ') || cornerstone.primaryKW });
  }

  const hub = clusterGuides.find(g => g.role === 'hub');
  if (hub && hub.slug !== cornerstone?.slug) {
    picked.push({ slug: hub.slug, title: hub.title, excerpt: hub.secondaryKWs.slice(0, 2).join(', ') || hub.primaryKW });
  }

  // Fill with subguides that best match the slug keywords
  const slugTokens = slugLower.split('-').filter(w => w.length > 2);
  const remaining = clusterGuides
    .filter(g => !picked.find(p => p.slug === g.slug))
    .map(g => {
      const guideTokens = [...g.slug.split('-'), ...g.primaryKW.toLowerCase().split(' ')];
      const overlap = slugTokens.filter(t => guideTokens.includes(t)).length;
      return { guide: g, score: overlap };
    })
    .sort((a, b) => b.score - a.score || b.guide.priority - a.guide.priority);

  for (const r of remaining) {
    if (picked.length >= 4) break;
    picked.push({ slug: r.guide.slug, title: r.guide.title, excerpt: r.guide.secondaryKWs.slice(0, 2).join(', ') || r.guide.primaryKW });
  }

  return picked;
}

interface CollectionExpertGuidesProps {
  collectionSlug: string;
}

export function CollectionExpertGuides({ collectionSlug }: CollectionExpertGuidesProps) {
  const guides = useMemo(() => {
    // Use curated map first, fall back to auto-detection
    const curated = COLLECTION_GUIDE_MAP[collectionSlug];
    if (curated && curated.length > 0) return curated;
    return autoDetectGuides(collectionSlug);
  }, [collectionSlug]);

  if (!guides || guides.length === 0) return null;

  return (
    <section className="mb-12">
      <div className="flex items-center gap-2 mb-5">
        <BookOpen className="w-5 h-5 text-primary" />
        <h2 className="text-2xl font-semibold">Helpful Guides for Pet Owners</h2>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {guides.map((guide) => (
          <Link
            key={guide.slug}
            to={`/guides/${guide.slug}`}
            className="group block bg-card border rounded-xl p-5 hover:border-primary/30 hover:shadow-md transition-all"
          >
            <h3 className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors">
              {guide.title}
            </h3>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {guide.excerpt}
            </p>
            <span className="inline-flex items-center gap-1 text-primary text-xs mt-2">
              Read Guide <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

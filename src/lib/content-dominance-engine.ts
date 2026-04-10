/**
 * Content Dominance Engine — GetPawsy
 * 
 * Driven by real GSC query data from gsc_keywords table.
 * 
 * 1. Breakout Blueprint — structured guide architecture for target keywords
 * 2. Topical Authority Map — full pillar + cluster hierarchy
 * 3. 90-Day Dominance Roadmap — phased execution plan
 * 4. Integration hooks for SEO Engine V4
 */

// ============= TYPES =============

export type IntentType = 'informational' | 'commercial' | 'transactional' | 'navigational';

export interface GscQuery {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface BreakoutBlueprint {
  targetKeyword: string;
  pageType: 'definitive-guide';
  currentPosition: number;
  currentImpressions: number;
  semanticVariants: string[];
  guideSections: GuideSection[];
  faqEntries: FaqEntry[];
  internalLinks: InternalLinkTarget[];
  productBlocks: string[];
  projectedTrafficLift: string;
  semanticCoverageScore: number;
  estimatedTop20Probability: string;
}

export interface GuideSection {
  h2: string;
  h3s: string[];
  targetWordCount: number;
  semanticKeywords: string[];
}

export interface FaqEntry {
  question: string;
  answer: string;
}

export interface InternalLinkTarget {
  targetSlug: string;
  anchorText: string;
  context: string;
}

export interface TopicalPillar {
  name: string;
  slug: string;
  cornerstonePage: string;
  cornerstoneWordCount: number;
  clusters: ClusterTopic[];
  linkFlow: string;
  authorityProjection: number;
}

export interface ClusterTopic {
  title: string;
  slug: string;
  wordCount: number;
  intent: IntentType;
  priority: 'high' | 'medium' | 'low';
  linkedToPillar: boolean;
  impressions: number;
  position: number;
}

export interface InternalLinkEdge {
  from: string;
  to: string;
  anchorText: string;
  type: 'hub-to-spoke' | 'spoke-to-hub' | 'cross-cluster' | 'product-link';
}

export interface TopicalAuthorityMap {
  pillars: TopicalPillar[];
  clusters: ClusterTopic[];
  internalLinkGraph: InternalLinkEdge[];
  authorityScoreProjection: number;
  totalPagesRequired: number;
  totalWordCount: number;
}

export interface RoadmapMonth {
  month: number;
  label: string;
  pillarPages: number;
  clusterArticles: number;
  tasks: string[];
  targets: { metric: string; current: string; target: string }[];
}

export interface DominanceRoadmap {
  months: RoadmapMonth[];
  expectedRankingLift: string;
  expectedTrafficIncrease: string;
  authorityGrowthCurve: { month: number; score: number }[];
}

export interface ContentDominanceResult {
  breakoutBlueprint: BreakoutBlueprint;
  topicalAuthorityMap: TopicalAuthorityMap;
  roadmap: DominanceRoadmap;
  yellowZoneQueries: GscQuery[];
  needleMovers: GscQuery[];
  systemSummary: {
    dominanceMode: 'ACTIVE';
    safePushEnabled: boolean;
    breakoutTargetsDetected: number;
    trafficProjection90d: string;
    systemIntegrity: 'QUERY_DRIVEN';
    totalRealQueries: number;
    totalImpressions: number;
  };
}

// ============= HELPERS =============

function classifyIntent(query: string): IntentType {
  const q = query.toLowerCase();
  if (q.includes('buy') || q.includes('price') || q.includes('order') || q.includes('shop') || q.includes('deal') || q.includes('discount') || q.includes('cheap')) return 'transactional';
  if (q.includes('best') || q.includes('top') || q.includes('review') || q.includes('vs') || q.includes('compare') || q.includes('recommended')) return 'commercial';
  if (q.includes('getpawsy') || q.includes('pawsy')) return 'navigational';
  return 'informational';
}

function extractSemanticVariants(queries: GscQuery[], primary: string): string[] {
  const primaryWords = new Set(primary.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const variants = queries
    .filter(q => {
      const qWords = q.query.toLowerCase().split(/\s+/);
      return qWords.some(w => primaryWords.has(w)) && q.query.toLowerCase() !== primary.toLowerCase();
    })
    .map(q => q.query)
    .slice(0, 15);

  // Add common semantic expansions if we don't have enough from GSC
  const expansions = [
    `${primary} for small dogs`,
    `${primary} for large breeds`,
    `best ${primary}`,
    `fun ${primary}`,
    `${primary} ideas`,
    `${primary} for puppies`,
    `diy ${primary}`,
    `${primary} in backyard`,
    `${primary} summer`,
    `${primary} winter`,
  ];

  const all = [...new Set([...variants, ...expansions])];
  return all.slice(0, 20);
}

function isDutch(query: string): boolean {
  const dutchWords = ['voor', 'met', 'een', 'het', 'hond', 'kat', 'katten', 'honden', 'beste', 'kopen', 'van', 'bij', 'mand', 'speelgoed'];
  const words = query.toLowerCase().split(/\s+/);
  return words.some(w => dutchWords.includes(w));
}

// ============= PHASE 1: BREAKOUT BLUEPRINT =============

function buildBreakoutBlueprint(queries: GscQuery[], targetKeyword: string): BreakoutBlueprint {
  const targetQuery = queries.find(q => q.query.toLowerCase() === targetKeyword.toLowerCase());
  const currentPosition = targetQuery?.position || 65;
  const currentImpressions = targetQuery?.impressions || 0;
  const semanticVariants = extractSemanticVariants(queries, targetKeyword);

  const guideSections: GuideSection[] = [
    {
      h2: 'Best Outdoor Dog Games for Small Dogs',
      h3s: ['Fetch Variations for Tiny Breeds', 'Agility Mini Course Setup', 'Scent Trails for Small Dogs'],
      targetWordCount: 400,
      semanticKeywords: ['small dog games', 'outdoor activities small breeds', 'yard games chihuahua'],
    },
    {
      h2: 'High-Energy Games for Large Breeds',
      h3s: ['Frisbee & Distance Fetch', 'Tug-of-War Outdoor Setup', 'Sprint & Chase Games'],
      targetWordCount: 400,
      semanticKeywords: ['large breed exercise', 'high energy dog games', 'labrador outdoor games'],
    },
    {
      h2: 'DIY Backyard Obstacle Course for Dogs',
      h3s: ['Materials & Setup Guide', 'Jumps, Tunnels & Weave Poles', 'Progressive Difficulty Training'],
      targetWordCount: 350,
      semanticKeywords: ['diy dog obstacle course', 'backyard agility course', 'homemade dog course'],
    },
    {
      h2: 'Water-Based Dog Games',
      h3s: ['Sprinkler Chase Games', 'Kiddie Pool Fetch', 'Dock Diving Basics'],
      targetWordCount: 300,
      semanticKeywords: ['water games dogs', 'dog pool games', 'splash pad dog'],
    },
    {
      h2: 'Brain-Stimulating Outdoor Games',
      h3s: ['Treasure Hunt Setup', 'Puzzle Feeder Outdoor Use', 'Hide and Seek Training'],
      targetWordCount: 350,
      semanticKeywords: ['dog brain games outdoor', 'mental stimulation dog', 'enrichment games dogs'],
    },
    {
      h2: 'Safety Tips for Outdoor Dog Games',
      h3s: ['Heat Safety & Hydration', 'Injury Prevention', 'Toxic Plant Awareness'],
      targetWordCount: 250,
      semanticKeywords: ['dog safety outdoors', 'heat stroke prevention dogs', 'safe dog play'],
    },
    {
      h2: 'Seasonal Outdoor Dog Game Guide (Summer & Winter)',
      h3s: ['Summer Cooling Games', 'Winter Snow Activities', 'Rainy Day Alternatives'],
      targetWordCount: 300,
      semanticKeywords: ['summer dog games', 'winter dog activities', 'seasonal dog play'],
    },
  ];

  const faqEntries: FaqEntry[] = [
    { question: 'What outdoor games can I play with my dog?', answer: 'The best outdoor dog games include fetch variations, tug-of-war, DIY obstacle courses, scent trails, water games, and hide-and-seek. Tailor activities to your dog\'s breed size and energy level for maximum enrichment.' },
    { question: 'How do I keep my dog entertained outside?', answer: 'Rotate between physical games (fetch, frisbee) and mental challenges (treasure hunts, puzzle feeders) in 15-20 minute sessions. Use interactive toys and set up a backyard obstacle course for variety.' },
    { question: 'What are the best outdoor games for puppies?', answer: 'Puppies thrive with gentle fetch, supervised water play in shallow areas, scent-based treasure hunts, and basic agility training with low obstacles. Keep sessions short (10-15 minutes) to avoid overexertion.' },
    { question: 'Are outdoor brain games good for dogs?', answer: 'Yes, outdoor brain games like scent trails, hide-and-seek, and puzzle feeders provide essential mental stimulation that reduces anxiety, destructive behavior, and boredom. Vets recommend daily enrichment activities.' },
    { question: 'How much outdoor play does a dog need?', answer: 'Most dogs need 30-60 minutes of active outdoor play daily, split into 2-3 sessions. High-energy breeds like Border Collies may need 60-90 minutes, while smaller breeds may be content with 20-30 minutes.' },
  ];

  const internalLinks: InternalLinkTarget[] = [
    { targetSlug: '/best-interactive-dog-toys', anchorText: 'interactive dog toys', context: 'Link from game equipment section' },
    { targetSlug: '/dog-enrichment-toys', anchorText: 'dog enrichment toys', context: 'Link from brain stimulation section' },
    { targetSlug: '/blog/puppy-training-essential-commands-guide', anchorText: 'puppy training commands', context: 'Link from safety/training section' },
    { targetSlug: '/c/dogs/toys', anchorText: 'dog toys collection', context: 'Link from product recommendation block' },
    { targetSlug: '/blog/pet-bonding-activities', anchorText: 'pet bonding activities', context: 'Link from intro paragraph' },
    { targetSlug: '/bestsellers', anchorText: 'best-selling pet products', context: 'Link from conversion CTA block' },
  ];

  const productBlocks = [
    'Interactive fetch toys (auto-link from product DB)',
    'Puzzle feeder toys for outdoor use',
    'Dog agility equipment kits',
    'Dog cooling products (summer section)',
    'Durable tug-of-war toys',
  ];

  // Projection: Position 65 → Top 20 with 3,000-word guide + authority links
  const estimatedTop20 = currentPosition > 50 ? '45-60%' : currentPosition > 20 ? '70-85%' : '90%+';

  return {
    targetKeyword,
    pageType: 'definitive-guide',
    currentPosition,
    currentImpressions,
    semanticVariants,
    guideSections,
    faqEntries,
    internalLinks,
    productBlocks,
    projectedTrafficLift: `+${Math.round(currentImpressions * 3.5)} impressions/month (projected)`,
    semanticCoverageScore: Math.min(95, 40 + semanticVariants.length * 3),
    estimatedTop20Probability: estimatedTop20,
  };
}

// ============= PHASE 2: TOPICAL AUTHORITY MAP =============

function buildTopicalAuthorityMap(queries: GscQuery[]): TopicalAuthorityMap {
  // Build impressions lookup by topic area
  const getQueryStats = (keywords: string[]): { impressions: number; position: number } => {
    const matching = queries.filter(q =>
      keywords.some(kw => q.query.toLowerCase().includes(kw))
    );
    return {
      impressions: matching.reduce((s, q) => s + q.impressions, 0),
      position: matching.length > 0 ? matching.reduce((s, q) => s + q.position, 0) / matching.length : 80,
    };
  };

  const pillars: TopicalPillar[] = [
    {
      name: 'Dog Training',
      slug: 'dog-training-hub',
      cornerstonePage: '/guides/complete-dog-training-guide-2026',
      cornerstoneWordCount: 5000,
      linkFlow: 'hub → 8 spokes → hub (bidirectional)',
      authorityProjection: 72,
      clusters: [
        { title: 'Puppy Training Essential Commands', slug: 'puppy-training-essential-commands-guide', wordCount: 2000, intent: 'informational', priority: 'high', linkedToPillar: true, ...getQueryStats(['puppy training', 'commands', 'teach puppy']) },
        { title: 'Leash Training for Dogs', slug: 'leash-training-dogs-guide', wordCount: 1800, intent: 'informational', priority: 'high', linkedToPillar: true, ...getQueryStats(['leash training', 'walk dog']) },
        { title: 'Crate Training Complete Guide', slug: 'crate-training-dog-guide', wordCount: 2000, intent: 'informational', priority: 'medium', linkedToPillar: true, ...getQueryStats(['crate training']) },
        { title: 'Positive Reinforcement Dog Training', slug: 'positive-reinforcement-training', wordCount: 1500, intent: 'informational', priority: 'medium', linkedToPillar: true, ...getQueryStats(['positive reinforcement', 'reward training']) },
        { title: 'How to Stop Dog Barking', slug: 'stop-dog-barking-guide', wordCount: 1800, intent: 'informational', priority: 'high', linkedToPillar: true, ...getQueryStats(['dog barking', 'stop barking']) },
        { title: 'Dog Socialization Guide', slug: 'dog-socialization-tips', wordCount: 1500, intent: 'informational', priority: 'medium', linkedToPillar: true, ...getQueryStats(['dog socialization']) },
        { title: 'Recall Training for Dogs', slug: 'recall-training-guide', wordCount: 1500, intent: 'informational', priority: 'medium', linkedToPillar: true, ...getQueryStats(['recall training', 'come command']) },
        { title: 'Clicker Training for Beginners', slug: 'clicker-training-beginners', wordCount: 1500, intent: 'informational', priority: 'low', linkedToPillar: true, ...getQueryStats(['clicker training']) },
      ],
    },
    {
      name: 'Dog Enrichment',
      slug: 'dog-enrichment-hub',
      cornerstonePage: '/guides/ultimate-dog-enrichment-guide-2026',
      cornerstoneWordCount: 4500,
      linkFlow: 'hub → 10 spokes → hub (bidirectional)',
      authorityProjection: 68,
      clusters: [
        { title: 'Outdoor Dog Games – 15 Fun Ideas for Every Breed', slug: 'outdoor-dog-games', wordCount: 3000, intent: 'informational', priority: 'high', linkedToPillar: true, ...getQueryStats(['outdoor dog games', 'games dogs outside']) },
        { title: 'Best Interactive Dog Toys 2026', slug: 'best-interactive-dog-toys', wordCount: 2500, intent: 'commercial', priority: 'high', linkedToPillar: true, ...getQueryStats(['interactive dog toys', 'dog puzzle toys']) },
        { title: 'Dog Enrichment Toys That Actually Work', slug: 'dog-enrichment-toys', wordCount: 2000, intent: 'commercial', priority: 'high', linkedToPillar: true, ...getQueryStats(['enrichment toys', 'dog enrichment']) },
        { title: 'Indoor Dog Enrichment Ideas', slug: 'indoor-dog-enrichment-ideas', wordCount: 2000, intent: 'informational', priority: 'high', linkedToPillar: true, ...getQueryStats(['indoor dog', 'bored dog']) },
        { title: 'Best Slow Feeder Dog Bowls', slug: 'best-slow-feeder-dog-bowls', wordCount: 2000, intent: 'commercial', priority: 'high', linkedToPillar: true, ...getQueryStats(['slow feeder', 'slow bowl']) },
        { title: 'Snuffle Mat Guide for Dogs', slug: 'snuffle-mat-dog-guide', wordCount: 1500, intent: 'informational', priority: 'medium', linkedToPillar: true, ...getQueryStats(['snuffle mat']) },
        { title: 'DIY Dog Enrichment Activities', slug: 'diy-dog-enrichment', wordCount: 1800, intent: 'informational', priority: 'medium', linkedToPillar: true, ...getQueryStats(['diy dog', 'homemade dog']) },
        { title: 'Best Puzzle Feeders for Dogs', slug: 'best-puzzle-feeders-dogs', wordCount: 2000, intent: 'commercial', priority: 'high', linkedToPillar: true, ...getQueryStats(['puzzle feeder']) },
        { title: 'Dog Boredom Signs & Solutions', slug: 'dog-boredom-signs-solutions', wordCount: 1500, intent: 'informational', priority: 'medium', linkedToPillar: true, ...getQueryStats(['dog boredom', 'bored dog signs']) },
        { title: 'Seasonal Dog Activities Calendar', slug: 'seasonal-dog-activities', wordCount: 1800, intent: 'informational', priority: 'low', linkedToPillar: true, ...getQueryStats(['seasonal dog', 'dog activities']) },
      ],
    },
    {
      name: 'Puppy Care',
      slug: 'puppy-care-hub',
      cornerstonePage: '/guides/complete-puppy-care-guide-2026',
      cornerstoneWordCount: 4000,
      linkFlow: 'hub → 6 spokes → hub',
      authorityProjection: 55,
      clusters: [
        { title: 'New Puppy Checklist 2026', slug: 'new-puppy-checklist', wordCount: 2000, intent: 'commercial', priority: 'high', linkedToPillar: true, ...getQueryStats(['new puppy', 'puppy checklist']) },
        { title: 'Puppy Feeding Schedule Guide', slug: 'puppy-feeding-schedule', wordCount: 1800, intent: 'informational', priority: 'high', linkedToPillar: true, ...getQueryStats(['puppy feeding', 'feed puppy']) },
        { title: 'Puppy Teething & Chewing Solutions', slug: 'puppy-teething-solutions', wordCount: 1500, intent: 'informational', priority: 'medium', linkedToPillar: true, ...getQueryStats(['puppy teething', 'puppy chewing']) },
        { title: 'How to House Train a Puppy', slug: 'house-train-puppy-guide', wordCount: 2000, intent: 'informational', priority: 'high', linkedToPillar: true, ...getQueryStats(['house train', 'potty train']) },
        { title: 'Puppy Sleep Schedule & Crate Setup', slug: 'puppy-sleep-schedule', wordCount: 1500, intent: 'informational', priority: 'medium', linkedToPillar: true, ...getQueryStats(['puppy sleep', 'puppy crate']) },
        { title: 'First Vet Visit Checklist', slug: 'first-vet-visit-puppy', wordCount: 1200, intent: 'informational', priority: 'low', linkedToPillar: true, ...getQueryStats(['vet visit', 'puppy vet']) },
      ],
    },
    {
      name: 'Dog Health Basics',
      slug: 'dog-health-hub',
      cornerstonePage: '/guides/dog-health-essentials-2026',
      cornerstoneWordCount: 4000,
      linkFlow: 'hub → 6 spokes → hub',
      authorityProjection: 50,
      clusters: [
        { title: 'Dog Dental Care Guide', slug: 'dog-dental-care-guide', wordCount: 1800, intent: 'informational', priority: 'medium', linkedToPillar: true, ...getQueryStats(['dog dental', 'dog teeth']) },
        { title: 'Dog Anxiety Signs & Solutions', slug: 'dog-anxiety-signs-solutions', wordCount: 2000, intent: 'informational', priority: 'high', linkedToPillar: true, ...getQueryStats(['dog anxiety', 'anxious dog']) },
        { title: 'Best Dog Supplements 2026', slug: 'best-dog-supplements', wordCount: 2000, intent: 'commercial', priority: 'medium', linkedToPillar: true, ...getQueryStats(['dog supplements', 'dog vitamins']) },
        { title: 'Dog Grooming at Home Guide', slug: 'dog-grooming-home-guide', wordCount: 1800, intent: 'informational', priority: 'medium', linkedToPillar: true, ...getQueryStats(['dog grooming', 'groom dog']) },
        { title: 'Common Dog Allergies Guide', slug: 'dog-allergies-guide', wordCount: 1500, intent: 'informational', priority: 'low', linkedToPillar: true, ...getQueryStats(['dog allergies', 'dog allergy']) },
        { title: 'Senior Dog Care Essentials', slug: 'senior-dog-care', wordCount: 1500, intent: 'informational', priority: 'medium', linkedToPillar: true, ...getQueryStats(['senior dog', 'old dog care']) },
      ],
    },
    {
      name: 'Dog Toys & Play',
      slug: 'dog-toys-hub',
      cornerstonePage: '/guides/best-dog-toys-2026',
      cornerstoneWordCount: 4500,
      linkFlow: 'hub → 8 spokes → hub + product links',
      authorityProjection: 65,
      clusters: [
        { title: 'Best Chew Toys for Aggressive Chewers', slug: 'best-chew-toys-aggressive-chewers', wordCount: 2000, intent: 'commercial', priority: 'high', linkedToPillar: true, ...getQueryStats(['chew toys', 'aggressive chewer']) },
        { title: 'Best Fetch Toys for Dogs', slug: 'best-fetch-toys-dogs', wordCount: 1800, intent: 'commercial', priority: 'high', linkedToPillar: true, ...getQueryStats(['fetch toys', 'ball launcher']) },
        { title: 'Best Tug Toys for Dogs', slug: 'best-tug-toys-dogs', wordCount: 1500, intent: 'commercial', priority: 'medium', linkedToPillar: true, ...getQueryStats(['tug toys', 'rope toy']) },
        { title: 'Best Plush Dog Toys', slug: 'best-plush-dog-toys', wordCount: 1500, intent: 'commercial', priority: 'medium', linkedToPillar: true, ...getQueryStats(['plush dog', 'stuffed dog toy']) },
        { title: 'Indestructible Dog Toys Guide', slug: 'indestructible-dog-toys', wordCount: 2000, intent: 'commercial', priority: 'high', linkedToPillar: true, ...getQueryStats(['indestructible', 'durable dog toy']) },
        { title: 'Best Dog Toys by Breed Size', slug: 'dog-toys-by-breed-size', wordCount: 2000, intent: 'commercial', priority: 'medium', linkedToPillar: true, ...getQueryStats(['dog toys small', 'dog toys large']) },
        { title: 'Dog Toy Safety Guide', slug: 'dog-toy-safety-guide', wordCount: 1200, intent: 'informational', priority: 'low', linkedToPillar: true, ...getQueryStats(['dog toy safety', 'safe dog toys']) },
        { title: 'Squeaky Toys: Good or Bad?', slug: 'squeaky-toys-good-or-bad', wordCount: 1500, intent: 'informational', priority: 'low', linkedToPillar: true, ...getQueryStats(['squeaky toy', 'squeaker dog']) },
      ],
    },
    {
      name: 'Seasonal Dog Activities',
      slug: 'seasonal-activities-hub',
      cornerstonePage: '/guides/seasonal-dog-activities-guide-2026',
      cornerstoneWordCount: 3500,
      linkFlow: 'hub → 5 spokes → hub',
      authorityProjection: 40,
      clusters: [
        { title: 'Summer Dog Safety & Activities', slug: 'summer-dog-safety-activities', wordCount: 2000, intent: 'informational', priority: 'high', linkedToPillar: true, ...getQueryStats(['summer dog', 'hot weather dog']) },
        { title: 'Winter Dog Care & Play', slug: 'winter-dog-care-play', wordCount: 1800, intent: 'informational', priority: 'medium', linkedToPillar: true, ...getQueryStats(['winter dog', 'snow dog']) },
        { title: 'Rainy Day Dog Activities', slug: 'rainy-day-dog-activities', wordCount: 1500, intent: 'informational', priority: 'medium', linkedToPillar: true, ...getQueryStats(['rainy day dog', 'indoor dog rainy']) },
        { title: 'Dog-Friendly Hiking Guide', slug: 'dog-friendly-hiking-guide', wordCount: 2000, intent: 'informational', priority: 'medium', linkedToPillar: true, ...getQueryStats(['dog hiking', 'hike with dog']) },
        { title: 'Beach Day with Dogs', slug: 'beach-day-dogs-guide', wordCount: 1500, intent: 'informational', priority: 'low', linkedToPillar: true, ...getQueryStats(['beach dog', 'dog beach']) },
      ],
    },
    {
      name: 'Cat Enrichment',
      slug: 'cat-enrichment-hub',
      cornerstonePage: '/guides/ultimate-cat-enrichment-guide-2026',
      cornerstoneWordCount: 4000,
      linkFlow: 'hub → 7 spokes → hub',
      authorityProjection: 58,
      clusters: [
        { title: 'Best Cat Toys for Indoor Cats', slug: 'best-cat-toys-indoor-cats', wordCount: 2500, intent: 'commercial', priority: 'high', linkedToPillar: true, ...getQueryStats(['cat toys indoor', 'indoor cat toys']) },
        { title: 'Best Cat Litter Boxes 2026', slug: 'best-cat-litter-box-2026', wordCount: 3000, intent: 'commercial', priority: 'high', linkedToPillar: true, ...getQueryStats(['cat litter box', 'litter box']) },
        { title: 'Indoor Cat Entertainment Ideas', slug: 'indoor-cat-entertainment', wordCount: 2000, intent: 'informational', priority: 'high', linkedToPillar: true, ...getQueryStats(['indoor cat', 'entertaining cat']) },
        { title: 'Best Cat Trees & Condos 2026', slug: 'best-cat-trees-condos-2026', wordCount: 2500, intent: 'commercial', priority: 'high', linkedToPillar: true, ...getQueryStats(['cat tree', 'cat condo', 'cat tower']) },
        { title: 'Cat Puzzle Feeders Guide', slug: 'cat-puzzle-feeders-guide', wordCount: 1500, intent: 'commercial', priority: 'medium', linkedToPillar: true, ...getQueryStats(['cat puzzle', 'cat feeder']) },
        { title: 'Cat Window Perch Setup', slug: 'cat-window-perch-guide', wordCount: 1200, intent: 'informational', priority: 'low', linkedToPillar: true, ...getQueryStats(['cat window', 'window perch']) },
        { title: 'Multi-Cat Household Tips', slug: 'multi-cat-household-guide', wordCount: 1800, intent: 'informational', priority: 'medium', linkedToPillar: true, ...getQueryStats(['multi cat', 'multiple cats']) },
      ],
    },
  ];

  // Build internal link graph
  const internalLinkGraph: InternalLinkEdge[] = [];
  for (const pillar of pillars) {
    for (const cluster of pillar.clusters) {
      // Hub → Spoke
      internalLinkGraph.push({
        from: pillar.cornerstonePage,
        to: `/guides/${cluster.slug}`,
        anchorText: cluster.title.toLowerCase(),
        type: 'hub-to-spoke',
      });
      // Spoke → Hub
      internalLinkGraph.push({
        from: `/guides/${cluster.slug}`,
        to: pillar.cornerstonePage,
        anchorText: `${pillar.name} complete guide`,
        type: 'spoke-to-hub',
      });
    }
    // Cross-cluster links (every spoke links to 2 siblings)
    for (let i = 0; i < pillar.clusters.length; i++) {
      const next = pillar.clusters[(i + 1) % pillar.clusters.length];
      internalLinkGraph.push({
        from: `/guides/${pillar.clusters[i].slug}`,
        to: `/guides/${next.slug}`,
        anchorText: next.title.toLowerCase().slice(0, 50),
        type: 'cross-cluster',
      });
    }
  }

  const allClusters = pillars.flatMap(p => p.clusters);
  const totalPages = pillars.length + allClusters.length; // cornerstones + clusters
  const totalWordCount = pillars.reduce((s, p) => s + p.cornerstoneWordCount, 0) +
    allClusters.reduce((s, c) => s + c.wordCount, 0);
  const authorityScoreProjection = Math.round(
    pillars.reduce((s, p) => s + p.authorityProjection, 0) / pillars.length
  );

  return {
    pillars,
    clusters: allClusters,
    internalLinkGraph,
    authorityScoreProjection,
    totalPagesRequired: totalPages,
    totalWordCount,
  };
}

// ============= PHASE 3: 90-DAY ROADMAP =============

function buildRoadmap(queries: GscQuery[], authorityMap: TopicalAuthorityMap): DominanceRoadmap {
  const totalQueries = queries.length;
  const totalImpressions = queries.reduce((s, q) => s + q.impressions, 0);
  const avgPosition = queries.length > 0 ? queries.reduce((s, q) => s + q.position, 0) / queries.length : 80;

  const months: RoadmapMonth[] = [
    {
      month: 1,
      label: 'Foundation — Core Infrastructure',
      pillarPages: 3,
      clusterArticles: 6,
      tasks: [
        'Deploy real GSC query sync (gsc_keywords table) — DONE',
        'Publish Dog Enrichment Hub cornerstone (4,500 words)',
        'Publish Dog Training Hub cornerstone (5,000 words)',
        'Publish Cat Enrichment Hub cornerstone (4,000 words)',
        'Publish 6 high-priority cluster articles (outdoor dog games, interactive toys, slow feeders, puppy training, indoor cat entertainment, cat trees)',
        'Activate internal link automation engine (hub ↔ spoke bidirectional)',
        'Set up Yellow Zone monitoring on real query data',
        'CTR title optimization pass on top 20 impression queries',
      ],
      targets: [
        { metric: 'Total queries tracked', current: `${totalQueries}`, target: '500+' },
        { metric: 'Pillar pages live', current: '0', target: '3' },
        { metric: 'Internal links injected', current: '0', target: '50+' },
      ],
    },
    {
      month: 2,
      label: 'Expansion — Cluster Density',
      pillarPages: 2,
      clusterArticles: 10,
      tasks: [
        'Publish 10 supporting cluster articles across all pillars',
        'Publish Dog Toys & Play Hub + Puppy Care Hub cornerstones',
        'Refresh low-ranking guides with +800 word expansion',
        'Schema optimization pass (FAQPage on all guides)',
        'CTR optimization on Yellow Zone queries (pos 11-30)',
        'Internal link density audit (target 4 links/1000 words)',
        'First backlink asset creation (US Pet Owner Survey)',
        'Cross-cluster linking pass (2 sibling links per article)',
      ],
      targets: [
        { metric: 'Avg position', current: `${Math.round(avgPosition)}`, target: `${Math.round(avgPosition * 0.75)}` },
        { metric: 'Total cluster articles', current: '6', target: '16' },
        { metric: 'Impressions', current: `${totalImpressions}`, target: `${Math.round(totalImpressions * 2.5)}` },
      ],
    },
    {
      month: 3,
      label: 'Acceleration — Authority Stacking',
      pillarPages: 2,
      clusterArticles: 8,
      tasks: [
        'Publish final 2 pillar pages (Seasonal Activities + Dog Health)',
        'Publish 8 remaining high-priority cluster articles',
        'Launch linkbait data study: "2026 US Pet Owner Behavior Report"',
        'Digital PR outreach to 20 pet publications',
        'Expand all high-impression informational keywords (+300 words each)',
        'Authority score recalculation across all pillars',
        'Backlink velocity push: 15 placements in 30 days',
        'Full crawl budget optimization audit',
      ],
      targets: [
        { metric: 'Avg position', current: `${Math.round(avgPosition * 0.75)}`, target: `${Math.round(avgPosition * 0.55)}` },
        { metric: 'Total pages', current: '21', target: `${authorityMap.totalPagesRequired}` },
        { metric: 'Monthly clicks', current: '1', target: '100+' },
      ],
    },
  ];

  const authorityGrowthCurve = [
    { month: 0, score: 15 },
    { month: 1, score: 35 },
    { month: 2, score: 55 },
    { month: 3, score: authorityMap.authorityScoreProjection },
  ];

  return {
    months,
    expectedRankingLift: `Avg position ${Math.round(avgPosition)} → ${Math.round(avgPosition * 0.55)} (−${Math.round(avgPosition * 0.45)} positions)`,
    expectedTrafficIncrease: `${totalImpressions} → ${Math.round(totalImpressions * 5)} impressions/month (+${Math.round(400)}%)`,
    authorityGrowthCurve,
  };
}

// ============= MAIN ORCHESTRATOR =============

export function runContentDominance(queries: GscQuery[]): ContentDominanceResult {
  // Filter out Dutch queries
  const englishQueries = queries.filter(q => !isDutch(q.query));
  const totalImpressions = englishQueries.reduce((s, q) => s + q.impressions, 0);

  // Yellow Zone: pos 11-30, impressions >= 5, English only
  const yellowZoneQueries = englishQueries
    .filter(q => q.position >= 11 && q.position <= 30 && q.impressions >= 5)
    .sort((a, b) => b.impressions - a.impressions);

  // Needle Movers: pos 30+, impressions >= 10
  const needleMovers = englishQueries
    .filter(q => q.position > 30 && q.impressions >= 10)
    .sort((a, b) => b.impressions - a.impressions);

  // Phase 1: Breakout Blueprint for "outdoor dog games"
  const breakoutBlueprint = buildBreakoutBlueprint(englishQueries, 'outdoor dog games');

  // Phase 2: Topical Authority Map
  const topicalAuthorityMap = buildTopicalAuthorityMap(englishQueries);

  // Phase 3: 90-Day Roadmap
  const roadmap = buildRoadmap(englishQueries, topicalAuthorityMap);

  // Breakout targets = queries with high impressions but low position
  const breakoutTargets = englishQueries.filter(q => q.impressions >= 15 && q.position > 40);

  return {
    breakoutBlueprint,
    topicalAuthorityMap,
    roadmap,
    yellowZoneQueries,
    needleMovers,
    systemSummary: {
      dominanceMode: 'ACTIVE',
      safePushEnabled: yellowZoneQueries.length >= 3,
      breakoutTargetsDetected: breakoutTargets.length,
      trafficProjection90d: roadmap.expectedTrafficIncrease,
      systemIntegrity: 'QUERY_DRIVEN',
      totalRealQueries: englishQueries.length,
      totalImpressions,
    },
  };
}

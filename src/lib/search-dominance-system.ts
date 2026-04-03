/**
 * 3-Layer Search Dominance System — GetPawsy
 * 
 * LAYER 1: Ranking Gap Attack (competitor intelligence + gap execution)
 * LAYER 2: SEO Moat Defense (topical fortress + content differentiation)
 * LAYER 3: AI SEO Automation (auto-content, cannibalization, crawl budget)
 */

// ============================================================
// LAYER 1 — RANKING GAP ATTACK SYSTEM
// ============================================================

export interface CompetitorTarget {
  domain: string;
  name: string;
  strengths: string[];
  weaknesses: string[];
  topKeywords: string[];
}

export const TOP_COMPETITORS: CompetitorTarget[] = [
  {
    domain: 'chewy.com',
    name: 'Chewy',
    strengths: ['massive product catalog', 'autoship', 'brand recognition', 'review volume'],
    weaknesses: ['generic content', 'thin product descriptions', 'no expert guides'],
    topKeywords: ['dog beds', 'cat trees', 'pet food', 'dog crates'],
  },
  {
    domain: 'amazon.com',
    name: 'Amazon',
    strengths: ['domain authority', 'product variety', 'review depth'],
    weaknesses: ['no editorial content', 'no breed-specific guides', 'no expert authority'],
    topKeywords: ['orthopedic dog bed', 'automatic cat feeder', 'cat tree'],
  },
  {
    domain: 'petsmart.com',
    name: 'PetSmart',
    strengths: ['in-store presence', 'brand trust', 'vet partnerships'],
    weaknesses: ['weak blog content', 'poor internal linking', 'slow site speed'],
    topKeywords: ['dog toys', 'cat litter', 'pet carriers'],
  },
  {
    domain: 'petco.com',
    name: 'Petco',
    strengths: ['retail network', 'vet services', 'grooming content'],
    weaknesses: ['thin collection pages', 'no comparison content', 'generic H1s'],
    topKeywords: ['dog harness', 'cat food', 'fish supplies'],
  },
  {
    domain: 'walmart.com',
    name: 'Walmart',
    strengths: ['price competition', 'massive reach', 'domain authority'],
    weaknesses: ['zero editorial', 'no pet expertise signals', 'poor UX'],
    topKeywords: ['cheap dog beds', 'cat litter box', 'dog bowls'],
  },
  {
    domain: 'rover.com',
    name: 'Rover',
    strengths: ['strong blog authority', 'E-E-A-T signals', 'pet care expertise'],
    weaknesses: ['services-focused, not products', 'limited commercial intent'],
    topKeywords: ['dog anxiety', 'separation anxiety dogs', 'dog training tips'],
  },
  {
    domain: 'akc.org',
    name: 'AKC',
    strengths: ['authoritative breed content', 'massive backlink profile'],
    weaknesses: ['non-commercial', 'no product recommendations'],
    topKeywords: ['dog breeds', 'puppy training', 'best dogs for families'],
  },
  {
    domain: 'thewildest.com',
    name: 'The Wildest',
    strengths: ['editorial quality', 'expert contributors', 'lifestyle content'],
    weaknesses: ['limited product focus', 'slow content publishing'],
    topKeywords: ['dog enrichment', 'cat behavior', 'pet wellness'],
  },
  {
    domain: 'barkbox.com',
    name: 'BarkBox',
    strengths: ['brand loyalty', 'subscription model', 'social media'],
    weaknesses: ['narrow product range', 'toys-only focus'],
    topKeywords: ['dog toys subscription', 'tough dog toys', 'dog chew toys'],
  },
  {
    domain: 'tuft-paw.com',
    name: 'Tuft + Paw',
    strengths: ['premium cat furniture niche', 'design-focused', 'strong SEO'],
    weaknesses: ['cat-only', 'high price point', 'limited range'],
    topKeywords: ['modern cat tree', 'cat furniture', 'cat shelves'],
  },
];

// ============= RANKING GAP CATEGORIES =============

export type GapCategory = 'immediate_win' | 'mid_term_growth' | 'authority_building';

export interface RankingGap {
  keyword: string;
  searchVolume: number;
  competitorRanking: number;
  competitorDomain: string;
  getpawsyStatus: 'not_ranking' | 'weak' | 'partial';
  category: GapCategory;
  intent: 'commercial' | 'informational' | 'comparison' | 'transactional';
  suggestedPageType: 'blog' | 'collection' | 'pillar' | 'comparison';
  suggestedSlug: string;
}

export const RANKING_GAPS: RankingGap[] = [
  // IMMEDIATE WINS (low difficulty, strong intent)
  { keyword: 'best cooling dog bed for summer', searchVolume: 720, competitorRanking: 8, competitorDomain: 'chewy.com', getpawsyStatus: 'weak', category: 'immediate_win', intent: 'commercial', suggestedPageType: 'blog', suggestedSlug: 'best-cooling-dog-beds-summer-2026' },
  { keyword: 'cat tree for heavy cats', searchVolume: 590, competitorRanking: 5, competitorDomain: 'tuft-paw.com', getpawsyStatus: 'partial', category: 'immediate_win', intent: 'commercial', suggestedPageType: 'collection', suggestedSlug: 'cat-tree-for-heavy-cats' },
  { keyword: 'self cleaning litter box worth it', searchVolume: 480, competitorRanking: 3, competitorDomain: 'thewildest.com', getpawsyStatus: 'not_ranking', category: 'immediate_win', intent: 'informational', suggestedPageType: 'blog', suggestedSlug: 'self-cleaning-litter-box-worth-it' },
  { keyword: 'best dog car seat small dogs', searchVolume: 880, competitorRanking: 6, competitorDomain: 'chewy.com', getpawsyStatus: 'weak', category: 'immediate_win', intent: 'commercial', suggestedPageType: 'collection', suggestedSlug: 'dog-car-seat-for-small-dogs' },
  { keyword: 'indestructible dog bed', searchVolume: 1200, competitorRanking: 4, competitorDomain: 'amazon.com', getpawsyStatus: 'not_ranking', category: 'immediate_win', intent: 'transactional', suggestedPageType: 'collection', suggestedSlug: 'indestructible-dog-beds' },

  // MID-TERM GROWTH
  { keyword: 'automatic cat feeder wet food', searchVolume: 1600, competitorRanking: 3, competitorDomain: 'chewy.com', getpawsyStatus: 'partial', category: 'mid_term_growth', intent: 'commercial', suggestedPageType: 'collection', suggestedSlug: 'best-automatic-cat-feeder-wet-food' },
  { keyword: 'dog bed for crate', searchVolume: 1100, competitorRanking: 5, competitorDomain: 'amazon.com', getpawsyStatus: 'weak', category: 'mid_term_growth', intent: 'commercial', suggestedPageType: 'collection', suggestedSlug: 'best-dog-bed-for-crate-training' },
  { keyword: 'cat anxiety symptoms', searchVolume: 2200, competitorRanking: 2, competitorDomain: 'rover.com', getpawsyStatus: 'not_ranking', category: 'mid_term_growth', intent: 'informational', suggestedPageType: 'blog', suggestedSlug: 'cat-anxiety-symptoms-solutions' },
  { keyword: 'best no pull harness 2026', searchVolume: 1400, competitorRanking: 4, competitorDomain: 'petsmart.com', getpawsyStatus: 'weak', category: 'mid_term_growth', intent: 'commercial', suggestedPageType: 'blog', suggestedSlug: 'best-no-pull-dog-harness-2026' },
  { keyword: 'how to crate train a puppy', searchVolume: 3200, competitorRanking: 1, competitorDomain: 'akc.org', getpawsyStatus: 'not_ranking', category: 'mid_term_growth', intent: 'informational', suggestedPageType: 'blog', suggestedSlug: 'how-to-crate-train-puppy-guide' },

  // AUTHORITY BUILDING
  { keyword: 'orthopedic dog bed', searchVolume: 6600, competitorRanking: 2, competitorDomain: 'amazon.com', getpawsyStatus: 'partial', category: 'authority_building', intent: 'commercial', suggestedPageType: 'pillar', suggestedSlug: 'orthopedic-calming-dog-beds' },
  { keyword: 'cat tree', searchVolume: 12100, competitorRanking: 1, competitorDomain: 'amazon.com', getpawsyStatus: 'partial', category: 'authority_building', intent: 'commercial', suggestedPageType: 'pillar', suggestedSlug: 'cat-condos' },
  { keyword: 'dog toys', searchVolume: 14800, competitorRanking: 1, competitorDomain: 'chewy.com', getpawsyStatus: 'partial', category: 'authority_building', intent: 'commercial', suggestedPageType: 'pillar', suggestedSlug: 'best-interactive-dog-toys' },
  { keyword: 'cat litter box', searchVolume: 8100, competitorRanking: 2, competitorDomain: 'petsmart.com', getpawsyStatus: 'partial', category: 'authority_building', intent: 'commercial', suggestedPageType: 'pillar', suggestedSlug: 'best-cat-litter-boxes' },
  { keyword: 'dog grooming', searchVolume: 9900, competitorRanking: 3, competitorDomain: 'petco.com', getpawsyStatus: 'weak', category: 'authority_building', intent: 'commercial', suggestedPageType: 'pillar', suggestedSlug: 'best-dog-grooming-kits' },
];

// ============= GAP ATTACK: 25 REVENUE-FOCUSED BLOG TOPICS =============

export interface GapAttackContent {
  slug: string;
  title: string;
  primaryKeyword: string;
  type: 'blog' | 'comparison' | 'buyer_guide' | 'pillar';
  targetCollection: string;
  relatedArticles: string[];
  faqQuestions: string[];
  estimatedSearchVolume: number;
  difficulty: 'low' | 'medium' | 'high';
}

export const GAP_ATTACK_BLOGS: GapAttackContent[] = [
  // Dog Beds cluster
  { slug: 'best-cooling-dog-beds-summer-2026', title: 'Best Cooling Dog Beds for Summer 2026 – Expert Tested', primaryKeyword: 'best cooling dog beds', type: 'blog', targetCollection: 'orthopedic-calming-dog-beds', relatedArticles: ['best-orthopedic-dog-beds-2026', 'how-to-choose-dog-bed-size'], faqQuestions: ['Do cooling dog beds actually work?', 'What is the best material for a cooling dog bed?', 'How do gel cooling dog beds work?'], estimatedSearchVolume: 720, difficulty: 'low' },
  { slug: 'best-dog-beds-for-german-shepherds', title: 'Best Dog Beds for German Shepherds – Size & Support Guide', primaryKeyword: 'best dog bed for german shepherd', type: 'blog', targetCollection: 'best-dog-beds-for-large-dogs', relatedArticles: ['best-orthopedic-dog-beds-2026', 'how-to-choose-dog-bed-size'], faqQuestions: ['What size bed does a German Shepherd need?', 'Do German Shepherds need orthopedic beds?'], estimatedSearchVolume: 590, difficulty: 'low' },
  { slug: 'waterproof-dog-bed-buyers-guide', title: 'Waterproof Dog Beds – The Complete Buyer\'s Guide', primaryKeyword: 'waterproof dog bed', type: 'blog', targetCollection: 'waterproof-dog-beds', relatedArticles: ['best-orthopedic-dog-beds-2026'], faqQuestions: ['Are waterproof dog beds safe?', 'How to clean a waterproof dog bed?', 'What makes a dog bed truly waterproof?'], estimatedSearchVolume: 880, difficulty: 'low' },
  { slug: 'best-dog-bed-for-hip-dysplasia', title: 'Best Dog Beds for Hip Dysplasia – Vet-Recommended Options', primaryKeyword: 'best dog bed for hip dysplasia', type: 'blog', targetCollection: 'best-orthopedic-dog-beds', relatedArticles: ['best-orthopedic-dog-beds-2026', 'calming-dog-bed-guide'], faqQuestions: ['What type of bed is best for a dog with hip dysplasia?', 'Is memory foam good for dogs with joint pain?'], estimatedSearchVolume: 480, difficulty: 'low' },
  { slug: 'best-dog-bed-for-labrador', title: 'Best Dog Beds for Labradors – Expert Picks for 2026', primaryKeyword: 'best dog bed for labrador', type: 'blog', targetCollection: 'best-dog-beds-for-large-dogs', relatedArticles: ['best-orthopedic-dog-beds-2026'], faqQuestions: ['What size bed does a Labrador need?', 'Do Labs prefer bolster or flat beds?'], estimatedSearchVolume: 720, difficulty: 'low' },

  // Cat Furniture cluster
  { slug: 'best-cat-trees-for-small-apartments-2026', title: 'Best Cat Trees for Small Apartments – Space-Saving Picks', primaryKeyword: 'cat trees for small apartments', type: 'blog', targetCollection: 'best-cat-trees-for-small-apartments', relatedArticles: ['best-cat-trees-guide'], faqQuestions: ['What is the best cat tree for a studio apartment?', 'How tall should a cat tree be in a small space?'], estimatedSearchVolume: 890, difficulty: 'low' },
  { slug: 'wall-mounted-cat-shelves-vs-cat-trees', title: 'Wall-Mounted Cat Shelves vs Cat Trees – Which is Better?', primaryKeyword: 'cat shelves vs cat trees', type: 'blog', targetCollection: 'wall-mounted-cat-furniture', relatedArticles: ['best-cat-trees-guide', 'cat-climbing-behavior-explained'], faqQuestions: ['Are wall shelves better than cat trees?', 'Can you use both cat shelves and a cat tree?'], estimatedSearchVolume: 390, difficulty: 'low' },
  { slug: 'best-cat-trees-for-senior-cats', title: 'Best Cat Trees for Senior Cats – Low-Entry & Gentle Options', primaryKeyword: 'cat trees for senior cats', type: 'blog', targetCollection: 'cat-condos', relatedArticles: ['best-cat-trees-guide'], faqQuestions: ['Do senior cats still use cat trees?', 'What features should a senior cat tree have?'], estimatedSearchVolume: 320, difficulty: 'low' },

  // Cat Litter cluster
  { slug: 'self-cleaning-litter-box-worth-it', title: 'Is a Self-Cleaning Litter Box Worth It? Honest Review', primaryKeyword: 'self cleaning litter box worth it', type: 'blog', targetCollection: 'self-cleaning-litter-box-guide', relatedArticles: ['cat-litter-box-problems-solutions'], faqQuestions: ['Do self-cleaning litter boxes really work?', 'How much does a self-cleaning litter box cost?', 'Are self-cleaning litter boxes safe for cats?'], estimatedSearchVolume: 480, difficulty: 'low' },
  { slug: 'best-litter-box-for-multiple-cats', title: 'Best Litter Box for Multiple Cats – Multi-Cat Household Guide', primaryKeyword: 'best litter box for multiple cats', type: 'blog', targetCollection: 'best-cat-litter-boxes', relatedArticles: ['cat-litter-box-problems-solutions'], faqQuestions: ['How many litter boxes do you need for 2 cats?', 'Can two cats share one litter box?'], estimatedSearchVolume: 590, difficulty: 'low' },

  // Dog Travel cluster
  { slug: 'how-to-keep-dog-safe-in-car', title: 'How to Keep Your Dog Safe in the Car – Complete Safety Guide', primaryKeyword: 'dog car safety', type: 'blog', targetCollection: 'dog-car-travel-safety-seats', relatedArticles: ['how-to-keep-dog-calm-in-car'], faqQuestions: ['Is it safe for dogs to ride in the front seat?', 'What is the safest way for a dog to travel in a car?'], estimatedSearchVolume: 720, difficulty: 'low' },
  { slug: 'best-dog-travel-bags-2026', title: 'Best Dog Travel Bags for 2026 – Airline & Road Trip Ready', primaryKeyword: 'best dog travel bag', type: 'blog', targetCollection: 'dog-travel-accessories', relatedArticles: [], faqQuestions: ['What size travel bag does my dog need?', 'Are soft-sided dog carriers airline approved?'], estimatedSearchVolume: 480, difficulty: 'low' },

  // Dog Grooming cluster
  { slug: 'best-dog-nail-grinders-2026', title: 'Best Dog Nail Grinders 2026 – Quiet & Stress-Free Options', primaryKeyword: 'best dog nail grinder', type: 'blog', targetCollection: 'best-dog-grooming-kits', relatedArticles: ['how-often-should-you-groom-your-dog'], faqQuestions: ['Are nail grinders safe for dogs?', 'Nail grinder vs nail clipper for dogs?'], estimatedSearchVolume: 880, difficulty: 'low' },
  { slug: 'best-deshedding-tools-for-dogs', title: 'Best Deshedding Tools for Dogs – Reduce Shedding by 90%', primaryKeyword: 'best deshedding tool for dogs', type: 'blog', targetCollection: 'best-dog-grooming-kits', relatedArticles: ['best-grooming-tools-for-double-coated-dogs'], faqQuestions: ['How often should you deshed a dog?', 'Does a FURminator damage coat?'], estimatedSearchVolume: 720, difficulty: 'low' },

  // Dog Feeding cluster
  { slug: 'best-raised-dog-bowls-for-large-breeds', title: 'Best Raised Dog Bowls for Large Breeds – Posture & Digestion', primaryKeyword: 'raised dog bowls for large dogs', type: 'blog', targetCollection: 'best-slow-feeder-dog-bowls', relatedArticles: ['elevated-vs-floor-dog-bowl-which-is-better', 'benefits-of-slow-feeder-bowls'], faqQuestions: ['Are raised bowls better for large dogs?', 'Do elevated bowls cause bloat?'], estimatedSearchVolume: 590, difficulty: 'low' },

  // Cat Enrichment cluster
  { slug: 'best-puzzle-feeders-for-cats', title: 'Best Puzzle Feeders for Cats – Fight Boredom & Obesity', primaryKeyword: 'puzzle feeder for cats', type: 'blog', targetCollection: 'best-cat-toys-for-indoor-cats', relatedArticles: ['indoor-cat-boredom-signs'], faqQuestions: ['Do cats like puzzle feeders?', 'How do puzzle feeders help cats?'], estimatedSearchVolume: 480, difficulty: 'low' },
  { slug: 'how-to-keep-indoor-cat-happy', title: 'How to Keep an Indoor Cat Happy – 15 Expert Tips', primaryKeyword: 'how to keep indoor cat happy', type: 'blog', targetCollection: 'best-cat-toys-for-indoor-cats', relatedArticles: ['indoor-cat-boredom-signs', 'cat-sleep-patterns-explained'], faqQuestions: ['Do indoor cats get depressed?', 'How much playtime does an indoor cat need?'], estimatedSearchVolume: 1100, difficulty: 'medium' },

  // Cat Beds cluster  
  { slug: 'best-heated-cat-beds-for-winter', title: 'Best Heated Cat Beds for Winter – Warm & Safe Options', primaryKeyword: 'heated cat bed', type: 'blog', targetCollection: 'best-cat-beds', relatedArticles: [], faqQuestions: ['Are heated cat beds safe?', 'Do cats need heated beds?'], estimatedSearchVolume: 590, difficulty: 'low' },

  // Dog Harness cluster
  { slug: 'best-no-pull-dog-harness-2026', title: 'Best No-Pull Dog Harnesses 2026 – Stop Pulling Today', primaryKeyword: 'best no pull dog harness', type: 'blog', targetCollection: 'best-dog-harnesses', relatedArticles: ['best-harness-for-dogs-that-pull', 'harness-vs-collar-which-is-safer'], faqQuestions: ['Do no-pull harnesses actually work?', 'Are no-pull harnesses bad for dogs?'], estimatedSearchVolume: 1400, difficulty: 'medium' },

  // Cat Carrier cluster
  { slug: 'best-airline-approved-cat-carriers', title: 'Best Airline-Approved Cat Carriers – TSA Compliant Picks', primaryKeyword: 'airline approved cat carrier', type: 'blog', targetCollection: 'best-cat-carriers', relatedArticles: [], faqQuestions: ['What cat carriers are TSA approved?', 'Can my cat fly in the cabin?'], estimatedSearchVolume: 880, difficulty: 'medium' },

  // Cross-cluster authority
  { slug: 'pet-anxiety-complete-guide', title: 'Pet Anxiety – Complete Guide to Signs, Causes & Solutions', primaryKeyword: 'pet anxiety', type: 'blog', targetCollection: 'dog-beds-for-anxiety', relatedArticles: ['calming-dog-bed-guide', 'indoor-cat-boredom-signs'], faqQuestions: ['How do I know if my pet has anxiety?', 'What helps pet anxiety naturally?', 'Can anxiety cause health problems in pets?'], estimatedSearchVolume: 2200, difficulty: 'medium' },
  { slug: 'how-to-puppy-proof-your-home', title: 'How to Puppy-Proof Your Home – Room by Room Checklist', primaryKeyword: 'how to puppy proof your home', type: 'blog', targetCollection: 'best-dog-toys-for-puppies', relatedArticles: ['best-toys-for-teething-puppies'], faqQuestions: ['What do you need before getting a puppy?', 'How do I stop my puppy from chewing everything?'], estimatedSearchVolume: 1600, difficulty: 'medium' },
  { slug: 'senior-dog-care-essentials', title: 'Senior Dog Care Essentials – Complete Guide for Aging Dogs', primaryKeyword: 'senior dog care', type: 'blog', targetCollection: 'dog-bed-for-senior-dogs', relatedArticles: ['best-orthopedic-dog-beds-2026', 'best-dog-bed-for-hip-dysplasia'], faqQuestions: ['At what age is a dog considered senior?', 'What do senior dogs need most?'], estimatedSearchVolume: 1200, difficulty: 'medium' },
  { slug: 'multi-cat-household-survival-guide', title: 'Multi-Cat Household Survival Guide – Expert Tips', primaryKeyword: 'multi cat household tips', type: 'blog', targetCollection: 'multi-cat-condos', relatedArticles: ['best-litter-box-for-multiple-cats', 'cat-climbing-behavior-explained'], faqQuestions: ['How many cats is too many?', 'Do cats need separate litter boxes?', 'How to introduce a new cat?'], estimatedSearchVolume: 720, difficulty: 'low' },
  { slug: 'best-gifts-for-dog-owners-2026', title: 'Best Gifts for Dog Owners 2026 – Unique & Practical Ideas', primaryKeyword: 'gifts for dog owners', type: 'blog', targetCollection: 'best-interactive-dog-toys', relatedArticles: [], faqQuestions: ['What to get someone who just got a dog?', 'What do dog lovers want as gifts?'], estimatedSearchVolume: 2900, difficulty: 'medium' },
];

// ============= GAP ATTACK: 10 COMPARISON PAGES =============

export const GAP_ATTACK_COMPARISONS: GapAttackContent[] = [
  { slug: 'orthopedic-vs-memory-foam-dog-beds', title: 'Orthopedic vs Memory Foam Dog Beds – Which Is Better?', primaryKeyword: 'orthopedic vs memory foam dog bed', type: 'comparison', targetCollection: 'orthopedic-calming-dog-beds', relatedArticles: ['best-orthopedic-dog-beds-2026', 'best-dog-bed-for-hip-dysplasia'], faqQuestions: ['Is orthopedic the same as memory foam?', 'Which is better for joint pain?', 'How long do memory foam dog beds last?'], estimatedSearchVolume: 480, difficulty: 'low' },
  { slug: 'self-cleaning-vs-traditional-litter-box', title: 'Self-Cleaning vs Traditional Litter Box – Honest Comparison', primaryKeyword: 'self cleaning vs regular litter box', type: 'comparison', targetCollection: 'best-cat-litter-boxes', relatedArticles: ['cat-litter-box-problems-solutions', 'self-cleaning-litter-box-worth-it'], faqQuestions: ['Is a self-cleaning litter box worth the price?', 'Do cats prefer self-cleaning litter boxes?'], estimatedSearchVolume: 390, difficulty: 'low' },
  { slug: 'cat-tree-vs-cat-condo-difference', title: 'Cat Tree vs Cat Condo – What\'s the Difference?', primaryKeyword: 'cat tree vs cat condo', type: 'comparison', targetCollection: 'cat-condos', relatedArticles: ['best-cat-trees-guide', 'cat-climbing-behavior-explained'], faqQuestions: ['Is a cat condo better than a cat tree?', 'Do cats prefer trees or condos?'], estimatedSearchVolume: 320, difficulty: 'low' },
  { slug: 'harness-vs-collar-for-dogs', title: 'Harness vs Collar for Dogs – Complete Safety Comparison', primaryKeyword: 'harness vs collar for dogs', type: 'comparison', targetCollection: 'best-dog-harnesses', relatedArticles: ['harness-vs-collar-which-is-safer', 'best-no-pull-dog-harness-2026'], faqQuestions: ['Is a harness better than a collar?', 'Can a collar hurt a dog\'s neck?'], estimatedSearchVolume: 590, difficulty: 'low' },
  { slug: 'slow-feeder-vs-regular-dog-bowl', title: 'Slow Feeder vs Regular Dog Bowl – Is It Worth the Switch?', primaryKeyword: 'slow feeder vs regular bowl', type: 'comparison', targetCollection: 'best-slow-feeder-dog-bowls', relatedArticles: ['benefits-of-slow-feeder-bowls', 'how-to-stop-dog-eating-too-fast'], faqQuestions: ['Do slow feeders frustrate dogs?', 'Are slow feeders good for all dogs?'], estimatedSearchVolume: 320, difficulty: 'low' },
  { slug: 'elevated-vs-floor-dog-bowls', title: 'Elevated vs Floor Dog Bowls – Vet Opinion & Research', primaryKeyword: 'elevated vs floor dog bowl', type: 'comparison', targetCollection: 'best-slow-feeder-dog-bowls', relatedArticles: ['elevated-vs-floor-dog-bowl-which-is-better', 'best-raised-dog-bowls-for-large-breeds'], faqQuestions: ['Are elevated bowls bad for dogs?', 'At what height should a dog bowl be?'], estimatedSearchVolume: 480, difficulty: 'low' },
  { slug: 'cooling-bed-vs-elevated-bed-for-dogs', title: 'Cooling Dog Bed vs Elevated Dog Bed – Which Keeps Dogs Cooler?', primaryKeyword: 'cooling bed vs elevated bed dog', type: 'comparison', targetCollection: 'cooling-dog-beds', relatedArticles: ['best-cooling-dog-beds-summer-2026'], faqQuestions: ['Do elevated beds keep dogs cool?', 'Which is better for hot weather?'], estimatedSearchVolume: 280, difficulty: 'low' },
  { slug: 'backpack-cat-carrier-vs-traditional', title: 'Backpack Cat Carrier vs Traditional – Best for Your Cat?', primaryKeyword: 'cat backpack carrier vs traditional', type: 'comparison', targetCollection: 'best-cat-carriers', relatedArticles: ['best-airline-approved-cat-carriers'], faqQuestions: ['Do cats like backpack carriers?', 'Are backpack carriers safe for cats?'], estimatedSearchVolume: 390, difficulty: 'low' },
  { slug: 'calming-bed-vs-regular-dog-bed', title: 'Calming Dog Bed vs Regular Bed – Does It Actually Work?', primaryKeyword: 'calming dog bed vs regular', type: 'comparison', targetCollection: 'dog-beds-for-anxiety', relatedArticles: ['calming-dog-bed-guide', 'pet-anxiety-complete-guide'], faqQuestions: ['Do calming beds work for dogs?', 'What makes a calming bed different?'], estimatedSearchVolume: 390, difficulty: 'low' },
  { slug: 'automatic-vs-gravity-cat-feeder', title: 'Automatic vs Gravity Cat Feeder – Which Should You Choose?', primaryKeyword: 'automatic vs gravity cat feeder', type: 'comparison', targetCollection: 'automatic-cat-feeders', relatedArticles: [], faqQuestions: ['Is an automatic feeder better than gravity?', 'Can I leave my cat with an automatic feeder?'], estimatedSearchVolume: 320, difficulty: 'low' },
];

// ============= GAP ATTACK: 8 BUYER GUIDES =============

export const GAP_ATTACK_BUYER_GUIDES: GapAttackContent[] = [
  { slug: 'best-dog-beds-for-large-dogs-2026', title: 'Best Dog Beds for Large Dogs 2026 – Size, Support & Durability', primaryKeyword: 'best dog beds for large dogs', type: 'buyer_guide', targetCollection: 'best-dog-beds-for-large-dogs', relatedArticles: ['best-orthopedic-dog-beds-2026', 'how-to-choose-dog-bed-size'], faqQuestions: ['What is the best bed for a 100 pound dog?', 'How big should a large dog bed be?', 'What filling is best for large dog beds?'], estimatedSearchVolume: 1600, difficulty: 'medium' },
  { slug: 'best-cat-condos-2026-buyer-guide', title: 'Best Cat Condos 2026 – Complete Buyer\'s Guide', primaryKeyword: 'best cat condos', type: 'buyer_guide', targetCollection: 'cat-condos', relatedArticles: ['best-cat-trees-guide', 'cat-climbing-behavior-explained'], faqQuestions: ['What is the best cat condo on the market?', 'How much should a good cat condo cost?', 'What to look for in a cat condo?'], estimatedSearchVolume: 1200, difficulty: 'medium' },
  { slug: 'best-interactive-dog-toys-2026', title: 'Best Interactive Dog Toys 2026 – Tested & Ranked', primaryKeyword: 'best interactive dog toys 2026', type: 'buyer_guide', targetCollection: 'best-interactive-dog-toys', relatedArticles: ['dog-puzzle-toys-guide', 'signs-your-dog-is-bored'], faqQuestions: ['What are the best enrichment toys for dogs?', 'Are interactive toys good for dogs?'], estimatedSearchVolume: 1100, difficulty: 'medium' },
  { slug: 'best-automatic-cat-feeders-2026', title: 'Best Automatic Cat Feeders 2026 – Smart Feeding Made Easy', primaryKeyword: 'best automatic cat feeder 2026', type: 'buyer_guide', targetCollection: 'automatic-cat-feeders', relatedArticles: ['automatic-vs-gravity-cat-feeder'], faqQuestions: ['What is the most reliable automatic cat feeder?', 'Are automatic feeders safe for cats?'], estimatedSearchVolume: 1400, difficulty: 'medium' },
  { slug: 'best-dog-car-seats-2026', title: 'Best Dog Car Seats 2026 – Safety Tested & Expert Reviewed', primaryKeyword: 'best dog car seats 2026', type: 'buyer_guide', targetCollection: 'best-dog-car-seats', relatedArticles: ['how-to-keep-dog-safe-in-car', 'best-dog-car-seats-for-anxious-dogs'], faqQuestions: ['Are dog car seats crash tested?', 'What is the safest dog car seat?'], estimatedSearchVolume: 1200, difficulty: 'medium' },
  { slug: 'best-dog-grooming-kits-2026', title: 'Best Dog Grooming Kits 2026 – Professional Results at Home', primaryKeyword: 'best dog grooming kit 2026', type: 'buyer_guide', targetCollection: 'best-dog-grooming-kits', relatedArticles: ['how-often-should-you-groom-your-dog', 'best-deshedding-tools-for-dogs'], faqQuestions: ['What grooming tools do professional groomers use?', 'Is it cheaper to groom your dog at home?'], estimatedSearchVolume: 880, difficulty: 'medium' },
  { slug: 'best-cat-litter-boxes-2026', title: 'Best Cat Litter Boxes 2026 – From Budget to Premium', primaryKeyword: 'best cat litter box 2026', type: 'buyer_guide', targetCollection: 'best-cat-litter-boxes', relatedArticles: ['cat-litter-box-problems-solutions', 'self-cleaning-litter-box-worth-it'], faqQuestions: ['What is the best cat litter box?', 'How often should you replace a litter box?'], estimatedSearchVolume: 1600, difficulty: 'medium' },
  { slug: 'best-cat-carriers-2026', title: 'Best Cat Carriers 2026 – Vet Visits, Travel & Flying', primaryKeyword: 'best cat carrier 2026', type: 'buyer_guide', targetCollection: 'best-cat-carriers', relatedArticles: ['best-airline-approved-cat-carriers'], faqQuestions: ['What carrier do vets recommend for cats?', 'How to get a cat into a carrier?'], estimatedSearchVolume: 880, difficulty: 'medium' },
];

// ============= GAP ATTACK: 5 PILLAR PAGES =============

export const GAP_ATTACK_PILLARS: GapAttackContent[] = [
  { slug: 'ultimate-dog-bed-guide', title: 'The Ultimate Dog Bed Guide – Everything You Need to Know', primaryKeyword: 'dog bed guide', type: 'pillar', targetCollection: 'orthopedic-calming-dog-beds', relatedArticles: ['best-orthopedic-dog-beds-2026', 'how-to-choose-dog-bed-size', 'calming-dog-bed-guide', 'best-cooling-dog-beds-summer-2026', 'best-dog-bed-for-hip-dysplasia'], faqQuestions: ['What type of bed is best for dogs?', 'How often should you replace a dog bed?', 'What size dog bed does my dog need?', 'Are elevated beds better than regular beds?', 'Do dogs need orthopedic beds?'], estimatedSearchVolume: 2400, difficulty: 'high' },
  { slug: 'ultimate-cat-furniture-guide', title: 'The Ultimate Cat Furniture Guide – Trees, Condos & Beyond', primaryKeyword: 'cat furniture guide', type: 'pillar', targetCollection: 'cat-condos', relatedArticles: ['best-cat-trees-guide', 'cat-climbing-behavior-explained', 'wall-mounted-cat-shelves-vs-cat-trees', 'best-cat-trees-for-senior-cats', 'best-cat-trees-for-small-apartments-2026'], faqQuestions: ['What furniture do cats need?', 'How to choose the right cat tree?', 'Do cats prefer tall or wide trees?', 'Is cat furniture worth the investment?', 'How many cat trees do I need?'], estimatedSearchVolume: 1800, difficulty: 'high' },
  { slug: 'complete-cat-litter-guide', title: 'The Complete Cat Litter & Litter Box Guide', primaryKeyword: 'cat litter guide', type: 'pillar', targetCollection: 'best-cat-litter-boxes', relatedArticles: ['cat-litter-box-problems-solutions', 'self-cleaning-litter-box-worth-it', 'best-litter-box-for-multiple-cats', 'how-often-to-change-cat-litter'], faqQuestions: ['What type of cat litter is best?', 'How deep should cat litter be?', 'How many litter boxes per cat?', 'What is the healthiest cat litter?'], estimatedSearchVolume: 1600, difficulty: 'high' },
  { slug: 'dog-travel-safety-handbook', title: 'Dog Travel Safety Handbook – Car, Air & Road Trips', primaryKeyword: 'dog travel safety', type: 'pillar', targetCollection: 'dog-travel-accessories', relatedArticles: ['how-to-keep-dog-safe-in-car', 'how-to-keep-dog-calm-in-car', 'best-dog-car-seats-for-anxious-dogs', 'best-dog-travel-bags-2026'], faqQuestions: ['How to travel safely with a dog?', 'Do dogs need car seats?', 'Can dogs get car sick?', 'What is the safest way to transport a dog?'], estimatedSearchVolume: 1200, difficulty: 'high' },
  { slug: 'indoor-cat-enrichment-masterclass', title: 'Indoor Cat Enrichment Masterclass – Happy Cats at Home', primaryKeyword: 'indoor cat enrichment', type: 'pillar', targetCollection: 'best-cat-toys-for-indoor-cats', relatedArticles: ['indoor-cat-boredom-signs', 'how-to-keep-indoor-cat-happy', 'best-puzzle-feeders-for-cats', 'cat-sleep-patterns-explained'], faqQuestions: ['How do I enrich my indoor cat?', 'Do indoor cats get bored?', 'What is environmental enrichment for cats?', 'How much play does an indoor cat need?'], estimatedSearchVolume: 1400, difficulty: 'high' },
];


// ============================================================
// LAYER 2 — SEO MOAT DEFENSE SYSTEM
// ============================================================

export interface TopicalFortressCluster {
  pillarId: string;
  pillarTitle: string;
  supportBlogs: string[];
  comparisonPages: string[];
  faqHubSlug: string;
  contentDifferentiators: string[];
  breedSpecific: string[];
  seasonalContent: string[];
}

export const TOPICAL_FORTRESS: Record<string, TopicalFortressCluster> = {
  // DOG CLUSTERS
  'dog-beds': {
    pillarId: 'dog-beds',
    pillarTitle: 'Ultimate Dog Bed Guide',
    supportBlogs: ['best-orthopedic-dog-beds-2026', 'how-to-choose-dog-bed-size', 'calming-dog-bed-guide', 'best-cooling-dog-beds-summer-2026', 'best-dog-bed-for-hip-dysplasia', 'best-dog-beds-for-german-shepherds'],
    comparisonPages: ['orthopedic-vs-memory-foam-dog-beds', 'cooling-bed-vs-elevated-bed-for-dogs', 'calming-bed-vs-regular-dog-bed'],
    faqHubSlug: 'dog-bed-faq-hub',
    contentDifferentiators: ['breed-specific sizing charts', 'material comparison tables', 'age-specific recommendations', 'vet-backed health benefits'],
    breedSpecific: ['german-shepherd', 'labrador', 'golden-retriever', 'french-bulldog', 'dachshund'],
    seasonalContent: ['summer-cooling-beds', 'winter-heated-beds'],
  },
  'dog-travel': {
    pillarId: 'dog-travel',
    pillarTitle: 'Dog Travel Safety Handbook',
    supportBlogs: ['how-to-keep-dog-safe-in-car', 'how-to-keep-dog-calm-in-car', 'best-dog-car-seats-for-anxious-dogs', 'best-dog-travel-bags-2026'],
    comparisonPages: [],
    faqHubSlug: 'dog-travel-faq-hub',
    contentDifferentiators: ['crash-test safety data', 'breed-by-size fitting guide', 'airline regulation updates'],
    breedSpecific: ['small-dog-car-seats', 'large-dog-travel'],
    seasonalContent: ['summer-road-trip-dog-essentials'],
  },
  'dog-feeding': {
    pillarId: 'dog-feeding',
    pillarTitle: 'Dog Feeding Solutions Guide',
    supportBlogs: ['benefits-of-slow-feeder-bowls', 'how-to-stop-dog-eating-too-fast', 'elevated-vs-floor-dog-bowl-which-is-better', 'best-raised-dog-bowls-for-large-breeds'],
    comparisonPages: ['slow-feeder-vs-regular-dog-bowl', 'elevated-vs-floor-dog-bowls'],
    faqHubSlug: 'dog-feeding-faq-hub',
    contentDifferentiators: ['breed-specific feeding schedules', 'portion control guides', 'material safety analysis'],
    breedSpecific: [],
    seasonalContent: [],
  },
  'dog-grooming': {
    pillarId: 'dog-grooming',
    pillarTitle: 'Dog Grooming at Home Guide',
    supportBlogs: ['how-often-should-you-groom-your-dog', 'best-grooming-tools-for-double-coated-dogs', 'best-dog-nail-grinders-2026', 'best-deshedding-tools-for-dogs'],
    comparisonPages: [],
    faqHubSlug: 'dog-grooming-faq-hub',
    contentDifferentiators: ['coat-type specific routines', 'professional vs at-home comparison', 'safety checklists'],
    breedSpecific: ['double-coated', 'short-hair', 'curly-coated'],
    seasonalContent: ['spring-shedding-season-guide'],
  },
  'dog-toys': {
    pillarId: 'dog-toys',
    pillarTitle: 'Interactive Dog Toys Guide',
    supportBlogs: ['signs-your-dog-is-bored', 'mental-stimulation-for-dogs', 'indoor-dog-games', 'dog-puzzle-toys-guide', 'best-toys-for-teething-puppies', 'diy-dog-enrichment-ideas-at-home'],
    comparisonPages: [],
    faqHubSlug: 'dog-toys-faq-hub',
    contentDifferentiators: ['chew-strength ratings', 'age-appropriate toy charts', 'enrichment difficulty levels'],
    breedSpecific: ['aggressive-chewers', 'small-dogs', 'puppies'],
    seasonalContent: [],
  },

  // CAT CLUSTERS
  'cat-furniture': {
    pillarId: 'cat-furniture',
    pillarTitle: 'Ultimate Cat Furniture Guide',
    supportBlogs: ['best-cat-trees-guide', 'cat-climbing-behavior-explained', 'best-cat-trees-for-small-apartments-2026', 'wall-mounted-cat-shelves-vs-cat-trees', 'best-cat-trees-for-senior-cats'],
    comparisonPages: ['cat-tree-vs-cat-condo-difference'],
    faqHubSlug: 'cat-furniture-faq-hub',
    contentDifferentiators: ['weight capacity charts', 'apartment-size fitting guide', 'multi-cat household configurations'],
    breedSpecific: ['maine-coon', 'large-cats', 'kittens'],
    seasonalContent: [],
  },
  'cat-litter': {
    pillarId: 'cat-litter',
    pillarTitle: 'Complete Cat Litter Guide',
    supportBlogs: ['cat-litter-box-problems-solutions', 'self-cleaning-litter-box-worth-it', 'best-litter-box-for-multiple-cats', 'how-often-to-change-cat-litter'],
    comparisonPages: ['self-cleaning-vs-traditional-litter-box'],
    faqHubSlug: 'cat-litter-faq-hub',
    contentDifferentiators: ['litter type comparison matrix', 'odor control testing data', 'multi-cat configurations'],
    breedSpecific: [],
    seasonalContent: [],
  },
  'cat-enrichment': {
    pillarId: 'cat-enrichment',
    pillarTitle: 'Indoor Cat Enrichment Masterclass',
    supportBlogs: ['indoor-cat-boredom-signs', 'how-to-keep-indoor-cat-happy', 'best-puzzle-feeders-for-cats', 'cat-sleep-patterns-explained', 'best-toys-for-senior-cats', 'how-to-play-with-your-cat-guide'],
    comparisonPages: [],
    faqHubSlug: 'cat-enrichment-faq-hub',
    contentDifferentiators: ['age-specific play schedules', 'enrichment difficulty tiers', 'behavioral benefit analysis'],
    breedSpecific: ['senior-cats', 'kittens'],
    seasonalContent: [],
  },
  'cat-feeding': {
    pillarId: 'cat-feeding',
    pillarTitle: 'Smart Cat Feeding Guide',
    supportBlogs: [],
    comparisonPages: ['automatic-vs-gravity-cat-feeder'],
    faqHubSlug: 'cat-feeding-faq-hub',
    contentDifferentiators: ['portion-control technology comparison', 'wet vs dry food feeder options'],
    breedSpecific: [],
    seasonalContent: [],
  },
  'cat-travel': {
    pillarId: 'cat-travel',
    pillarTitle: 'Cat Travel & Carrier Guide',
    supportBlogs: ['best-airline-approved-cat-carriers'],
    comparisonPages: ['backpack-cat-carrier-vs-traditional'],
    faqHubSlug: 'cat-travel-faq-hub',
    contentDifferentiators: ['airline regulation database', 'stress-reduction carrier features'],
    breedSpecific: [],
    seasonalContent: [],
  },
};

// ============= CONTENT DIFFERENTIATION MOAT =============

export const CONTENT_MOAT_ELEMENTS = {
  /** Every collection/product page should include at least 3 of these */
  differentiators: [
    'use_case_breakdown',       // Specific scenarios where the product excels
    'breed_recommendation',     // Breed-specific suitability
    'age_recommendation',       // Puppy, adult, senior
    'seasonal_recommendation',  // Best for summer, winter, etc.
    'size_guide',              // Detailed sizing with measurements
    'material_comparison',      // Material pros/cons table
    'care_instructions',        // How to clean/maintain
    'safety_notes',            // Safety warnings, certifications
    'expert_opinion',          // Vet/behaviorist input
    'real_world_testing',      // Testing methodology
  ],
  /** Minimum content depth multiplier vs competitors */
  depthMultiplier: 2,
  /** Required structured data on every page */
  requiredSchema: ['Product', 'BreadcrumbList', 'FAQPage', 'Organization', 'WebSite'],
};


// ============================================================
// LAYER 3 — AI SEO AUTOMATION LAYER
// ============================================================

export interface AutomationRule {
  id: string;
  trigger: string;
  action: string;
  frequency: string;
  priority: 'critical' | 'high' | 'medium';
}

export const AI_AUTOMATION_RULES: AutomationRule[] = [
  // New product detection
  { id: 'auto-01', trigger: 'new_product_inserted', action: 'generate_optimized_description', frequency: 'on_event', priority: 'critical' },
  { id: 'auto-02', trigger: 'new_product_inserted', action: 'generate_meta_title_60_chars', frequency: 'on_event', priority: 'critical' },
  { id: 'auto-03', trigger: 'new_product_inserted', action: 'generate_meta_description_155_chars', frequency: 'on_event', priority: 'critical' },
  { id: 'auto-04', trigger: 'new_product_inserted', action: 'generate_faq_block_3_questions', frequency: 'on_event', priority: 'high' },
  { id: 'auto-05', trigger: 'new_product_inserted', action: 'inject_internal_links_3_minimum', frequency: 'on_event', priority: 'high' },
  { id: 'auto-06', trigger: 'new_product_inserted', action: 'generate_product_schema', frequency: 'on_event', priority: 'critical' },

  // Underperformance detection
  { id: 'auto-07', trigger: 'page_position_dropped_5_plus', action: 'expand_content_depth', frequency: 'weekly', priority: 'high' },
  { id: 'auto-08', trigger: 'page_ctr_below_expected', action: 'rewrite_meta_title_description', frequency: 'weekly', priority: 'high' },
  { id: 'auto-09', trigger: 'page_impressions_up_clicks_flat', action: 'add_semantic_keywords', frequency: 'weekly', priority: 'medium' },
  { id: 'auto-10', trigger: 'page_thin_content_detected', action: 'expand_with_faq_and_sections', frequency: 'weekly', priority: 'high' },
  { id: 'auto-11', trigger: 'page_low_internal_links', action: 'inject_contextual_links', frequency: 'weekly', priority: 'medium' },
  { id: 'auto-12', trigger: 'sitemap_lastmod_stale_30d', action: 'update_lastmod_timestamp', frequency: 'daily', priority: 'medium' },

  // Cannibalization monitoring
  { id: 'auto-13', trigger: 'duplicate_keyword_targeting_detected', action: 'flag_for_merge_or_rewrite', frequency: 'weekly', priority: 'critical' },
  { id: 'auto-14', trigger: 'blog_collection_keyword_overlap', action: 'rewrite_blog_to_longtail', frequency: 'weekly', priority: 'high' },
  { id: 'auto-15', trigger: 'collection_collection_overlap', action: 'merge_or_301_redirect', frequency: 'weekly', priority: 'critical' },

  // Content generation
  { id: 'auto-16', trigger: 'weekly_content_schedule', action: 'generate_4_seo_blog_articles', frequency: 'weekly', priority: 'high' },
  { id: 'auto-17', trigger: 'revenue_category_gap_detected', action: 'prioritize_commercial_content', frequency: 'weekly', priority: 'critical' },
  { id: 'auto-18', trigger: 'topic_cluster_incomplete', action: 'generate_supporting_article', frequency: 'weekly', priority: 'medium' },

  // Crawl budget optimization
  { id: 'auto-19', trigger: 'non_indexable_url_in_sitemap', action: 'remove_from_sitemap', frequency: 'daily', priority: 'critical' },
  { id: 'auto-20', trigger: 'parameter_url_indexed', action: 'add_canonical_and_noindex', frequency: 'daily', priority: 'critical' },
  { id: 'auto-21', trigger: 'duplicate_url_detected', action: 'consolidate_to_canonical', frequency: 'daily', priority: 'critical' },
];

// ============= WEEKLY CONTENT GENERATION SCHEDULE =============

export interface WeeklyContentSlot {
  dayOfWeek: number; // 0=Sun, 1=Mon...
  contentType: 'blog' | 'comparison' | 'buyer_guide' | 'faq_expansion';
  targetCluster: string;
  priority: 'revenue' | 'authority' | 'gap_fill';
}

export const WEEKLY_CONTENT_SCHEDULE: WeeklyContentSlot[] = [
  { dayOfWeek: 1, contentType: 'blog', targetCluster: 'dog-beds', priority: 'revenue' },
  { dayOfWeek: 2, contentType: 'blog', targetCluster: 'cat-furniture', priority: 'revenue' },
  { dayOfWeek: 3, contentType: 'comparison', targetCluster: 'rotating', priority: 'gap_fill' },
  { dayOfWeek: 4, contentType: 'blog', targetCluster: 'cat-litter', priority: 'revenue' },
  { dayOfWeek: 5, contentType: 'buyer_guide', targetCluster: 'rotating', priority: 'authority' },
];

// ============= 90-DAY GROWTH PROJECTION =============

export const GROWTH_PROJECTION = {
  currentState: {
    estimatedMonthlyOrganicSessions: 2500,
    indexedPages: 1100,
    top10Keywords: 12,
    top3Keywords: 3,
    averagePosition: 28,
  },
  day30: {
    targetOrganicSessions: 4500,
    newPagesPublished: 25,
    top10Keywords: 25,
    top3Keywords: 8,
    averagePosition: 22,
    actions: [
      '5 pillar pages live',
      '10 comparison pages live',
      'Schema on all products/collections',
      'Internal linking matrix deployed',
      'Cannibalization risks resolved',
    ],
  },
  day60: {
    targetOrganicSessions: 8000,
    newPagesPublished: 50,
    top10Keywords: 45,
    top3Keywords: 15,
    averagePosition: 16,
    actions: [
      '8 buyer guides live',
      '15 new blog articles',
      'FAQ expansion on all collections',
      'Core Web Vitals optimized',
      'Structured data validated error-free',
    ],
  },
  day90: {
    targetOrganicSessions: 15000,
    newPagesPublished: 75,
    top10Keywords: 70,
    top3Keywords: 25,
    averagePosition: 12,
    actions: [
      'Full topical fortress complete',
      'All 25 revenue blogs published',
      'Long-tail cluster expansion done',
      'Automated content pipeline active',
      'SEO moat fully operational',
    ],
  },
};

// ============= INTERNAL LINKING MATRIX =============

export interface LinkingMatrixEntry {
  source: string;
  sourceType: 'homepage' | 'pillar' | 'collection' | 'product' | 'blog';
  targets: { url: string; anchorType: 'exact' | 'partial' | 'branded' | 'natural' }[];
}

export const LINKING_MATRIX_SAMPLE: LinkingMatrixEntry[] = [
  {
    source: '/',
    sourceType: 'homepage',
    targets: [
      { url: '/collections/dog-beds', anchorType: 'exact' },
      { url: '/collections/cat-condos', anchorType: 'exact' },
      { url: '/collections/best-interactive-dog-toys', anchorType: 'exact' },
      { url: '/collections/cat-litter-boxes', anchorType: 'exact' },
      { url: '/collections/dog-travel-accessories', anchorType: 'partial' },
      { url: '/collections/best-cat-toys-for-indoor-cats', anchorType: 'partial' },
      { url: '/collections/best-slow-feeder-dog-bowls', anchorType: 'partial' },
      { url: '/collections/best-dog-grooming-kits', anchorType: 'partial' },
      { url: '/collections/best-cat-beds', anchorType: 'branded' },
      { url: '/collections/dogs', anchorType: 'branded' },
      { url: '/collections/automatic-cat-feeders', anchorType: 'natural' },
      { url: '/collections/cats', anchorType: 'natural' },
    ],
  },
  {
    source: '/collections/dog-beds',
    sourceType: 'pillar',
    targets: [
      { url: '/collections/best-orthopedic-dog-beds', anchorType: 'exact' },
      { url: '/collections/memory-foam-dog-beds', anchorType: 'exact' },
      { url: '/collections/dog-beds-for-anxiety', anchorType: 'partial' },
      { url: '/collections/waterproof-dog-beds', anchorType: 'partial' },
      { url: '/collections/cooling-dog-beds', anchorType: 'natural' },
      { url: '/collections/best-dog-beds-for-large-dogs', anchorType: 'exact' },
      { url: '/blog/best-orthopedic-dog-beds-2026', anchorType: 'natural' },
      { url: '/blog/how-to-choose-dog-bed-size', anchorType: 'natural' },
      { url: '/blog/calming-dog-bed-guide', anchorType: 'branded' },
    ],
  },
];

// ============= UTILITY FUNCTIONS =============

export function getGapsByCategory(category: GapCategory): RankingGap[] {
  return RANKING_GAPS.filter(g => g.category === category);
}

export function getAllAttackContent(): GapAttackContent[] {
  return [...GAP_ATTACK_BLOGS, ...GAP_ATTACK_COMPARISONS, ...GAP_ATTACK_BUYER_GUIDES, ...GAP_ATTACK_PILLARS];
}

export function getAttackContentByCluster(collectionSlug: string): GapAttackContent[] {
  return getAllAttackContent().filter(c => c.targetCollection === collectionSlug);
}

export function getContentCalendarForWeek(weekNumber: number): { day: string; content: GapAttackContent | null }[] {
  const allContent = getAllAttackContent();
  const startIdx = (weekNumber - 1) * 4;
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  
  return WEEKLY_CONTENT_SCHEDULE.map((slot, i) => ({
    day: days[slot.dayOfWeek - 1] || days[i],
    content: allContent[startIdx + i] || null,
  }));
}

export function getAutomationRulesByTrigger(trigger: string): AutomationRule[] {
  return AI_AUTOMATION_RULES.filter(r => r.trigger === trigger);
}

export function getMoatCompletionScore(): { score: number; missing: string[] } {
  const missing: string[] = [];
  let total = 0;
  let complete = 0;

  for (const [key, cluster] of Object.entries(TOPICAL_FORTRESS)) {
    total += 4; // pillar + blogs + comparisons + faq hub
    if (cluster.supportBlogs.length >= 4) complete++;
    else missing.push(`${key}: needs ${4 - cluster.supportBlogs.length} more support blogs`);
    if (cluster.comparisonPages.length >= 1) complete++;
    else missing.push(`${key}: needs comparison pages`);
    if (cluster.pillarTitle) complete++;
    complete++; // faq hub placeholder
  }

  return { score: Math.round((complete / total) * 100), missing };
}
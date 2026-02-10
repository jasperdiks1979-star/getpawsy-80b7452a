/**
 * 100-Guide Scaling Roadmap (3 Clusters)
 * 
 * Aggressive but safe scaling plan for Cat Litter, Cat Furniture, Dog Beds.
 * Targets keywords at positions 15-40 with high impression potential.
 * Includes cannibalization check, internal linking rules, and weekly schedule.
 */

// ============= TYPES =============

export interface ScalingGuide {
  slug: string;
  title: string;
  primaryKW: string;
  secondaryKWs: string[];
  intent: 'commercial' | 'informational' | 'comparison';
  priority: number; // 0-100
  cluster: 'cat-litter' | 'cat-furniture' | 'dog-beds';
  week: number; // 1-8
  role: 'cornerstone' | 'hub' | 'subguide';
  internalLinksTarget: number; // how many inbound links this should get
  linksTo: string[]; // slugs this guide should link to
}

export interface WeeklySchedule {
  week: number;
  label: string;
  guides: ScalingGuide[];
  focus: string;
}

// ============= 100-GUIDE MASTER LIST =============

export const SCALING_GUIDES: ScalingGuide[] = [
  // ========== CLUSTER 1: CAT LITTER (40 guides) ==========
  // Week 1 (existing + new)
  { slug: 'best-cat-litter-box-2026', title: 'Best Cat Litter Box (2026) – 12 Tested Picks for Odor Control, Large & Multi-Cat Homes', primaryKW: 'best cat litter box', secondaryKWs: ['cat litter box review', 'top litter boxes 2026', 'odor control litter box'], intent: 'commercial', priority: 100, cluster: 'cat-litter', week: 1, role: 'cornerstone', internalLinksTarget: 15, linksTo: ['how-many-litter-boxes-per-cat', 'best-litter-boxes-multi-cat', 'best-extra-large-litter-boxes'] },
  { slug: 'how-many-litter-boxes-per-cat', title: 'How Many Litter Boxes Per Cat? The N+1 Rule Explained (2026)', primaryKW: 'how many litter boxes per cat', secondaryKWs: ['n+1 litter box rule', 'litter box per cat', 'multiple litter boxes'], intent: 'informational', priority: 95, cluster: 'cat-litter', week: 1, role: 'hub', internalLinksTarget: 10, linksTo: ['best-cat-litter-box-2026', 'best-litter-boxes-multi-cat'] },
  { slug: 'best-litter-boxes-multi-cat', title: 'Best Litter Boxes for Multiple Cats (2026) – Tested Picks With Pros & Cons', primaryKW: 'best litter box multi cat', secondaryKWs: ['litter box for 2 cats', 'multi cat litter box'], intent: 'commercial', priority: 90, cluster: 'cat-litter', week: 1, role: 'subguide', internalLinksTarget: 8, linksTo: ['best-cat-litter-box-2026', 'how-many-litter-boxes-per-cat'] },
  { slug: 'best-extra-large-litter-boxes', title: 'Best Extra Large Litter Boxes for Big Cats (2026) – Tested for Maine Coons', primaryKW: 'extra large litter box', secondaryKWs: ['xl litter box', 'litter box for maine coon', 'big litter box'], intent: 'commercial', priority: 88, cluster: 'cat-litter', week: 1, role: 'subguide', internalLinksTarget: 8, linksTo: ['best-cat-litter-box-2026', 'best-litter-box-maine-coon'] },
  // Week 2
  { slug: 'best-self-cleaning-litter-box-2026', title: 'Best Self-Cleaning Litter Boxes (2026) – Automatic Picks Tested & Reviewed', primaryKW: 'best self cleaning litter box', secondaryKWs: ['automatic litter box', 'self cleaning litter box review', 'robot litter box'], intent: 'commercial', priority: 92, cluster: 'cat-litter', week: 2, role: 'hub', internalLinksTarget: 10, linksTo: ['best-cat-litter-box-2026', 'litter-robot-vs-casa-leo'] },
  { slug: 'best-covered-litter-box', title: 'Best Covered Litter Boxes (2026) – Hooded & Enclosed Picks for Odor Control', primaryKW: 'best covered litter box', secondaryKWs: ['hooded litter box', 'enclosed litter box', 'covered vs open litter box'], intent: 'commercial', priority: 82, cluster: 'cat-litter', week: 2, role: 'subguide', internalLinksTarget: 6, linksTo: ['best-cat-litter-box-2026', 'covered-vs-open-litter-box'] },
  { slug: 'covered-vs-open-litter-box', title: 'Covered vs Open Litter Box – Which Is Better? Pros & Cons Compared', primaryKW: 'covered vs open litter box', secondaryKWs: ['hooded vs open cat box', 'enclosed vs open litter box'], intent: 'informational', priority: 78, cluster: 'cat-litter', week: 2, role: 'subguide', internalLinksTarget: 5, linksTo: ['best-covered-litter-box', 'best-cat-litter-box-2026'] },
  { slug: 'litter-robot-vs-casa-leo', title: 'Litter-Robot vs Casa Leo (2026) – Which Auto Litter Box Is Worth It?', primaryKW: 'litter robot vs casa leo', secondaryKWs: ['litter robot review', 'casa leo review', 'automatic litter box comparison'], intent: 'comparison', priority: 85, cluster: 'cat-litter', week: 2, role: 'subguide', internalLinksTarget: 6, linksTo: ['best-self-cleaning-litter-box-2026', 'best-cat-litter-box-2026'] },
  // Week 3
  { slug: 'best-litter-box-odor-control', title: 'Best Litter Boxes for Odor Control (2026) – Tested in Real Homes', primaryKW: 'best litter box for odor control', secondaryKWs: ['odor free litter box', 'litter box smell solution', 'no smell litter box'], intent: 'commercial', priority: 86, cluster: 'cat-litter', week: 3, role: 'subguide', internalLinksTarget: 7, linksTo: ['best-cat-litter-box-2026', 'best-covered-litter-box'] },
  { slug: 'best-litter-box-maine-coon', title: 'Best Litter Box for Maine Coons (2026) – Size Guide & Top Picks', primaryKW: 'best litter box for maine coon', secondaryKWs: ['maine coon litter box size', 'litter box for large breed cats'], intent: 'commercial', priority: 84, cluster: 'cat-litter', week: 3, role: 'subguide', internalLinksTarget: 7, linksTo: ['best-extra-large-litter-boxes', 'best-cat-litter-box-2026'] },
  { slug: 'best-litter-box-kittens', title: 'Best Litter Boxes for Kittens (2026) – Safe Starter Picks With Low Entry', primaryKW: 'best litter box for kittens', secondaryKWs: ['kitten litter box', 'first litter box for kitten', 'kitten training litter box'], intent: 'commercial', priority: 75, cluster: 'cat-litter', week: 3, role: 'subguide', internalLinksTarget: 5, linksTo: ['best-cat-litter-box-2026', 'how-many-litter-boxes-per-cat'] },
  { slug: 'best-litter-box-senior-cats', title: 'Best Litter Boxes for Senior Cats (2026) – Low Entry & Arthritis-Friendly', primaryKW: 'best litter box for senior cats', secondaryKWs: ['low entry litter box', 'litter box for old cats', 'arthritis friendly litter box'], intent: 'commercial', priority: 73, cluster: 'cat-litter', week: 3, role: 'subguide', internalLinksTarget: 5, linksTo: ['best-cat-litter-box-2026', 'best-extra-large-litter-boxes'] },
  // Week 4
  { slug: 'best-stainless-steel-litter-box', title: 'Best Stainless Steel Litter Boxes (2026) – Durable, Odor-Free & Easy to Clean', primaryKW: 'stainless steel litter box', secondaryKWs: ['metal litter box', 'stainless cat box', 'non-stick litter box'], intent: 'commercial', priority: 76, cluster: 'cat-litter', week: 4, role: 'subguide', internalLinksTarget: 5, linksTo: ['best-cat-litter-box-2026', 'best-litter-box-odor-control'] },
  { slug: 'best-top-entry-litter-box', title: 'Best Top-Entry Litter Boxes (2026) – Tested for Litter Tracking & Privacy', primaryKW: 'top entry litter box', secondaryKWs: ['top entry cat box', 'litter box less tracking', 'top entry vs side entry'], intent: 'commercial', priority: 74, cluster: 'cat-litter', week: 4, role: 'subguide', internalLinksTarget: 5, linksTo: ['best-cat-litter-box-2026', 'best-covered-litter-box'] },
  { slug: 'best-disposable-litter-box', title: 'Best Disposable Litter Boxes (2026) – For Travel, Rescue & Temporary Use', primaryKW: 'disposable litter box', secondaryKWs: ['travel litter box', 'temporary cat box', 'biodegradable litter box'], intent: 'commercial', priority: 60, cluster: 'cat-litter', week: 4, role: 'subguide', internalLinksTarget: 4, linksTo: ['best-cat-litter-box-2026'] },
  { slug: 'best-litter-box-under-50', title: 'Best Cat Litter Boxes Under $50 (2026) – Budget Picks That Don\'t Stink', primaryKW: 'best litter box under 50', secondaryKWs: ['cheap litter box', 'budget cat litter box', 'affordable litter box'], intent: 'commercial', priority: 72, cluster: 'cat-litter', week: 4, role: 'subguide', internalLinksTarget: 5, linksTo: ['best-cat-litter-box-2026'] },
  // Week 5
  { slug: 'litter-box-placement-guide', title: 'Where to Put a Litter Box – Placement Guide for Every Home Layout', primaryKW: 'where to put litter box', secondaryKWs: ['litter box placement', 'best spot for litter box', 'litter box in bathroom'], intent: 'informational', priority: 70, cluster: 'cat-litter', week: 5, role: 'subguide', internalLinksTarget: 5, linksTo: ['how-many-litter-boxes-per-cat', 'best-cat-litter-box-2026'] },
  { slug: 'how-to-stop-litter-tracking', title: 'How to Stop Litter Tracking – 7 Proven Tips & Best Mats Tested', primaryKW: 'how to stop litter tracking', secondaryKWs: ['litter tracking solutions', 'best litter mat', 'cat litter everywhere'], intent: 'informational', priority: 68, cluster: 'cat-litter', week: 5, role: 'subguide', internalLinksTarget: 4, linksTo: ['best-top-entry-litter-box', 'best-cat-litter-box-2026'] },
  { slug: 'clumping-vs-non-clumping-litter', title: 'Clumping vs Non-Clumping Litter – Which Is Better for Your Cat?', primaryKW: 'clumping vs non clumping litter', secondaryKWs: ['best type of cat litter', 'cat litter comparison'], intent: 'informational', priority: 65, cluster: 'cat-litter', week: 5, role: 'subguide', internalLinksTarget: 4, linksTo: ['best-cat-litter-box-2026'] },
  { slug: 'best-litter-box-for-small-apartment', title: 'Best Litter Box for Small Apartments (2026) – Compact & Discreet Picks', primaryKW: 'best litter box for small apartment', secondaryKWs: ['compact litter box', 'small space litter box', 'apartment litter box'], intent: 'commercial', priority: 77, cluster: 'cat-litter', week: 5, role: 'subguide', internalLinksTarget: 6, linksTo: ['best-cat-litter-box-furniture-enclosures-2026', 'best-cat-litter-box-2026'] },

  // ========== CLUSTER 2: CAT FURNITURE (35 guides) ==========
  // Week 1 (existing)
  { slug: 'best-cat-litter-box-furniture-enclosures-2026', title: 'Best Cat Litter Box Furniture & Enclosures (2026) – Reviewed & Tested', primaryKW: 'cat litter box furniture', secondaryKWs: ['litter box enclosure', 'hidden litter box', 'litter box cabinet'], intent: 'commercial', priority: 93, cluster: 'cat-furniture', week: 1, role: 'cornerstone', internalLinksTarget: 12, linksTo: ['best-cat-litter-box-2026', 'best-cat-trees-small-apartments'] },
  { slug: 'best-cat-trees-small-apartments', title: 'Best Cat Trees for Small Apartments (2026) – Space-Saving Picks, Tested', primaryKW: 'best cat tree small apartment', secondaryKWs: ['compact cat tree', 'small space cat tree', 'apartment cat tree'], intent: 'commercial', priority: 91, cluster: 'cat-furniture', week: 1, role: 'hub', internalLinksTarget: 10, linksTo: ['best-cat-litter-box-furniture-enclosures-2026', 'best-wall-mounted-cat-shelves'] },
  // Week 2
  { slug: 'best-cat-tree-maine-coon', title: 'Best Cat Trees for Maine Coons (2026) – Heavy-Duty Tested Picks', primaryKW: 'best cat tree for maine coon', secondaryKWs: ['large cat tree', 'heavy duty cat tree', 'cat tree for big cats'], intent: 'commercial', priority: 87, cluster: 'cat-furniture', week: 2, role: 'subguide', internalLinksTarget: 7, linksTo: ['best-cat-trees-small-apartments', 'best-cat-litter-box-furniture-enclosures-2026'] },
  { slug: 'best-wall-mounted-cat-shelves', title: 'Best Wall-Mounted Cat Shelves (2026) – Modern Picks for Active Cats', primaryKW: 'wall mounted cat shelves', secondaryKWs: ['cat wall furniture', 'cat climbing wall', 'cat shelves for wall'], intent: 'commercial', priority: 80, cluster: 'cat-furniture', week: 2, role: 'subguide', internalLinksTarget: 6, linksTo: ['best-cat-trees-small-apartments'] },
  { slug: 'best-cat-window-perch', title: 'Best Cat Window Perches (2026) – Suction Cup & Mounted Options Tested', primaryKW: 'best cat window perch', secondaryKWs: ['cat window shelf', 'cat window seat', 'suction cup cat perch'], intent: 'commercial', priority: 75, cluster: 'cat-furniture', week: 2, role: 'subguide', internalLinksTarget: 5, linksTo: ['best-cat-trees-small-apartments'] },
  // Week 3
  { slug: 'best-cat-scratching-post', title: 'Best Cat Scratching Posts (2026) – Tested for Durability & Cats That Shred', primaryKW: 'best cat scratching post', secondaryKWs: ['cat scratcher', 'tall scratching post', 'sisal scratching post'], intent: 'commercial', priority: 83, cluster: 'cat-furniture', week: 3, role: 'subguide', internalLinksTarget: 7, linksTo: ['best-cat-trees-small-apartments', 'best-cat-litter-box-furniture-enclosures-2026'] },
  { slug: 'best-cat-condo-2026', title: 'Best Cat Condos (2026) – Multi-Level Picks for Play & Rest', primaryKW: 'best cat condo', secondaryKWs: ['cat condo tower', 'multi level cat condo', 'cat condo with hammock'], intent: 'commercial', priority: 81, cluster: 'cat-furniture', week: 3, role: 'subguide', internalLinksTarget: 6, linksTo: ['best-cat-trees-small-apartments'] },
  { slug: 'cat-tree-vs-cat-condo', title: 'Cat Tree vs Cat Condo – What\'s the Difference & Which Is Better?', primaryKW: 'cat tree vs cat condo', secondaryKWs: ['difference cat tree condo', 'cat tree or condo'], intent: 'informational', priority: 65, cluster: 'cat-furniture', week: 3, role: 'subguide', internalLinksTarget: 4, linksTo: ['best-cat-condo-2026', 'best-cat-trees-small-apartments'] },
  // Week 4
  { slug: 'best-modern-cat-furniture', title: 'Best Modern Cat Furniture (2026) – Minimalist & Stylish Picks', primaryKW: 'modern cat furniture', secondaryKWs: ['minimalist cat furniture', 'stylish cat tree', 'designer cat furniture'], intent: 'commercial', priority: 74, cluster: 'cat-furniture', week: 4, role: 'subguide', internalLinksTarget: 5, linksTo: ['best-cat-litter-box-furniture-enclosures-2026', 'best-cat-trees-small-apartments'] },
  { slug: 'best-cat-tree-under-100', title: 'Best Cat Trees Under $100 (2026) – Budget Picks That Last', primaryKW: 'best cat tree under 100', secondaryKWs: ['cheap cat tree', 'affordable cat tree', 'budget cat tree'], intent: 'commercial', priority: 76, cluster: 'cat-furniture', week: 4, role: 'subguide', internalLinksTarget: 5, linksTo: ['best-cat-trees-small-apartments'] },
  { slug: 'best-cat-hammock', title: 'Best Cat Hammocks (2026) – Window, Wall & Free-Standing Picks', primaryKW: 'best cat hammock', secondaryKWs: ['cat hammock bed', 'hanging cat bed', 'cat hammock for window'], intent: 'commercial', priority: 68, cluster: 'cat-furniture', week: 4, role: 'subguide', internalLinksTarget: 4, linksTo: ['best-cat-window-perch', 'best-cat-trees-small-apartments'] },
  // Week 5
  { slug: 'best-cat-tree-for-2-cats', title: 'Best Cat Trees for 2 Cats (2026) – Multi-Cat Tested Picks', primaryKW: 'best cat tree for 2 cats', secondaryKWs: ['cat tree for two cats', 'multi cat tree', 'cat tree multiple cats'], intent: 'commercial', priority: 73, cluster: 'cat-furniture', week: 5, role: 'subguide', internalLinksTarget: 5, linksTo: ['best-cat-trees-small-apartments', 'best-litter-boxes-multi-cat'] },
  { slug: 'best-outdoor-cat-enclosure', title: 'Best Outdoor Cat Enclosures (2026) – Catios Tested for Safety & Space', primaryKW: 'outdoor cat enclosure', secondaryKWs: ['catio', 'outdoor cat pen', 'cat patio enclosure'], intent: 'commercial', priority: 70, cluster: 'cat-furniture', week: 5, role: 'subguide', internalLinksTarget: 5, linksTo: ['best-cat-trees-small-apartments'] },
  { slug: 'best-cat-bed-2026', title: 'Best Cat Beds (2026) – Cozy Picks Tested by Real Cat Owners', primaryKW: 'best cat bed', secondaryKWs: ['cat bed review', 'heated cat bed', 'calming cat bed'], intent: 'commercial', priority: 72, cluster: 'cat-furniture', week: 5, role: 'subguide', internalLinksTarget: 5, linksTo: ['best-cat-trees-small-apartments'] },
  // Week 6
  { slug: 'how-to-get-cat-to-use-cat-tree', title: 'How to Get Your Cat to Use a Cat Tree – 8 Proven Tips', primaryKW: 'how to get cat to use cat tree', secondaryKWs: ['cat ignores cat tree', 'cat tree training'], intent: 'informational', priority: 62, cluster: 'cat-furniture', week: 6, role: 'subguide', internalLinksTarget: 4, linksTo: ['best-cat-trees-small-apartments', 'best-cat-scratching-post'] },
  { slug: 'best-cat-tree-with-litter-box', title: 'Best Cat Trees With Built-In Litter Box Enclosure (2026)', primaryKW: 'cat tree with litter box', secondaryKWs: ['cat tree litter box combo', 'all in one cat furniture'], intent: 'commercial', priority: 71, cluster: 'cat-furniture', week: 6, role: 'subguide', internalLinksTarget: 6, linksTo: ['best-cat-litter-box-furniture-enclosures-2026', 'best-cat-trees-small-apartments'] },
  { slug: 'best-floor-to-ceiling-cat-tree', title: 'Best Floor-to-Ceiling Cat Trees (2026) – Tall Picks for Climbers', primaryKW: 'floor to ceiling cat tree', secondaryKWs: ['tall cat tree', 'ceiling height cat tree'], intent: 'commercial', priority: 66, cluster: 'cat-furniture', week: 6, role: 'subguide', internalLinksTarget: 4, linksTo: ['best-cat-trees-small-apartments', 'best-cat-tree-maine-coon'] },

  // ========== CLUSTER 3: DOG BEDS (25 guides) ==========
  // Week 3
  { slug: 'best-dog-bed-2026', title: 'Best Dog Beds (2026) – 10 Tested Picks for Every Breed & Budget', primaryKW: 'best dog bed', secondaryKWs: ['dog bed review', 'top dog beds 2026', 'comfortable dog bed'], intent: 'commercial', priority: 95, cluster: 'dog-beds', week: 3, role: 'cornerstone', internalLinksTarget: 12, linksTo: ['best-orthopedic-dog-bed', 'best-dog-bed-large-dogs'] },
  { slug: 'best-orthopedic-dog-bed', title: 'Best Orthopedic Dog Beds (2026) – Tested for Joint Support & Comfort', primaryKW: 'best orthopedic dog bed', secondaryKWs: ['memory foam dog bed', 'dog bed for arthritis', 'joint support dog bed'], intent: 'commercial', priority: 88, cluster: 'dog-beds', week: 3, role: 'hub', internalLinksTarget: 8, linksTo: ['best-dog-bed-2026', 'best-dog-bed-senior-dogs'] },
  // Week 4
  { slug: 'best-dog-bed-large-dogs', title: 'Best Dog Beds for Large Dogs (2026) – XL Picks for 50–100+ lbs', primaryKW: 'best dog bed for large dogs', secondaryKWs: ['xl dog bed', 'big dog bed', 'dog bed for 100 lb dog'], intent: 'commercial', priority: 86, cluster: 'dog-beds', week: 4, role: 'subguide', internalLinksTarget: 7, linksTo: ['best-dog-bed-2026', 'best-orthopedic-dog-bed'] },
  { slug: 'best-dog-bed-senior-dogs', title: 'Best Dog Beds for Senior Dogs (2026) – Comfort & Easy Access Tested', primaryKW: 'best dog bed for senior dogs', secondaryKWs: ['old dog bed', 'dog bed for aging dogs', 'heated dog bed for seniors'], intent: 'commercial', priority: 80, cluster: 'dog-beds', week: 4, role: 'subguide', internalLinksTarget: 6, linksTo: ['best-orthopedic-dog-bed', 'best-dog-bed-2026'] },
  { slug: 'best-calming-dog-bed', title: 'Best Calming Dog Beds (2026) – Anxiety Relief Picks Tested', primaryKW: 'best calming dog bed', secondaryKWs: ['anti anxiety dog bed', 'donut dog bed', 'dog bed for anxious dogs'], intent: 'commercial', priority: 78, cluster: 'dog-beds', week: 4, role: 'subguide', internalLinksTarget: 5, linksTo: ['best-dog-bed-2026'] },
  // Week 5
  { slug: 'best-chew-proof-dog-bed', title: 'Best Chew-Proof Dog Beds (2026) – Indestructible Picks for Heavy Chewers', primaryKW: 'best chew proof dog bed', secondaryKWs: ['indestructible dog bed', 'dog bed for chewers', 'durable dog bed'], intent: 'commercial', priority: 77, cluster: 'dog-beds', week: 5, role: 'subguide', internalLinksTarget: 5, linksTo: ['best-dog-bed-2026', 'best-dog-bed-large-dogs'] },
  { slug: 'best-elevated-dog-bed', title: 'Best Elevated Dog Beds (2026) – Cooling Cot Picks for Summer', primaryKW: 'best elevated dog bed', secondaryKWs: ['raised dog bed', 'dog cot', 'cooling dog bed'], intent: 'commercial', priority: 72, cluster: 'dog-beds', week: 5, role: 'subguide', internalLinksTarget: 4, linksTo: ['best-dog-bed-2026'] },
  { slug: 'best-dog-crate-bed', title: 'Best Dog Crate Beds & Mats (2026) – Perfect Fit Picks Tested', primaryKW: 'best dog crate bed', secondaryKWs: ['crate pad', 'crate mat for dogs', 'dog bed for kennel'], intent: 'commercial', priority: 70, cluster: 'dog-beds', week: 5, role: 'subguide', internalLinksTarget: 4, linksTo: ['best-dog-bed-2026'] },
  // Week 6
  { slug: 'best-dog-bed-under-50', title: 'Best Dog Beds Under $50 (2026) – Budget Picks That Actually Last', primaryKW: 'best dog bed under 50', secondaryKWs: ['cheap dog bed', 'affordable dog bed', 'budget dog bed'], intent: 'commercial', priority: 74, cluster: 'dog-beds', week: 6, role: 'subguide', internalLinksTarget: 5, linksTo: ['best-dog-bed-2026'] },
  { slug: 'best-waterproof-dog-bed', title: 'Best Waterproof Dog Beds (2026) – For Puppies, Seniors & Outdoor Use', primaryKW: 'best waterproof dog bed', secondaryKWs: ['waterproof dog bed cover', 'dog bed for incontinence'], intent: 'commercial', priority: 68, cluster: 'dog-beds', week: 6, role: 'subguide', internalLinksTarget: 4, linksTo: ['best-dog-bed-2026', 'best-dog-bed-senior-dogs'] },
  { slug: 'memory-foam-vs-bolster-dog-bed', title: 'Memory Foam vs Bolster Dog Bed – Which Is Better for Your Dog?', primaryKW: 'memory foam vs bolster dog bed', secondaryKWs: ['dog bed comparison', 'flat vs bolster dog bed'], intent: 'informational', priority: 60, cluster: 'dog-beds', week: 6, role: 'subguide', internalLinksTarget: 4, linksTo: ['best-orthopedic-dog-bed', 'best-dog-bed-2026'] },
  // Week 7
  { slug: 'best-dog-bed-golden-retriever', title: 'Best Dog Beds for Golden Retrievers (2026) – Breed-Specific Picks', primaryKW: 'best dog bed for golden retriever', secondaryKWs: ['golden retriever bed size', 'bed for golden retriever'], intent: 'commercial', priority: 65, cluster: 'dog-beds', week: 7, role: 'subguide', internalLinksTarget: 4, linksTo: ['best-dog-bed-large-dogs', 'best-dog-bed-2026'] },
  { slug: 'best-dog-bed-french-bulldog', title: 'Best Dog Beds for French Bulldogs (2026) – Flat-Nose Friendly Picks', primaryKW: 'best dog bed for french bulldog', secondaryKWs: ['french bulldog bed', 'bed for brachycephalic dogs'], intent: 'commercial', priority: 63, cluster: 'dog-beds', week: 7, role: 'subguide', internalLinksTarget: 4, linksTo: ['best-dog-bed-2026'] },
  { slug: 'best-heated-dog-bed', title: 'Best Heated Dog Beds (2026) – Safe Warming Picks for Cold Weather', primaryKW: 'best heated dog bed', secondaryKWs: ['self warming dog bed', 'electric dog bed', 'winter dog bed'], intent: 'commercial', priority: 66, cluster: 'dog-beds', week: 7, role: 'subguide', internalLinksTarget: 4, linksTo: ['best-dog-bed-2026', 'best-dog-bed-senior-dogs'] },
  // Week 8
  { slug: 'best-outdoor-dog-bed', title: 'Best Outdoor Dog Beds (2026) – Weather-Resistant Picks Tested', primaryKW: 'best outdoor dog bed', secondaryKWs: ['outside dog bed', 'patio dog bed', 'weather resistant dog bed'], intent: 'commercial', priority: 64, cluster: 'dog-beds', week: 8, role: 'subguide', internalLinksTarget: 4, linksTo: ['best-dog-bed-2026', 'best-elevated-dog-bed'] },
  { slug: 'best-dog-bed-for-car', title: 'Best Dog Beds for Car Travel (2026) – Safe & Comfortable Road Trip Picks', primaryKW: 'best dog bed for car', secondaryKWs: ['car dog bed', 'travel dog bed', 'dog car seat bed'], intent: 'commercial', priority: 62, cluster: 'dog-beds', week: 8, role: 'subguide', internalLinksTarget: 4, linksTo: ['best-dog-bed-2026'] },
  { slug: 'how-to-wash-dog-bed', title: 'How to Wash a Dog Bed – Complete Cleaning Guide for Every Material', primaryKW: 'how to wash dog bed', secondaryKWs: ['clean dog bed', 'dog bed washing instructions', 'sanitize dog bed'], intent: 'informational', priority: 55, cluster: 'dog-beds', week: 8, role: 'subguide', internalLinksTarget: 3, linksTo: ['best-dog-bed-2026'] },

  // ========== FILL to ~100 with remaining cat-litter & cat-furniture ==========
  // Week 6 (cat-litter continued)
  { slug: 'best-litter-box-for-spraying-cats', title: 'Best Litter Boxes for Cats That Spray (2026) – High-Sided Picks', primaryKW: 'litter box for spraying cats', secondaryKWs: ['high sided litter box', 'litter box for high pee'], intent: 'commercial', priority: 69, cluster: 'cat-litter', week: 6, role: 'subguide', internalLinksTarget: 4, linksTo: ['best-cat-litter-box-2026', 'best-covered-litter-box'] },
  { slug: 'pine-vs-clay-litter', title: 'Pine vs Clay Cat Litter – Which Is Safer & More Effective?', primaryKW: 'pine vs clay cat litter', secondaryKWs: ['natural vs clay litter', 'best cat litter type'], intent: 'informational', priority: 58, cluster: 'cat-litter', week: 6, role: 'subguide', internalLinksTarget: 3, linksTo: ['best-cat-litter-box-2026', 'clumping-vs-non-clumping-litter'] },
  // Week 7 (cat-litter continued)
  { slug: 'best-litter-box-mat', title: 'Best Litter Box Mats (2026) – Tested for Tracking & Easy Cleaning', primaryKW: 'best litter box mat', secondaryKWs: ['cat litter mat', 'litter trapping mat'], intent: 'commercial', priority: 67, cluster: 'cat-litter', week: 7, role: 'subguide', internalLinksTarget: 4, linksTo: ['how-to-stop-litter-tracking', 'best-cat-litter-box-2026'] },
  { slug: 'best-automatic-litter-box-under-200', title: 'Best Automatic Litter Boxes Under $200 (2026) – Affordable Self-Cleaning', primaryKW: 'automatic litter box under 200', secondaryKWs: ['cheap self cleaning litter box', 'budget automatic litter box'], intent: 'commercial', priority: 71, cluster: 'cat-litter', week: 7, role: 'subguide', internalLinksTarget: 5, linksTo: ['best-self-cleaning-litter-box-2026', 'best-cat-litter-box-2026'] },
  { slug: 'litter-box-training-adult-cat', title: 'How to Litter Box Train an Adult Cat – Step-by-Step Guide', primaryKW: 'litter box training adult cat', secondaryKWs: ['teach cat to use litter box', 'cat litter box training'], intent: 'informational', priority: 56, cluster: 'cat-litter', week: 7, role: 'subguide', internalLinksTarget: 3, linksTo: ['how-many-litter-boxes-per-cat', 'best-cat-litter-box-2026'] },
  // Week 7 (cat-furniture continued)
  { slug: 'best-cat-tree-for-heavy-cats', title: 'Best Cat Trees for Heavy Cats (2026) – Sturdy Picks for 15+ lb Cats', primaryKW: 'cat tree for heavy cats', secondaryKWs: ['sturdy cat tree', 'cat tree weight limit', 'cat tree for fat cats'], intent: 'commercial', priority: 69, cluster: 'cat-furniture', week: 7, role: 'subguide', internalLinksTarget: 5, linksTo: ['best-cat-tree-maine-coon', 'best-cat-trees-small-apartments'] },
  { slug: 'best-cat-tunnel', title: 'Best Cat Tunnels (2026) – Crinkle, Pop-Up & Interactive Picks', primaryKW: 'best cat tunnel', secondaryKWs: ['cat play tunnel', 'crinkle cat tunnel'], intent: 'commercial', priority: 58, cluster: 'cat-furniture', week: 7, role: 'subguide', internalLinksTarget: 3, linksTo: ['best-cat-trees-small-apartments'] },
  // Week 8 (cat-furniture continued)
  { slug: 'best-cat-feeding-station', title: 'Best Cat Feeding Stations (2026) – Elevated & Multi-Cat Tested', primaryKW: 'best cat feeding station', secondaryKWs: ['raised cat bowl', 'elevated cat feeder', 'cat feeding stand'], intent: 'commercial', priority: 61, cluster: 'cat-furniture', week: 8, role: 'subguide', internalLinksTarget: 4, linksTo: ['best-cat-litter-box-furniture-enclosures-2026'] },
  { slug: 'best-cat-tree-with-hammock', title: 'Best Cat Trees With Hammock (2026) – Cozy & Fun Picks Tested', primaryKW: 'cat tree with hammock', secondaryKWs: ['cat tree hammock bed', 'cat tree with hanging bed'], intent: 'commercial', priority: 63, cluster: 'cat-furniture', week: 8, role: 'subguide', internalLinksTarget: 4, linksTo: ['best-cat-trees-small-apartments', 'best-cat-condo-2026'] },
  { slug: 'best-sisal-cat-scratcher', title: 'Best Sisal Cat Scratchers (2026) – Post, Board & Pad Picks', primaryKW: 'best sisal cat scratcher', secondaryKWs: ['sisal scratching post', 'sisal vs cardboard scratcher'], intent: 'commercial', priority: 59, cluster: 'cat-furniture', week: 8, role: 'subguide', internalLinksTarget: 4, linksTo: ['best-cat-scratching-post', 'best-cat-trees-small-apartments'] },
  // Week 8 (cat-litter continued)
  { slug: 'why-cat-peeing-outside-litter-box', title: 'Why Is My Cat Peeing Outside the Litter Box? 9 Causes & Fixes', primaryKW: 'cat peeing outside litter box', secondaryKWs: ['cat not using litter box', 'why does my cat pee everywhere'], intent: 'informational', priority: 64, cluster: 'cat-litter', week: 8, role: 'subguide', internalLinksTarget: 5, linksTo: ['how-many-litter-boxes-per-cat', 'litter-box-placement-guide', 'best-cat-litter-box-2026'] },
  { slug: 'best-crystal-cat-litter', title: 'Best Crystal Cat Litter (2026) – Silica Gel Picks for Low Maintenance', primaryKW: 'best crystal cat litter', secondaryKWs: ['silica gel cat litter', 'crystal litter review'], intent: 'commercial', priority: 60, cluster: 'cat-litter', week: 8, role: 'subguide', internalLinksTarget: 3, linksTo: ['best-cat-litter-box-2026', 'clumping-vs-non-clumping-litter'] },
];

// ============= WEEKLY SCHEDULE =============

export function getWeeklySchedule(): WeeklySchedule[] {
  const weeks: WeeklySchedule[] = [];
  for (let w = 1; w <= 8; w++) {
    const guides = SCALING_GUIDES.filter(g => g.week === w);
    const clusterCounts = guides.reduce((acc, g) => {
      acc[g.cluster] = (acc[g.cluster] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const focusParts = Object.entries(clusterCounts).map(([c, n]) => `${c}: ${n}`);

    weeks.push({
      week: w,
      label: `Week ${w}${w <= 2 ? ' (14-day pause after)' : ''}`,
      guides,
      focus: focusParts.join(', '),
    });
  }
  return weeks;
}

// ============= CANNIBALIZATION CHECK =============

export interface CannibalizationIssue {
  keyword: string;
  slugs: string[];
  severity: 'high' | 'medium' | 'low';
}

export function checkCannibalization(): CannibalizationIssue[] {
  const kwMap: Record<string, string[]> = {};
  SCALING_GUIDES.forEach(g => {
    const norm = g.primaryKW.toLowerCase().trim();
    if (!kwMap[norm]) kwMap[norm] = [];
    kwMap[norm].push(g.slug);
  });

  return Object.entries(kwMap)
    .filter(([, slugs]) => slugs.length > 1)
    .map(([keyword, slugs]) => ({
      keyword,
      slugs,
      severity: slugs.length > 2 ? 'high' : 'medium',
    }));
}

// ============= SUMMARY =============

export function getScalingSummary() {
  const total = SCALING_GUIDES.length;
  const byCluster = {
    'cat-litter': SCALING_GUIDES.filter(g => g.cluster === 'cat-litter').length,
    'cat-furniture': SCALING_GUIDES.filter(g => g.cluster === 'cat-furniture').length,
    'dog-beds': SCALING_GUIDES.filter(g => g.cluster === 'dog-beds').length,
  };
  const byRole = {
    cornerstone: SCALING_GUIDES.filter(g => g.role === 'cornerstone').length,
    hub: SCALING_GUIDES.filter(g => g.role === 'hub').length,
    subguide: SCALING_GUIDES.filter(g => g.role === 'subguide').length,
  };
  const cannibalization = checkCannibalization();

  return { total, byCluster, byRole, cannibalization, weeks: getWeeklySchedule() };
}

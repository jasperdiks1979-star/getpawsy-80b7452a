/**
 * Position #1 Domination Engine — Per-Page Configuration
 * 
 * Contains direct answer snippets, PAA questions, HowTo steps,
 * quick comparison data, and bullet USPs for each target page.
 */

export interface DirectAnswerConfig {
  answer: string; // 40-60 words, direct answer to primary query
}

export interface QuickComparisonRow {
  model: string;
  bestFor: string;
  keyFeature: string;
  price: string;
  badge?: string;
}

export interface PAAQuestion {
  question: string;
  answer: string; // 2-3 paragraphs
  internalLink?: { href: string; label: string };
}

export interface HowToStep {
  name: string;
  text: string;
}

export interface HowToConfig {
  name: string;
  description: string;
  totalTime?: string;
  steps: HowToStep[];
}

export interface BulletUSP {
  icon: string;
  text: string;
}

export interface DominationPageConfig {
  slug: string;
  directAnswer: DirectAnswerConfig;
  bulletUSPs: BulletUSP[];
  quickComparison: QuickComparisonRow[];
  paaQuestions: PAAQuestion[];
  howTo?: HowToConfig;
  jumpNavItems: { id: string; label: string }[];
}

export const DOMINATION_PAGES: Record<string, DominationPageConfig> = {
  // ── ORTHOPEDIC DOG BEDS ──
  'orthopedic-dog-beds': {
    slug: 'orthopedic-dog-beds',
    directAnswer: {
      answer: 'The best orthopedic dog bed uses high-density memory foam (1.8+ lb/ft³) with a waterproof liner and removable washable cover. For dogs over 50 lbs or with arthritis, choose 5–7 inches of foam thickness. Top-rated beds last 3–5 years and cost $60–$200 — saving money vs replacing cheap beds every 6 months.',
    },
    bulletUSPs: [
      { icon: '✅', text: 'Vet-recommended memory foam for joint pain relief' },
      { icon: '🇺🇸', text: 'Ships from US warehouses in 5–10 business days' },
      { icon: '🔄', text: '30-day return policy — full refund if your dog doesn\'t love it' },
    ],
    quickComparison: [
      { model: 'Memory Foam Classic', bestFor: 'Senior dogs, arthritis', keyFeature: '5" high-density foam', price: '$45–$90', badge: 'Most Popular' },
      { model: 'Gel-Infused Cooling', bestFor: 'Hot climates, thick coats', keyFeature: 'Phase-change gel layer', price: '$55–$120' },
      { model: 'XL Heavy-Duty', bestFor: 'Giant breeds (90+ lbs)', keyFeature: '7" dual-layer foam', price: '$70–$150', badge: 'Best for Large Dogs' },
      { model: 'Therapeutic Pro', bestFor: 'Post-surgery recovery', keyFeature: 'Medical-grade foam', price: '$90–$180', badge: 'Vet Choice' },
    ],
    paaQuestions: [
      {
        question: 'Are orthopedic dog beds worth it?',
        answer: 'Yes — orthopedic dog beds are one of the smartest investments for dogs over 40 lbs, senior dogs (7+ years), and breeds prone to hip dysplasia or arthritis. High-density memory foam distributes weight evenly, reducing joint pressure by up to 40%.\n\nA quality orthopedic bed costs $60–$200 but lasts 3–5 years, while standard polyester beds flatten in 6–12 months and need 4–6 replacements over the same period. The total cost is actually lower.\n\nVeterinarians recommend orthopedic beds as part of comprehensive arthritis management alongside joint supplements and controlled exercise.',
        internalLink: { href: '/guides/do-orthopedic-dog-beds-help-arthritis', label: 'Do Orthopedic Dog Beds Help Arthritis?' },
      },
      {
        question: 'What size orthopedic bed does a 70 lb dog need?',
        answer: 'A 70 lb dog needs a Large orthopedic bed (42×32 inches minimum) with at least 5 inches of high-density foam (1.8+ lb/ft³). Measure your dog nose-to-tail while lying in their natural sleep position and add 8–12 inches.\n\nDogs that sleep stretched out need longer beds. Curlers can sometimes go one size down. For breeds like Labradors and Golden Retrievers at 70 lbs, a Large is the sweet spot — XL is only necessary for dogs that stretch beyond 36 inches.\n\nAvoid beds where your dog\'s legs hang off the edge, as this creates pressure points that defeat the purpose of orthopedic support.',
        internalLink: { href: '#size-guide', label: 'View Full Size Guide' },
      },
      {
        question: 'How long do orthopedic dog beds last?',
        answer: 'Orthopedic dog bed lifespan depends entirely on foam density. Low-density foam (under 1.5 lb/ft³) lasts 3–6 months. Medium-density (1.5–1.7 lb/ft³) lasts 1–2 years. High-density (1.8+ lb/ft³) lasts 3–5 years with proper care.\n\nSigns it\'s time to replace: the foam doesn\'t spring back within 10 seconds, there\'s a permanent body impression, or persistent odor despite cover washing.\n\nExtend bed life by washing the cover every 2–4 weeks and using a waterproof liner to protect the foam core from liquid damage.',
      },
      {
        question: 'Do vets recommend orthopedic dog beds?',
        answer: 'Yes — veterinary orthopedic specialists consistently recommend memory foam beds for dogs with arthritis, hip dysplasia, and post-surgical recovery. The American Kennel Club cites proper sleep surface support as a key factor in reducing joint inflammation.\n\nOrthopedic beds are especially important for large breeds (Labradors, German Shepherds, Golden Retrievers) that put 3x more pressure per square inch on joints than small breeds. Starting orthopedic support before age 5 can slow the progression of age-related joint disease.\n\nLook for beds with CertiPUR-US certified foam to ensure no harmful chemicals or off-gassing.',
        internalLink: { href: '/guides/best-orthopedic-dog-bed', label: 'Vet-Recommended Bed Guide' },
      },
      {
        question: 'Is memory foam or egg crate foam better for dogs?',
        answer: 'Memory foam is significantly better for orthopedic support. Viscoelastic memory foam conforms to your dog\'s body shape, distributes weight evenly, and lasts 3–5 years. Egg crate foam provides initial comfort but compresses flat within 3–6 months.\n\nEgg crate foam lacks true pressure relief — it simply creates air pockets that collapse under sustained weight. For dogs over 30 lbs, large breeds, or any dog with joint issues, memory foam is the only effective option.\n\nThe only scenario where egg crate is acceptable: as a temporary travel bed for a small dog under 20 lbs.',
        internalLink: { href: '/guides/memory-foam-vs-egg-crate-foam-dog-bed', label: 'Memory Foam vs Egg Crate Comparison' },
      },
      {
        question: 'What is the best orthopedic bed for hip dysplasia?',
        answer: 'Dogs with hip dysplasia need beds with at least 5 inches of high-density foam (1.8+ lb/ft³), a low entry point under 4 inches, and bolstered edges for hip cradling. Dual-layer construction — firm base with contouring top — prevents the hip joint from sinking to the floor.\n\nGel-infused memory foam is ideal because it reduces inflammation-related heat buildup around the hip socket. Avoid beds with thick side walls that require the dog to step up, as this strains the dysplastic hip joint.\n\nFor severe cases, medical-grade foam (2.3+ lb/ft³) provides the most consistent support over time.',
        internalLink: { href: '/guides/best-dog-bed-hip-dysplasia', label: 'Best Bed for Hip Dysplasia Guide' },
      },
      {
        question: 'Can puppies use orthopedic dog beds?',
        answer: 'Puppies of large and giant breeds (expected adult weight 60+ lbs) benefit from orthopedic beds starting at 4–6 months old. Early joint support helps prevent developmental orthopedic disease, especially in fast-growing breeds like Great Danes and German Shepherds.\n\nHowever, puppies are aggressive chewers. Choose beds with chew-resistant 1000D Oxford fabric covers, hidden zippers, and waterproof liners for accidents. Size the bed for the puppy\'s current size — you\'ll upgrade as they grow.\n\nFor puppies under 30 lbs or slow-growing breeds, a standard bed is fine until they reach adult size.',
      },
      {
        question: 'Are waterproof orthopedic beds worth the extra cost?',
        answer: 'Absolutely — waterproof protection is the single most important feature after foam quality. One accident permanently ruins unprotected memory foam, creating mold, bacteria, and irreversible odor inside the foam core.\n\nLook for beds with a sealed TPU (thermoplastic polyurethane) liner between the foam and outer cover. "Water-resistant" coatings wear off after washing. True waterproof liners are welded, not sewn, and protect against complete liquid penetration.\n\nFor senior dogs, puppies, and heavy droolers, waterproof is non-negotiable. The $10–$20 premium saves you from replacing a $100+ bed.',
      },
    ],
    howTo: {
      name: 'How to Choose the Right Orthopedic Dog Bed',
      description: 'A step-by-step guide to selecting the best orthopedic bed for your dog\'s size, age, and health needs.',
      totalTime: 'PT10M',
      steps: [
        { name: 'Measure your dog', text: 'Measure nose-to-tail while lying in their natural sleep position. Add 6–12 inches to determine minimum bed length.' },
        { name: 'Check foam density', text: 'Look for memory foam density of 1.8+ lb/ft³ for dogs over 40 lbs. Higher density means longer-lasting support.' },
        { name: 'Choose the right thickness', text: 'Dogs under 50 lbs: 3–4 inches. 50–90 lbs: 5 inches. Over 90 lbs: 6–7 inches with a dual-layer construction.' },
        { name: 'Verify waterproof protection', text: 'Ensure the bed has a sealed TPU waterproof liner between foam and cover — not just a water-resistant coating.' },
        { name: 'Check cover washability', text: 'Choose a removable, machine-washable cover with heavy-duty zipper. Plan to wash every 2–4 weeks.' },
      ],
    },
    jumpNavItems: [
      { id: 'comparison', label: 'Comparison Matrix' },
      { id: 'products', label: 'Shop Beds' },
      { id: 'size-guide', label: 'Size Guide' },
      { id: 'use-cases', label: 'Best For Your Dog' },
      { id: 'buyer-mistakes', label: 'Mistakes to Avoid' },
      { id: 'paa', label: 'Common Questions' },
      { id: 'faq', label: 'FAQ (20 Q&A)' },
    ],
  },

  // ── CAT TREES FOR LARGE CATS ──
  'cat-trees-for-large-cats': {
    slug: 'cat-trees-for-large-cats',
    directAnswer: {
      answer: 'The best cat tree for large cats uses solid wood or engineered wood frames with 4"+ diameter sisal posts, 18"+ wide platforms, and anti-tip wall anchors. Standard cat trees fail for cats over 15 lbs — heavy-duty models rated for 40–60+ lbs cost $120–$300 and last 5–8 years with proper maintenance.',
    },
    bulletUSPs: [
      { icon: '✅', text: 'Stability-tested for cats 25+ lbs (Maine Coons, Ragdolls)' },
      { icon: '🇺🇸', text: 'US warehouse shipping — 5–10 day delivery' },
      { icon: '🔄', text: '30-day return policy on all cat furniture' },
    ],
    quickComparison: [
      { model: 'Floor-to-Ceiling Tension', bestFor: 'Maximum stability, multi-cat', keyFeature: 'Adjustable 7–9 ft, no tipping', price: '$180–$300', badge: 'Most Stable' },
      { model: 'Wall-Mounted Shelves', bestFor: 'Apartments, zero floor space', keyFeature: 'Modular, 25 lb capacity each', price: '$80–$200' },
      { model: 'Heavy Duty Free-Standing', bestFor: 'Large breeds, multi-level', keyFeature: 'Solid wood, wall-anchor kit', price: '$120–$250', badge: 'Best Overall' },
      { model: 'XL Cat Condo Tower', bestFor: 'Privacy-loving cats', keyFeature: '12"+ condo openings, hammock', price: '$100–$220' },
    ],
    paaQuestions: [
      {
        question: 'Do large cats need reinforced cat trees?',
        answer: 'Yes — standard cat trees are engineered for cats under 12 lbs. A 20-lb Maine Coon jumping onto a platform creates approximately 80 lbs of dynamic impact force. Standard pressed-board cat trees rated for 15–25 lbs of static weight will wobble, tilt, or collapse under this force.\n\nHeavy-duty cat trees use solid wood frames, 4"+ diameter sisal-wrapped posts, and reinforced joints rated for 60+ lbs of dynamic load. Wall-anchor hardware provides an additional safety margin for households with multiple large cats.\n\nThe risk isn\'t just property damage — a tipping cat tree can seriously injure your cat. Always anchor tall trees (60"+) to the wall.',
        internalLink: { href: '/collections/all', label: 'Heavy Duty Cat Trees' },
      },
      {
        question: 'What cat tree can hold a 25 lb cat?',
        answer: 'Look for cat trees with solid wood or engineered wood frames rated for 40+ lbs total capacity. Avoid pressed particleboard models. Key specifications: 4"+ diameter sisal posts, 18"+ wide platforms with raised edges, and included wall-anchor hardware.\n\nFor a single 25 lb cat, a heavy-duty free-standing tree with a wide weighted base (24"×24" minimum) works well. For multiple large cats, floor-to-ceiling tension pole models are the safest choice with virtually zero tipping risk.\n\nPrice range for quality 25+ lb-rated trees: $120–$300. Under $120, construction quality drops significantly.',
        internalLink: { href: '/collections/all', label: 'Cat Trees for Maine Coons' },
      },
      {
        question: 'What is the most sturdy cat tree for heavy cats?',
        answer: 'Floor-to-ceiling tension pole cat trees are the most stable option. The tension mechanism creates a rigid connection between floor and ceiling, making it physically impossible to tip. Most support 40–60+ lbs safely across multiple platforms.\n\nSecond most stable: wall-mounted cat shelf systems. Each shelf is anchored directly to wall studs, supporting 25+ lbs per shelf with zero floor footprint.\n\nThird: heavy-duty free-standing trees with solid wood frames, wide bases, and included wall-anchor kits. Always install the wall anchors — a wide base alone is not sufficient for 20+ lb cats jumping at full speed.',
      },
      {
        question: 'Are floor-to-ceiling cat trees safe for large cats?',
        answer: 'Yes — tension-pole cat trees are among the safest options for large cats. The adjustable tension mechanism creates a rigid column between floor and ceiling, completely eliminating tip-over risk even with aggressive jumping.\n\nMost tension models are rated for 40–60+ lbs across all platforms. Key maintenance: retighten the tension mechanism quarterly, as the rubber pads settle over time.\n\nAdjustable models fit ceiling heights from 7 to 9.5 feet. Always verify your ceiling height before ordering, and ensure the ceiling can support the tension force (not recommended for drop ceilings).',
      },
      {
        question: 'How much should a heavy duty cat tree cost?',
        answer: 'Quality heavy-duty cat trees range from $120–$300. Under $120, construction typically uses pressed particleboard that won\'t hold up for cats over 15 lbs. The sweet spot is $150–$220 for solid wood construction with natural sisal and 5+ year durability.\n\nPremium floor-to-ceiling models run $200–$350 but offer the highest stability and 8+ year lifespans. Wall-mounted modular systems cost $80–$200 depending on the number of shelves.\n\nWhen comparing prices, check the materials — "wood" often means MDF/particleboard, while "solid wood" means real timber that won\'t degrade under heavy use.',
      },
      {
        question: 'What size cat tree for a Maine Coon?',
        answer: 'Maine Coons (15–25 lbs, 40"+ nose to tail) need cat trees with platforms at least 18 inches wide, condos with 12"+ diameter openings, and total height of 60 inches or more. Standard "large" cat trees are often undersized for true Maine Coons.\n\nLook for hammock-style perches rated for 25+ lbs — Maine Coons love lounging in hammocks but collapse cheaper models. Extra-tall scratching posts (36"+) accommodate their full-stretch scratching behavior.\n\nBudget $150–$250 for a Maine Coon-appropriate tree. Floor-to-ceiling models are ideal as they provide maximum climbing territory while maintaining stability for a 20+ lb cat.',
        internalLink: { href: '/collections/all', label: 'Maine Coon Cat Tree Guide' },
      },
      {
        question: 'Can two large cats share one cat tree?',
        answer: 'Yes, but the tree needs at least 5 separate platforms or perches, each rated for 25+ lbs individually. Total weight capacity should be 50+ lbs. Multi-cat trees with territorial spacing — platforms at different heights and angles — reduce inter-cat conflict.\n\nWall-mounted shelf systems work exceptionally well for multi-cat households because you can space shelves to create separate "zones" that cats can claim without conflict.\n\nAvoid trees with only 2–3 perches for 2+ large cats — this creates resource guarding and territorial fights. Budget $200+ for a properly sized multi-cat heavy-duty tree.',
        internalLink: { href: '/collections/best-cat-tree-for-multiple-cats', label: 'Multi-Cat Tree Guide' },
      },
      {
        question: 'How often should I replace sisal rope on a cat tree?',
        answer: 'Replace sisal rope every 2–3 years for heavy scratchers, or when you see significant fraying exposing the post underneath. Large cats are harder on sisal than small cats — Maine Coons may wear through sisal in 1–2 years.\n\nRe-wrapping is straightforward: remove old sisal, apply hot glue in 6-inch sections, wrap tightly. Budget $20–$30 per post for replacement sisal rope. Buy 3/8" diameter natural sisal — thicker rope lasts longer.\n\nSome premium cat trees offer replaceable sisal sleeves that slide on and off without gluing, making maintenance significantly easier.',
      },
    ],
    howTo: {
      name: 'How to Choose a Cat Tree for Large Cats',
      description: 'Step-by-step guide to selecting a stable, safe cat tree for Maine Coons, Ragdolls, and other large breeds.',
      totalTime: 'PT8M',
      steps: [
        { name: 'Weigh your cat', text: 'Know your cat\'s actual weight. Large breeds range from 15–25+ lbs. The tree must be rated for at least 2x your heaviest cat\'s weight.' },
        { name: 'Check platform size', text: 'Measure your cat nose-to-tail. Platforms should be at least 18 inches wide for cats over 15 lbs.' },
        { name: 'Verify post diameter', text: 'Look for 4-inch+ diameter sisal-wrapped posts. Standard 2–3 inch posts will be destroyed within weeks by large cats.' },
        { name: 'Assess stability system', text: 'Wall-anchor hardware is essential for free-standing trees. Floor-to-ceiling tension models provide maximum stability.' },
        { name: 'Plan placement', text: 'Place near a window for enrichment. Ensure the wall behind can accept anchor hardware. Measure ceiling height for tension models.' },
      ],
    },
    jumpNavItems: [
      { id: 'comparison', label: 'Heavy vs Standard' },
      { id: 'products', label: 'Shop Cat Trees' },
      { id: 'buyer-intent', label: 'Find Your Type' },
      { id: 'paa', label: 'Common Questions' },
      { id: 'faq', label: 'FAQ (20 Q&A)' },
    ],
  },

  // ── DOG CAR SEATS ──
  'best-dog-car-seats': {
    slug: 'best-dog-car-seats',
    directAnswer: {
      answer: 'The best dog car seat combines crash-tested restraint straps, a raised booster design for window viewing, and a non-slip base. For dogs under 30 lbs, booster seats provide the safest ride. For larger dogs, crash-tested harness-and-tether systems are recommended. All picks ship from US warehouses with 30-day returns.',
    },
    bulletUSPs: [
      { icon: '✅', text: 'Crash-tested designs for dogs up to 75 lbs' },
      { icon: '🇺🇸', text: 'US shipping — 5–10 business days' },
      { icon: '🔄', text: '30-day return policy on all travel gear' },
    ],
    quickComparison: [
      { model: 'Booster Car Seat', bestFor: 'Small dogs under 20 lbs', keyFeature: 'Window viewing, easy install', price: '$30–$60', badge: 'Best Seller' },
      { model: 'Console Car Seat', bestFor: 'Tiny dogs under 10 lbs', keyFeature: 'Fits between front seats', price: '$25–$45' },
      { model: 'Crash-Tested Harness', bestFor: 'Medium-large dogs 30–75 lbs', keyFeature: 'Seatbelt attachment, tested', price: '$40–$90', badge: 'Safest Option' },
      { model: 'Hammock Seat Cover', bestFor: 'Back seat protection + restraint', keyFeature: 'Full bench coverage', price: '$35–$70' },
    ],
    paaQuestions: [
      { question: 'Are dog car seats crash tested?', answer: 'Most dog car seats are NOT crash tested — only a few brands have passed independent crash testing protocols. Look for seats tested to FMVSS 213 standards or by the Center for Pet Safety (CPS). Untested seats may keep your dog contained during normal driving but fail catastrophically in a collision.\n\nCrash-tested options include reinforced straps, metal hardware (not plastic clips), and energy-absorbing padding. These typically cost $40–$90 compared to $15–$30 for untested models.\n\nFor dogs over 30 lbs, a crash-tested harness with a seatbelt tether provides better protection than a seat-style restraint.' },
      { question: 'What size dog fits in a car booster seat?', answer: 'Standard dog booster seats fit dogs from 5–25 lbs comfortably. XL boosters accommodate dogs up to 35 lbs. Beyond 35 lbs, switch to a crash-tested harness system or a hammock-style back seat cover.\n\nMeasure your dog sitting height — they should be able to see out the window when seated in the booster without standing. The seat base should be wide enough for your dog to sit, lie down, and turn around.\n\nFor toy breeds (under 10 lbs), console car seats that fit between the front seats keep your dog closer to you during the drive.' },
      { question: 'Is it illegal to drive with a dog unrestrained?', answer: 'Laws vary by state. As of 2026, several states (including New Jersey, Rhode Island, and Hawaii) have laws requiring pets to be restrained while driving. Many more states classify unrestrained pets as distracted driving.\n\nRegardless of legality, unrestrained dogs are a major safety hazard. A 60-lb dog in a 35 mph crash becomes a 2,700-lb projectile. Restraining your dog protects both the animal and all vehicle occupants.\n\nInsurance companies may also deny accident claims if an unrestrained pet is determined to have contributed to the crash.' },
      { question: 'How do I install a dog car seat?', answer: 'Most dog car seats install in 3 steps: (1) Thread the seat\'s base strap through the vehicle headrest posts and tighten, (2) Connect the seat\'s tether to the LATCH anchor or seatbelt buckle, (3) Attach your dog\'s harness to the seat\'s internal leash.\n\nNever attach the tether to your dog\'s collar — only use a harness. Pull-test the installation by yanking the seat firmly before placing your dog.\n\nFor booster seats, the raised position should allow window viewing without your dog being able to jump out. Adjust the internal tether length to allow sitting and lying but not standing.' },
      { question: 'Can large dogs use car seats?', answer: 'Traditional car seats don\'t work for dogs over 35 lbs. Instead, large dogs need: (1) A crash-tested car harness attached to the seatbelt or LATCH system, (2) A back-seat hammock cover for comfort and containment, or (3) A cargo area barrier for SUVs and wagons.\n\nThe safest option for large dogs is a crash-tested harness combined with a padded seat cover. This allows the dog to sit or lie on the back seat while being securely restrained in case of sudden stops or collisions.\n\nAvoid harnesses that clip to the collar — always use a full body harness that distributes crash forces across the chest.' },
      { question: 'What is the safest way to travel with a dog in a car?', answer: 'The safest configuration is: (1) Dog in the back seat (not front — airbags can be lethal), (2) Wearing a crash-tested harness, (3) Tethered to the seatbelt or LATCH anchor, (4) On a padded seat cover for comfort.\n\nFor small dogs, a booster seat in the back with a harness tether provides window viewing plus crash protection. Never allow dogs to ride in your lap or with heads out the window.\n\nFor road trips longer than 2 hours, stop every 1–2 hours for water, bathroom breaks, and leg stretching. Never leave dogs in parked cars — temperatures rise to dangerous levels within minutes.' },
      { question: 'Do dog car seats reduce anxiety?', answer: 'Yes — elevated booster seats and secure harness systems significantly reduce travel anxiety in dogs. The raised position provides visual stimulation (seeing outside), while the secure containment mimics the calming effect of a crate.\n\nFor severely anxious dogs, pair the car seat with a calming spray or anxiety wrap. Start with short 5-minute drives and gradually increase duration. Reward calm behavior with treats.\n\nMost dogs adapt to a car seat within 3–5 trips. The key is consistency — use the same seat every time so your dog associates it with safe, predictable travel.' },
      { question: 'How do I clean a dog car seat?', answer: 'Most dog car seats have removable fabric covers that are machine washable on gentle cycle with cold water. Air dry to prevent shrinkage. Clean the frame and straps with a damp cloth and mild soap.\n\nFor vomit or accident cleanup, remove the cover immediately and blot — don\'t rub. Apply enzyme-based pet cleaner and let sit for 10 minutes before washing. The foam or padding inserts should be spot-cleaned only.\n\nDeep clean monthly for regular use. Replace the entire seat if straps show fraying, buckles crack, or the base no longer grips securely — compromised restraints are dangerous.' },
    ],
    howTo: {
      name: 'How to Choose a Dog Car Seat',
      description: 'Step-by-step guide to selecting the safest car restraint for your dog\'s size and travel needs.',
      totalTime: 'PT7M',
      steps: [
        { name: 'Weigh your dog', text: 'Dogs under 25 lbs: booster seat. 25–35 lbs: XL booster or harness. Over 35 lbs: crash-tested harness system.' },
        { name: 'Check crash test certification', text: 'Look for Center for Pet Safety (CPS) certification or FMVSS 213 testing. Uncertified seats may fail in collisions.' },
        { name: 'Verify vehicle compatibility', text: 'Check that the seat fits your vehicle\'s back seat and is compatible with your seatbelt or LATCH system.' },
        { name: 'Install and test', text: 'Thread straps through headrest posts, attach to seatbelt anchor. Pull-test firmly before placing your dog.' },
        { name: 'Acclimate your dog', text: 'Let your dog explore the seat at home first. Take short drives before long trips. Reward calm behavior.' },
      ],
    },
    jumpNavItems: [
      { id: 'comparison', label: 'Quick Comparison' },
      { id: 'products', label: 'Shop Car Seats' },
      { id: 'paa', label: 'Safety Questions' },
      { id: 'faq', label: 'FAQ' },
    ],
  },

  // ── ELEVATED DOG BEDS ──
  'best-elevated-dog-bed': {
    slug: 'best-elevated-dog-bed',
    directAnswer: {
      answer: 'The best elevated dog bed uses a powder-coated steel frame with breathable mesh fabric, raising your dog 4–8 inches off the ground for airflow cooling. Ideal for hot climates, outdoor use, and dogs with joint issues. Top-rated models support up to 150 lbs and cost $25–$80 with free US shipping.',
    },
    bulletUSPs: [
      { icon: '✅', text: 'Cooling airflow design for hot weather and outdoor use' },
      { icon: '🇺🇸', text: 'Ships from US warehouses in 5–10 business days' },
      { icon: '🔄', text: '30-day return policy on all elevated beds' },
    ],
    quickComparison: [
      { model: 'Steel Frame Cot', bestFor: 'All-purpose, indoor/outdoor', keyFeature: '150 lb capacity, breathable mesh', price: '$25–$50', badge: 'Best Value' },
      { model: 'Canopy Elevated Bed', bestFor: 'Outdoor sun protection', keyFeature: 'Removable shade canopy', price: '$40–$80' },
      { model: 'Orthopedic Elevated', bestFor: 'Joint support + cooling', keyFeature: 'Memory foam pad included', price: '$50–$100', badge: 'Best for Senior Dogs' },
      { model: 'Travel Portable Cot', bestFor: 'Camping, road trips', keyFeature: 'Folds flat, carry bag included', price: '$30–$60' },
    ],
    paaQuestions: [
      { question: 'Are elevated dog beds better for dogs?', answer: 'Elevated dog beds are better than floor beds in specific situations: hot climates (4–8" airflow reduces body temperature), outdoor use (off damp/hot ground), and dogs with mild joint stiffness (easier entry/exit than low beds).\n\nHowever, for dogs with severe arthritis or hip dysplasia, an orthopedic memory foam bed provides superior pressure relief. The ideal setup: orthopedic bed inside, elevated cot outside or as a secondary bed.\n\nElevated beds are also easier to clean (hose off the mesh) and resist pests like fleas and ants that nest in ground-level bedding.' },
      { question: 'What size elevated bed for a large dog?', answer: 'Large dogs (60–90 lbs) need an elevated bed measuring at least 48×36 inches. Giant breeds (90+ lbs) need 52×42 inches or larger. The bed should be long enough for your dog to stretch fully without legs hanging off.\n\nFrame height matters too: 7–8 inches is optimal for large dogs. Lower frames (4–5") don\'t provide enough airflow. Higher frames (10"+) can be difficult for senior large dogs to mount.\n\nAlways check weight capacity — cheap elevated beds rated for 100 lbs may sag or collapse under a large dog\'s concentrated weight. Look for 150+ lb capacity for breeds like Labradors and German Shepherds.' },
      { question: 'Can elevated dog beds be used outside?', answer: 'Yes — elevated beds are ideal for outdoor use. The raised design keeps your dog off hot pavement, damp grass, and cold ground. Choose beds with powder-coated steel or aluminum frames that resist rust and UV-resistant mesh fabric.\n\nFor extended outdoor use, add a canopy attachment for shade. Anchor the bed on uneven terrain to prevent sliding. Bring the bed inside during severe weather to extend its lifespan.\n\nAvoid beds with fabric slings instead of mesh — fabric traps moisture and develops mold in outdoor environments.' },
      { question: 'Do dogs like elevated beds?', answer: 'Most dogs take to elevated beds quickly, especially in warm weather when they feel the cooling airflow benefit immediately. Dogs that prefer hard floors or tile (seeking cool surfaces) are the best candidates.\n\nSome dogs need 2–3 days to adjust. Place treats or a familiar blanket on the bed initially. Don\'t force your dog onto it — let them discover it naturally.\n\nDogs that sleep curled up may prefer a bolstered bed over an elevated cot. Elevated beds work best for dogs that sleep stretched out or on their side.' },
      { question: 'Elevated dog bed vs orthopedic bed — which is better?', answer: 'They serve different purposes. Elevated beds excel at: cooling (airflow underneath), outdoor use, easy cleaning, and pest prevention. Orthopedic beds excel at: joint support, pressure relief, arthritis management, and post-surgery recovery.\n\nFor most dogs, the answer is both — orthopedic inside, elevated outside. For senior dogs with joint issues, an orthopedic bed is the priority. For young, healthy dogs in warm climates, an elevated bed may be the primary choice.\n\nSome hybrid models combine elevation with a memory foam pad, offering both cooling and joint support — but at a higher price ($50–$100).' },
      { question: 'How much weight can an elevated dog bed hold?', answer: 'Entry-level elevated beds (under $30) typically hold 80–100 lbs. Mid-range models ($30–$50) hold 120–150 lbs. Heavy-duty commercial-grade cots ($50–$80) hold 200+ lbs and use reinforced steel frames.\n\nWeight ratings refer to static load — a dog jumping onto the bed creates 2–3x the dynamic force. For a 70 lb dog, choose a bed rated for at least 150 lbs to prevent frame bending or mesh tearing over time.\n\nCheck reviews for long-term durability reports. Some beds meet their weight rating initially but sag within 6 months of daily use.' },
      { question: 'Are elevated beds good for dogs with arthritis?', answer: 'Elevated beds provide moderate joint benefit — the raised height makes it easier for arthritic dogs to get on and off compared to low floor beds. The firm, flat mesh surface also provides decent support.\n\nHowever, elevated beds lack the conforming pressure relief that memory foam provides. For dogs with moderate to severe arthritis, an orthopedic memory foam bed is significantly more therapeutic.\n\nA practical compromise: elevated bed frame with a thin memory foam pad on top. This combination provides both airflow cooling and joint support, though at a higher total cost.' },
      { question: 'How do I clean an elevated dog bed?', answer: 'Elevated beds are the easiest dog beds to clean. For routine cleaning: hose off the mesh fabric outdoors and let air dry. For deeper cleaning: spray with enzyme-based pet cleaner, scrub with a soft brush, rinse thoroughly.\n\nSteel frames can be wiped down with a damp cloth. Check for rust spots quarterly — touch up with rust-resistant spray paint if needed.\n\nMost elevated bed fabrics are mold-resistant, but storing a wet bed in a garage can still develop mildew. Always air dry completely before storage.' },
    ],
    howTo: {
      name: 'How to Choose an Elevated Dog Bed',
      description: 'Quick guide to selecting the right elevated bed for your dog\'s size and climate needs.',
      totalTime: 'PT5M',
      steps: [
        { name: 'Measure your dog', text: 'Length: nose-to-tail + 6". Width: shoulder-to-hip + 4". Choose a bed that fits these dimensions.' },
        { name: 'Check weight capacity', text: 'Select a bed rated for at least 2x your dog\'s weight to prevent sagging over time.' },
        { name: 'Choose frame material', text: 'Steel for durability, aluminum for portability. Powder-coated finish for rust resistance.' },
        { name: 'Select indoor/outdoor', text: 'Outdoor: UV-resistant mesh, rust-proof frame. Indoor: standard mesh, optional canopy.' },
      ],
    },
    jumpNavItems: [
      { id: 'comparison', label: 'Quick Comparison' },
      { id: 'products', label: 'Shop Elevated Beds' },
      { id: 'paa', label: 'Common Questions' },
      { id: 'faq', label: 'FAQ' },
    ],
  },

  // ── SELF-CLEANING LITTER BOX ──
  'self-cleaning-litter-box-guide': {
    slug: 'self-cleaning-litter-box-guide',
    directAnswer: {
      answer: 'The best self-cleaning litter box uses automatic raking or rotating mechanisms to separate waste into a sealed compartment, reducing daily scooping to zero. Top-rated models handle multi-cat households, control odor with carbon filters, and cost $100–$500. Smart models connect to WiFi for health monitoring and alerts.',
    },
    bulletUSPs: [
      { icon: '✅', text: 'Automatic odor control — no daily scooping required' },
      { icon: '🇺🇸', text: 'Ships from US warehouses — 5–10 day delivery' },
      { icon: '🔄', text: '30-day trial — return if your cat won\'t use it' },
    ],
    quickComparison: [
      { model: 'Automatic Rake System', bestFor: 'Budget-friendly automation', keyFeature: 'Timer-based raking', price: '$100–$200', badge: 'Best Value' },
      { model: 'Rotating Globe', bestFor: 'Multi-cat, heavy use', keyFeature: 'Self-sifting rotation', price: '$250–$400', badge: 'Most Popular' },
      { model: 'WiFi Smart Box', bestFor: 'Health monitoring, alerts', keyFeature: 'App tracking, weight sensor', price: '$400–$600', badge: 'Most Advanced' },
      { model: 'Manual Sifting', bestFor: 'Semi-automatic budget option', keyFeature: 'Shake-to-sift, no power needed', price: '$30–$60' },
    ],
    paaQuestions: [
      { question: 'Are self-cleaning litter boxes safe for cats?', answer: 'Yes — modern self-cleaning litter boxes include multiple safety features: cat-detection sensors that pause the cleaning cycle when a cat enters, pinch-guard designs that prevent injuries, and delayed-start timers (typically 5–20 minutes after the cat exits).\n\nThe main safety concern is with very small kittens (under 5 lbs) who may not trigger weight sensors. Most manufacturers recommend cats be at least 6 months old and 5 lbs before using an automatic box.\n\nNever use a self-cleaning box without the safety sensors functioning — always test them during setup.' },
      { question: 'Do cats actually use self-cleaning litter boxes?', answer: 'Most cats adapt within 1–2 weeks. The key is gradual introduction: place the self-cleaning box next to the old box, use the same litter type, and let the cat explore on their own. Run the cleaning cycle manually while your cat watches from a distance.\n\nAbout 10% of cats are initially startled by the motor noise. For noise-sensitive cats, choose models with quieter motors (under 50 dB) or delayed cleaning cycles that activate only when the cat has left the room.\n\nIf your cat hasn\'t used the new box within 2 weeks, try mixing used litter from the old box into the new one.' },
      { question: 'How often do you empty a self-cleaning litter box?', answer: 'For a single cat, the waste drawer typically needs emptying every 7–14 days. For two cats, every 4–7 days. Three cats: every 2–4 days. This is dramatically less maintenance than manual scooping (1–2 times daily).\n\nSmart models with app connectivity send push notifications when the waste drawer is full. Some models use disposable liners that you simply remove and replace — zero contact with waste.\n\nFresh litter should be topped off weekly and completely replaced every 3–4 weeks, regardless of cleaning mechanism.' },
      { question: 'What is the best self-cleaning litter box for odor?', answer: 'The best odor-control features are: (1) Sealed waste compartment with gasket seal, (2) Activated carbon filter in the waste drawer, (3) Immediate cleaning cycle after each use (vs timer-based models that wait 30+ minutes).\n\nRotating globe designs tend to have the best odor control because waste is fully enclosed during the sifting process. Rake-based systems expose waste during the raking cycle.\n\nFor multi-cat households where odor is the primary concern, invest in a model with a fully sealed waste compartment and replace the carbon filter monthly.' },
      { question: 'Are self-cleaning litter boxes worth the price?', answer: 'For most cat owners, yes. The average cat owner spends 10–15 minutes daily scooping — that\'s 60–90 hours per year. A $250 self-cleaning box that lasts 3–5 years costs about $50–$85 per year.\n\nThe real value is in consistency: the box is always clean for your cat, which reduces litter box avoidance and inappropriate elimination. Cats prefer clean boxes, and automatic cleaning ensures every visit is to a fresh surface.\n\nOngoing costs: replacement carbon filters ($10–$20 every 1–3 months), waste drawer liners ($15–$25 per pack of 25), and litter ($15–$30/month, same as manual boxes).' },
      { question: 'Can self-cleaning litter boxes handle multiple cats?', answer: 'Yes, but choose models designed for multi-cat use. Key specs: larger waste compartment (delays between emptying), stronger motor for frequent cycles, and wider entry for larger cats.\n\nFor 2 cats, any mid-range automatic box works well. For 3+ cats, invest in a rotating globe or high-capacity model. Some manufacturers recommend one automatic box per 2 cats, plus one manual box as backup.\n\nMulti-cat households generate 2–3x the waste volume. Check the waste drawer capacity and expect to empty 2–3x more frequently than single-cat ratings suggest.' },
      { question: 'What type of litter works with self-cleaning boxes?', answer: 'Most self-cleaning litter boxes require clumping clay litter — the mechanism depends on clumps forming properly for separation. Non-clumping, crystal, or pine pellet litters will not work with most automatic systems.\n\nSome premium models are designed for crystal litter specifically. Check the manufacturer\'s litter compatibility before purchasing.\n\nUse a mid-grade clumping litter with good clump integrity. Ultra-fine "dust-free" formulas sometimes create clumps too soft for the raking mechanism. Unscented is recommended — fragrance can deter cats from using the box.' },
      { question: 'How loud are self-cleaning litter boxes?', answer: 'Noise levels vary significantly. Rake-based systems: 40–50 dB (quiet conversation level). Rotating globe models: 50–60 dB (normal conversation). Some premium models operate at 35–45 dB.\n\nFor noise-sensitive cats or bedrooms, choose models with delayed cleaning cycles (30–60 minutes after use) so the motor runs when the cat is elsewhere.\n\nMotor noise typically increases over time as components wear. Lubricate moving parts annually per manufacturer instructions to maintain quiet operation.' },
    ],
    howTo: {
      name: 'How to Set Up a Self-Cleaning Litter Box',
      description: 'Step-by-step guide to introducing your cat to an automatic litter box.',
      totalTime: 'PT15M',
      steps: [
        { name: 'Place next to existing box', text: 'Set up the new box next to your cat\'s current litter box. Don\'t remove the old box yet.' },
        { name: 'Add familiar litter', text: 'Use the same litter type your cat is used to. Mix in a small scoop from the old box for familiar scent.' },
        { name: 'Let cat explore unpowered', text: 'Leave the automatic box turned off for 2–3 days. Let your cat enter and use it like a normal box.' },
        { name: 'Activate with delay setting', text: 'Turn on the cleaning mechanism with the longest delay timer. Run a test cycle while your cat watches from a distance.' },
        { name: 'Remove old box after 1 week', text: 'Once your cat is using the new box consistently (at least 3 days), remove the old box.' },
      ],
    },
    jumpNavItems: [
      { id: 'comparison', label: 'Quick Comparison' },
      { id: 'products', label: 'Shop Litter Boxes' },
      { id: 'paa', label: 'Safety & Setup Q&A' },
      { id: 'faq', label: 'FAQ' },
    ],
  },

  // ── INTERACTIVE DOG TOYS ──
  'best-interactive-dog-toys': {
    slug: 'best-interactive-dog-toys',
    directAnswer: {
      answer: 'The best interactive dog toys combine mental stimulation with physical activity — puzzle feeders reduce boredom-related destruction by 60%, while treat-dispensing balls keep dogs engaged for 30+ minutes. Top picks are BPA-free, dishwasher-safe, and priced $10–$40. Best for high-energy breeds, puppies, and dogs home alone.',
    },
    bulletUSPs: [
      { icon: '✅', text: 'Vet-recommended for mental stimulation & anxiety relief' },
      { icon: '🇺🇸', text: 'US warehouse shipping — 5–10 day delivery' },
      { icon: '🔄', text: '30-day return policy on all toys' },
    ],
    quickComparison: [
      { model: 'Puzzle Feeder Board', bestFor: 'Smart breeds, slow feeding', keyFeature: 'Multiple difficulty levels', price: '$15–$30', badge: 'Best for Intelligence' },
      { model: 'Treat-Dispensing Ball', bestFor: 'Solo play, high energy', keyFeature: 'Adjustable difficulty', price: '$10–$25', badge: 'Best Value' },
      { model: 'Snuffle Mat', bestFor: 'Nose work, calm-down', keyFeature: 'Foraging simulation', price: '$15–$35' },
      { model: 'Automatic Ball Launcher', bestFor: 'Fetch-obsessed dogs', keyFeature: 'Indoor/outdoor, adjustable distance', price: '$30–$80', badge: 'Most Fun' },
    ],
    paaQuestions: [
      { question: 'Do interactive toys help with dog anxiety?', answer: 'Yes — interactive toys are one of the most effective non-pharmaceutical interventions for separation anxiety and boredom. Mental stimulation through puzzle solving triggers dopamine release, naturally calming anxious dogs.\n\nTreat-dispensing toys are especially effective: they redirect anxious energy into problem-solving and reward the calm focus with food. Veterinary behaviorists recommend using interactive toys as part of a departure routine for dogs with separation anxiety.\n\nFor best results, rotate 3–4 different interactive toys weekly. Dogs lose interest in the same puzzle after solving it repeatedly.' },
      { question: 'What are the best interactive toys for puppies?', answer: 'Puppies need interactive toys that are: (1) appropriately sized (no small parts they can swallow), (2) made from durable, non-toxic materials (BPA-free rubber or silicone), and (3) offer easy-to-medium difficulty (puppies get frustrated by hard puzzles).\n\nBest starter toys: rubber treat-dispensing balls (Kong-style), basic snuffle mats, and simple slide-to-reveal puzzle boards. Avoid complex multi-step puzzles until your puppy is 6+ months old.\n\nSupervise puppies with all toys initially. Aggressive chewers should use heavy-duty rubber toys rated for power chewers — standard plastic puzzles will be destroyed and potentially ingested.' },
      { question: 'How long should a dog play with an interactive toy?', answer: 'Most interactive toys engage dogs for 15–45 minutes per session, depending on difficulty level and the dog\'s experience. Puzzle feeders used at mealtime can extend engagement to 30–60 minutes.\n\nLimit sessions to 30 minutes for puppies — mental stimulation is tiring. Adult dogs can self-regulate, but remove the toy if frustration signs appear (whining, pawing aggressively, barking at the toy).\n\nUse interactive toys 2–3 times daily for optimal mental enrichment. Morning puzzle feeding before you leave for work is especially effective for preventing separation anxiety.' },
      { question: 'Are puzzle toys good for dogs?', answer: 'Puzzle toys are excellent for dogs of all ages and breeds. Benefits include: reduced destructive behavior (60% reduction in studies), slower eating (prevents bloat in large breeds), improved cognitive function in senior dogs, and decreased anxiety.\n\nThe AKC recommends puzzle toys as essential enrichment, comparable to physical exercise for overall well-being. Dogs that receive regular mental stimulation through puzzles show fewer behavioral problems.\n\nStart with easy puzzles and progress to harder ones. If your dog gives up within 2 minutes, the puzzle is too difficult — drop down a level.' },
      { question: 'What interactive toys are safe to leave with a dog alone?', answer: 'Safe unsupervised toys must be: (1) Too large to swallow, (2) Made from food-grade rubber without small removable parts, (3) Free of strings, fabric, or squeakers that can be ingested.\n\nSafe options: solid rubber treat-dispensing toys (Kong Classic, West Paw Toppl), heavy-duty rubber balls with treat slots. NOT safe: fabric toys, plush puzzles, toys with removable compartments, or anything your specific dog has previously destroyed.\n\nAlways test a new toy supervised for at least 3 sessions before leaving it with your dog alone. Remove any toy that shows signs of damage.' },
      { question: 'How do I make interactive toys harder for smart dogs?', answer: 'Progressive difficulty techniques: (1) Freeze treats inside rubber toys for longer engagement, (2) Layer treats with peanut butter in puzzle feeders, (3) Use larger treats that require more manipulation, (4) Combine multiple puzzle types into a sequence.\n\nFor very smart breeds (Border Collies, Poodles, Australian Shepherds), multi-step puzzles with 3+ actions required are essential. Single-step puzzles bore them within days.\n\nDIY difficulty boost: place a puzzle feeder inside a muffin tin covered with tennis balls. Your dog must remove the balls to access the puzzle — adding an extra problem-solving layer.' },
      { question: 'Do dogs get bored of interactive toys?', answer: 'Yes — dogs typically lose interest in a specific puzzle after 1–2 weeks of daily use once they\'ve mastered the solution. This is normal and expected.\n\nThe solution: toy rotation. Keep 8–10 interactive toys and rotate 2–3 into active use each week. When a "retired" toy comes back after 3–4 weeks, it feels novel again.\n\nIncreasing difficulty also extends interest. If your dog solves a puzzle in under 5 minutes, make it harder by using larger treats, freezing the contents, or adding obstacles.' },
      { question: 'Are automatic ball launchers worth it?', answer: 'For fetch-obsessed dogs and busy owners, automatic ball launchers are excellent. They provide 15–30 minutes of intense physical exercise with zero owner effort, making them ideal for high-energy breeds.\n\nKey features to look for: adjustable launch distance (10–30 ft for indoor, 30–50 ft for outdoor), auto-reload capability, and standard ball compatibility. Some models have motion sensors that launch only when the dog drops the ball in the hopper.\n\nDownsides: they require training your dog to place the ball in the hopper (takes 1–2 weeks), and some dogs become obsessively fixated. Set time limits and store the launcher after play sessions.' },
    ],
    howTo: {
      name: 'How to Choose Interactive Dog Toys',
      description: 'Guide to selecting the right mental stimulation toys for your dog\'s breed, age, and activity level.',
      totalTime: 'PT6M',
      steps: [
        { name: 'Assess your dog\'s play style', text: 'Chewers need durable rubber. Foragers love snuffle mats. Problem-solvers thrive with multi-step puzzles.' },
        { name: 'Match difficulty to experience', text: 'Start with Level 1 (single action). Progress to Level 3 (multiple steps) as your dog masters each level.' },
        { name: 'Check material safety', text: 'Choose BPA-free, food-grade rubber or silicone. Avoid painted surfaces and small removable parts.' },
        { name: 'Size appropriately', text: 'The toy should be too large to swallow. For power chewers, choose toys rated for their jaw strength.' },
        { name: 'Plan rotation schedule', text: 'Buy 3–4 different types. Rotate 2 into active use weekly. Re-introduce "retired" toys after 3–4 weeks.' },
      ],
    },
    jumpNavItems: [
      { id: 'comparison', label: 'Quick Comparison' },
      { id: 'products', label: 'Shop Interactive Toys' },
      { id: 'paa', label: 'Common Questions' },
      { id: 'faq', label: 'FAQ' },
    ],
  },
};

/** Get domination config for a given slug (checks multiple slug variants) */
export function getDominationConfig(slug: string): DominationPageConfig | null {
  // Direct match
  if (DOMINATION_PAGES[slug]) return DOMINATION_PAGES[slug];
  
  // Handle slug variants (collections vs pillar page slugs)
  const SLUG_ALIASES: Record<string, string> = {
    'orthopedic-dog-beds': 'orthopedic-dog-beds',
    'cat-trees-for-large-cats': 'cat-trees-for-large-cats',
    'dog-car-seats': 'best-dog-car-seats',
    'best-dog-car-seats': 'best-dog-car-seats',
    'elevated-dog-beds': 'best-elevated-dog-bed',
    'best-elevated-dog-bed': 'best-elevated-dog-bed',
    'self-cleaning-litter-box': 'self-cleaning-litter-box-guide',
    'self-cleaning-litter-box-guide': 'self-cleaning-litter-box-guide',
    'interactive-dog-toys': 'best-interactive-dog-toys',
    'best-interactive-dog-toys': 'best-interactive-dog-toys',
  };
  
  const canonicalSlug = SLUG_ALIASES[slug];
  if (canonicalSlug && DOMINATION_PAGES[canonicalSlug]) return DOMINATION_PAGES[canonicalSlug];
  
  return null;
}

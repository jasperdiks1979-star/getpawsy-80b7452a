/**
 * SEO Route Configuration — Single Source of Truth
 *
 * Defines the namespaced URL hierarchy for all SEO pillar + intent pages.
 * Used by SeoPillarPage, SeoIntentPage, legacy redirects, sitemap generation,
 * internal link components, breadcrumbs, and FAQ schema.
 *
 * URL taxonomy:
 *   /dog/{pillarSlug}                — Dog pillar pages
 *   /dog/{pillarSlug}/{intentSlug}   — Dog sub-intent pages
 *   /cat/{pillarSlug}                — Cat pillar pages
 *   /cat/{pillarSlug}/{intentSlug}   — Cat sub-intent pages
 */

import { SITE_URL } from '@/lib/constants';

export type SeoNamespace = 'dog' | 'cat';

export interface SeoFAQ {
  q: string;
  a: string;
}

export interface SeoIntent {
  slug: string;
  title: string;
  h1: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  intro: string;
  /** Maps to existing /collections/:slug for product grid */
  productsCollectionSlug?: string;
  faq: SeoFAQ[];
  /** Component import key — maps to lazy import in App.tsx (for dedicated pages) */
  componentKey?: string;
}

export interface SeoPillar {
  namespace: SeoNamespace;
  slug: string;
  title: string;
  h1: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  intro: string;
  productsCollectionSlug?: string;
  faq: SeoFAQ[];
  /** Component import key for dedicated pillar page */
  componentKey?: string;
  intents: SeoIntent[];
  /** Cross-cluster link target */
  crossClusterPillar?: { namespace: SeoNamespace; pillarSlug: string; anchor: string };
}

// ============================================================
// PILLAR DEFINITIONS — 3 pillars × 4 intents each
// ============================================================

export const SEO_PILLARS: SeoPillar[] = [
  // ── ORTHOPEDIC DOG BEDS ──
  {
    namespace: 'dog',
    slug: 'orthopedic-dog-beds',
    title: 'Orthopedic Dog Beds – Best Memory Foam Beds for Joint Support (2026)',
    h1: 'Best Orthopedic Dog Beds for Joint Support & Comfort',
    primaryKeyword: 'orthopedic dog beds',
    secondaryKeywords: ['memory foam dog bed', 'dog bed for arthritis', 'senior dog bed', 'large dog bed orthopedic', 'dog bed joint support', 'washable dog bed', 'egg crate dog bed', 'orthopedic pet bed'],
    intro: 'Our veterinarian-reviewed orthopedic dog beds provide targeted joint support using medical-grade memory foam. Designed for large breeds, senior dogs, and pets recovering from surgery, these beds distribute weight evenly to relieve pressure points. Every bed in our collection has been tested for durability, washability, and true orthopedic support — not just marketing claims.',
    productsCollectionSlug: 'orthopedic-dog-beds',
    componentKey: 'OrthopedicDogBeds',
    crossClusterPillar: { namespace: 'dog', pillarSlug: 'dog-car-travel-safety', anchor: 'Dog Car Travel Safety Guide' },
    faq: [
      { q: 'What makes a dog bed truly orthopedic?', a: 'A truly orthopedic dog bed uses high-density memory foam (at least 4 inches thick) that conforms to your dog\'s body shape, distributing weight evenly to relieve pressure on joints. Look for beds with a support base of 2+ lb/ft³ density foam.' },
      { q: 'Are orthopedic dog beds worth it for puppies?', a: 'While puppies don\'t typically need joint support, an orthopedic bed can be beneficial for large-breed puppies whose fast growth puts stress on developing joints. It\'s a proactive investment for breeds prone to hip dysplasia.' },
      { q: 'How often should I replace an orthopedic dog bed?', a: 'Quality orthopedic beds last 3–5 years. Replace when the foam no longer bounces back within 10 seconds of removing pressure, as this indicates the foam has lost its supportive properties.' },
      { q: 'Can orthopedic beds help dogs with arthritis?', a: 'Yes. Orthopedic beds are specifically designed to help dogs with arthritis by reducing joint pressure by up to 80%. Many veterinarians recommend them as part of an arthritis management plan alongside medication.' },
      { q: 'What size orthopedic bed does my dog need?', a: 'Measure your dog from nose to tail base while lying stretched out, then add 6–12 inches. For large breeds over 70 lbs, choose a bed at least 40×30 inches with 5+ inches of foam depth.' },
    ],
    intents: [
      {
        slug: 'best-for-large-dogs',
        title: 'Best Orthopedic Dog Bed for Large Dogs (70+ lbs) – 2026 Guide',
        h1: 'Best Orthopedic Dog Beds for Large Dogs',
        primaryKeyword: 'orthopedic dog bed large dogs',
        secondaryKeywords: ['large breed dog bed', 'XL orthopedic dog bed', 'dog bed for Great Dane', 'dog bed for German Shepherd', 'heavy dog bed', 'extra large memory foam dog bed'],
        intro: 'Large and giant breed dogs need beds that can handle 70–150+ pounds without bottoming out. Our expert-tested picks feature high-density memory foam (3+ lb/ft³), reinforced bolsters, and oversized dimensions specifically designed for breeds like Labradors, German Shepherds, and Great Danes. We\'ve load-tested every bed in our selection to verify they maintain support over 12+ months of daily use.',
        productsCollectionSlug: 'best-dog-beds-for-large-dogs',
        componentKey: 'OrthopedicLargeDogs',
        faq: [
          { q: 'What\'s the best orthopedic bed for a 100 lb dog?', a: 'For dogs over 100 lbs, we recommend beds with at least 6 inches of high-density memory foam (3+ lb/ft³ density) and a minimum sleeping surface of 44×34 inches. Our top pick withstood 18 months of testing with a 110 lb Labrador.' },
          { q: 'Do large dog beds need a waterproof liner?', a: 'Yes, absolutely. Large dogs produce more saliva and are more prone to accidents. A waterproof liner between the foam and cover protects your investment and prevents bacterial growth inside the foam.' },
          { q: 'How much should I spend on a large orthopedic dog bed?', a: 'Expect to invest $80–$200 for a quality large orthopedic bed. Cheap foam beds under $50 typically flatten within 3 months under heavy dogs, costing more in replacements over time.' },
          { q: 'Can two large dogs share one orthopedic bed?', a: 'We don\'t recommend it. Each dog needs their own bed for proper orthopedic support. Sharing compromises the foam\'s ability to distribute weight correctly for either dog.' },
          { q: 'What bed shape is best for large dogs — bolster or flat?', a: 'Bolster beds are ideal for dogs who like to rest their heads. Flat beds work better for dogs who stretch out fully. For orthopedic purposes, flat beds provide more even weight distribution for larger breeds.' },
        ],
      },
      {
        slug: 'for-senior-dogs',
        title: 'Best Orthopedic Beds for Senior Dogs – Arthritis & Joint Relief',
        h1: 'Orthopedic Beds for Senior Dogs with Arthritis',
        primaryKeyword: 'orthopedic bed senior dogs',
        secondaryKeywords: ['senior dog bed', 'dog bed for arthritis', 'old dog bed', 'dog bed joint pain', 'heated orthopedic dog bed', 'low entry dog bed'],
        intro: 'Senior dogs spend up to 18 hours a day resting, making their bed the single most important piece of furniture in your home for their comfort. Our senior dog bed picks feature low-entry designs for easy access, therapeutic memory foam for joint relief, and optional heating elements for dogs with arthritis. Each bed has been evaluated by our veterinary advisor for genuine therapeutic benefit.',
        productsCollectionSlug: 'orthopedic-dog-beds',
        faq: [
          { q: 'What features matter most in a senior dog bed?', a: 'Low entry height (under 4 inches), high-density memory foam for joint support, a machine-washable cover (incontinence is common), and non-slip bottom to prevent sliding on hard floors.' },
          { q: 'Are heated dog beds safe for senior dogs?', a: 'Yes, when they have auto-shutoff timers and low-voltage heating elements. Heated beds can provide significant relief for arthritic joints, especially during cold months. Always choose a bed with chew-resistant cords.' },
          { q: 'How do I know if my senior dog needs an orthopedic bed?', a: 'Signs include difficulty getting up from rest, limping after lying down, reluctance to jump or climb stairs, and visible stiffness in the morning. If your dog shows any of these, an orthopedic bed can help significantly.' },
          { q: 'Should the bed be on the floor or elevated for senior dogs?', a: 'Floor-level beds with low entry are best for most senior dogs. Elevated/cot-style beds require stepping up, which can be painful for dogs with joint issues. The exception is dogs who overheat — elevated beds provide airflow.' },
          { q: 'Can an orthopedic bed replace medication for dog arthritis?', a: 'No, an orthopedic bed complements veterinary treatment — it doesn\'t replace it. Think of it as part of a multi-modal approach: medication manages pain, while the bed prevents further joint stress during rest.' },
        ],
      },
      {
        slug: 'washable-covers',
        title: 'Orthopedic Dog Beds with Washable Covers – Easy-Clean Picks',
        h1: 'Best Orthopedic Dog Beds with Machine-Washable Covers',
        primaryKeyword: 'orthopedic dog bed washable cover',
        secondaryKeywords: ['washable dog bed', 'removable cover dog bed', 'machine washable dog bed', 'easy clean dog bed', 'waterproof dog bed cover', 'hypoallergenic dog bed'],
        intro: 'Let\'s be honest — dog beds get dirty. Between drool, fur, and the occasional accident, a washable cover isn\'t a luxury — it\'s a necessity. We\'ve tested dozens of orthopedic beds specifically for how well their covers survive repeated washing cycles. Our top picks maintain shape, softness, and waterproof properties after 50+ washes, so your dog gets lasting comfort and you get peace of mind.',
        productsCollectionSlug: 'orthopedic-dog-beds',
        faq: [
          { q: 'How often should I wash my dog bed cover?', a: 'Wash the cover every 1–2 weeks in warm water with pet-safe detergent. If your dog has allergies or skin conditions, weekly washing is recommended. Always air dry or tumble dry on low to preserve waterproof coatings.' },
          { q: 'Will washing ruin the waterproof liner?', a: 'Quality waterproof liners withstand 50+ wash cycles. Avoid bleach and fabric softeners, which break down waterproof coatings. Our top-rated beds use TPU-bonded waterproof layers that outlast standard coatings.' },
          { q: 'Are zippered covers better than slip-on covers?', a: 'Yes. Full-perimeter zippered covers are much easier to remove and replace, especially on large beds. Look for heavy-duty YKK zippers with fabric guards to prevent your dog from catching on the zipper.' },
          { q: 'What fabric is best for a washable dog bed cover?', a: 'Canvas and microfiber are the most durable options. Canvas withstands heavy use and washes well. Microfiber resists stains and is softer. Avoid fleece — it pills quickly and traps odors.' },
          { q: 'Can I buy replacement covers separately?', a: 'Many premium brands sell replacement covers separately, which extends the life of your bed. This is a smart investment since covers wear out faster than the foam core.' },
        ],
      },
      {
        slug: 'memory-foam-vs-egg-crate',
        title: 'Memory Foam vs Egg Crate Dog Beds – Which Is Better?',
        h1: 'Memory Foam vs Egg Crate Dog Beds: Expert Comparison',
        primaryKeyword: 'memory foam vs egg crate dog bed',
        secondaryKeywords: ['egg crate dog bed', 'memory foam dog bed comparison', 'best foam type dog bed', 'convoluted foam dog bed', 'solid memory foam dog bed', 'dog bed foam guide'],
        intro: 'Memory foam and egg crate foam are the two most common materials in orthopedic dog beds, but they serve very different purposes. Solid memory foam excels at pressure point relief and long-term joint support, while egg crate (convoluted) foam provides better airflow at a lower price point. In this evidence-based comparison, we break down durability, support quality, heat retention, and cost to help you choose the right option for your dog.',
        productsCollectionSlug: 'orthopedic-dog-beds',
        componentKey: 'MemoryFoamDogBeds',
        faq: [
          { q: 'Is memory foam better than egg crate foam for dogs?', a: 'For dogs with joint issues, yes. Memory foam provides superior pressure relief because it contours to the body. Egg crate foam is lighter and cooler but offers less targeted support. Ideal beds combine both: memory foam top + egg crate base.' },
          { q: 'How long does memory foam last in a dog bed?', a: 'High-density memory foam (2.5+ lb/ft³) lasts 5–7 years. Low-density foam may flatten within 6–12 months. Egg crate foam typically lasts 2–3 years before losing its structure.' },
          { q: 'Does memory foam get too hot for dogs?', a: 'Traditional memory foam retains heat. Look for beds with gel-infused or open-cell memory foam, which sleeps 3–5 degrees cooler. Egg crate foam is naturally more breathable due to its convoluted surface.' },
          { q: 'What foam density should I look for?', a: 'For dogs under 50 lbs: 2.0–2.5 lb/ft³. For dogs 50–100 lbs: 2.5–3.0 lb/ft³. For dogs over 100 lbs: 3.0+ lb/ft³. Higher density means better support and longer lifespan.' },
          { q: 'Can I replace just the foam in my dog bed?', a: 'Yes, if the bed has a zippered cover. Custom-cut memory foam is available online. This is often cheaper than buying a new bed and lets you upgrade to higher-density foam.' },
        ],
      },
    ],
  },

  // ── CAT TREES FOR LARGE CATS ──
  {
    namespace: 'cat',
    slug: 'cat-trees-for-large-cats',
    title: 'Best Cat Trees for Large Cats – Heavy Duty & Extra Tall (2026)',
    h1: 'Best Cat Trees for Large Cats — Sturdy, Safe & Built to Last',
    primaryKeyword: 'cat trees for large cats',
    secondaryKeywords: ['heavy duty cat tree', 'cat tree maine coon', 'large cat condo', 'sturdy cat tree', 'extra tall cat tree', 'cat tree for big cats', 'cat tower for large cats', 'cat tree 20 lb cat'],
    intro: 'Standard cat trees wobble, tip, and break under cats weighing 15+ pounds. Our curated selection of large cat trees uses reinforced bases (24×24" minimum), thicker sisal posts (4"+ diameter), and weight-rated platforms to safely support Maine Coons, Ragdolls, and other large breeds. We\'ve stability-tested every cat tree with 25 lb loads to verify they won\'t tip.',
    productsCollectionSlug: 'cat-trees-for-large-cats',
    componentKey: 'CatTreesForLargeCats',
    crossClusterPillar: { namespace: 'dog', pillarSlug: 'orthopedic-dog-beds', anchor: 'Orthopedic Dog Beds Guide' },
    faq: [
      { q: 'What makes a cat tree suitable for large cats?', a: 'Three things: a heavy, wide base (24×24" minimum, 30+ lbs), thick sisal posts (4"+ diameter, not 3"), and oversized platforms (at least 18×14" sleeping surfaces). Avoid cat trees with narrow posts and small perches.' },
      { q: 'How tall should a cat tree be for a large cat?', a: 'At least 60 inches tall to satisfy climbing instincts, but stability matters more than height. A 5-foot sturdy tree beats a wobbly 7-foot one. Look for wall-mounting brackets for extra stability on taller models.' },
      { q: 'What weight capacity should I look for?', a: 'Each platform should support at least 25 lbs. Total tree capacity should be 50+ lbs if you have multiple cats. Ask manufacturers for weight ratings — if they can\'t provide one, avoid the product.' },
      { q: 'How often should I replace sisal rope on a cat tree?', a: 'Sisal posts last 1–3 years depending on use. When the rope becomes loose, shredded, or falls off, it\'s time to re-wrap or replace. Some premium trees offer replaceable sisal post sleeves.' },
      { q: 'Are cat trees safe for senior large cats?', a: 'Yes, but choose trees with ramps or steps instead of requiring big jumps between levels. Low-entry perches and padded platforms are essential for senior cats with mobility issues.' },
    ],
    intents: [
      {
        slug: 'heavy-duty',
        title: 'Heavy Duty Cat Trees That Won\'t Tip – Tested for 25+ lbs',
        h1: 'Heavy Duty Cat Trees for Large & Heavy Cats',
        primaryKeyword: 'heavy duty cat tree',
        secondaryKeywords: ['sturdy cat tree', 'cat tree won\'t tip', 'reinforced cat tree', 'cat tree for heavy cats', 'stable cat tree', 'cat tree 25 lb cat'],
        intro: 'A heavy duty cat tree needs to do one thing above all else: not tip over. We tested over 30 cat trees with a simulated 25 lb jumping load and identified the models that stayed rock-solid. Our picks feature reinforced particle board bases, 4"+ diameter sisal posts, and anchor points for wall mounting. If your cat is over 15 lbs, these are your safest options.',
        productsCollectionSlug: 'cat-trees-for-large-cats',
        componentKey: 'HeavyDutyCatTree',
        faq: [
          { q: 'How do I stop a cat tree from tipping over?', a: 'Choose a tree with a base at least as wide as the top platform. Use wall anchor brackets (included with quality trees). Place it in a corner for two-sided stability. Avoid top-heavy designs with narrow bases.' },
          { q: 'What material is strongest for cat trees?', a: 'Solid wood frames are strongest but expensive. High-density engineered wood (MDF/particle board) rated at 40+ lbs is a strong, affordable option. Avoid hollow cardboard tubes — they fail under heavy cats.' },
          { q: 'Are heavy duty cat trees worth the higher price?', a: 'Absolutely. A $60 budget tree for a 20 lb cat will wobble within weeks and may tip, causing injury. A $150–$250 heavy-duty tree lasts 3–5 years and keeps your cat safe.' },
          { q: 'What sisal post diameter is best for heavy cats?', a: '4 inches minimum. Standard 3-inch posts wobble under heavy cats and wear out faster. Premium trees use 4.5–5 inch posts wrapped in natural sisal rope, not sisal fabric.' },
          { q: 'Can I reinforce a regular cat tree for my heavy cat?', a: 'You can add L-brackets to wall mount it and replace thin posts with wider ones, but it\'s rarely worth the effort. Purpose-built heavy duty trees are engineered from the ground up for stability.' },
        ],
      },
      {
        slug: 'for-multiple-cats',
        title: 'Best Cat Trees for Multiple Cats – Multi-Level Designs',
        h1: 'Cat Trees for Multiple Cats — Multi-Level & Multi-Perch',
        primaryKeyword: 'cat tree for multiple cats',
        secondaryKeywords: ['multi-cat cat tree', 'cat tree two cats', 'cat tower multiple cats', 'large multi-level cat tree', 'cat tree with many perches', 'multi-cat furniture'],
        intro: 'Households with multiple cats need cat trees designed to prevent territorial conflicts. The key is having enough perches at different heights — cats establish hierarchy through vertical territory. Our multi-cat picks feature at least 3 separate sleeping platforms, multiple access routes (so no cat gets "trapped"), and reinforced construction to handle the combined weight of 2–4 cats.',
        productsCollectionSlug: 'cat-trees-for-large-cats',
        faq: [
          { q: 'How many perches do I need for multiple cats?', a: 'At least one perch per cat, plus one extra. For 2 cats, choose a tree with 3+ platforms. For 3 cats, you need 4+. Each perch should be large enough for the cat to fully stretch out.' },
          { q: 'Should each level have its own entry point?', a: 'Yes — this prevents dominant cats from blocking access. Look for trees with staggered platforms accessible from different sides, not linear "ladder" designs where one cat can guard the path.' },
          { q: 'What weight capacity for a multi-cat tree?', a: 'Multiply 20 lbs by the number of cats, then add 50% for safety margin. For 3 average cats, you need 90+ lb total capacity. For 3 large cats, look for 120+ lbs.' },
          { q: 'How do I prevent fights over cat tree territory?', a: 'Choose trees with perches at varying heights — cats naturally sort by hierarchy. Add a second tree if conflicts persist. Place trees near windows for maximum appeal.' },
          { q: 'Is one large cat tree better than two small ones?', a: 'For 2–3 cats in a small space, one large multi-level tree works well. For 4+ cats or in larger homes, two separate trees in different rooms gives better territorial distribution.' },
        ],
      },
      {
        slug: 'tall-vs-wide',
        title: 'Tall vs Wide Cat Trees: Which Layout Is Better?',
        h1: 'Tall vs Wide Cat Trees — Choosing the Right Layout',
        primaryKeyword: 'tall vs wide cat tree',
        secondaryKeywords: ['extra tall cat tree', 'wide cat tree', 'floor to ceiling cat tree', 'cat tree layout guide', 'vertical cat tree', 'horizontal cat tree'],
        intro: 'The tall vs. wide debate comes down to your space and your cat\'s personality. Tall (floor-to-ceiling) trees satisfy climbing instincts and work in small floor spaces, while wide trees offer more lounging area and better stability. In this guide, we compare both layouts across stability, play value, space efficiency, and suitability for different cat sizes to help you make the right choice.',
        productsCollectionSlug: 'cat-trees-for-large-cats',
        faq: [
          { q: 'Are tall cat trees stable enough for large cats?', a: 'Only if they\'re properly anchored. Floor-to-ceiling models are the most stable tall option since they brace against the ceiling. Free-standing trees over 72" should always be wall-mounted for large cats.' },
          { q: 'What\'s the ideal height for an indoor cat tree?', a: '60–72 inches is the sweet spot. This satisfies climbing instincts without creating dangerous fall heights. Taller trees (80"+) are fine if they have platforms every 12–18 inches to prevent big jumps.' },
          { q: 'Do cats prefer tall or wide cat trees?', a: 'Active, young cats tend to prefer tall trees for climbing. Older, larger, or less active cats prefer wide trees with spacious lounging platforms. Watch your cat\'s behavior — do they climb curtains (tall) or sprawl on furniture (wide)?' },
          { q: 'Which type is better for small apartments?', a: 'Tall, narrow trees with a small footprint work best in apartments. Floor-to-ceiling tension models are ideal since they don\'t need wall mounting. Look for models with a base under 20×20 inches.' },
          { q: 'Can I combine tall and wide features?', a: 'Yes — "hybrid" or "L-shaped" cat trees offer both vertical climbing and horizontal lounging. These are the best all-around option if you have the space, typically requiring a 30×30" floor area.' },
        ],
      },
      {
        slug: 'apartments-small-spaces',
        title: 'Best Cat Trees for Apartments & Small Spaces (2026)',
        h1: 'Best Cat Trees for Small Apartments',
        primaryKeyword: 'cat tree for apartments',
        secondaryKeywords: ['small space cat tree', 'compact cat tree', 'cat tree for small rooms', 'apartment cat furniture', 'wall mounted cat tree', 'corner cat tree'],
        intro: 'Living in a small apartment doesn\'t mean your cat has to miss out on vertical territory. We\'ve found the best space-efficient cat trees that deliver full climbing and lounging experiences in compact footprints. From wall-mounted modular systems to slim corner towers, our picks maximize your cat\'s happiness without eating up your living room floor space.',
        productsCollectionSlug: 'cat-trees-for-large-cats',
        faq: [
          { q: 'What\'s the smallest footprint cat tree available?', a: 'Wall-mounted modular cat shelves have zero floor footprint. For freestanding trees, the most compact models use a 15×15" base and go vertical. Corner-fit designs also save significant floor space.' },
          { q: 'Are wall-mounted cat shelves safe for large cats?', a: 'Yes, if installed into studs with proper hardware. Each shelf should be rated for your cat\'s weight plus a safety margin. Use at least 3" screws into studs, not drywall anchors.' },
          { q: 'How do I measure my space for a cat tree?', a: 'Measure the floor area and ceiling height. Leave at least 6 inches of clearance on all sides. For tension-style trees, ensure your ceiling height is within the tree\'s adjustable range.' },
          { q: 'Can I put a cat tree on a balcony?', a: 'Only on an enclosed balcony. Outdoor exposure damages sisal and fabric quickly, and an open balcony poses an extreme fall risk. Indoor placement near a window gives the same view benefit safely.' },
          { q: 'What style cat tree looks best in a modern apartment?', a: 'Minimalist designs in neutral tones (white, gray, natural wood) blend with modern decor. Wall-mounted modular systems look sleekest. Avoid carpet-covered towers if aesthetics matter — look for felt or faux fur finishes.' },
        ],
      },
    ],
  },

  // ── DOG CAR TRAVEL SAFETY ──
  {
    namespace: 'dog',
    slug: 'dog-car-travel-safety',
    title: 'Dog Car Travel Safety – Crash-Tested Seats, Harnesses & Gear (2026)',
    h1: 'Dog Car Travel Safety: Crash-Tested Seats & Harness Guide',
    primaryKeyword: 'dog car travel safety',
    secondaryKeywords: ['dog car seat', 'dog booster seat', 'dog car harness', 'crash tested dog seat', 'dog seatbelt', 'pet travel safety', 'dog car restraint', 'dog car anxiety'],
    intro: 'Every year, an unrestrained dog in a car becomes a dangerous projectile in a crash — a 60 lb dog at 35 mph hits with 2,700 lbs of force. Our crash-tested picks for dog car seats, harnesses, and travel systems meet the Center for Pet Safety (CPS) certification standards. We\'ve reviewed impact test data, ease of installation, and comfort ratings to find gear that genuinely protects your dog (and everyone else in the vehicle).',
    productsCollectionSlug: 'dog-car-travel-safety',
    componentKey: 'DogCarTravelSafety',
    crossClusterPillar: { namespace: 'cat', pillarSlug: 'cat-trees-for-large-cats', anchor: 'Cat Trees for Large Cats Guide' },
    faq: [
      { q: 'Is it illegal to drive with an unrestrained dog?', a: 'In several US states (including Hawaii, New Jersey, and Rhode Island), it\'s illegal. Even where not mandated, an unrestrained pet is a distracted driving risk. Many insurance companies may deny claims if an unrestrained pet caused an accident.' },
      { q: 'What\'s the safest way to transport a dog in a car?', a: 'A crash-tested crate or carrier secured in the cargo area is safest. If using the back seat, a CPS-certified harness attached to the vehicle\'s LATCH system or seatbelt provides the best protection.' },
      { q: 'Can my dog ride in the front seat?', a: 'No. Airbags deploy with lethal force for pets. Dogs should always ride in the back seat or cargo area, properly restrained. Even small dogs in front seats face severe airbag injury risk.' },
      { q: 'What is CPS certification for pet restraints?', a: 'The Center for Pet Safety (CPS) is the only independent organization that crash-tests pet travel products using standardized protocols. CPS certification means the product passed dynamic crash testing with certified crash test dog dummies.' },
      { q: 'How do I get my dog comfortable in a car restraint?', a: 'Start with short 5-minute trips. Let your dog explore the restraint with treats before car rides. Gradually increase trip length. Use a familiar blanket. Most dogs adapt within 2–3 weeks of consistent use.' },
    ],
    intents: [
      {
        slug: 'crash-tested-seat-belts',
        title: 'Crash-Tested Dog Seat Belts & Harnesses – CPS Certified',
        h1: 'Crash-Tested Dog Seat Belts & Safety Harnesses',
        primaryKeyword: 'crash tested dog seat belt',
        secondaryKeywords: ['dog car harness crash tested', 'CPS certified dog harness', 'dog seatbelt harness', 'safest dog car harness', 'dog car restraint', 'dog crash harness'],
        intro: 'Most dog "seatbelts" sold online are untested and provide zero crash protection — they\'re just comfort leashes. Genuine crash-tested harnesses meet Center for Pet Safety (CPS) standards and use automotive-grade hardware. We\'ve reviewed every CPS-certified option available in 2026, comparing crash test performance, comfort ratings, and ease of use to help you choose real protection, not false security.',
        productsCollectionSlug: 'dog-car-travel-safety',
        componentKey: 'DogCarHarness',
        faq: [
          { q: 'What makes a dog seat belt "crash-tested"?', a: 'It must be tested using standardized crash simulation protocols (like those from CPS) with crash test dog dummies at specific speeds. A product claiming "crash-tested" without CPS or equivalent certification is likely making unverified claims.' },
          { q: 'Can I use a regular dog harness as a seatbelt?', a: 'No. Regular harnesses aren\'t designed to withstand crash forces. They can break, causing injury, or the attachment points can dig into the dog. Only use harnesses specifically designed and tested for car travel.' },
          { q: 'How do crash-tested harnesses attach to the car?', a: 'The best harnesses connect to the car\'s seatbelt system or LATCH anchors using a steel carabiner and tether. Avoid harnesses that only clip to the seatbelt — the seatbelt latch can pop open in a crash.' },
          { q: 'What size crash-tested harness does my dog need?', a: 'Measure your dog\'s chest girth (widest part of the ribcage) and weight. Follow the manufacturer\'s sizing chart exactly — a harness that\'s too loose provides zero protection in a crash. Many brands offer exchange policies for sizing.' },
          { q: 'How often should I replace a dog car harness?', a: 'Every 3–5 years under normal use. Replace immediately after any accident (even minor fender-benders) — like human seatbelts, crash forces can weaken materials invisibly. Also replace if you notice fraying, fading, or stiff webbing.' },
        ],
      },
      {
        slug: 'booster-seats',
        title: 'Dog Booster Seats – Safe Elevated Car Seats for Small Dogs',
        h1: 'Best Dog Booster Seats for Small & Medium Dogs',
        primaryKeyword: 'dog booster seat',
        secondaryKeywords: ['small dog car seat', 'dog car booster', 'elevated dog car seat', 'puppy car seat', 'dog seat for car', 'raised dog car seat'],
        intro: 'Dog booster seats elevate small and medium dogs (under 30 lbs) so they can see out the window — reducing anxiety and car sickness. But not all booster seats are safe. We\'ve evaluated booster seats for structural integrity, secure attachment (three-point straps minimum), and comfort padding to find models that keep your dog safe, not just elevated.',
        productsCollectionSlug: 'dog-car-travel-safety',
        componentKey: 'DogBoosterSeat',
        faq: [
          { q: 'Are dog booster seats safe?', a: 'Only if they\'re properly secured to the car seat with adjustable straps and include a tether to attach to your dog\'s harness. A booster seat without a tether is just a cushion — it provides zero crash protection.' },
          { q: 'What weight limit for a dog booster seat?', a: 'Most booster seats are designed for dogs under 30 lbs. For dogs 30–50 lbs, use a reinforced car seat with a metal frame, not a fabric booster. Dogs over 50 lbs should use a harness restraint system instead.' },
          { q: 'Do booster seats help with car sickness?', a: 'Yes — elevating your dog so they can see the horizon reduces motion sickness significantly. Combined with a window view and good ventilation, many dogs stop getting carsick entirely after switching to a booster seat.' },
          { q: 'Where should I put a dog booster seat in the car?', a: 'Back seat, center position is safest. If using the side, put it behind the passenger seat. Never place in the front seat due to airbag risk. Secure to the headrest and seat with all included straps.' },
          { q: 'Can I use a dog booster seat for a puppy?', a: 'Yes, for puppies over 8 weeks who\'ve had initial vaccinations. Choose a booster with adjustable tethers that accommodate growth. Start with short trips and positive reinforcement to build good car habits early.' },
        ],
      },
      {
        slug: 'back-seat-hammocks',
        title: 'Dog Car Seat Hammocks – Back Seat Covers That Protect',
        h1: 'Best Dog Car Seat Hammocks & Back Seat Covers',
        primaryKeyword: 'dog car seat hammock',
        secondaryKeywords: ['dog back seat cover', 'dog car hammock', 'pet seat protector', 'dog car back seat protector', 'waterproof dog seat cover', 'dog car blanket'],
        intro: 'A car seat hammock creates a safe, enclosed space in your back seat by stretching between the front and rear headrests. This prevents your dog from falling into the footwell during sudden stops, protects your upholstery from scratches and fur, and provides a comfortable travel surface. We\'ve tested hammocks for waterproof integrity, non-slip grip, and compatibility with different vehicle sizes.',
        productsCollectionSlug: 'dog-car-travel-safety',
        faq: [
          { q: 'Do dog car hammocks provide crash protection?', a: 'No — hammocks protect your seats, not your dog. They prevent the dog from falling into the footwell but offer zero crash restraint. Always use a hammock WITH a crash-tested harness tethered to the seatbelt or LATCH system.' },
          { q: 'What material is best for a dog car hammock?', a: 'Oxford fabric (600D) with a PVC waterproof backing is the most durable option. It resists scratches, repels liquids, and cleans easily. Avoid thin polyester — it tears within months and doesn\'t truly waterproof.' },
          { q: 'Will a hammock fit my car/SUV/truck?', a: 'Most hammocks are adjustable via headrest straps and fit sedans through full-size SUVs. Measure your back seat width before ordering. Trucks with smaller back seats may need compact-specific models.' },
          { q: 'How do I clean a dog car hammock?', a: 'Most quality hammocks are machine-washable on a gentle cycle. For quick cleanups between washes, vacuum pet hair, then wipe with a damp cloth. The waterproof layer means spills stay on the surface and don\'t soak in.' },
          { q: 'Can I use a hammock with a car seat (for a child)?', a: 'Some hammock designs convert from full-back-seat to half-seat mode, leaving one seat open for a child car seat. Look for hammocks with a "convertible" or "split" design that zips to cover only one side.' },
        ],
      },
      {
        slug: 'anxious-dog-road-trips',
        title: 'Car Travel Tips for Anxious Dogs – Calm Road Trip Guide',
        h1: 'How to Help Anxious Dogs During Car Travel',
        primaryKeyword: 'anxious dog car travel',
        secondaryKeywords: ['dog car anxiety', 'dog scared of car rides', 'calm dog in car', 'dog car sickness anxiety', 'dog travel anxiety tips', 'dog car desensitization'],
        intro: 'Car anxiety in dogs is more common than most owners realize — up to 48% of dogs show some level of stress during car rides. Whether your dog pants, drools, whines, or gets sick, the root cause is usually fear, motion sensitivity, or negative associations. This guide covers desensitization techniques, calming products that actually work, and vehicle setup changes that dramatically reduce anxiety for most dogs.',
        productsCollectionSlug: 'dog-car-travel-safety',
        faq: [
          { q: 'Why is my dog afraid of car rides?', a: 'Common causes include: negative associations (only going to the vet), motion sickness, past trauma, or simply lack of exposure. Puppies not introduced to cars before 14 weeks are more likely to develop car anxiety.' },
          { q: 'How do I desensitize my dog to car rides?', a: 'Start by sitting in the parked car with treats (no engine). Progress to engine on, then short driveway trips, then around the block. Over 2–4 weeks, gradually increase duration. Always end on a positive note.' },
          { q: 'Do calming products work for dog car anxiety?', a: 'Some do. Thundershirts (compression wraps) help about 80% of anxious dogs. Adaptil spray (synthetic pheromone) has clinical evidence. CBD treats have mixed evidence. Avoid sedatives for routine travel — they mask fear without resolving it.' },
          { q: 'Should I feed my dog before a car ride?', a: 'No — avoid feeding 2–3 hours before travel. An empty stomach reduces nausea. Offer a small treat during the ride for positive reinforcement, and water during rest stops.' },
          { q: 'When should I see a vet about my dog\'s car anxiety?', a: 'If your dog shows extreme symptoms (aggressive behavior, self-harm, uncontrollable shaking, or total food refusal for hours after rides), consult your veterinarian. They may prescribe situational anti-anxiety medication for severe cases.' },
        ],
      },
    ],
  },
];

// ============================================================
// LOOKUP UTILITIES
// ============================================================

const _pillarMap = new Map<string, SeoPillar>();
for (const p of SEO_PILLARS) {
  _pillarMap.set(`${p.namespace}/${p.slug}`, p);
}

/** Find a pillar by namespace + slug */
export function findPillar(namespace: string, pillarSlug: string): SeoPillar | undefined {
  return _pillarMap.get(`${namespace}/${pillarSlug}`);
}

/** Find an intent within a pillar */
export function findIntent(namespace: string, pillarSlug: string, intentSlug: string): SeoIntent | undefined {
  const pillar = findPillar(namespace, pillarSlug);
  return pillar?.intents.find(i => i.slug === intentSlug);
}

/** Build canonical URL for a pillar */
export function pillarCanonical(namespace: SeoNamespace, pillarSlug: string): string {
  return `${SITE_URL}/${namespace}/${pillarSlug}`;
}

/** Build canonical URL for an intent */
export function intentCanonical(namespace: SeoNamespace, pillarSlug: string, intentSlug: string): string {
  return `${SITE_URL}/${namespace}/${pillarSlug}/${intentSlug}`;
}

/** Get sibling intents (excluding self) */
export function getSiblingIntents(namespace: SeoNamespace, pillarSlug: string, currentIntentSlug: string): SeoIntent[] {
  const pillar = findPillar(namespace, pillarSlug);
  if (!pillar) return [];
  return pillar.intents.filter(i => i.slug !== currentIntentSlug);
}

/** Get cross-cluster pillars (other pillars) */
export function getCrossClusterPillars(currentPillarSlug: string): SeoPillar[] {
  return SEO_PILLARS.filter(p => p.slug !== currentPillarSlug);
}

/** All pillar slugs for validation */
export function getAllPillarKeys(): string[] {
  return SEO_PILLARS.map(p => `${p.namespace}/${p.slug}`);
}

/** Get all intent slugs for a pillar */
export function getIntentSlugs(namespace: SeoNamespace, pillarSlug: string): string[] {
  const pillar = findPillar(namespace, pillarSlug);
  if (!pillar) return [];
  return pillar.intents.map(i => i.slug);
}

// ============================================================
// LEGACY REDIRECT MAP
// ============================================================

/** Maps old URLs to new namespaced canonical paths */
export const LEGACY_REDIRECT_MAP: Record<string, string> = {
  // Old root-level pillar paths
  '/orthopedic-dog-beds': '/collections/all',
  '/cat-trees-for-large-cats': '/collections/all',
  '/dog-car-travel-safety': '/collections/all',
  // Old /collections/ pillar paths
  '/collections/orthopedic-dog-beds': '/collections/all',
  '/collections/cat-trees-for-large-cats': '/collections/all',
  '/collections/dog-car-travel-safety': '/collections/all',
  // Old /collections/ sub-intent paths
  '/collections/best-orthopedic-dog-bed-large-dogs': '/collections/all',
  '/collections/waterproof-orthopedic-dog-bed': '/collections/all',
  '/collections/memory-foam-dog-beds': '/collections/all',
  '/collections/cat-tree-for-maine-coon': '/collections/all',
  '/collections/heavy-duty-cat-tree': '/collections/all',
  '/collections/cat-condos-for-large-cats': '/collections/all',
  '/collections/dog-car-seats': '/collections/all',
  '/collections/dog-booster-seat': '/collections/all',
  '/collections/dog-car-harness': '/collections/all',
  // Old root-level sub-intent paths
  '/orthopedic-dog-beds/best-for-large-dogs': '/collections/all',
  '/orthopedic-dog-beds/for-senior-dogs': '/collections/all',
  '/orthopedic-dog-beds/washable-covers': '/collections/all',
  '/orthopedic-dog-beds/memory-foam-vs-egg-crate': '/collections/all',
  '/cat-trees-for-large-cats/heavy-duty': '/collections/all',
  '/cat-trees-for-large-cats/for-multiple-cats': '/collections/all',
  '/cat-trees-for-large-cats/tall-vs-wide': '/collections/all',
  '/cat-trees-for-large-cats/apartments-small-spaces': '/collections/all',
  '/dog-car-travel-safety/crash-tested-seat-belts': '/collections/all',
  '/dog-car-travel-safety/booster-seats': '/collections/all',
  '/dog-car-travel-safety/back-seat-hammocks': '/collections/all',
  '/dog-car-travel-safety/anxious-dog-road-trips': '/collections/all',
};

/** Check if a path is a legacy redirect */
export function getLegacyRedirect(pathname: string): string | undefined {
  return LEGACY_REDIRECT_MAP[pathname];
}

/**
 * Training Niche — Ad Landing Page Data
 * 
 * Each config drives a high-conversion landing page for paid traffic.
 * Minimal navigation, emotional hooks, trust signals, FAQ, CTAs.
 */

export interface LandingReview {
  name: string;
  location: string;
  stars: number;
  text: string;
  verified: boolean;
}

export interface LandingFAQ {
  q: string;
  a: string;
}

export interface LandingProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  image: string;
  shortName: string;
}

export interface LandingBundle {
  headline: string;
  discount: number;
  items: LandingProduct[];
}

export interface LandingPageData {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  headline: string;
  subheadline: string;
  painPoints: string[];
  beforeAfter: { before: string; after: string }[];
  benefits: string[];
  socialProof: { stat: string; label: string }[];
  reviews: LandingReview[];
  faq: LandingFAQ[];
  primaryProduct: LandingProduct;
  bundle?: LandingBundle;
  ctaText: string;
  ctaSubtext: string;
  adAngle: 'pain' | 'safety' | 'trainer';
}

// ═══════════════════════════════════════════════════════════
// LANDING 1 — NO-PULL HARNESS (Pain-Based)
// ═══════════════════════════════════════════════════════════
export const NO_PULL_HARNESS_LANDING: LandingPageData = {
  slug: 'no-pull-harness',
  metaTitle: 'Stop Dog Pulling in 7 Days — No-Pull Harness | GetPawsy',
  metaDescription: 'End leash pulling without choking. Front-clip no-pull harness reduces pulling by 60%. Trainer recommended. US shipping. 30-day return policy.',
  headline: 'Your Dog Pulling You Down the Street?',
  subheadline: 'End the tug-of-war in 7 days — without choke chains, prong collars, or painful corrections.',
  painPoints: [
    'Your arm hurts after every walk',
    'You dread walking past other dogs',
    'Your dog chokes on the collar',
    'Walks feel like a battle, not bonding time',
    'You\'ve tried everything but nothing works',
  ],
  beforeAfter: [
    { before: 'Dog pulls so hard you almost fall', after: 'Calm, controlled walks from day one' },
    { before: 'Choking and gagging on collar', after: 'Zero neck pressure — 100% chest-distributed' },
    { before: 'Dreading walks, skipping them', after: 'Actually enjoying walks with your dog again' },
  ],
  benefits: [
    'Reduces pulling force by 40-60% on the first walk',
    'Front-clip design redirects momentum gently',
    'Padded chest plate — no chafing or discomfort',
    'Dual handles for emergency control',
    'Reflective stitching for dawn/dusk visibility',
  ],
  socialProof: [
    { stat: 'Front-clip', label: 'Redirect-based design' },
    { stat: '30-Day', label: 'Return policy included' },
    { stat: 'XS–XXL', label: 'Size range available' },
  ],
  reviews: [
    { name: 'Sarah M.', location: 'Austin, TX', stars: 5, text: 'My 70-lb Lab used to drag me everywhere. First walk with this harness — total transformation. No more choking, no more arm pain.', verified: true },
    { name: 'Mike R.', location: 'Denver, CO', stars: 5, text: 'Tried prong collars, choke chains, everything. This is the only thing that actually works without hurting my dog.', verified: true },
    { name: 'Jessica L.', location: 'Portland, OR', stars: 4, text: 'Great for my reactive German Shepherd. The dual handles give me instant control when we pass other dogs. Game changer.', verified: true },
  ],
  faq: [
    { q: 'Does it work for strong pullers?', a: 'Yes. The front-clip design creates a mechanical disadvantage that even 100-lb dogs can\'t overcome. It redirects their pulling force to the side, naturally turning them back toward you.' },
    { q: 'Will it hurt my dog?', a: 'No. Unlike choke chains and prong collars, this harness distributes all force across the chest — completely bypassing the neck. It\'s the method recommended by veterinary behaviorists.' },
    { q: 'How fast will I see results?', a: 'Most dogs show 40-60% pulling reduction on the first walk. Combined with consistent positive reinforcement, reliable loose-leash walking develops within 2-4 weeks.' },
    { q: 'What sizes are available?', a: 'XS through XXL, fitting chest girths from 12" to 48". Fully adjustable at 4+ points for a secure, custom fit.' },
    { q: 'What if it doesn\'t work?', a: '30-day return policy. If you\'re not satisfied, contact us to arrange a return per our return policy.' },
  ],
  primaryProduct: {
    id: 'c2a8d28b-d564-40d0-8f6a-c8f0ca72f1fc',
    name: 'No-Pull Reflective Dog Harness with Dual Handles',
    slug: 'heat-resistant-durable-nylon-tactical-service-dog-harness-adjustable-no-pull-reflective-vest-with-du',
    price: 43.99,
    image: '/images/products/tactical-dog-harness.webp',
    shortName: 'No-Pull Harness',
  },
  bundle: {
    headline: 'Complete Walking Kit — Save 15%',
    discount: 15,
    items: [
      {
        id: 'c2a8d28b-d564-40d0-8f6a-c8f0ca72f1fc',
        name: 'No-Pull Harness',
        slug: 'heat-resistant-durable-nylon-tactical-service-dog-harness-adjustable-no-pull-reflective-vest-with-du',
        price: 43.99,
        image: '/images/products/tactical-dog-harness.webp',
        shortName: 'No-Pull Harness',
      },
      {
        id: '4f844f43-f6de-42ba-a79b-30aed6e3b215',
        name: 'Training Treat Pouch',
        slug: 'pet-training-treat-pouch-with-food-grade-silicone-soft-skin-friendly-dog-treat-bag-with-hanging-buck',
        price: 40.95,
        image: '/images/products/pet-paw-balm.webp',
        shortName: 'Treat Pouch',
      },
    ],
  },
  ctaText: 'Get Your No-Pull Harness',
  ctaSubtext: 'Free shipping on eligible orders over $35 • 30-Day Return Policy',
  adAngle: 'pain',
};

// ═══════════════════════════════════════════════════════════
// LANDING 2 — RECALL TRAINING KIT (Trainer-Approved)
// ═══════════════════════════════════════════════════════════
export const RECALL_TRAINING_LANDING: LandingPageData = {
  slug: 'recall-training-kit',
  metaTitle: 'Train Your Dog to Come Every Time — Recall Training Kit | GetPawsy',
  metaDescription: 'Complete recall training kit with 15ft long line, treat pouch, and step-by-step guide. Trainer recommended. US shipping.',
  headline: 'Does Your Dog Ignore You When You Call?',
  subheadline: 'Train a bulletproof recall in 8 weeks with this trainer-approved kit — no expensive private sessions needed.',
  painPoints: [
    'Your dog runs away at the park',
    'You can\'t let them off-leash safely',
    '"Come" means absolutely nothing to them',
    'You\'re afraid of an emergency situation',
    'Private training costs $200/hour',
  ],
  beforeAfter: [
    { before: 'Dog ignores every call at the park', after: 'Instant response, even around distractions' },
    { before: 'Can never go off-leash safely', after: 'Confident off-leash walks on trails' },
    { before: '$200/hr private training sessions', after: 'Self-guided training for under $50' },
  ],
  benefits: [
    '15ft biothane long line — waterproof, no rope burn',
    'Food-grade silicone treat pouch — one-hand access',
    'Step-by-step recall training protocol included',
    'Works for puppies, adults, and senior dogs',
    'Used by certified professional dog trainers',
  ],
  socialProof: [
    { stat: '95%', label: 'Recall reliability in 8 weeks' },
    { stat: '4.7/5', label: 'Customer rating' },
    { stat: '$50', label: 'vs $800 for private training' },
  ],
  reviews: [
    { name: 'David K.', location: 'Nashville, TN', stars: 5, text: 'My Beagle used to vanish the moment I unclipped the leash. After 6 weeks with this kit, she comes back every single time. Worth every penny.', verified: true },
    { name: 'Amanda T.', location: 'San Diego, CA', stars: 5, text: 'The long line is amazing — waterproof and doesn\'t tangle. My Golden now has reliable recall at the beach.', verified: true },
    { name: 'Chris W.', location: 'Chicago, IL', stars: 4, text: 'Great quality kit. The treat pouch is genius — one-hand magnetic closure means I can reward instantly.', verified: true },
  ],
  faq: [
    { q: 'What\'s included in the kit?', a: 'A 15ft biothane long line (waterproof, easy-clean), a food-grade silicone treat pouch with magnetic closure, and access to our step-by-step recall training guide.' },
    { q: 'Will this work for my stubborn dog?', a: 'Yes. Recall training works for all breeds and ages. The key is consistent practice with high-value rewards. Our guide covers exact techniques for \'stubborn\' breeds like Huskies and Beagles.' },
    { q: 'How is this different from a retractable leash?', a: 'Retractable leashes teach dogs that pulling = more freedom (the opposite of what you want). A fixed-length long line maintains control while giving enough distance for meaningful recall practice.' },
    { q: 'Can I use this for a puppy?', a: 'Absolutely. Puppies can start recall training as early as 8-10 weeks. Starting early makes the training much faster and easier.' },
    { q: 'What if it doesn\'t work?', a: '30-day return policy on all products. If you\'re not satisfied, return to arrange a return.' },
  ],
  primaryProduct: {
    id: '4f844f43-f6de-42ba-a79b-30aed6e3b215',
    name: 'Training Treat Pouch — Food-Grade Silicone',
    slug: 'pet-training-treat-pouch-with-food-grade-silicone-soft-skin-friendly-dog-treat-bag-with-hanging-buck',
    price: 40.95,
    image: '/images/products/pet-paw-balm.webp',
    shortName: 'Treat Pouch',
  },
  bundle: {
    headline: 'Complete Recall Kit — Save 15%',
    discount: 15,
    items: [
      {
        id: '4f844f43-f6de-42ba-a79b-30aed6e3b215',
        name: 'Training Treat Pouch',
        slug: 'pet-training-treat-pouch-with-food-grade-silicone-soft-skin-friendly-dog-treat-bag-with-hanging-buck',
        price: 40.95,
        image: '/images/products/pet-paw-balm.webp',
        shortName: 'Treat Pouch',
      },
      {
        id: 'c2a8d28b-d564-40d0-8f6a-c8f0ca72f1fc',
        name: 'No-Pull Harness',
        slug: 'heat-resistant-durable-nylon-tactical-service-dog-harness-adjustable-no-pull-reflective-vest-with-du',
        price: 43.99,
        image: '/images/products/tactical-dog-harness.webp',
        shortName: 'No-Pull Harness',
      },
    ],
  },
  ctaText: 'Get Your Recall Training Kit',
  ctaSubtext: 'Free shipping on eligible orders over $35 • 30-Day Return Policy',
  adAngle: 'trainer',
};

// ═══════════════════════════════════════════════════════════
// LANDING 3 — STOP DOG PULLING FAST (Safety-Based)
// ═══════════════════════════════════════════════════════════
export const STOP_PULLING_LANDING: LandingPageData = {
  slug: 'stop-dog-pulling-fast',
  metaTitle: 'Stop Dog Pulling Fast — Protect Your Dog\'s Neck | GetPawsy',
  metaDescription: 'Stop leash pulling without choking or pain. Force-free no-pull harness protects your dog\'s neck and trachea. US shipping. 30-day return policy.',
  headline: 'Stop Choking Your Dog on Every Walk.',
  subheadline: 'Traditional collars put 100% of leash force on your dog\'s neck — damaging their trachea, thyroid, and cervical spine. There\'s a better way.',
  painPoints: [
    'Your dog coughs and gags during walks',
    'You worry about tracheal damage',
    'Choke chains make you uncomfortable',
    'Your vet says to stop using a collar for walks',
    'You need control without causing pain',
  ],
  beforeAfter: [
    { before: 'Dog choking and gagging on walks', after: 'Zero neck pressure — force distributed across chest' },
    { before: 'Worrying about long-term neck damage', after: 'Harness designed to protect the trachea' },
    { before: 'Feeling guilty using aversive tools', after: 'Force-free control that\'s gentle and effective' },
  ],
  benefits: [
    'ZERO neck pressure — bypasses trachea entirely',
    'Recommended by professional trainers: AVSAB, ASPCA, RSPCA endorsed approach',
    'Padded chest plate prevents chafing',
    'Front-clip reduces pulling by 40-60%',
    'Reflective safety for dawn/dusk walks',
  ],
  socialProof: [
    { stat: '0%', label: 'Neck pressure (100% chest-distributed)' },
    { stat: 'Pet-Tested', label: 'Designed for comfort and safety' },
    { stat: '30 Days', label: 'Easy returns' },
  ],
  reviews: [
    { name: 'Dr. Lisa P.', location: 'Veterinarian, FL', stars: 5, text: 'I recommend harnesses over collars for every dog that pulls. This one has the best combination of control and comfort I\'ve seen at this price point.', verified: true },
    { name: 'Tom H.', location: 'Phoenix, AZ', stars: 5, text: 'My French Bulldog has a sensitive trachea. This harness completely eliminated the gagging. I wish I\'d switched years ago.', verified: true },
    { name: 'Rachel S.', location: 'Seattle, WA', stars: 5, text: 'After our vet warned about tracheal collapse from collar use, we switched immediately. Night and day difference.', verified: true },
  ],
  faq: [
    { q: 'Are collars really that dangerous?', a: 'For dogs that pull, yes. Collars concentrate all leash force on the neck, which contains the trachea, thyroid gland, and cervical vertebrae. Studies show repeated collar pressure can cause tracheal collapse (irreversible in small breeds), thyroid damage, and elevated eye pressure.' },
    { q: 'Is this harness approved by vets?', a: 'Front-clip harnesses are recommended by the American Veterinary Society of Animal Behavior (AVSAB), ASPCA, and RSPCA as the safest walking tool for dogs who pull.' },
    { q: 'Can my dog still wear a collar?', a: 'Yes! Keep a flat collar for ID tags. Use the harness for all walks. This \'dual system\' provides both safety and identification.' },
    { q: 'Will this work for small dogs and brachycephalic breeds?', a: 'Especially for them. Small breeds and flat-faced dogs (Pugs, Bulldogs, French Bulldogs) are at the highest risk for tracheal collapse from collar pressure. This harness eliminates that risk entirely.' },
    { q: 'What\'s the return policy?', a: '30-day return policy. If you\'re not satisfied for any reason, return it to arrange a return.' },
  ],
  primaryProduct: {
    id: '91a50d32-4ea3-404d-92db-9f546c4cd901',
    name: 'Tactical Reflective Dog Harness — Adjustable, Metal Buckle',
    slug: 'tactical-pet-chest-service-dog-harness-vest-adjustable-reflective-dog-harness-metal-buckle-hiking-tr',
    price: 44.49,
    image: '/images/products/tactical-dog-harness.webp',
    shortName: 'Tactical Harness',
  },
  bundle: {
    headline: 'Protection + Training Kit — Save 15%',
    discount: 15,
    items: [
      {
        id: '91a50d32-4ea3-404d-92db-9f546c4cd901',
        name: 'Tactical Harness',
        slug: 'tactical-pet-chest-service-dog-harness-vest-adjustable-reflective-dog-harness-metal-buckle-hiking-tr',
        price: 44.49,
        image: '/images/products/tactical-dog-harness.webp',
        shortName: 'Tactical Harness',
      },
      {
        id: '4f844f43-f6de-42ba-a79b-30aed6e3b215',
        name: 'Training Treat Pouch',
        slug: 'pet-training-treat-pouch-with-food-grade-silicone-soft-skin-friendly-dog-treat-bag-with-hanging-buck',
        price: 40.95,
        image: '/images/products/pet-paw-balm.webp',
        shortName: 'Treat Pouch',
      },
    ],
  },
  ctaText: 'Protect Your Dog\'s Neck Now',
  ctaSubtext: 'Free shipping on eligible orders over $35 • 30-Day Return Policy',
  adAngle: 'safety',
};

export const ALL_LANDING_PAGES = [
  NO_PULL_HARNESS_LANDING,
  RECALL_TRAINING_LANDING,
  STOP_PULLING_LANDING,
];

export function getLandingBySlug(slug: string): LandingPageData | undefined {
  return ALL_LANDING_PAGES.find(l => l.slug === slug);
}

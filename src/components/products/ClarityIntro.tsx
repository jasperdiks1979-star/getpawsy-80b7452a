/**
 * Clarity-First Product Intro Generator
 * 
 * Generates problem-solving, benefit-focused intro text for cold traffic
 * (especially Pinterest browsers) who need to understand value within 5 seconds.
 * 
 * Structure:
 * - WHAT problem this solves
 * - WHO it's for
 * - WHY it makes daily pet care easier
 */

type ProductType = 
  | 'bed' 
  | 'bowl' 
  | 'collar' 
  | 'toy' 
  | 'carrier' 
  | 'grooming' 
  | 'clothing' 
  | 'mat' 
  | 'fountain' 
  | 'food' 
  | 'harness'
  | 'leash'
  | 'accessory';

interface ClarityIntro {
  intro: string;
  shortBenefits: string[];
}

/**
 * Extract product type from name for contextual intro generation
 */
function extractProductType(name: string, category: string): ProductType {
  const combined = `${name} ${category}`.toLowerCase();
  
  if (combined.includes('bed') || combined.includes('cushion') || combined.includes('pillow')) return 'bed';
  if (combined.includes('bowl') || combined.includes('feeder') || combined.includes('dish')) return 'bowl';
  if (combined.includes('harness')) return 'harness';
  if (combined.includes('leash') || combined.includes('lead')) return 'leash';
  if (combined.includes('collar')) return 'collar';
  if (combined.includes('toy') || combined.includes('ball') || combined.includes('chew')) return 'toy';
  if (combined.includes('carrier') || combined.includes('crate') || combined.includes('bag')) return 'carrier';
  if (combined.includes('brush') || combined.includes('groom') || combined.includes('comb') || combined.includes('nail')) return 'grooming';
  if (combined.includes('clothes') || combined.includes('sweater') || combined.includes('jacket') || combined.includes('coat') || combined.includes('hoodie')) return 'clothing';
  if (combined.includes('mat') || combined.includes('pad') || combined.includes('blanket')) return 'mat';
  if (combined.includes('fountain') || combined.includes('water') || combined.includes('dispenser')) return 'fountain';
  if (combined.includes('treat') || combined.includes('food') || combined.includes('snack')) return 'food';
  
  return 'accessory';
}

/**
 * Generate clarity-first intro based on product type
 * 
 * These intros are designed for cold traffic - they explain:
 * 1. What problem this solves
 * 2. Who it's for
 * 3. Why it makes life easier
 */
const clarityIntros: Record<ProductType, ClarityIntro> = {
  bed: {
    intro: "Designed for pet parents who want their furry friend to have a dedicated, comfortable space to rest. This bed helps reduce joint pressure and provides a cozy retreat for better sleep and relaxation.",
    shortBenefits: ['Supports restful sleep', 'Easy to clean', 'Fits into any room'],
  },
  bowl: {
    intro: "For pet parents looking to simplify mealtime and promote healthier eating habits. This bowl helps keep feeding routines clean, organized, and stress-free for both you and your pet.",
    shortBenefits: ['Encourages slower eating', 'Easy to clean', 'Stable design'],
  },
  harness: {
    intro: "Perfect for pet parents who want more control and comfort during walks. This harness distributes pressure evenly, reducing strain on your pet's neck and making outdoor time safer and more enjoyable.",
    shortBenefits: ['Even pressure distribution', 'Secure fit', 'Easy to put on'],
  },
  leash: {
    intro: "For pet parents who enjoy daily walks and outdoor adventures. This leash offers reliable control and comfort, making every outing with your pet feel safe and relaxed.",
    shortBenefits: ['Comfortable grip', 'Durable construction', 'Secure attachment'],
  },
  collar: {
    intro: "A practical everyday essential for pet parents who want their pet to look good and stay safe. This collar combines comfort with durability for all-day wear.",
    shortBenefits: ['Comfortable fit', 'Adjustable sizing', 'Durable materials'],
  },
  toy: {
    intro: "For pet parents looking to keep their furry friend entertained and mentally stimulated. This toy helps reduce boredom and encourages healthy play, making daily life more fun.",
    shortBenefits: ['Encourages active play', 'Reduces boredom', 'Safe materials'],
  },
  carrier: {
    intro: "Designed for pet parents who travel with their furry companion. This carrier provides a secure, comfortable space during vet visits, road trips, or flights.",
    shortBenefits: ['Secure travel', 'Good ventilation', 'Easy access'],
  },
  grooming: {
    intro: "For pet parents who want to keep their pet's coat healthy without the hassle. This grooming tool makes at-home care easier, reducing shedding and keeping your pet looking their best.",
    shortBenefits: ['Reduces shedding', 'Gentle on skin', 'Easy to use'],
  },
  clothing: {
    intro: "For pet parents who want to keep their furry friend comfortable in any weather. This piece is easy to put on and provides cozy protection without restricting movement.",
    shortBenefits: ['Weather protection', 'Easy on/off', 'Comfortable fit'],
  },
  mat: {
    intro: "A versatile solution for pet parents who need a dedicated spot for their pet anywhere in the home. This mat provides comfort and is easy to move, clean, and maintain.",
    shortBenefits: ['Portable comfort', 'Easy to clean', 'Non-slip backing'],
  },
  fountain: {
    intro: "For pet parents concerned about their pet's hydration. This fountain encourages more water intake with fresh, filtered water, promoting better health and well-being.",
    shortBenefits: ['Encourages hydration', 'Filtered water', 'Quiet operation'],
  },
  food: {
    intro: "Selected for pet parents who care about what goes into their pet's bowl. A quality choice for everyday nutrition that fits seamlessly into your feeding routine.",
    shortBenefits: ['Quality ingredients', 'Everyday nutrition', 'Convenient packaging'],
  },
  accessory: {
    intro: "A practical addition for pet parents looking to make daily life with their furry friend easier. Designed with quality and convenience in mind.",
    shortBenefits: ['Practical design', 'Quality materials', 'Easy to use'],
  },
};

/**
 * Generate a clarity-first intro for the product
 */
export function generateClarityIntro(productName: string, category: string): string {
  const productType = extractProductType(productName, category);
  return clarityIntros[productType].intro;
}

/**
 * Get short benefits for the product type
 */
export function getShortBenefits(productName: string, category: string): string[] {
  const productType = extractProductType(productName, category);
  return clarityIntros[productType].shortBenefits;
}

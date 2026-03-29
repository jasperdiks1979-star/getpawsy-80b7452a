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
    intro: "Many pets sleep on worn-out beds that offer little joint support — leading to stiffness and restless nights. This pet bed is designed to support hips and joints with high-density foam that adapts to your dog's body. A great choice for senior dogs, active breeds, and any pet that deserves more comfortable sleep.",
    shortBenefits: ['Designed to support joint comfort', 'Breathable, machine-washable cover', 'Non-slip base for all floors'],
  },
  bowl: {
    intro: "Pets that eat too fast risk bloating, vomiting, and poor digestion — while lightweight bowls slide across the floor creating mess at every meal. This feeding bowl promotes healthier eating habits with a stable, non-slip design that keeps mealtimes clean and calm. Ideal for dogs and cats of all sizes who need a slower, safer feeding routine.",
    shortBenefits: ['Promotes slower, safer eating', 'Non-slip stable base', 'Dishwasher safe for easy cleaning'],
  },
  harness: {
    intro: "Traditional collars put dangerous pressure on your pet's throat, causing neck strain and making walks stressful for both of you. This no-pull harness distributes force evenly across the chest, eliminating choking while giving you better control. Built for daily walks, training sessions, and outdoor adventures with padded comfort that prevents rubbing.",
    shortBenefits: ['No-choke chest distribution', 'Padded anti-rub straps', 'Reflective trim for safety'],
  },
  leash: {
    intro: "A flimsy leash with a weak clasp can lead to accidental escapes — putting your pet in danger every time you walk. This heavy-duty leash combines a reinforced rotating clasp with a padded ergonomic grip for all-day comfort. Whether you're on city sidewalks or hiking trails, it gives you reliable control in any situation.",
    shortBenefits: ['Heavy-duty secure clasp', 'Padded ergonomic grip', 'All-weather durable materials'],
  },
  collar: {
    intro: "Poorly fitted collars slip off, chafe skin, or cause matting — and an uncomfortable collar means your pet resists wearing it, creating a safety risk outdoors. This adjustable collar is built for all-day comfort with breathable material and a secure quick-release buckle. Perfect for everyday wear during walks, play, and rest.",
    shortBenefits: ['Adjustable perfect fit', 'Breathable materials', 'Secure quick-release buckle'],
  },
  toy: {
    intro: "Bored pets turn to destructive behavior — chewing furniture, excessive barking, and anxious habits that frustrate everyone. This interactive toy channels that energy into healthy play with durable, non-toxic materials that withstand daily use. Designed to mentally stimulate your pet while keeping your home intact and your pet happier.",
    shortBenefits: ['Durable for aggressive chewers', 'Non-toxic safe materials', 'Reduces destructive behavior'],
  },
  carrier: {
    intro: "Traveling with a loose pet is unsafe, and poorly ventilated carriers cause anxiety and overheating during vet visits or road trips. This pet carrier provides a secure, well-ventilated space with easy-access openings that reduce loading stress. Airline-compatible and sturdy enough for confident travel anywhere.",
    shortBenefits: ['Multi-point ventilation', 'Airline-compatible size', 'Secure anti-escape zippers'],
  },
  grooming: {
    intro: "Shedding fur covers your furniture, clothes, and car seats — and without regular grooming, painful mats and tangles develop that lead to skin irritation. This grooming tool removes loose undercoat effectively while being gentle on sensitive skin. Professional-quality results at home, saving hundreds per year on salon visits.",
    shortBenefits: ['Helps reduce shedding significantly', 'Gentle on sensitive skin', 'Self-cleaning mechanism'],
  },
  clothing: {
    intro: "Short-haired and small breeds struggle in cold weather, shivering through winter walks while ill-fitting pet clothes restrict their movement. This pet clothing provides warmth without bulk, with a stretch-friendly design that lets your pet move naturally. Easy on-off fastening means less fussing and more time enjoying the outdoors together.",
    shortBenefits: ['Warmth without restricting movement', 'Easy on/off design', 'Machine washable'],
  },
  mat: {
    intro: "Without a consistent resting spot, pets claim your furniture or develop anxiety from not having their own space. This portable pet mat gives your furry friend a non-slip surface they can call their own — at home, traveling, or at the vet. Machine washable and built to provide familiar comfort wherever you go.",
    shortBenefits: ['Non-slip portable comfort', 'Machine washable', 'Works anywhere — home or travel'],
  },
  fountain: {
    intro: "Still water in bowls can collect bacteria, and many pets prefer fresh, moving water. This pet water fountain circulates and triple-filters water continuously, helping keep it fresh and appealing around the clock. Ultra-quiet operation means your pet always has access to clean, flowing water.",
    shortBenefits: ['Triple filtration system', 'Ultra-quiet pump', 'Encourages healthy hydration'],
  },
  food: {
    intro: "Choosing the right pet food can be confusing with so many options on the market. This carefully selected formula provides balanced daily nutrition with quality ingredients. Designed to support your pet's energy, coat health, and digestive comfort.",
    shortBenefits: ['Quality ingredients', 'Complete balanced nutrition', 'Supports coat and digestive comfort'],
  },
  accessory: {
    intro: "Finding pet accessories that actually work is frustrating — many products look good online but break easily or aren't safe for daily use. This product is built with premium, pet-safe materials and practical design tested for real-world pet ownership. It integrates seamlessly into your daily routine, making life easier for both you and your pet.",
    shortBenefits: ['Premium durable materials', 'Practical daily-use design', 'Built for real pet life'],
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

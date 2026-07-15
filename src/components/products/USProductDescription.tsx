import React from 'react';
import { CheckCircle, Truck, RotateCcw, Shield, Heart, Package } from 'lucide-react';
import {
  FREE_SHIPPING_THRESHOLD,
  DELIVERY_TIME_STANDARD,
  RETURN_WINDOW_DAYS,
} from '@/lib/shipping-constants';

interface USProductDescriptionProps {
  description: string;
  productName: string;
  className?: string;
}

interface ParsedDescription {
  benefitIntro: string;
  keyBenefits: string[];
  whyLoveIt: string;
  productDetails: string[];
}

/**
 * US-Style Product Description Component
 * 
 * Follows a standardized 5-section format optimized for US e-commerce:
 * 1. Short Benefit Intro (above the fold)
 * 2. Key Benefits (scannable bullets)
 * 3. Why Pet Parents Love It (emotional reassurance)
 * 4. Product Details (factual specs)
 * 5. Shipping & Returns Reassurance (trust block)
 */
const USProductDescription: React.FC<USProductDescriptionProps> = ({
  description,
  productName,
  className = '',
}) => {
  const parsed = parseDescriptionToUSFormat(description, productName);

  return (
    <div className={`space-y-8 ${className}`}>
      {/* Section 1: Short Benefit Intro */}
      <section>
        <p className="text-lg text-foreground leading-relaxed">
          {parsed.benefitIntro}
        </p>
      </section>

      {/* Section 2: Key Benefits */}
      {parsed.keyBenefits.length > 0 && (
        <section>
          <h3 className="text-lg font-display font-semibold text-foreground mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-primary" />
            Key Benefits
          </h3>
          <ul className="space-y-3">
            {parsed.keyBenefits.map((benefit, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                <span className="text-muted-foreground">{benefit}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Section 3: Why Pet Parents Love It */}
      <section className="bg-primary/5 rounded-xl p-5 border border-primary/10">
        <h3 className="text-lg font-display font-semibold text-foreground mb-3 flex items-center gap-2">
          <Heart className="w-5 h-5 text-primary" />
          Why Pet Parents Love It
        </h3>
        <p className="text-muted-foreground leading-relaxed">
          {parsed.whyLoveIt}
        </p>
      </section>

      {/* Section 4: Product Details */}
      {parsed.productDetails.length > 0 && (
        <section>
          <h3 className="text-lg font-display font-semibold text-foreground mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Product Details
          </h3>
          <ul className="space-y-2">
            {parsed.productDetails.map((detail, idx) => (
              <li key={idx} className="flex items-start gap-3 py-2 border-b border-border/30 last:border-0">
                <span className="text-muted-foreground">{detail}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Section 5: Shipping & Returns Reassurance */}
      <section className="bg-muted/50 rounded-xl p-5">
        <h3 className="text-lg font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <Truck className="w-5 h-5 text-primary" />
          Shipping & Returns
        </h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="flex items-start gap-3">
            <Truck className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
             <div>
              <p className="font-medium text-foreground text-sm">US Shipping</p>
              <p className="text-xs text-muted-foreground">Estimated delivery: 5–10 business days</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Shield className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
            <div>
              <p className="font-medium text-foreground text-sm">Estimated Delivery</p>
              <p className="text-xs text-muted-foreground">{DELIVERY_TIME_STANDARD}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 sm:col-span-2">
            <RotateCcw className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
            <div>
              <p className="font-medium text-foreground text-sm">{RETURN_WINDOW_DAYS}-Day Easy Returns</p>
              <p className="text-xs text-muted-foreground">Easy returns if you are not completely satisfied</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

/**
 * Parse raw product description into US-style structured format
 */
function parseDescriptionToUSFormat(description: string, productName: string): ParsedDescription {
  // Clean the description
  let cleanDesc = description
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/\*\*/g, '') // Remove markdown bold
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Default fallbacks based on product name
  const productType = extractProductType(productName);
  
  // Extract or generate benefit intro (1-2 sentences)
  let benefitIntro = extractBenefitIntro(cleanDesc, productName, productType);
  
  // Extract or generate key benefits (3-5 bullets)
  let keyBenefits = extractKeyBenefits(cleanDesc, productType);
  
  // Extract or generate "Why Pet Parents Love It"
  let whyLoveIt = extractWhyLoveIt(cleanDesc, productName, productType);
  
  // Extract product details/specifications
  let productDetails = extractProductDetails(cleanDesc);

  return {
    benefitIntro,
    keyBenefits,
    whyLoveIt,
    productDetails,
  };
}

/**
 * Extract product type from name for contextual content generation
 */
function extractProductType(name: string): string {
  const lowName = name.toLowerCase();
  
  if (lowName.includes('bed')) return 'bed';
  if (lowName.includes('bowl') || lowName.includes('feeder')) return 'bowl';
  if (lowName.includes('collar') || lowName.includes('leash') || lowName.includes('harness')) return 'collar';
  if (lowName.includes('toy')) return 'toy';
  if (lowName.includes('carrier') || lowName.includes('crate')) return 'carrier';
  if (lowName.includes('brush') || lowName.includes('groom')) return 'grooming';
  if (lowName.includes('clothes') || lowName.includes('sweater') || lowName.includes('jacket')) return 'clothing';
  if (lowName.includes('mat') || lowName.includes('pad')) return 'mat';
  if (lowName.includes('fountain') || lowName.includes('water')) return 'fountain';
  if (lowName.includes('treat') || lowName.includes('food')) return 'food';
  
  return 'accessory';
}

/**
 * Extract or generate benefit-focused intro
 */
function extractBenefitIntro(desc: string, name: string, type: string): string {
  // Try to extract first 1-2 meaningful sentences
  const sentences = desc.split(/(?<=[.!?])\s+/).filter(s => s.length > 20);
  
  if (sentences.length > 0) {
    // Take first sentence, clean it up
    let intro = sentences[0];
    
    // If first sentence is too long or too short, generate one
    if (intro.length > 200 || intro.length < 30) {
      return generateIntro(name, type);
    }
    
    // Ensure it ends with period
    if (!intro.endsWith('.') && !intro.endsWith('!')) {
      intro += '.';
    }
    
    return intro;
  }
  
  return generateIntro(name, type);
}

/**
 * Generate contextual intro based on product type
 */
function generateIntro(name: string, type: string): string {
  const intros: Record<string, string> = {
    bed: `The ${name} offers everyday comfort designed with your pet's rest in mind. A practical solution for relaxation and better sleep.`,
    bowl: `Make mealtime easier and cleaner with this thoughtfully designed feeding solution. Built for everyday convenience.`,
    collar: `A comfortable and practical accessory for daily walks and outdoor adventures. Designed with both style and function in mind.`,
    toy: `Keep your pet entertained and active with this engaging toy. Perfect for everyday play and mental stimulation.`,
    carrier: `Travel with confidence using this practical carrier designed for your pet's comfort and safety on the go.`,
    grooming: `Simplify your grooming routine with this easy-to-use tool. Designed to keep your pet looking and feeling their best.`,
    clothing: `Keep your pet comfortable in any weather with this practical and stylish piece. Easy to put on and take off.`,
    mat: `A versatile addition to your pet's space that provides comfort and easy maintenance for everyday use.`,
    fountain: `Encourage healthy hydration with this practical water solution designed for your pet's daily needs.`,
    food: `A quality choice for your pet's nutrition, selected with their health and enjoyment in mind.`,
    accessory: `A practical everyday essential designed to make life with your pet easier and more enjoyable.`,
  };
  
  return intros[type] || intros.accessory;
}

/**
 * Extract or generate key benefits
 */
function extractKeyBenefits(desc: string, type: string): string[] {
  const benefits: string[] = [];
  
  // Try to find bullet points or list items in description
  const bulletMatches = desc.match(/[-•]\s*([^-•.]+)/g);
  if (bulletMatches && bulletMatches.length >= 3) {
    bulletMatches.slice(0, 5).forEach(match => {
      const cleaned = match.replace(/^[-•]\s*/, '').trim();
      if (cleaned.length > 10 && cleaned.length < 100) {
        benefits.push(capitalizeFirst(cleaned));
      }
    });
  }
  
  // If not enough benefits found, generate based on type
  if (benefits.length < 3) {
    const typeBenefits = getTypeBenefits(type);
    typeBenefits.forEach(b => {
      if (!benefits.some(existing => existing.toLowerCase().includes(b.toLowerCase().slice(0, 10)))) {
        benefits.push(b);
      }
    });
  }
  
  return benefits.slice(0, 5);
}

/**
 * Get default benefits based on product type
 */
function getTypeBenefits(type: string): string[] {
  const benefitsByType: Record<string, string[]> = {
    bed: [
      'Provides comfortable support for restful sleep',
      'Durable materials built for everyday use',
      'Easy to clean and maintain',
      'Suitable for pets of various sizes (check size guide)',
      'Non-slip base keeps bed in place',
    ],
    bowl: [
      'Promotes healthier eating habits',
      'Easy to clean and dishwasher safe',
      'Stable base prevents spills and sliding',
      'Made from pet-safe materials',
      'Practical design for everyday feeding',
    ],
    collar: [
      'Comfortable fit for all-day wear',
      'Durable construction for active pets',
      'Easy-to-use buckle or clasp system',
      'Reflective elements for visibility (if applicable)',
      'Adjustable sizing for a secure fit',
    ],
    toy: [
      'Encourages active play and exercise',
      'Made from durable, pet-safe materials',
      'Helps reduce boredom and anxiety',
      'Easy to clean after playtime',
      'Suitable for interactive or solo play',
    ],
    carrier: [
      'Secure and comfortable for travel',
      'Proper ventilation for your pet',
      'Durable construction for long-term use',
      'Easy access for loading and unloading',
      'Meets most airline carry-on requirements (check dimensions)',
    ],
    grooming: [
      'Gentle on your pet skin and coat',
      'Reduces shedding and loose fur',
      'Comfortable grip for easy handling',
      'Suitable for regular grooming sessions',
      'Helps maintain a healthy, shiny coat',
    ],
    clothing: [
      'Comfortable fit that does not restrict movement',
      'Easy to put on and remove',
      'Machine washable for easy care',
      'Suitable for indoor and outdoor use',
      'Available in multiple sizes (check size guide)',
    ],
    mat: [
      'Provides a comfortable resting surface',
      'Easy to clean and quick-drying',
      'Portable and versatile for any space',
      'Non-slip backing for stability',
      'Durable for everyday use',
    ],
    fountain: [
      'Encourages increased water intake',
      'Quiet operation for sensitive pets',
      'Easy to clean and refill',
      'Filters help keep water fresh',
      'Suitable for cats and small dogs',
    ],
    food: [
      'Selected with your pet nutrition in mind',
      'Made with quality ingredients',
      'Suitable for everyday feeding',
      'Convenient packaging for freshness',
      'Appropriate for the recommended life stage',
    ],
    accessory: [
      'Designed for everyday convenience',
      'Made from durable, pet-safe materials',
      'Easy to use and maintain',
      'Practical addition to your pet supplies',
      'Suitable for pets of various sizes',
    ],
  };
  
  return benefitsByType[type] || benefitsByType.accessory;
}

/**
 * Extract or generate "Why Pet Parents Love It" content
 */
function extractWhyLoveIt(desc: string, name: string, type: string): string {
  // Look for testimonial-like content or emotional phrases
  const sentences = desc.split(/(?<=[.!?])\s+/);
  const emotionalSentence = sentences.find(s => 
    s.toLowerCase().includes('love') ||
    s.toLowerCase().includes('perfect') ||
    s.toLowerCase().includes('great for') ||
    s.toLowerCase().includes('ideal')
  );
  
  if (emotionalSentence && emotionalSentence.length > 30 && emotionalSentence.length < 200) {
    return emotionalSentence;
  }
  
  // Generate based on type
  const whyLoveByType: Record<string, string> = {
    bed: 'Pet parents appreciate how this bed fits seamlessly into their home while giving their furry friend a dedicated space to rest. It is easy to care for and holds up well to everyday use.',
    bowl: 'Feeding time becomes simpler and cleaner. Pet parents love the practical design that works well for their daily routine without any fuss.',
    collar: 'This is a go-to choice for daily walks and outings. Pet parents appreciate the balance of comfort and durability that stands up to an active lifestyle.',
    toy: 'Pets stay engaged and entertained, which means happier playtime for everyone. Pet parents love seeing their furry friends enjoying themselves.',
    carrier: 'Whether it is a trip to the vet or a weekend getaway, pet parents feel confident knowing their pet is secure and comfortable during travel.',
    grooming: 'Regular grooming becomes easier and less stressful for both pet and owner. Many pet parents notice a visible difference in their pet coat after consistent use.',
    clothing: 'Perfect for keeping pets comfortable during colder weather or adding a touch of style to their look. Easy to dress and undress makes it a practical choice.',
    mat: 'A versatile solution that works in any room of the house. Pet parents appreciate having a dedicated spot they can easily move around as needed.',
    fountain: 'Pets drink more water, and pet parents have peace of mind knowing hydration is taken care of. The quiet operation means it blends into the background of daily life.',
    food: 'Pet parents feel good about what they are feeding their furry family member. It is a reliable choice that fits into their pet care routine.',
    accessory: 'A practical everyday item designed to fit into your pet care routine.',
  };
  
  return whyLoveByType[type] || whyLoveByType.accessory;
}

/**
 * Extract product details/specifications
 */
function extractProductDetails(desc: string): string[] {
  const details: string[] = [];
  
  // Look for specification patterns
  const specPatterns = [
    /material[s]?:?\s*([^.]+)/i,
    /size[s]?:?\s*([^.]+)/i,
    /dimension[s]?:?\s*([^.]+)/i,
    /weight:?\s*([^.]+)/i,
    /color[s]?:?\s*([^.]+)/i,
    /include[sd]?:?\s*([^.]+)/i,
    /package:?\s*([^.]+)/i,
  ];
  
  specPatterns.forEach(pattern => {
    const match = desc.match(pattern);
    if (match && match[1]) {
      const detail = capitalizeFirst(match[0].trim());
      if (detail.length < 100) {
        details.push(detail);
      }
    }
  });
  
  // Add generic details if none found
  if (details.length === 0) {
    details.push('Please refer to the size guide for dimensions');
    details.push('Check product images for color and style options');
    details.push('See specifications tab for additional details');
  }
  
  return details.slice(0, 6);
}

/**
 * Capitalize first letter of string
 */
function capitalizeFirst(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export default USProductDescription;

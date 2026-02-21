import { CheckCircle, XCircle, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

/**
 * Hero Product Conversion Boost
 * 
 * High-conversion sections for the #1 hero product:
 * - "Who is this for?" (emotional match)
 * - "Who is this NOT for?" (objection pre-handling)
 * - Product-specific FAQ accordion
 * - First batch pricing badge (factual urgency)
 * 
 * Only rendered for specific hero product slugs.
 */

interface HeroProductBoostProps {
  productSlug: string;
}

// Product-specific conversion data keyed by slug
const HERO_DATA: Record<string, {
  whoFor: string[];
  whoNotFor: string[];
  faqs: Array<{ q: string; a: string }>;
  urgencyLine: string;
}> = {
  'memory-foam-pet-bed-for-small-dogs-cats-with-washable-removable-cover-non-slip-base-waterproof-liner': {
    whoFor: [
      'Senior dogs (5+ years) who struggle to get up in the morning',
      'Cats and small dogs with joint stiffness or early arthritis',
      'Pets recovering from surgery who need gentle, even support',
      'Pet parents tired of replacing flat, saggy beds every few months',
      'Dogs who sleep on hard floors because their current bed bottomed out',
    ],
    whoNotFor: [
      'Aggressive chewers who destroy beds — consider a chew-proof bed first',
      'Giant breeds over 90 lbs — this bed is sized for small to medium pets',
      'Outdoor-only pets — this bed is designed for indoor use',
    ],
    faqs: [
      {
        q: 'Will this bed actually help my dog\'s joint pain?',
        a: 'Yes. Memory foam distributes weight evenly, reducing pressure on hips, elbows, and spine. Many pet parents report their dogs getting up more easily within the first week. It\'s the same principle used in human orthopedic mattresses.',
      },
      {
        q: 'Is the cover really machine washable?',
        a: 'Yes — the outer cover zips off completely and goes straight into the washing machine. The waterproof liner underneath protects the foam from accidents, so even if your pet has an incident, the foam stays clean and dry.',
      },
      {
        q: 'How long does the memory foam hold its shape?',
        a: 'The high-density foam in this bed is rated for 3–5 years of daily use without sagging. Unlike polyester fill beds that flatten in weeks, memory foam returns to its original shape after each use.',
      },
      {
        q: 'Will this bed slide around on hardwood or tile floors?',
        a: 'No. The non-slip rubber base grips hard floors firmly. This is especially important for senior pets who may struggle with mobility — the last thing you want is a bed that slides out from under them.',
      },
      {
        q: 'What size pets does this bed fit?',
        a: 'This bed is designed for small dogs (up to ~30 lbs) and cats. Your pet should be able to curl up or stretch out comfortably. Measure your pet nose-to-tail and compare — most small breeds and all cats fit perfectly.',
      },
    ],
    urgencyLine: 'Introductory pricing — first batch at this price point',
  },
  'dog-cot-cooling-pet-bed-3': {
    whoFor: [
      'Dogs that overheat easily during summer — this bed promotes constant airflow underneath',
      'Large & medium breeds (up to 150 lbs) who need sturdy, supportive rest',
      'Senior dogs with joint stiffness — the elevated frame relieves pressure on hips and elbows',
      'Pet parents who want one bed for both indoor and outdoor use',
      'Dogs recovering from surgery who need a clean, raised sleeping surface',
    ],
    whoNotFor: [
      'Very small dogs under 10 lbs — the mesh may not contour enough for tiny breeds',
      'Dogs that love to burrow or nest — this is an open-air cot design',
      'Pet parents looking for a plush, cushioned mattress feel — this is firm orthopedic support',
    ],
    faqs: [
      {
        q: 'Is this elevated dog bed good for large breeds?',
        a: 'Absolutely. The heavy-duty steel frame supports dogs up to 150 lbs. The breathable mesh distributes weight evenly, making it ideal for large breeds like Labs, Golden Retrievers, and German Shepherds who need joint relief.',
      },
      {
        q: 'Does the elevated design help with arthritis?',
        a: 'Yes. By lifting your dog off the ground, this raised cot reduces pressure on joints, hips, and elbows. The even weight distribution mimics orthopedic support, and many pet parents notice improved mobility within days.',
      },
      {
        q: 'Can this cooling dog bed be used outdoors?',
        a: 'Yes — the rust-resistant steel frame and UV-resistant mesh are designed for outdoor use. Use it on your patio, deck, camping trips, or anywhere your dog needs a cool, clean spot to rest.',
      },
      {
        q: 'Is the breathable mesh washable?',
        a: 'Yes. The mesh fabric is removable and easy to clean — just wipe down or hand-wash with mild soap. It dries quickly, making it low-maintenance for everyday use.',
      },
      {
        q: 'What weight capacity does this raised dog cot support?',
        a: 'This elevated dog bed supports up to 150 lbs with its reinforced steel frame. The legs lock securely to prevent wobbling, even with larger, more active dogs.',
      },
    ],
    urgencyLine: 'High-demand summer item — limited stock available',
  },
};

export const HeroProductBoost = ({ productSlug }: HeroProductBoostProps) => {
  const data = HERO_DATA[productSlug];
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* First batch pricing — factual, no fake scarcity */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="gap-1.5 text-xs font-medium border-primary/30 text-primary bg-primary/5 py-1 px-3">
          <Sparkles className="w-3 h-3" />
          {data.urgencyLine}
        </Badge>
      </div>

      {/* Who is this for */}
      <div className="bg-muted/30 rounded-2xl p-5 space-y-3 border border-border/50">
        <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-success" />
          Perfect For
        </h3>
        <ul className="space-y-2">
          {data.whoFor.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <CheckCircle className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Who is this NOT for */}
      <div className="bg-muted/30 rounded-2xl p-5 space-y-3 border border-border/50">
        <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
          <XCircle className="w-5 h-5 text-muted-foreground" />
          May Not Be Right For
        </h3>
        <ul className="space-y-2">
          {data.whoNotFor.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <XCircle className="w-4 h-4 text-muted-foreground/60 flex-shrink-0 mt-0.5" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Product-specific FAQ Accordion */}
      <div className="space-y-3">
        <h3 className="font-display font-semibold text-foreground">
          Common Questions About This Product
        </h3>
        <Accordion type="single" collapsible className="w-full">
          {data.faqs.map((faq, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-left text-sm font-medium hover:no-underline">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
};

export default HeroProductBoost;

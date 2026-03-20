import { useMemo } from 'react';
import { HelpCircle } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  FREE_SHIPPING_THRESHOLD,
  DELIVERY_TIME_STANDARD,
  RETURN_WINDOW_DAYS,
} from '@/lib/shipping-constants';

interface ProductFAQAccordionProps {
  productName: string;
  category?: string;
}

const CAT_TREE_RE = /cat\s*tree|cat\s*condo|cat\s*tower|scratching\s*post|cat\s*furniture|climbing/i;
const LITTER_RE = /litter\s*box|self[\s-]*clean|automatic\s*litter/i;

function generateFAQs(name: string, category?: string) {
  const cat = (category || '').toLowerCase();
  const n = name.toLowerCase();
  const isCatTree = CAT_TREE_RE.test(n) || CAT_TREE_RE.test(cat);
  const isLitter = LITTER_RE.test(n) || LITTER_RE.test(cat);

  if (isCatTree) {
    return [
      { q: `How stable is the ${name}?`, a: `This cat tree features a heavy-duty base plate engineered to prevent tipping, even with cats weighing 25+ lbs. The wide footprint and reinforced joints keep it sturdy during vigorous play.` },
      { q: `What is the weight capacity?`, a: `Depending on the model, our cat trees support 15–30+ lbs per platform. Check the product specifications above for exact weight ratings per level.` },
      { q: `Is this suitable for large cats like Maine Coons?`, a: `Yes. Our premium cat trees are designed with oversized platforms, reinforced perches, and wider openings specifically for large and heavy breeds.` },
      { q: `How long does assembly take?`, a: `Most customers complete assembly in 30–60 minutes with basic tools. Step-by-step instructions and all hardware are included.` },
      { q: `What materials are the scratching posts made from?`, a: `Our posts use natural sisal rope which lasts 3–5× longer than carpet-covered alternatives. The sisal satisfies scratching instincts and protects your furniture.` },
      { q: `Can multiple cats use this at the same time?`, a: `Absolutely. Multi-level designs allow several cats to perch, play, and rest simultaneously without competing for space.` },
      { q: `Will this damage my floors?`, a: `No. The base includes felt or rubber pads to protect hardwood and tile floors from scratches.` },
      { q: `How long does shipping take?`, a: `We offer fast shipping to the United States with standard delivery of ${DELIVERY_TIME_STANDARD}. Orders over $${FREE_SHIPPING_THRESHOLD} qualify for free shipping.` },
      { q: `What is the return policy?`, a: `We offer a ${RETURN_WINDOW_DAYS}-day hassle-free return policy. If your cat doesn't love it, contact our support team for a full refund.` },
      { q: `How do I clean and maintain this cat tree?`, a: `Removable cushion covers are machine-washable. Wipe platforms with a damp cloth. Vacuum sisal posts periodically to remove loose fibers.` },
    ];
  }

  if (isLitter) {
    return [
      { q: `Is it safe for kittens?`, a: `Yes. Built-in infrared sensors prevent the cleaning cycle from starting when a cat is inside. We recommend it for cats over 5 lbs. Kittens under 6 months should use a standard box until they reach the minimum weight.` },
      { q: `How often do I need to empty it?`, a: `Typically every few days depending on usage. With the sealed waste compartment, you only need a full litter change every 2–3 weeks — 50% less frequently than manual boxes.` },
      { q: `Does it smell?`, a: `No — waste is automatically sealed after each use, and odors are minimized at the source. Most customers report guests can't even tell they have cats.` },
      { q: `How does the self-cleaning mechanism work?`, a: `After your cat exits, the infrared sensor triggers an automatic cycle that separates clumps into a sealed waste compartment, keeping the litter bed fresh without any manual scooping.` },
      { q: `Can multiple cats share this litter box?`, a: `Yes — this model is designed for multi-cat homes. We recommend one box per 2 cats maximum. The automatic cleaning ensures it stays fresh between uses.` },
      { q: `What type of litter should I use?`, a: `Clumping clay litter works best with the self-cleaning system. Avoid crystal or non-clumping litter as it can jam the mechanism.` },
      { q: `How loud is the cleaning cycle?`, a: `Whisper-quiet at under 50 dB. Most cats are not disturbed by the cleaning cycle, and it won't wake you at night.` },
      { q: `How long does shipping take?`, a: `We offer fast shipping to the United States with standard delivery of ${DELIVERY_TIME_STANDARD}. Orders over $${FREE_SHIPPING_THRESHOLD} qualify for free shipping.` },
      { q: `What is the return policy?`, a: `We offer a ${RETURN_WINDOW_DAYS}-day hassle-free return policy. If you're not satisfied, contact our support team for a full refund.` },
      { q: `What maintenance is required?`, a: `Empty the waste compartment every few days, replace carbon filters monthly, and wipe sensors with a dry cloth. Full deep-clean recommended every 3 months.` },
    ];
  }

  // Generic FAQs for non-cat-specific products
  return [
    { q: `What sizes does the ${name} come in?`, a: `The ${name} is available in multiple sizes to fit different pet breeds. Check the product specifications above for exact dimensions and weight recommendations.` },
    { q: `How long does shipping take?`, a: `We offer fast shipping to the United States with standard delivery of ${DELIVERY_TIME_STANDARD}. Orders over $${FREE_SHIPPING_THRESHOLD} qualify for free shipping.` },
    { q: `What is your return policy?`, a: `We offer a ${RETURN_WINDOW_DAYS}-day hassle-free return policy. If you're not satisfied, contact our support team for a full refund or exchange.` },
    { q: `What materials is this made from?`, a: `The ${name} is made from premium, pet-safe materials designed for durability and comfort. See the product description for specific material details.` },
    { q: `Is this easy to clean?`, a: cat.includes('bed') ? `Most of our pet beds feature removable, machine-washable covers for easy maintenance.` : `Yes, this product is designed for easy cleaning. Refer to the care instructions in the product description.` },
    { q: `Does this come with a warranty?`, a: `All GetPawsy products are backed by our ${RETURN_WINDOW_DAYS}-day satisfaction guarantee. We stand behind the quality of every product we sell.` },
    { q: `Is this safe for puppies and kittens?`, a: `Yes, we prioritize pet safety in every product. However, we recommend supervising young pets during initial use.` },
    { q: `Can I use this for multiple pets?`, a: `Absolutely! Many of our customers use this product in multi-pet households. Choose the appropriate size for your largest pet.` },
    { q: `Do you ship internationally?`, a: `We currently focus on US shipping to ensure the fastest delivery times. International shipping may be available for select items.` },
    { q: `How do I contact customer support?`, a: `You can reach our friendly support team via the Contact page or email us directly. We typically respond within 24 hours.` },
  ];
}

export function ProductFAQAccordion({ productName, category }: ProductFAQAccordionProps) {
  const faqs = useMemo(() => generateFAQs(productName, category), [productName, category]);

  return (
    <section className="mt-12">
      <h2 className="text-xl md:text-2xl font-display font-bold text-foreground flex items-center gap-2 mb-6">
        <HelpCircle className="w-6 h-6 text-primary" />
        Frequently Asked Questions
      </h2>
      <Accordion type="single" collapsible className="w-full space-y-2">
        {faqs.map((faq, idx) => (
          <AccordionItem
            key={idx}
            value={`faq-${idx}`}
            className="border rounded-xl px-4 bg-card"
          >
            <AccordionTrigger className="text-sm md:text-base font-medium text-left py-4">
              {faq.q}
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground pb-4">
              {faq.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

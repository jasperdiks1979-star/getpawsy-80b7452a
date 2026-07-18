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
import { getProductContentOverride } from '@/config/product-content-overrides';

interface ProductFAQAccordionProps {
  productId?: string;
  productName: string;
  category?: string;
}

const CAT_TREE_RE = /cat\s*tree|cat\s*condo|cat\s*tower|scratching\s*post|cat\s*furniture|climbing/i;
const LITTER_RE = /litter\s*box|self[\s-]*clean|automatic\s*litter/i;
const DOG_BED_RE = /dog\s*bed|pet\s*cot|cooling\s*bed|elevated\s*bed|car\s*bed|travel\s*pad/i;
const TRAVEL_RE = /stroller|carrier|backpack|travel/i;
const TOY_RE = /toy|chew|squeaky|dispenser/i;

function generateFAQs(name: string, category?: string) {
  const cat = (category || '').toLowerCase();
  const n = name.toLowerCase();
  const combined = `${n} ${cat}`;
  const isCatTree = CAT_TREE_RE.test(combined);
  const isLitter = LITTER_RE.test(combined);
  const isDogBed = DOG_BED_RE.test(combined) || cat.includes('dog bed');
  const isTravel = TRAVEL_RE.test(combined) || cat.includes('travel');
  const isToy = TOY_RE.test(combined) || cat.includes('toy');

  if (isDogBed) {
    const isCooling = /cooling|elevated|breathable|outdoor|cot/i.test(combined);
    const isCarBed = /car\s*bed|rear\s*seat|travel\s*pad/i.test(combined);

    const faqs = [
      { q: `What size dog is the ${name} designed for?`, a: `This dog bed is designed for medium to large dogs. Check the product dimensions above to match your dog's size. As a rule of thumb, your dog should be able to lie fully stretched without hanging over the edge.` },
      { q: `Is this dog bed good for senior dogs with joint pain?`, a: `Yes. The raised or cushioned design helps distribute weight evenly, which may reduce pressure on joints and hips. Many pet owners choose this bed specifically for older dogs or dogs recovering from surgery.` },
      { q: `Is the ${name} washable?`, a: `Yes — the cover is removable and machine-washable for easy maintenance. We recommend washing on a gentle cycle with cold water and air drying for best results.` },
      { q: `Can I use this dog bed outdoors?`, a: isCooling ? `Absolutely. The elevated design and breathable mesh make it ideal for porches, patios, camping, and other outdoor environments. The frame is weather-resistant and rust-proof.` : `This bed is primarily designed for indoor use, but it can be used in covered outdoor areas. Avoid leaving it in direct rain or prolonged sun exposure.` },
      { q: `How does this compare to orthopedic dog beds?`, a: isCooling ? `Unlike memory foam orthopedic beds, this elevated cot provides cooling airflow from all sides — making it a better choice for warm climates. For joint support specifically, an orthopedic bed may be preferable in colder environments.` : `This bed offers comfort and support for daily rest. If your dog has diagnosed joint conditions, consult your veterinarian about the best sleeping surface for their needs.` },
      { q: `Will this fit in a dog crate?`, a: isCarBed ? `This bed is designed specifically for car rear seats rather than crates. Check the dimensions above to see if it fits your vehicle.` : `Check the bed dimensions against your crate's interior measurements. Many customers successfully use our beds inside XL and XXL crates.` },
      { q: `How long does assembly take?`, a: isCooling ? `Most customers set up the elevated cot in under 5 minutes. No tools required — the legs snap into place and the mesh stretches over the frame.` : `This bed arrives ready to use — no assembly needed. Simply unbox and place it in your dog's favorite spot.` },
      { q: `How long does shipping take?`, a: `We ship to the United States with estimated delivery of ${DELIVERY_TIME_STANDARD}. Orders over $${FREE_SHIPPING_THRESHOLD} qualify for free shipping. Delivery times may vary depending on location.` },
      { q: `What is the return policy?`, a: `We offer a ${RETURN_WINDOW_DAYS}-day return policy. Items must be unused and in original condition. Contact our support team to start a return.` },
      { q: `What weight can this dog bed support?`, a: isCooling ? `The elevated steel frame supports dogs up to 80 lbs. The mesh fabric is tear-resistant and maintains tension even with heavier dogs.` : `Check the product specifications above for the exact weight capacity. Most of our dog beds support medium to large breeds comfortably.` },
    ];
    return faqs;
  }

  if (isTravel) {
    const isStroller = /stroller/i.test(combined);
    const isBackpack = /backpack|carrier/i.test(combined);
    return [
      { q: `What is the weight limit for this ${isStroller ? 'pet stroller' : 'pet carrier'}?`, a: isStroller ? `This stroller comfortably supports dogs up to 30 lbs. For larger dogs, check our selection of heavy-duty pet strollers.` : `This carrier is designed for small dogs and cats up to 15 lbs. Always check the weight capacity before purchasing.` },
      { q: `Is this ${isStroller ? 'stroller' : 'carrier'} airline approved?`, a: isStroller ? `Pet strollers are not typically permitted on aircraft. For air travel, consider our expandable pet carrier backpack which meets most airline cabin size requirements.` : `The dimensions are compatible with most airline cabin carry-on requirements. However, always verify with your specific airline before traveling, as policies vary.` },
      { q: `Can senior dogs use this?`, a: isStroller ? `Absolutely — pet strollers are one of the best ways to help senior, injured, or post-surgery dogs continue enjoying outdoor time without strain.` : `Yes, the padded interior provides comfortable support for older pets during short trips to the vet or around town.` },
      { q: `How does it fold for storage?`, a: isStroller ? `The one-hand fold mechanism collapses the stroller flat in seconds. It fits easily in a car trunk or closet.` : `The carrier collapses flat when not in use and can be stored in a closet, under a seat, or in a suitcase.` },
      { q: `Is there ventilation for my pet?`, a: `Yes — mesh ventilation panels on multiple sides ensure steady airflow and visibility so your pet stays comfortable and calm during travel.` },
      { q: `What surfaces can the ${isStroller ? 'stroller wheels' : 'carrier'} handle?`, a: isStroller ? `The all-terrain wheels handle pavement, grass, gravel paths, and packed dirt. The suspension system provides a smooth ride on uneven surfaces.` : `The carrier works anywhere you can carry it — city streets, hiking trails, airports, and public transit.` },
      { q: `Is this easy to clean?`, a: `Yes — removable padding is machine-washable, and the frame can be wiped down with a damp cloth. We recommend cleaning after each use to maintain hygiene.` },
      { q: `How long does shipping take?`, a: `We ship to the United States with estimated delivery of ${DELIVERY_TIME_STANDARD}. Orders over $${FREE_SHIPPING_THRESHOLD} qualify for free shipping.` },
    ];
  }

  if (isToy) {
    return [
      { q: `Is this toy safe for aggressive chewers?`, a: `Yes — this toy is made from durable, pet-safe materials designed to withstand aggressive chewing. However, no toy is completely indestructible. Always supervise your pet and replace the toy if it shows signs of significant wear.` },
      { q: `What size dogs is this toy suitable for?`, a: `This toy works well for puppies, small, medium, and large dogs. The size and texture are designed to engage dogs of all sizes and chewing strengths.` },
      { q: `Is the material non-toxic?`, a: `Yes — all materials used are non-toxic, BPA-free, and safe for pets. We prioritize food-grade or pet-safe certifications in every toy we sell.` },
      { q: `Can I put treats inside this toy?`, a: /dispenser|treat|food/i.test(combined) ? `Absolutely — fill the compartments with your dog's favorite treats or kibble. This turns playtime into a mentally stimulating puzzle that slows feeding and reduces boredom.` : `This toy is designed primarily for chewing and play rather than treat dispensing. Check our food-dispensing toys for treat-based enrichment.` },
      { q: `How do I clean this toy?`, a: `Most of our toys are dishwasher safe or can be hand-washed with warm soapy water. Air dry before giving it back to your pet.` },
      { q: `Will this keep my dog entertained when home alone?`, a: `This toy is great for independent play and can help reduce boredom and destructive behavior. For best results, rotate toys regularly to keep your dog interested.` },
      { q: `How long does shipping take?`, a: `We ship to the United States with estimated delivery of ${DELIVERY_TIME_STANDARD}. Orders over $${FREE_SHIPPING_THRESHOLD} qualify for free shipping.` },
      { q: `What is your return policy?`, a: `We offer a ${RETURN_WINDOW_DAYS}-day return policy. Items must be unused and in original condition.` },
    ];
  }

  if (isCatTree) {
    return [
      { q: `How stable is the ${name}?`, a: `This cat tree features a heavy-duty base plate engineered to prevent tipping, even with cats weighing 25+ lbs. The wide footprint and reinforced joints keep it sturdy during vigorous play.` },
      { q: `What is the weight capacity?`, a: `Depending on the model, our cat trees support 15–30+ lbs per platform. Check the product specifications above for exact weight ratings per level.` },
      { q: `Is this suitable for large cats like Maine Coons?`, a: `Yes. Our premium cat trees are designed with oversized platforms, reinforced perches, and wider openings specifically for large and heavy breeds.` },
      { q: `How long does assembly take?`, a: `Most customers complete assembly in 30–60 minutes with basic tools. Step-by-step instructions and all hardware are included.` },
      { q: `What materials are the scratching posts made from?`, a: `Our posts use natural sisal rope which lasts 3–5× longer than carpet-covered alternatives. The sisal satisfies scratching instincts and protects your furniture.` },
      { q: `Can multiple cats use this at the same time?`, a: `Absolutely. Multi-level designs allow several cats to perch, play, and rest simultaneously without competing for space.` },
      { q: `Will this damage my floors?`, a: `No. The base includes felt or rubber pads to protect hardwood and tile floors from scratches.` },
      { q: `How long does shipping take?`, a: `We ship to the United States with estimated delivery of ${DELIVERY_TIME_STANDARD}. Orders over $${FREE_SHIPPING_THRESHOLD} qualify for free shipping. Delivery times may vary depending on location.` },
      { q: `What is the return policy?`, a: `We offer a ${RETURN_WINDOW_DAYS}-day return policy. Items must be unused and in original condition. Contact our support team to start a return.` },
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
      { q: `How long does shipping take?`, a: `We ship to the United States with estimated delivery of ${DELIVERY_TIME_STANDARD}. Orders over $${FREE_SHIPPING_THRESHOLD} qualify for free shipping. Delivery times may vary depending on location.` },
      { q: `What is the return policy?`, a: `We offer a ${RETURN_WINDOW_DAYS}-day return policy. Items must be unused and in original condition. Contact our support team to start a return.` },
      { q: `What maintenance is required?`, a: `Empty the waste compartment every few days, replace carbon filters monthly, and wipe sensors with a dry cloth. Full deep-clean recommended every 3 months.` },
    ];
  }

  // Generic FAQs
  return [
    { q: `What sizes does the ${name} come in?`, a: `The ${name} is available in multiple sizes to fit different pet breeds. Check the product specifications above for exact dimensions and weight recommendations.` },
    { q: `How long does shipping take?`, a: `We ship to the United States with estimated delivery of ${DELIVERY_TIME_STANDARD}. Orders over $${FREE_SHIPPING_THRESHOLD} qualify for free shipping. Delivery times may vary depending on location.` },
    { q: `What is your return policy?`, a: `We offer a ${RETURN_WINDOW_DAYS}-day easy return policy. If you're not satisfied, contact our support team to arrange a return per our policy.` },
    { q: `What materials is this made from?`, a: `The ${name} is made from premium, pet-safe materials designed for durability and comfort. See the product description for specific material details.` },
    { q: `Is this easy to clean?`, a: cat.includes('bed') ? `Most of our pet beds feature removable, machine-washable covers for easy maintenance.` : `Yes, this product is designed for easy cleaning. Refer to the care instructions in the product description.` },
    { q: `Does this come with a warranty?`, a: `All GetPawsy products are backed by our ${RETURN_WINDOW_DAYS}-day return policy. We stand behind the quality of every product we sell.` },
    { q: `Is this safe for puppies and kittens?`, a: `Yes, we prioritize pet safety in every product. However, we recommend supervising young pets during initial use.` },
    { q: `Can I use this for multiple pets?`, a: `Absolutely! Many of our customers use this product in multi-pet households. Choose the appropriate size for your largest pet.` },
    { q: `Do you ship internationally?`, a: `We currently focus on US shipping to ensure the fastest delivery times. International shipping may be available for select items.` },
    { q: `How do I contact customer support?`, a: `You can reach our friendly support team via the Contact page or email us directly. We typically respond within 24 hours.` },
  ];
}

export function ProductFAQAccordion({ productId, productName, category }: ProductFAQAccordionProps) {
  const faqs = useMemo(() => {
    const override = getProductContentOverride(productId);
    if (override?.faqs && override.faqs.length > 0) return override.faqs;
    return generateFAQs(productName, category);
  }, [productId, productName, category]);

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

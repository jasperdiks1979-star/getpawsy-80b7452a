/**
 * ProductWhyChoose — Category-aware "Why Choose This Product" section.
 * Generates 300+ words of unique, benefit-driven content per category
 * to prevent Google Soft 404 classification on product pages.
 */

import { Award, Heart, Shield, Sparkles, CheckCircle } from 'lucide-react';

interface Props {
  productName: string;
  category: string;
}

interface ContentBlock {
  heading: string;
  paragraphs: string[];
  highlights: string[];
}

function generateContent(name: string, cat: string): ContentBlock {
  const n = (name || '').toLowerCase();
  const c = (cat || '').toLowerCase();

  if (/litter/i.test(n + ' ' + c)) {
    return {
      heading: 'Why Pet Owners Choose This Litter Box',
      paragraphs: [
        `Keeping your home fresh and clean shouldn't require constant effort. Traditional litter boxes demand daily scooping, create unpleasant odors, and can become a source of stress for both you and your cat. This automatic litter box eliminates that burden entirely by handling waste removal on its own — so you can focus on enjoying time with your pet instead of cleaning up after them.`,
        `Designed with multi-cat households in mind, the system uses advanced infrared sensors to detect when your cat has finished using the box. It then initiates a quiet, thorough cleaning cycle that separates waste into a sealed compartment, locking in odors before they can spread. The result is a consistently clean litter surface that your cat will actually want to use — reducing accidents and litter aversion.`,
        `Beyond convenience, this litter box is built for safety. The sensor system prevents the cleaning mechanism from activating while any cat is inside or nearby, giving you complete peace of mind. The enclosed waste compartment only needs to be emptied every few days depending on usage, making it ideal for busy pet owners, travelers, and anyone who values a cleaner living space.`,
      ],
      highlights: [
        'Automatic waste removal after every use',
        'Sealed odor-control compartment',
        'Safe infrared detection system',
        'Ideal for homes with multiple cats',
        'Quiet operation — won\'t startle pets',
      ],
    };
  }

  if (/bed|mattress|cushion/i.test(n + ' ' + c)) {
    return {
      heading: 'Why This Bed Makes a Difference',
      paragraphs: [
        `A good night's rest isn't just important for humans — it's essential for your dog's health, mood, and longevity. Dogs spend up to 14 hours a day sleeping, and the quality of their sleep surface directly impacts joint health, muscle recovery, and overall well-being. This orthopedic bed is engineered to provide the support active, aging, and recovering dogs need.`,
        `The high-density memory foam core distributes your dog's weight evenly, relieving pressure on hips, elbows, and spine. Unlike flat beds that compress over time, this design maintains its shape and support through years of daily use. The removable, machine-washable cover is made from breathable fabric that stays cool in summer and warm in winter.`,
        `Whether your dog is a senior dealing with arthritis, an active breed recovering from long walks, or a puppy who deserves the best start — this bed delivers measurable comfort from the very first night. Pet owners consistently report improved mobility and energy levels within weeks of switching to supportive sleep surfaces.`,
      ],
      highlights: [
        'Supports joints and pressure points for deeper rest',
        'High-density foam that doesn\'t flatten over time',
        'Machine-washable, breathable cover',
        'Non-slip base for all floor types',
        'Designed with pet comfort as the priority',
      ],
    };
  }

  if (/cat\s*tree|cat\s*condo|scratching/i.test(n + ' ' + c)) {
    return {
      heading: 'Why Cats (and Their Owners) Love This',
      paragraphs: [
        `Indoor cats need vertical space to feel safe, exercise, and express natural behaviors. Without a dedicated climbing and scratching structure, cats often resort to furniture, curtains, and shelves — causing damage and frustration. This cat tree provides everything your cat needs in one sturdy, well-designed unit.`,
        `Multiple platforms at varying heights let cats climb, perch, and survey their territory — all essential behaviors for feline mental health. The integrated scratching posts are wrapped in natural sisal rope, which cats prefer over fabric or carpet. Regular scratching keeps claws healthy and saves your furniture from becoming a substitute.`,
        `Stability is the foundation of this design. A reinforced base and solid construction support cats weighing over 25 pounds without wobbling or tipping, even during enthusiastic play. The cozy enclosed hideaways give nervous or introverted cats a secure retreat, while open platforms satisfy the bold climbers.`,
      ],
      highlights: [
        'Multi-level design for climbing and exercise',
        'Sisal-wrapped scratching posts protect furniture',
        'Supports cats over 25 lbs without wobbling',
        'Enclosed hideaways for shy cats',
        'Easy assembly with included tools',
      ],
    };
  }

  if (/harness|leash|collar/i.test(n + ' ' + c)) {
    return {
      heading: 'Why This Walking Gear Stands Out',
      paragraphs: [
        `Walking your dog should be enjoyable — not a tug-of-war. Traditional collars can put dangerous pressure on a dog's throat and trachea, especially for breeds prone to respiratory issues. This harness distributes pulling force across the chest and shoulders, eliminating choking while giving you better control.`,
        `The ergonomic design features padded straps that prevent rubbing and chafing, even on long walks or hikes. Reflective stitching ensures visibility during early morning or evening outings, adding an important layer of safety. The quick-snap buckle system means you can get your dog geared up and out the door in seconds.`,
        `Whether you're training a new puppy, managing a strong puller, or simply want a more comfortable walk for both of you — this gear is built for real-world daily use. It's adjustable across multiple points to fit a wide range of body shapes and sizes, and the durable materials hold up through rain, mud, and years of adventures.`,
      ],
      highlights: [
        'No-choke chest distribution design',
        'Padded straps prevent rubbing and irritation',
        'Reflective trim for low-light visibility',
        'Quick-snap buckle for easy on/off',
        'Adjustable fit for all body types',
      ],
    };
  }

  if (/stroller/i.test(n + ' ' + c)) {
    return {
      heading: 'Why Pet Owners Love This Stroller',
      paragraphs: [
        `Senior dogs, injured pets, and small breeds deserve to enjoy the outdoors without being limited by their stamina or mobility. A pet stroller gives them access to parks, neighborhoods, and fresh air — without the physical strain. It's not a luxury; for many pets, it's the difference between staying home and staying active.`,
        `This stroller is designed with real-world use in mind. The one-hand fold mechanism means you can collapse it in seconds for car storage or public transit. All-terrain wheels handle pavement, grass, and gravel smoothly, while the built-in suspension system absorbs bumps that could startle or jostle a nervous pet.`,
        `The breathable mesh canopy provides ventilation and visibility so your pet stays calm and comfortable. A rear brake system keeps the stroller secure when parked, and the spacious interior fits pets up to 30 lbs with room to turn around. Whether you are taking a morning walk or running errands, this stroller makes pet ownership more flexible and enjoyable.`,
      ],
      highlights: [
        'One-hand fold for easy storage and transport',
        'All-terrain wheels with suspension',
        'Breathable mesh for airflow and visibility',
        'Rear brake system for safety',
        'Supports pets up to 30 lbs comfortably',
      ],
    };
  }

  if (/carrier|backpack/i.test(n + ' ' + c)) {
    return {
      heading: 'Why This Carrier Is a Travel Essential',
      paragraphs: [
        `Traveling with a pet shouldn't mean choosing between their comfort and your convenience. This carrier is designed to keep your pet safe, ventilated, and calm — whether you're heading to the vet, boarding a plane, or hiking a trail. The expandable design gives your pet extra room when you need it, and collapses flat when you don't.`,
        `Multiple mesh ventilation panels ensure steady airflow from every angle, preventing overheating even in warmer conditions. The padded shoulder straps and waist belt distribute weight evenly, so you can carry your pet hands-free without back strain. Lockable zippers prevent escape attempts during moments of stress.`,
        `Designed to fit under most airline cabin seats, this carrier meets size requirements for the majority of US domestic airlines. The removable, washable inner pad keeps things hygienic between trips, and the built-in safety tether clips to your pet's harness for an extra layer of security during transit.`,
      ],
      highlights: [
        'Expandable design for extra pet room',
        'Multi-point mesh ventilation',
        'Airline cabin compatible dimensions',
        'Padded hands-free shoulder straps',
        'Lockable zippers and internal safety tether',
      ],
    };
  }

  if (/toy|puzzle|feeder/i.test(n + ' ' + c)) {
    return {
      heading: 'Why Interactive Play Matters',
      paragraphs: [
        `Boredom is one of the leading causes of destructive behavior in pets. Dogs that don't get enough mental stimulation often turn to chewing furniture, digging, excessive barking, and other problematic habits. Interactive toys channel that energy into productive problem-solving, keeping your pet engaged and your home intact.`,
        `This toy is designed to challenge your pet at the right level — stimulating without frustrating. The durable construction withstands aggressive chewers and daily use, while the non-toxic, pet-safe materials give you peace of mind. It's more than a toy — it's a tool for better behavior and a stronger bond between you and your pet.`,
        `Regular mental stimulation through puzzle toys has been shown to reduce anxiety, improve eating habits (for slow feeders), and increase overall satisfaction in both dogs and cats. Many veterinarians and animal behaviorists recommend interactive feeding as part of a healthy daily routine.`,
      ],
      highlights: [
        'Channels destructive energy into positive play',
        'Durable build withstands aggressive chewers',
        'Non-toxic, BPA-free materials',
        'Suitable for dogs and cats of all sizes',
      ],
    };
  }

  // Generic fallback
  return {
    heading: 'Why Pet Owners Trust This Product',
    paragraphs: [
      `Choosing the right products for your pet means balancing quality, safety, and everyday practicality. This product is designed specifically for the demands of daily pet life — built with premium materials that hold up over time, while remaining comfortable and safe for your furry companion.`,
      `Every detail is considered with your pet's well-being in mind. From the materials used to the ergonomic design, this product reflects what real pet owners need: something that works reliably, looks good in your home, and genuinely improves your pet's quality of life.`,
      `Backed by our 30-day return policy and responsive customer support, you can try it with complete confidence. We ship to customers across the United States so your pet can enjoy their new favorite thing.`,
    ],
    highlights: [
      'Premium, pet-safe materials throughout',
      'Designed for daily use and durability',
      'US shipping with tracking',
      '30-day return policy',
      'Responsive customer support team',
    ],
  };
}

export function ProductWhyChoose({ productName, category }: Props) {
  const content = generateContent(productName, category);

  return (
    <section className="mt-16 scroll-mt-20" aria-labelledby="why-choose-heading">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Award className="w-5 h-5 text-primary" />
        </div>
        <h2 id="why-choose-heading" className="text-xl md:text-2xl font-display font-bold text-foreground">
          {content.heading}
        </h2>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main content — 2 columns */}
        <div className="lg:col-span-2 space-y-5">
          {content.paragraphs.map((p, i) => (
            <p key={i} className="text-muted-foreground leading-relaxed">
              {p}
            </p>
          ))}
        </div>

        {/* Highlights sidebar */}
        <div className="bg-muted/40 rounded-2xl p-6 h-fit">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Key Highlights
          </h3>
          <ul className="space-y-3">
            {content.highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

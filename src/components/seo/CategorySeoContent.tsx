import { Link } from 'react-router-dom';

interface CategorySeoEntry {
  heading: string;
  content: string;
  links: Array<{ to: string; text: string }>;
}

const CATEGORY_SEO_CONTENT: Record<string, CategorySeoEntry> = {
  'cat-trees-and-condos': {
    heading: 'Cat Trees & Cat Condos for Sale',
    content:
      'Finding the right cat tree or condo depends on your cat\'s size, personality, and your living space. Active climbers thrive on tall, multi-level cat trees with sisal scratching posts — protecting your furniture while satisfying natural climbing instincts. Senior or anxious cats may prefer enclosed cat condos that offer security and warmth. For multi-cat homes, choose trees with multiple platforms and condos at different heights so every cat gets their own territory.\n\nOur collection features cat trees tested for stability on hardwood, tile, and carpet — from budget towers under $100 to premium 6-foot structures for large breeds like Maine Coons and Ragdolls. Every tree uses natural sisal rope (never carpet wrapping) to build healthy scratching habits. Free US shipping on orders over $35.',
    links: [
      { to: '/guides/best-cat-trees-2026', text: 'Best Cat Trees (2026) — Complete Buyer\'s Guide' },
      { to: '/guides/best-cat-trees-small-apartments', text: 'Best Cat Trees for Small Apartments' },
      { to: '/guides/cat-condo-vs-cat-tower', text: 'Cat Condo vs Cat Tower — Which Is Better?' },
    ],
  },
  'orthopedic-calming-dog-beds': {
    heading: 'Orthopedic & Calming Dog Beds',
    content:
      'An orthopedic dog bed isn\'t a luxury — it\'s essential joint protection for senior dogs, large breeds, and pets recovering from surgery. Memory foam distributes weight evenly, relieving pressure on hips, elbows, and spine. Calming beds with raised bolsters create a "nest" effect that reduces anxiety in nervous or rescue dogs.\n\nOur collection includes vet-recommended orthopedic beds tested for durability, waterproof liners for easy cleaning, and anti-anxiety donut beds proven to help dogs settle faster. Whether you have a 10 lb Chihuahua or a 100 lb Great Dane, we have the right support. Free US shipping on orders over $35.',
    links: [
      { to: '/guides/best-dog-bed-2026', text: 'Best Dog Beds (2026) — Complete Buyer\'s Guide' },
      { to: '/guides/best-orthopedic-dog-bed', text: 'Best Orthopedic Dog Beds for Joint Support' },
      { to: '/collections/orthopedic-calming-dog-beds', text: 'Shop All Orthopedic Dog Beds' },
    ],
  },
  'dog-car-travel-safety-seats': {
    heading: 'Dog Car Travel Safety Seats',
    content:
      'An unsecured dog in a moving vehicle is a safety hazard for both your pet and everyone in the car. Dog car seats with crash-tested designs and adjustable harnesses keep your dog safely restrained while providing an elevated view that reduces motion sickness and car anxiety.\n\nOur car seats are engineered for dogs up to 30 lbs, featuring non-slip bases, machine-washable covers, and universal seatbelt compatibility. Perfect for daily vet trips, road adventures, and keeping your dog comfortable on long drives. Free US shipping on orders over $35.',
    links: [
      { to: '/collections/dog-car-travel-safety-seats', text: 'Shop All Dog Car Seats' },
      { to: '/collections/dog-travel-accessories', text: 'Dog Travel Accessories' },
    ],
  },
  'automatic-cat-feeders': {
    heading: 'Automatic Cat Feeders',
    content:
      'Consistent feeding times are critical for your cat\'s digestive health and behavior. Automatic cat feeders eliminate guesswork by dispensing precise portions on a programmable schedule — whether you\'re at work, traveling, or simply want to prevent early-morning wake-up calls.\n\nOur selection includes WiFi-enabled smart feeders with app control, battery-backup models for power outages, and multi-cat feeders with microchip recognition. Every feeder is tested for jam resistance and portion accuracy. Ideal for cats on veterinary diets or weight management programs. Free US shipping on orders over $35.',
    links: [
      { to: '/collections/automatic-cat-feeders', text: 'Shop All Automatic Cat Feeders' },
    ],
  },
  'indestructible-dog-chew-toys': {
    heading: 'Heavy-Duty Indestructible Dog Chew Toys',
    content:
      'If your dog destroys every toy within minutes, you need toys engineered for power chewers. Our heavy-duty collection uses natural rubber, reinforced nylon, and multi-layer construction that withstands even the most aggressive chewing sessions.\n\nBeyond durability, these toys serve a purpose: textured surfaces clean teeth, massage gums, and reduce destructive chewing behavior by providing a proper outlet. All toys are vet-approved, non-toxic, and sized appropriately to prevent choking. Satisfaction guaranteed — if your dog destroys it, we\'ll help you find a tougher option. Free US shipping on orders over $35.',
    links: [
      { to: '/collections/indestructible-dog-chew-toys', text: 'Shop All Indestructible Dog Toys' },
      { to: '/collections/best-interactive-dog-toys', text: 'Best Interactive Dog Toys' },
    ],
  },
  'pet-grooming-vacuum-kits': {
    heading: 'Pet Grooming Vacuum Kits',
    content:
      'Professional pet grooming at home used to mean hair everywhere — on your clothes, furniture, and floor. Grooming vacuum kits solve this by combining clippers, brushes, and de-shedding tools with built-in vacuum suction that captures 99% of loose hair directly into a sealed collection bin.\n\nOur kits feature low-noise motors under 60dB to keep anxious pets calm, multiple attachment heads for different coat types, and easy-clean designs. Perfect for shedding season, long-haired breeds, and pet parents who want salon-quality results without the mess or the $80+ grooming bill. Free US shipping on orders over $35.',
    links: [
      { to: '/collections/pet-grooming-vacuum-kits', text: 'Shop All Grooming Vacuum Kits' },
    ],
  },
};

interface CategorySeoContentProps {
  categorySlug: string;
}

export function CategorySeoContent({ categorySlug }: CategorySeoContentProps) {
  const entry = CATEGORY_SEO_CONTENT[categorySlug];
  if (!entry) return null;

  return (
    <div className="mb-8 max-w-3xl space-y-4">
      <div className="text-muted-foreground leading-relaxed text-sm whitespace-pre-line">
        {entry.content}
      </div>
      <div className="flex flex-wrap gap-3">
        {entry.links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="text-sm font-medium text-primary hover:underline"
          >
            📖 {link.text}
          </Link>
        ))}
      </div>
    </div>
  );
}

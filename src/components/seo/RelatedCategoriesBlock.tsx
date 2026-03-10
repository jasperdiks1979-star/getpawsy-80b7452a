import { Link } from 'react-router-dom';
import { ArrowRight, Grid3X3 } from 'lucide-react';

interface RelatedCategory {
  slug: string;
  label: string;
  description: string;
}

// Define related category blocks per parent niche
// Expanded to cover dog + cat money pages with diversified anchor text
const RELATED_CATEGORIES: Record<string, RelatedCategory[]> = {
  // ── Cat Condo Cluster ──
  'cat-condos': [
    { slug: 'best-cat-trees-for-small-apartments', label: 'Cat Trees for Small Spaces', description: 'Open-platform climbing towers for active cats' },
    { slug: 'best-cat-scratching-posts', label: 'Cat Scratching Posts', description: 'Standalone sisal posts & boards' },
    { slug: 'wall-mounted-cat-furniture', label: 'Wall-Mounted Cat Furniture', description: 'Shelves & climbing steps for vertical play' },
    { slug: 'best-cat-beds', label: 'Cozy Cat Beds', description: 'Comfortable beds for napping & relaxing' },
    { slug: 'indoor-cat-enrichment', label: 'Indoor Cat Enrichment', description: 'Toys, tunnels & activity centers' },
  ],
  'small-cat-condos': [
    { slug: 'cat-condos', label: 'All Cat Condos', description: 'Browse the full cat condo collection' },
    { slug: 'cat-tree-small-apartment', label: 'Apartment Cat Trees', description: 'Space-saving cat trees' },
    { slug: 'modern-cat-condos', label: 'Modern Cat Condos', description: 'Minimalist designs for small spaces' },
    { slug: 'best-cat-beds', label: 'Cat Beds', description: 'Compact beds for kittens & small cats' },
  ],
  'modern-cat-condos': [
    { slug: 'cat-condos', label: 'All Cat Condos', description: 'Browse the full collection' },
    { slug: 'luxury-cat-condos', label: 'Luxury Cat Condos', description: 'Premium designer furniture' },
    { slug: 'wooden-cat-condos', label: 'Wooden Cat Condos', description: 'Natural hardwood designs' },
    { slug: 'wall-mounted-cat-furniture', label: 'Wall-Mounted Cat Furniture', description: 'Modern wall-mounted shelves' },
  ],
  'cat-condos-for-large-cats': [
    { slug: 'cat-condos', label: 'All Cat Condos', description: 'Browse the full collection' },
    { slug: 'cat-tree-for-large-cats', label: 'Cat Trees for Large Cats', description: 'Heavy-duty climbing trees' },
    { slug: 'multi-level-cat-condos', label: 'Multi-Level Cat Condos', description: 'Tall towers with multiple tiers' },
    { slug: 'best-cat-scratching-posts', label: 'Sturdy Scratching Posts', description: 'Built for big cats' },
  ],
  'multi-level-cat-condos': [
    { slug: 'cat-condos', label: 'All Cat Condos', description: 'Browse the full collection' },
    { slug: 'cat-condos-for-large-cats', label: 'Condos for Large Cats', description: 'Extra-sturdy for big breeds' },
    { slug: 'multi-cat-condos', label: 'Multi-Cat Condos', description: 'Separate spaces for every cat' },
    { slug: 'best-cat-trees-for-small-apartments', label: 'Compact Cat Trees', description: 'Open-platform alternatives' },
  ],
  'wooden-cat-condos': [
    { slug: 'cat-condos', label: 'All Cat Condos', description: 'Browse the full collection' },
    { slug: 'luxury-cat-condos', label: 'Luxury Cat Condos', description: 'Premium designer options' },
    { slug: 'modern-cat-condos', label: 'Modern Cat Condos', description: 'Minimalist contemporary styles' },
    { slug: 'best-cat-scratching-posts', label: 'Natural Scratching Posts', description: 'Wood & sisal posts' },
  ],
  'luxury-cat-condos': [
    { slug: 'cat-condos', label: 'All Cat Condos', description: 'Browse the full collection' },
    { slug: 'wooden-cat-condos', label: 'Wooden Cat Condos', description: 'Natural hardwood designs' },
    { slug: 'modern-cat-condos', label: 'Modern Cat Condos', description: 'Clean-line contemporary styles' },
    { slug: 'luxury-cat-towers', label: 'Luxury Cat Towers', description: 'Premium open-platform towers' },
  ],
  'large-cat-condos': [
    { slug: 'cat-condos', label: 'All Cat Condos', description: 'Browse the full collection' },
    { slug: 'cat-condos-for-large-cats', label: 'Condos for Large Cats', description: 'Rated for 20+ lb breeds' },
    { slug: 'multi-level-cat-condos', label: 'Multi-Level Condos', description: 'Tall towers for big climbers' },
    { slug: 'cat-tree-for-large-cats', label: 'Heavy-Duty Cat Trees', description: 'Extra-strong platforms' },
  ],

  // ── Dog Bed Cluster (money pages) ──
  'orthopedic-calming-dog-beds': [
    { slug: 'memory-foam-dog-beds', label: 'Memory Foam Dog Beds', description: 'Premium pressure-relieving beds' },
    { slug: 'waterproof-dog-beds', label: 'Waterproof Dog Beds', description: 'Easy-clean water-resistant options' },
    { slug: 'best-dog-beds-for-large-dogs', label: 'Large Dog Beds', description: 'Extra-large beds for big breeds' },
    { slug: 'dog-beds-for-senior-dogs', label: 'Senior Dog Beds', description: 'Joint-support beds for older pups' },
    { slug: 'dogs', label: 'All Dog Products at GetPawsy', description: 'Browse the full dog collection' },
  ],
  'memory-foam-dog-beds': [
    { slug: 'orthopedic-calming-dog-beds', label: 'Orthopedic & Calming Beds', description: 'Anxiety-reducing bed options' },
    { slug: 'best-dog-beds-for-large-dogs', label: 'Beds for Large Dogs', description: 'Extra-large memory foam beds' },
    { slug: 'waterproof-dog-beds', label: 'Waterproof Options', description: 'Water-resistant memory foam beds' },
    { slug: 'dogs', label: 'Explore Dog Products', description: 'Browse our full range' },
  ],
  'waterproof-dog-beds': [
    { slug: 'orthopedic-calming-dog-beds', label: 'Orthopedic Dog Beds', description: 'Joint-support bed options' },
    { slug: 'memory-foam-dog-beds', label: 'Memory Foam Beds', description: 'Pressure-relieving comfort' },
    { slug: 'best-dog-beds-for-large-dogs', label: 'Large Dog Bed Picks', description: 'Waterproof beds for big breeds' },
    { slug: 'dogs', label: 'GetPawsy Dog Collection', description: 'Full dog product range' },
  ],

  // ── Cat Top-Level ──
  'cats': [
    { slug: 'cat-condos', label: 'Cat Condos & Hideaways', description: 'Enclosed condos for privacy-loving cats' },
    { slug: 'best-cat-toys-for-indoor-cats', label: 'Indoor Cat Toys', description: 'Interactive toys for indoor cats' },
    { slug: 'best-cat-litter-boxes', label: 'Top Litter Boxes', description: 'Self-cleaning & covered options' },
    { slug: 'best-cat-carriers', label: 'Cat Carriers for Travel', description: 'Airline-approved carriers' },
    { slug: 'automatic-cat-feeders', label: 'Automatic Cat Feeders', description: 'Timed & smart feeding solutions' },
  ],

  // ── Dog Top-Level ──
  'dogs': [
    { slug: 'orthopedic-calming-dog-beds', label: 'Orthopedic Dog Beds', description: 'Joint support for all breeds' },
    { slug: 'best-interactive-dog-toys', label: 'Interactive Dog Toys', description: 'Puzzle toys & enrichment' },
    { slug: 'best-dog-harnesses', label: 'Dog Harnesses & Leashes', description: 'No-pull walking gear' },
    { slug: 'best-dog-grooming-kits', label: 'Dog Grooming Kits', description: 'At-home grooming essentials' },
    { slug: 'dog-enrichment-toys', label: 'Enrichment & Training Toys', description: 'Mental stimulation picks' },
  ],

  // ── Slow Feeder Cluster ──
  'best-slow-feeder-dog-bowls': [
    { slug: 'best-interactive-dog-toys', label: 'Interactive Dog Toys', description: 'Puzzle toys for mental stimulation' },
    { slug: 'dog-training-tools', label: 'Dog Training Tools', description: 'Clickers, treat pouches & aids' },
    { slug: 'orthopedic-calming-dog-beds', label: 'Orthopedic Dog Beds', description: 'Comfort & recovery essentials' },
  ],

  // ── Cat Litter Box Cluster ──
  'best-cat-litter-boxes': [
    { slug: 'cat-trees-and-condos', label: 'Cat Trees & Condos', description: 'Climbing furniture for indoor cats' },
    { slug: 'best-interactive-cat-toys', label: 'Interactive Cat Toys', description: 'Electronic & feather toys' },
    { slug: 'best-cat-carriers', label: 'Cat Carriers', description: 'Airline-approved travel carriers' },
  ],

  // ── Cat Trees Cluster ──
  'cat-trees-and-condos': [
    { slug: 'best-cat-scratching-posts', label: 'Scratching Posts', description: 'Sisal & cardboard scratching posts' },
    { slug: 'best-interactive-cat-toys', label: 'Cat Toys', description: 'Interactive enrichment toys' },
    { slug: 'best-cat-litter-boxes', label: 'Litter Boxes', description: 'Self-cleaning & covered options' },
  ],

  // ── Dog Training Cluster ──
  'dog-training-tools': [
    { slug: 'best-dog-harnesses', label: 'Dog Harnesses', description: 'No-pull harnesses for training walks' },
    { slug: 'best-interactive-dog-toys', label: 'Dog Toys', description: 'Puzzle & enrichment toys' },
    { slug: 'best-slow-feeder-dog-bowls', label: 'Slow Feeder Bowls', description: 'Anti-gulp bowls for healthy eating' },
  ],

  // ── Dog Travel Cluster ──
  'dog-travel-accessories': [
    { slug: 'best-dog-car-seats', label: 'Dog Car Seats', description: 'Crash-tested car seats & boosters' },
    { slug: 'best-pet-strollers', label: 'Pet Strollers', description: 'Heavy-duty strollers for dogs' },
    { slug: 'best-dog-harnesses', label: 'Dog Harnesses', description: 'Travel-safe no-pull harnesses' },
  ],

  // ── Pet Stroller Cluster ──
  'best-pet-strollers': [
    { slug: 'dog-travel-accessories', label: 'Dog Travel Gear', description: 'Portable crates, water bottles & more' },
    { slug: 'best-dog-car-seats', label: 'Dog Car Seats', description: 'Safety-tested car seat options' },
    { slug: 'best-cat-carriers', label: 'Cat Carriers', description: 'Airline-approved cat travel carriers' },
  ],

  // ── Dog Toys Cluster ──
  'best-interactive-dog-toys': [
    { slug: 'dog-training-tools', label: 'Training Tools', description: 'Clickers, treat bags & correction aids' },
    { slug: 'best-slow-feeder-dog-bowls', label: 'Slow Feeder Bowls', description: 'Puzzle feeders for mealtime enrichment' },
    { slug: 'orthopedic-calming-dog-beds', label: 'Dog Beds', description: 'Comfort beds for post-play rest' },
  ],

  // ── Cat Toys Cluster ──
  'best-interactive-cat-toys': [
    { slug: 'cat-trees-and-condos', label: 'Cat Trees', description: 'Climbing furniture for active cats' },
    { slug: 'best-cat-scratching-posts', label: 'Scratching Posts', description: 'Sisal posts for nail care' },
    { slug: 'best-cat-litter-boxes', label: 'Litter Boxes', description: 'Self-cleaning & covered options' },
  ],

  // ── Dog Harnesses Cluster ──
  'best-dog-harnesses': [
    { slug: 'dog-training-tools', label: 'Training Accessories', description: 'Clickers, pouches & correction aids' },
    { slug: 'dog-travel-accessories', label: 'Dog Travel Gear', description: 'Travel-safe harnesses & car seats' },
    { slug: 'best-interactive-dog-toys', label: 'Dog Toys', description: 'Interactive enrichment toys' },
  ],

  // ── Dog Car Seats Cluster ──
  'best-dog-car-seats': [
    { slug: 'dog-travel-accessories', label: 'Dog Travel Accessories', description: 'Complete travel gear collection' },
    { slug: 'best-pet-strollers', label: 'Pet Strollers', description: 'Outdoor mobility for pets' },
    { slug: 'best-dog-harnesses', label: 'Dog Harnesses', description: 'Travel-rated no-pull harnesses' },
  ],

  // ── Cat Carriers Cluster ──
  'best-cat-carriers': [
    { slug: 'best-interactive-cat-toys', label: 'Cat Toys', description: 'In-carrier enrichment toys' },
    { slug: 'cat-trees-and-condos', label: 'Cat Trees', description: 'Home base climbing furniture' },
    { slug: 'best-cat-litter-boxes', label: 'Litter Boxes', description: 'Travel-friendly litter solutions' },
  ],

  // ── Cat Scratching Posts ──
  'best-cat-scratching-posts': [
    { slug: 'cat-trees-and-condos', label: 'Cat Trees & Condos', description: 'Climbing + scratching combos' },
    { slug: 'best-interactive-cat-toys', label: 'Cat Toys', description: 'Enrichment toys for indoor cats' },
    { slug: 'best-cat-beds', label: 'Cat Beds', description: 'Cozy post-play resting spots' },
  ],
};

interface RelatedCategoriesBlockProps {
  collectionSlug: string;
}

export function RelatedCategoriesBlock({ collectionSlug }: RelatedCategoriesBlockProps) {
  const categories = RELATED_CATEGORIES[collectionSlug];
  if (!categories || categories.length === 0) return null;

  return (
    <section className="mb-12">
      <div className="flex items-center gap-2 mb-4">
        <Grid3X3 className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-semibold">Related Categories</h2>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {categories.map((cat) => (
          <Link
            key={cat.slug}
            to={`/collections/${cat.slug}`}
            className="group flex items-center gap-3 bg-card border rounded-xl p-4 hover:border-primary/30 hover:shadow-sm transition-all"
          >
            <div className="min-w-0">
              <h3 className="font-medium text-sm group-hover:text-primary transition-colors">
                {cat.label}
              </h3>
              <p className="text-xs text-muted-foreground">{cat.description}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary flex-shrink-0 ml-auto transition-colors" />
          </Link>
        ))}
      </div>
    </section>
  );
}

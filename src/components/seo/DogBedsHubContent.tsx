import { Link } from 'react-router-dom';
import { ArrowRight, Heart, Thermometer, Droplets, Bed, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/**
 * DogBedsHubContent — SEO authority content block for /collections/dog-beds
 * Subcategory blocks, guide links, visible intro, and internal linking.
 */

const SUBCATEGORIES = [
  {
    icon: <Heart className="w-5 h-5 text-primary" />,
    title: 'Orthopedic Dog Beds',
    description: 'Memory foam support for senior dogs, large breeds, and pets with joint issues like hip dysplasia or arthritis. Distributes weight evenly to relieve pressure points.',
    keywords: ['orthopedic', 'memory foam', 'joint support'],
    guideLink: '/guides/best-orthopedic-dog-beds-for-large-dogs',
    guideLabel: 'Orthopedic Bed Guide →',
  },
  {
    icon: <Bed className="w-5 h-5 text-primary" />,
    title: 'Large Breed Dog Beds',
    description: 'Extra-large beds rated for 80–120+ lbs with reinforced stitching. Sized for Labs, Golden Retrievers, German Shepherds, and Great Danes who need room to stretch.',
    keywords: ['large dog bed', 'XL', 'heavy duty'],
    guideLink: '/guides/best-orthopedic-dog-beds-for-large-dogs',
    guideLabel: 'Large Breed Guide →',
  },
  {
    icon: <Thermometer className="w-5 h-5 text-primary" />,
    title: 'Cooling & Elevated Dog Beds',
    description: 'Breathable mesh cots and gel-infused foam beds that keep dogs cool in warm weather. Ideal for outdoor use, porches, and dogs that overheat easily.',
    keywords: ['cooling', 'elevated', 'outdoor'],
    guideLink: '/guides/elevated-dog-beds-canopy-outdoor-comfort-guide',
    guideLabel: 'Elevated Bed Guide →',
  },
  {
    icon: <Droplets className="w-5 h-5 text-primary" />,
    title: 'Washable & Waterproof Dog Beds',
    description: 'Machine-washable covers with waterproof liners — essential for puppies in training, senior dogs, and messy eaters. Keeps bedding fresh and hygienic.',
    keywords: ['washable', 'waterproof', 'easy clean'],
    guideLink: '/guides/washable-orthopedic-dog-bed-buying-guide',
    guideLabel: 'Washable Bed Guide →',
  },
];

const EXPERT_GUIDES = [
  { title: 'Best Dog Beds 2026 — Complete Buying Guide', slug: 'best-dog-beds-2026', featured: true },
  { title: 'Best Orthopedic Dog Beds for Large Dogs (2026)', slug: 'best-orthopedic-dog-beds-for-large-dogs' },
  { title: 'Orthopedic Dog Beds for Arthritis: What Vets Recommend', slug: 'orthopedic-dog-beds-for-arthritis' },
  { title: 'Memory Foam Dog Beds for Senior Dogs', slug: 'memory-foam-dog-beds-for-senior-dogs' },
  { title: 'How to Choose the Perfect Dog Bed', slug: 'how-to-choose-perfect-dog-bed-guide' },
  { title: 'Washable Orthopedic Dog Beds: What to Look For', slug: 'washable-orthopedic-dog-bed-buying-guide' },
  { title: 'Elevated Dog Beds with Canopy: Outdoor Comfort Guide', slug: 'elevated-dog-beds-canopy-outdoor-comfort-guide' },
];

export function DogBedsHubContent() {
  return (
    <div className="max-w-4xl mb-16 space-y-12">
      {/* Updated badge */}
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs">Updated April 2026</Badge>
        <Badge variant="outline" className="text-xs">Vet-Informed Picks</Badge>
      </div>

      {/* Visible SEO intro — 200+ words, benefit-driven, US-focused */}
      <section id="dog-beds-intro">
        <h2 className="text-2xl font-display font-bold mb-4">
          Finding the Right Dog Bed: Why It Matters for Your Dog's Health
        </h2>
        <div className="text-muted-foreground leading-relaxed space-y-4">
          <p>
            Your dog spends 12 to 14 hours sleeping every day — that's more than half their life on a single surface. The right dog bed isn't a luxury; it's a health investment. Orthopedic memory foam beds distribute weight evenly across hips, elbows, and spine, reducing morning stiffness and joint pain that affects large breeds and senior dogs in particular. For active dogs, a supportive bed accelerates muscle recovery after hikes, runs, and play sessions.
          </p>
          <p>
            We curate only dog beds that meet real-world standards: removable machine-washable covers for hygiene, non-slip bases for hardwood and tile floors, and weight ratings that actually match breeds like Labrador Retrievers, German Shepherds, Golden Retrievers, and Great Danes. Every bed ships to all 50 US states with free shipping on orders over $35 and includes our 30-day satisfaction guarantee.
          </p>
          <p>
            Whether you need an <strong className="text-foreground">orthopedic bed for a senior dog with arthritis</strong>, a <strong className="text-foreground">cooling elevated cot for summer</strong>, or a <strong className="text-foreground">waterproof bed for a puppy in training</strong> — we've tested and selected options that deliver real comfort without overpaying. Browse our dog bed types below to find the perfect fit for your dog's size, sleep style, and health needs.
          </p>
        </div>
      </section>

      {/* Subcategory blocks */}
      <section id="dog-bed-types">
        <h2 className="text-2xl font-display font-bold mb-6">
          Shop Dog Beds by Type
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {SUBCATEGORIES.map((sub) => (
            <div key={sub.title} className="bg-card border rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                {sub.icon}
                <h3 className="font-semibold text-base">{sub.title}</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {sub.description}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {sub.keywords.map((kw) => (
                  <Badge key={kw} variant="outline" className="text-[10px]">{kw}</Badge>
                ))}
              </div>
              <Link
                to={sub.guideLink}
                className="inline-flex items-center gap-1 text-primary text-sm font-medium hover:gap-2 transition-all"
              >
                {sub.guideLabel}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Quick decision helper */}
      <section id="which-bed">
        <h2 className="text-2xl font-display font-bold mb-4">
          Which Dog Bed Is Right for Your Dog?
        </h2>
        <div className="bg-muted/30 rounded-xl p-6 space-y-3">
          {[
            { need: 'Senior dog with joint pain or arthritis', pick: 'Orthopedic memory foam bed (4"+ thickness)' },
            { need: 'Large breed (50+ lbs) that sprawls', pick: 'XL rectangular bed with bolster edges' },
            { need: 'Dog that runs hot or lives in warm climate', pick: 'Elevated mesh cot or gel-infused cooling bed' },
            { need: 'Puppy in house training', pick: 'Waterproof bed with removable washable cover' },
            { need: 'Anxious or rescue dog', pick: 'Calming donut bed with raised bolsters' },
            { need: 'Car travel or crate use', pick: 'Travel pad or crate-fit mat with non-slip base' },
          ].map((item) => (
            <div key={item.need} className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">{item.need}</strong> → {item.pick}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Expert guides links */}
      <section id="dog-bed-guides">
        <h2 className="text-xl font-display font-bold mb-4">
          Expert Dog Bed Guides
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {EXPERT_GUIDES.map((guide) => (
            <Link
              key={guide.slug}
              to={`/guides/${guide.slug}`}
              className="group flex items-center gap-2 p-3 rounded-lg border hover:border-primary/40 hover:bg-primary/5 transition-all"
            >
              <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0 group-hover:translate-x-0.5 transition-transform" />
              <span className="text-sm font-medium group-hover:text-primary transition-colors">
                {guide.title}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

export default DogBedsHubContent;

import { Link } from 'react-router-dom';
import { BookOpen, ArrowRight } from 'lucide-react';

interface GuideLink {
  slug: string;
  title: string;
  excerpt: string;
}

// Map collection slugs to relevant expert guides
const COLLECTION_GUIDE_MAP: Record<string, GuideLink[]> = {
  'best-orthopedic-dog-beds': [
    {
      slug: 'are-orthopedic-dog-beds-worth-it',
      title: 'Are Orthopedic Dog Beds Worth the Investment?',
      excerpt: 'Vet-backed cost analysis and foam science to help you decide.',
    },
    {
      slug: 'best-dog-bed-materials-explained',
      title: 'Dog Bed Materials Guide: Foam, Fiber & Fabric',
      excerpt: 'Understand memory foam density, thickness, and cover durability.',
    },
  ],
  'memory-foam-dog-beds': [
    {
      slug: 'memory-foam-vs-standard-dog-bed',
      title: 'Memory Foam vs Standard Dog Bed – Which Lasts?',
      excerpt: 'Real cost-per-year comparison and durability testing results.',
    },
    {
      slug: 'are-orthopedic-dog-beds-worth-it',
      title: 'Is an Orthopedic Bed Worth the Extra Cost?',
      excerpt: 'Vet insights and 3-year cost analysis for memory foam beds.',
    },
  ],
  'waterproof-dog-beds': [
    {
      slug: 'best-dog-bed-materials-explained',
      title: 'Waterproof vs Water-Resistant: Materials Explained',
      excerpt: 'Cover fabric types ranked by durability and washability.',
    },
    {
      slug: 'how-to-wash-a-dog-bed-properly',
      title: 'How to Clean & Maintain a Waterproof Dog Bed',
      excerpt: 'Step-by-step care instructions to extend bed lifespan.',
    },
  ],
  'dog-beds-for-anxiety': [
    {
      slug: 'dog-bed-for-anxiety-do-they-work',
      title: 'Do Calming Dog Beds Actually Work? The Science',
      excerpt: 'Deep pressure stimulation research and real owner results.',
    },
    {
      slug: 'how-to-choose-the-right-dog-bed-size',
      title: 'Sizing a Calming Bed: Why It Matters More',
      excerpt: 'Calming beds need snug sizing — here\'s how to measure.',
    },
  ],
  'best-dog-beds-for-large-dogs': [
    {
      slug: 'how-to-choose-the-right-dog-bed-size',
      title: 'Dog Bed Size Chart for Large & Giant Breeds',
      excerpt: 'Exact measurements for Labs, Shepherds, Danes and more.',
    },
    {
      slug: 'are-orthopedic-dog-beds-worth-it',
      title: 'Why Large Dogs Need Orthopedic Support',
      excerpt: 'Foam density requirements for 50+ lb breeds explained.',
    },
  ],
  'dog-beds': [
    {
      slug: 'how-to-choose-the-right-dog-bed-size',
      title: 'Complete Dog Bed Sizing Guide by Breed',
      excerpt: 'Exact measurements and the #1 sizing mistake to avoid.',
    },
    {
      slug: 'best-dog-bed-materials-explained',
      title: 'Dog Bed Materials: What Lasts Longest?',
      excerpt: 'Foam, fiber, and fabric types compared for durability.',
    },
  ],
};

interface CollectionExpertGuidesProps {
  collectionSlug: string;
}

export function CollectionExpertGuides({ collectionSlug }: CollectionExpertGuidesProps) {
  const guides = COLLECTION_GUIDE_MAP[collectionSlug];
  if (!guides || guides.length === 0) return null;

  return (
    <section className="mb-12">
      <div className="flex items-center gap-2 mb-5">
        <BookOpen className="w-5 h-5 text-primary" />
        <h2 className="text-2xl font-semibold">Expert Guides</h2>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {guides.map((guide) => (
          <Link
            key={guide.slug}
            to={`/guides/${guide.slug}`}
            className="group block bg-card border rounded-xl p-5 hover:border-primary/30 hover:shadow-md transition-all"
          >
            <h3 className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors">
              {guide.title}
            </h3>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {guide.excerpt}
            </p>
            <span className="inline-flex items-center gap-1 text-primary text-xs mt-2">
              Read Guide <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

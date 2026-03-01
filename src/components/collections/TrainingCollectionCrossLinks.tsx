/**
 * Training Collection Cross-Links — bidirectional internal linking
 * between the 5 core dog training collections.
 * Renders as a compact "Related Training Collections" strip.
 */
import { Link } from 'react-router-dom';

const TRAINING_COLLECTIONS = [
  {
    slug: 'dog-potty-training',
    name: 'Potty Training',
    icon: '🏠',
    desc: 'Pads, mats & housebreaking solutions',
  },
  {
    slug: 'dog-leash-control',
    name: 'Leash & Control',
    icon: '🦮',
    desc: 'No-pull harnesses & training leashes',
  },
  {
    slug: 'dog-anti-bark',
    name: 'Anti-Bark',
    icon: '🔇',
    desc: 'Humane bark control devices & calming aids',
  },
  {
    slug: 'puppy-essentials',
    name: 'Puppy Essentials',
    icon: '🐶',
    desc: 'Complete starter kits for new puppies',
  },
  {
    slug: 'dog-training-accessories',
    name: 'Training Tools',
    icon: '🎯',
    desc: 'Clickers, treat pouches & agility gear',
  },
];

interface Props {
  /** Current collection slug — will be excluded from the links */
  currentSlug: string;
}

export function TrainingCollectionCrossLinks({ currentSlug }: Props) {
  const siblings = TRAINING_COLLECTIONS.filter(c => c.slug !== currentSlug);
  if (siblings.length === 0) return null;

  return (
    <div className="mt-8 mb-4 p-5 bg-muted/30 rounded-xl border border-border">
      <h3 className="text-sm font-semibold text-foreground mb-3">
        Related Training Collections
      </h3>
      <div className="flex flex-wrap gap-3">
        {siblings.map((c) => (
          <Link
            key={c.slug}
            to={`/collections/${c.slug}`}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card hover:border-primary/40 hover:shadow-sm transition-all text-sm"
          >
            <span>{c.icon}</span>
            <div>
              <span className="font-medium text-foreground">{c.name}</span>
              <span className="hidden sm:inline text-muted-foreground ml-1.5">— {c.desc}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

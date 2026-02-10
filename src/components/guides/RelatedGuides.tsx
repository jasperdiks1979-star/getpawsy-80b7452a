import { Link } from 'react-router-dom';
import { BookOpen, ArrowRight } from 'lucide-react';
import type { GuideMeta } from '@/types/guide';

interface RelatedGuidesProps {
  guides: GuideMeta[];
  title?: string;
}

export function RelatedGuides({ guides, title = 'Helpful Guides' }: RelatedGuidesProps) {
  if (guides.length === 0) return null;

  return (
    <section className="mt-16">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl md:text-2xl font-display font-bold text-foreground">
            {title}
          </h2>
          <p className="text-sm text-muted-foreground">
            Expert advice related to this product
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {guides.map((guide) => (
          <Link
            key={guide.slug}
            to={`/guides/${guide.slug}`}
            className="group block rounded-xl border border-border bg-card p-5 hover:border-primary/30 hover:shadow-md transition-all"
          >
            <span className="text-xs text-primary font-medium">{guide.category}</span>
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors mt-1 mb-2 line-clamp-2">
              {guide.title}
            </h3>
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{guide.excerpt}</p>
            <span className="flex items-center gap-1 text-sm font-medium text-primary">
              Read Guide <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

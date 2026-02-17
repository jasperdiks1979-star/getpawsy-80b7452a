import { Link } from 'react-router-dom';
import { BookOpen, ArrowRight, Sparkles } from 'lucide-react';
import type { GuideMeta } from '@/types/guide';

interface RelatedGuidesProps {
  guides: GuideMeta[];
  title?: string;
}

export function RelatedGuides({ guides, title = 'Helpful Guides' }: RelatedGuidesProps) {
  if (guides.length === 0) return null;

  return (
    <section className="mt-16">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-sm">
          <BookOpen className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl md:text-2xl font-display font-bold text-foreground tracking-tight">
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
            className="group relative block rounded-2xl border border-border bg-card p-5 hover:border-primary/30 hover:shadow-soft hover:-translate-y-1 transition-all duration-300"
          >
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-primary mb-3">
              <Sparkles className="w-3 h-3" />
              {guide.category}
            </span>

            <h3 className="font-display font-bold text-foreground group-hover:text-primary transition-colors leading-snug mb-2 line-clamp-2">
              {guide.title}
            </h3>
            <p className="text-sm text-muted-foreground line-clamp-2 mb-4 leading-relaxed">{guide.excerpt}</p>
            
            <span className="flex items-center gap-1.5 text-sm font-semibold text-primary group-hover:gap-2.5 transition-all duration-300">
              Read Guide <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

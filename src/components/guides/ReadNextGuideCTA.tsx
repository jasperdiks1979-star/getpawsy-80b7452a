import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { GuideMeta } from '@/types/guide';

interface ReadNextGuideCTAProps {
  guide: GuideMeta;
  className?: string;
}

/**
 * End-of-page "Read Next Guide" CTA — increases session depth and dwell time.
 * Single prominent card linking to the most relevant next guide.
 */
export function ReadNextGuideCTA({ guide, className = '' }: ReadNextGuideCTAProps) {
  return (
    <section className={`${className}`}>
      <Link
        to={`/guides/${guide.slug}`}
        className="group block rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/[0.06] via-card to-card p-6 hover:border-primary/40 hover:shadow-md transition-all duration-300"
      >
        <span className="text-xs font-bold uppercase tracking-widest text-primary mb-2 block">
          Read Next
        </span>
        <h3 className="text-lg md:text-xl font-display font-bold text-foreground group-hover:text-primary transition-colors leading-snug mb-2">
          {guide.title}
        </h3>
        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed mb-3">
          {guide.excerpt}
        </p>
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary group-hover:gap-3 transition-all duration-300">
          Continue Reading <ArrowRight className="w-4 h-4" />
        </span>
      </Link>
    </section>
  );
}

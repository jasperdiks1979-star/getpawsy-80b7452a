import { Link } from 'react-router-dom';
import { BookOpen, ArrowRight } from 'lucide-react';
import type { GuideMeta } from '@/types/guide';

interface PeopleAlsoReadProps {
  guides: GuideMeta[];
  className?: string;
}

/**
 * "People Also Read" block — increases session depth and dwell time.
 * Renders 3–6 contextual guide links for crawlability.
 */
export function PeopleAlsoRead({ guides, className = '' }: PeopleAlsoReadProps) {
  if (guides.length < 2) return null;
  const display = guides.slice(0, 6);

  return (
    <section className={`rounded-2xl border border-border bg-card p-5 md:p-6 shadow-sm ${className}`}>
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <BookOpen className="w-4 h-4 text-primary" />
        </div>
        <h2 className="text-lg font-display font-bold text-foreground">People Also Read</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {display.map((g) => (
          <Link
            key={g.slug}
            to={`/guides/${g.slug}`}
            className="group flex items-start gap-3 rounded-xl border border-border/60 bg-background p-3.5 hover:border-primary/30 hover:shadow-sm transition-all"
          >
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                {g.title}
              </h3>
              <span className="flex items-center gap-1 text-xs text-primary font-medium mt-1.5 group-hover:gap-2 transition-all">
                Read more <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

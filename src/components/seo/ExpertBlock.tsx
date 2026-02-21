import { Shield, CalendarDays } from 'lucide-react';

interface ExpertBlockProps {
  categoryName: string;
  lastUpdated?: string;
}

/** E-E-A-T expert review block for priority category pages */
export function ExpertBlock({ categoryName, lastUpdated }: ExpertBlockProps) {
  const dateStr = lastUpdated || new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <aside className="mb-10 border border-primary/20 bg-primary/5 rounded-2xl p-6 md:p-8 max-w-4xl">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Shield className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
            Reviewed by GetPawsy Pet Research Team
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-normal">
              <CalendarDays className="w-3 h-3" />
              Updated {dateStr}
            </span>
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Our team evaluates every {categoryName.toLowerCase()} recommendation based on real customer feedback, 
            return rate data, and material safety standards. We only feature products that meet our quality 
            benchmarks for US pet owners — no paid placements, no sponsored rankings.
          </p>
        </div>
      </div>
    </aside>
  );
}

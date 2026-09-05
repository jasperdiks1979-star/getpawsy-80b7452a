/**
 * PdpVerifiedProblemSolution — compact problem → solution section driven
 * entirely by per-SKU verified override data (`problemSolution`).
 *
 * Renders nothing when a product has no verified rows, so no other PDP is
 * affected. No generated claims, no performance promises.
 */
import type { PdpProblemSolutionRow } from '@/config/product-content-overrides';

interface Props {
  rows?: PdpProblemSolutionRow[];
  className?: string;
}

export function PdpVerifiedProblemSolution({ rows, className = '' }: Props) {
  if (!rows || rows.length === 0) return null;

  return (
    <section
      aria-labelledby="pdp-problem-solution"
      className={`mt-8 rounded-2xl border border-border/50 bg-muted/20 p-5 md:p-7 ${className}`}
    >
      <h2
        id="pdp-problem-solution"
        className="text-lg md:text-2xl font-display font-bold text-foreground mb-4"
      >
        What it solves
      </h2>
      <ul className="grid gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <li key={row.problem} className="rounded-xl bg-card p-4 border border-border/40">
            <p className="text-sm font-semibold text-foreground/80 mb-1.5">{row.problem}</p>
            <p className="text-sm text-muted-foreground leading-relaxed">{row.solution}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default PdpVerifiedProblemSolution;

import { ArrowRight, X, Check } from 'lucide-react';

export interface VerifiedComparisonRow {
  feature: string;
  ours: boolean;
  generic: boolean;
}

interface ProductVsAlternativesProps {
  productName: string;
  category: string;
  /**
   * Verified comparison rows (from product evidence or an explicit
   * per-product override). Without them nothing renders: a category guess
   * must never be shown as a ticked product feature.
   */
  verifiedRows?: VerifiedComparisonRow[] | null;
  heading?: string;
}

/**
 * "This product vs generic" table. Previously every product received a
 * category template (memory foam, BPA-free, chew-proof, 25+ lb support…)
 * ticked as fact without any evidence — and keyword matching let e.g. a dog
 * ramp inherit bed features. It now renders only verified rows.
 */
export function ProductVsAlternatives({ verifiedRows, heading }: ProductVsAlternativesProps) {
  if (!verifiedRows || verifiedRows.length === 0) return null;

  return (
    <section className="mt-12">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <ArrowRight className="w-4.5 h-4.5 text-primary" />
        </div>
        <h2 className="text-xl md:text-2xl font-display font-bold text-foreground">
          {heading || 'How This Compares'}
        </h2>
      </div>

      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-sm border-collapse min-w-[400px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 pr-4 font-medium text-muted-foreground">Feature</th>
              <th className="text-center py-3 px-4 font-semibold text-primary">This Product</th>
              <th className="text-center py-3 pl-4 font-medium text-muted-foreground">Generic</th>
            </tr>
          </thead>
          <tbody>
            {verifiedRows.map((row, idx) => (
              <tr key={idx} className="border-b border-border/50 last:border-0">
                <td className="py-3 pr-4 text-foreground">{row.feature}</td>
                <td className="py-3 px-4 text-center">
                  {row.ours ? (
                    <Check className="w-4.5 h-4.5 text-primary mx-auto" />
                  ) : (
                    <X className="w-4.5 h-4.5 text-muted-foreground/40 mx-auto" />
                  )}
                </td>
                <td className="py-3 pl-4 text-center">
                  {row.generic ? (
                    <Check className="w-4.5 h-4.5 text-muted-foreground mx-auto" />
                  ) : (
                    <X className="w-4.5 h-4.5 text-muted-foreground/40 mx-auto" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

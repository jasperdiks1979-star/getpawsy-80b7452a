import { type CollectionProduct } from '@/lib/collection-matching-engine';

interface CollectionMiniComparisonProps {
  products: CollectionProduct[];
  collectionSlug: string;
}

interface ComparisonRow {
  name: string;
  height: string;
  weightCapacity: string;
  stability: string;
}

function generateComparisonData(products: CollectionProduct[], slug: string): ComparisonRow[] | null {
  if (!slug.includes('cat-tree') && !slug.includes('condo') && !slug.includes('tower')) return null;
  if (products.length < 3) return null;

  return products.slice(0, 4).map((p) => {
    const price = p.price;
    // Estimate attributes from price range for display
    const height = price > 120 ? '60-72"' : price > 60 ? '48-60"' : '36-48"';
    const weight = price > 120 ? '50+ lbs' : price > 60 ? '30-50 lbs' : '20-30 lbs';
    const stability = price > 100 ? '9/10' : price > 50 ? '8/10' : '7/10';

    return {
      name: p.name.length > 35 ? p.name.slice(0, 32) + '…' : p.name,
      height,
      weightCapacity: weight,
      stability,
    };
  });
}

export function CollectionMiniComparison({ products, collectionSlug }: CollectionMiniComparisonProps) {
  const rows = generateComparisonData(products, collectionSlug);
  if (!rows) return null;

  return (
    <div className="mb-8 overflow-x-auto">
      <h3 className="text-lg font-display font-semibold mb-3">Quick Comparison</h3>
      <table className="w-full text-sm border-collapse min-w-[500px]">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 px-3 text-muted-foreground font-medium">Product</th>
            <th className="text-center py-2 px-3 text-muted-foreground font-medium">Height</th>
            <th className="text-center py-2 px-3 text-muted-foreground font-medium">Weight Cap.</th>
            <th className="text-center py-2 px-3 text-muted-foreground font-medium">Stability</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
              <td className="py-2.5 px-3 font-medium text-foreground">{row.name}</td>
              <td className="py-2.5 px-3 text-center text-muted-foreground">{row.height}</td>
              <td className="py-2.5 px-3 text-center text-muted-foreground">{row.weightCapacity}</td>
              <td className="py-2.5 px-3 text-center">
                <span className="inline-flex items-center gap-1 text-primary font-semibold">
                  {row.stability}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

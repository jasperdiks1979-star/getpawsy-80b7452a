import { CheckCircle, XCircle, MinusCircle } from 'lucide-react';

interface ProductComparisonTableProps {
  productName: string;
}

const COMPARISON_ROWS = [
  { feature: 'US Shipping (5–10 Days)', ours: 'yes', generic: 'varies' },
  { feature: 'Premium Materials', ours: 'yes', generic: 'no' },
  { feature: 'Durability Rating', ours: 'High', generic: 'Medium' },
  { feature: '30-Day Return Policy', ours: 'yes', generic: 'varies' },
  { feature: 'Pet-Focused Design', ours: 'yes', generic: 'no' },
  { feature: 'Responsive Customer Support', ours: 'yes', generic: 'varies' },
];

function CellIcon({ value }: { value: string }) {
  if (value === 'yes') return <CheckCircle className="w-5 h-5 text-success mx-auto" />;
  if (value === 'no') return <XCircle className="w-5 h-5 text-destructive mx-auto" />;
  if (value === 'varies') return <MinusCircle className="w-5 h-5 text-muted-foreground mx-auto" />;
  return <span className="text-sm font-medium text-foreground">{value}</span>;
}

export function ProductComparisonTable({ productName }: ProductComparisonTableProps) {
  // Shorten name for column header
  const shortName = productName.length > 25 ? productName.slice(0, 22) + '…' : productName;

  return (
    <section className="mt-12">
      <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-6">
        How We Compare
      </h2>
      <div className="overflow-x-auto border rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left p-3 font-semibold">Feature</th>
              <th className="text-center p-3 font-semibold text-primary">{shortName}</th>
              <th className="text-center p-3 font-semibold text-muted-foreground">Generic Alternative</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON_ROWS.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-card' : 'bg-muted/20'}>
                <td className="p-3 font-medium">{row.feature}</td>
                <td className="p-3 text-center"><CellIcon value={row.ours} /></td>
                <td className="p-3 text-center"><CellIcon value={row.generic} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface ComparisonRow {
  type: string;
  bestFor: string;
  waterproof: string;
  washable: string;
  priceRange: string;
}

interface ComparisonTableProps {
  title: string;
  rows: ComparisonRow[];
}

const CATEGORY_COMPARISONS: Record<string, { title: string; rows: ComparisonRow[] }> = {
  'best-orthopedic-dog-beds': {
    title: 'Orthopedic Dog Bed Comparison',
    rows: [
      { type: 'Memory Foam', bestFor: 'Senior dogs, joint pain', waterproof: '✅ Most models', washable: '✅ Removable cover', priceRange: '$40–$120' },
      { type: 'Gel-Infused Foam', bestFor: 'Hot climates, overheating dogs', waterproof: '✅ Yes', washable: '✅ Machine wash', priceRange: '$50–$150' },
      { type: 'Bolster Style', bestFor: 'Anxious dogs, head support', waterproof: '⚠️ Some models', washable: '✅ Most models', priceRange: '$35–$100' },
      { type: 'Egg Crate Foam', bestFor: 'Budget-friendly joint relief', waterproof: '❌ Rarely', washable: '⚠️ Spot clean', priceRange: '$20–$60' },
    ],
  },
  'cat-condos': {
    title: 'Cat Condo Style Comparison – Find Your Best Match',
    rows: [
      { type: 'Small / Compact', bestFor: 'Apartments, kittens, senior cats', waterproof: 'N/A', washable: '✅ Removable pads', priceRange: '$25–$80' },
      { type: 'Multi-Level Tower', bestFor: 'Active cats, multi-cat homes', waterproof: 'N/A', washable: '⚠️ Spot clean', priceRange: '$60–$200' },
      { type: 'Modern / Designer', bestFor: 'Style-conscious owners, small rooms', waterproof: 'N/A', washable: '✅ Wipeable', priceRange: '$70–$200' },
      { type: 'Large Cat Condo', bestFor: 'Maine Coons, Ragdolls (20+ lbs)', waterproof: 'N/A', washable: '⚠️ Spot clean', priceRange: '$80–$250' },
      { type: 'Wooden / Natural', bestFor: 'Eco-friendly, long-lasting', waterproof: 'N/A', washable: '✅ Wipeable', priceRange: '$80–$250' },
      { type: 'Luxury / Premium', bestFor: 'Interior design integration', waterproof: 'N/A', washable: '✅ Machine wash covers', priceRange: '$150–$400+' },
    ],
  },
  'best-dog-car-seats': {
    title: 'Dog Car Seat Comparison',
    rows: [
      { type: 'Booster Seat', bestFor: 'Small dogs under 25 lbs', waterproof: '✅ Most models', washable: '✅ Removable liner', priceRange: '$30–$80' },
      { type: 'Console Seat', bestFor: 'Toy breeds, front seat', waterproof: '⚠️ Some', washable: '✅ Machine wash', priceRange: '$25–$60' },
      { type: 'Hammock Style', bestFor: 'Medium–large dogs, back seat', waterproof: '✅ Yes', washable: '✅ Machine wash', priceRange: '$35–$90' },
      { type: 'Crash-Tested Carrier', bestFor: 'Maximum safety, travel', waterproof: '✅ Yes', washable: '✅ Removable pad', priceRange: '$80–$200' },
    ],
  },
};

export function getComparisonData(slug: string) {
  return CATEGORY_COMPARISONS[slug] || null;
}

export function ComparisonTable({ title, rows }: ComparisonTableProps) {
  if (!rows.length) return null;

  return (
    <section className="mb-12 max-w-4xl">
      <h2 className="text-2xl font-semibold mb-4">{title}</h2>
      <div className="overflow-x-auto border rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left p-3 font-semibold">Type</th>
              <th className="text-left p-3 font-semibold">Best For</th>
              <th className="text-left p-3 font-semibold">Waterproof</th>
              <th className="text-left p-3 font-semibold">Washable</th>
              <th className="text-left p-3 font-semibold">Price Range</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-card' : 'bg-muted/20'}>
                <td className="p-3 font-medium">{row.type}</td>
                <td className="p-3 text-muted-foreground">{row.bestFor}</td>
                <td className="p-3">{row.waterproof}</td>
                <td className="p-3">{row.washable}</td>
                <td className="p-3">{row.priceRange}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

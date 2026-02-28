/**
 * WhyGetPawsyComparison — Amazon vs GetPawsy comparison table.
 * Static, no JS dependencies, conversion-focused.
 */

const rows = [
  { feature: 'Product Selection', amazon: 'Random sellers', getpawsy: 'Curated & tested' },
  { feature: 'Shipping Speed', amazon: '2–4 week (marketplace)', getpawsy: 'US warehouse, 3–7 days' },
  { feature: 'Customer Support', amazon: 'Bot-first, faceless', getpawsy: 'Real humans, <24h response' },
  { feature: 'Product Quality', amazon: 'Inconsistent', getpawsy: 'Quality-tested & vetted' },
  { feature: 'Returns', amazon: 'Varies by seller', getpawsy: '30-day happiness guarantee' },
];

export function WhyGetPawsyComparison() {
  return (
    <section className="py-14 md:py-16 bg-sand/30">
      <div className="container px-4 md:px-6">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
            Why Pet Parents Choose GetPawsy
          </h2>
        </div>
        <div className="max-w-3xl mx-auto overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="text-left p-3 font-semibold text-muted-foreground border-b border-border/50"></th>
                <th className="text-center p-3 font-semibold text-muted-foreground border-b border-border/50">
                  Amazon / Generic
                </th>
                <th className="text-center p-3 font-bold text-primary border-b-2 border-primary/30 bg-primary/5 rounded-t-lg">
                  GetPawsy ✓
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.feature} className={i % 2 === 0 ? 'bg-card' : 'bg-muted/20'}>
                  <td className="p-3 font-medium text-foreground">{row.feature}</td>
                  <td className="p-3 text-center text-muted-foreground">{row.amazon}</td>
                  <td className="p-3 text-center font-medium text-foreground bg-primary/5">
                    {row.getpawsy}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default WhyGetPawsyComparison;

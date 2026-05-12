import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
type Counters = { total: number; us_included: number; non_us_excluded: number; internal_excluded: number; unknown_excluded: number } | null;
export function ExcludedTrafficTab({ counters }: { counters: Counters }) {
  if (!counters) return null;
  const breakdown = [
    { label: "Non-US (excluded from decisions)", value: counters.non_us_excluded },
    { label: "Internal / admin / test", value: counters.internal_excluded },
    { label: "Unknown country", value: counters.unknown_excluded },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Excluded Traffic (Diagnostics)</CardTitle>
        <CardDescription>These sessions are excluded from all growth scoring &amp; autopilot decisions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {breakdown.map((b) => (
          <div key={b.label} className="flex justify-between text-sm border-b pb-2 last:border-0">
            <span className="text-muted-foreground">{b.label}</span>
            <span className="font-mono">{b.value.toLocaleString()}</span>
          </div>
        ))}
        <div className="flex justify-between text-sm pt-2 font-semibold">
          <span>Total excluded</span>
          <span className="font-mono">{(counters.non_us_excluded + counters.internal_excluded + counters.unknown_excluded).toLocaleString()}</span>
        </div>
      </CardContent>
    </Card>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  fetchPersonaPerformance,
  fetchCreativePerformance,
  fetchTopCombos,
  fetchClosedLoopSummary,
} from "@/lib/genesisV36";

function eur(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase text-muted-foreground tracking-wider">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
        {hint ? <div className="text-xs text-muted-foreground mt-1">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "winning" ? "default"
    : status === "growing" ? "secondary"
    : status === "declining" || status === "retire" ? "destructive"
    : "outline";
  return <Badge variant={variant as never}>{status}</Badge>;
}

export function ClosedLoopLearningTab() {
  const summary = useQuery({ queryKey: ["gv36-summary"], queryFn: fetchClosedLoopSummary });
  const personas = useQuery({ queryKey: ["gv36-personas"], queryFn: () => fetchPersonaPerformance(20) });
  const creatives = useQuery({ queryKey: ["gv36-creatives"], queryFn: () => fetchCreativePerformance(40) });
  const combos = useQuery({ queryKey: ["gv36-combos"], queryFn: () => fetchTopCombos(20) });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Closed-Loop Learning (V3.6)</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Every published pin is stitched from impression → save → click → ATC → purchase → learning.
          High-confidence combos (≥0.90 Wilson) auto-enqueue into Autopilot.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {summary.isLoading || !summary.data ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)
        ) : (
          <>
            <Stat label="Attribution links" value={summary.data.attribution_links} />
            <Stat label="Combos evaluated" value={summary.data.combos_evaluated} />
            <Stat label="Winning combos" value={summary.data.combos_winning} />
            <Stat label="Confidence ≥0.90" value={summary.data.high_confidence} hint="auto-executable" />
            <Stat label="First-sale memories" value={summary.data.first_sale_memories} />
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Persona Performance</CardTitle>
        </CardHeader>
        <CardContent>
          {personas.isLoading ? <Skeleton className="h-40" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr><th className="text-left p-2">Persona</th><th className="text-right p-2">Impr</th><th className="text-right p-2">Clicks</th><th className="text-right p-2">CTR%</th><th className="text-right p-2">ATC</th><th className="text-right p-2">Purch</th><th className="text-right p-2">Revenue</th><th className="text-right p-2">AOV</th><th className="text-right p-2">Conf</th></tr>
                </thead>
                <tbody>
                  {(personas.data ?? []).map((p) => (
                    <tr key={p.persona_id} className="border-t">
                      <td className="p-2">{p.persona_name ?? p.persona_id.slice(0, 8)}</td>
                      <td className="text-right p-2">{p.impressions.toLocaleString()}</td>
                      <td className="text-right p-2">{p.clicks.toLocaleString()}</td>
                      <td className="text-right p-2">{Number(p.ctr_pct).toFixed(2)}</td>
                      <td className="text-right p-2">{p.atc.toLocaleString()}</td>
                      <td className="text-right p-2">{p.purchases.toLocaleString()}</td>
                      <td className="text-right p-2">{eur(p.revenue_cents)}</td>
                      <td className="text-right p-2">{eur(p.aov_cents)}</td>
                      <td className="text-right p-2">{p.confidence != null ? Number(p.confidence).toFixed(2) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Creative Performance — Strongest & Weakest Families</CardTitle>
        </CardHeader>
        <CardContent>
          {creatives.isLoading ? <Skeleton className="h-40" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr><th className="text-left p-2">Headline</th><th className="text-left p-2">Emotion</th><th className="text-left p-2">Style</th><th className="text-right p-2">Impr</th><th className="text-right p-2">CTR%</th><th className="text-right p-2">Purch</th><th className="text-right p-2">Revenue</th><th className="text-left p-2">Status</th></tr>
                </thead>
                <tbody>
                  {(creatives.data ?? []).map((c) => (
                    <tr key={c.creative_id} className="border-t">
                      <td className="p-2 max-w-md truncate">{c.headline ?? c.creative_id.slice(0, 8)}</td>
                      <td className="p-2">{c.emotion_id ?? "—"}</td>
                      <td className="p-2">{c.style_id ?? "—"}</td>
                      <td className="text-right p-2">{c.impressions.toLocaleString()}</td>
                      <td className="text-right p-2">{Number(c.ctr_pct).toFixed(2)}</td>
                      <td className="text-right p-2">{c.purchases}</td>
                      <td className="text-right p-2">{eur(c.revenue_cents)}</td>
                      <td className="p-2"><StatusBadge status={c.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top Combos by Confidence (Persona × Emotion × Style × Hook × Board × Product)</CardTitle>
        </CardHeader>
        <CardContent>
          {combos.isLoading ? <Skeleton className="h-40" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr><th className="text-left p-2">Persona</th><th className="text-left p-2">Emotion</th><th className="text-left p-2">Style</th><th className="text-right p-2">Impr</th><th className="text-right p-2">Purch</th><th className="text-right p-2">Revenue</th><th className="text-right p-2">Wilson</th><th className="text-left p-2">Status</th></tr>
                </thead>
                <tbody>
                  {(combos.data ?? []).map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="p-2">{c.persona_id?.slice(0, 8) ?? "—"}</td>
                      <td className="p-2">{c.emotion_id ?? "—"}</td>
                      <td className="p-2">{c.style_id ?? "—"}</td>
                      <td className="text-right p-2">{c.impressions.toLocaleString()}</td>
                      <td className="text-right p-2">{c.purchases}</td>
                      <td className="text-right p-2">{eur(c.revenue_cents)}</td>
                      <td className="text-right p-2">{Number(c.confidence_wilson).toFixed(3)}</td>
                      <td className="p-2"><StatusBadge status={c.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
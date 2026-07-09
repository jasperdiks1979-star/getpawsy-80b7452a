import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, ShieldCheck, AlertTriangle } from "lucide-react";
import { usePcie3Planner, usePcie3WhatIf, type Pcie3Envelope, type Pcie3WhatIf } from "@/hooks/usePcie3Planner";

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function WaveCard({ w, highlight }: { w: any; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span>Wave {w.size}</span>
          <Badge variant={w.meets_board_minimum ? "default" : "secondary"}>Q {w.wave_quality_score}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <div>Picked: <b>{w.picked_count}</b></div>
        <div>Boards used: <b>{w.boards_used}</b> {!w.meets_board_minimum && <span className="text-amber-600">(&lt; 8)</span>}</div>
        <div>Categories: <b>{w.categories_used}</b></div>
        <div>New products: <b>{w.new_products}</b></div>
        <div>Coverage Δ: <b>+{w.coverage_delta_pct}%</b></div>
        <div>Avg score: <b>{w.avg_planning_score}</b></div>
      </CardContent>
    </Card>
  );
}

export default function Pcie3PlannerPage() {
  const { data, isLoading, error, refetch, isFetching } = usePcie3Planner();
  const whatIfMut = usePcie3WhatIf();
  const [waveSize, setWaveSize] = useState(20);
  const [skipCats, setSkipCats] = useState("");
  const [highMargin, setHighMargin] = useState(false);

  const envelope: Pcie3Envelope | undefined = whatIfMut.data ?? data;

  const runWhatIf = () => {
    const w: Pcie3WhatIf = {
      wave_size: waveSize,
      skip_categories: skipCats.split(",").map(s => s.trim()).filter(Boolean),
      high_margin_only: highMargin,
    };
    whatIfMut.mutate(w);
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <Helmet><title>PCIE3 Diversity Planner — Admin</title></Helmet>

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> PCIE3 Diversity Planner
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Read-only planning layer. PCIE2 remains the sole certified publisher.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1"><ShieldCheck className="h-3 w-3" /> SAFE MODE</Badge>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
          </Button>
        </div>
      </header>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Planning…
        </div>
      )}

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {(error as Error).message}
          </CardContent>
        </Card>
      )}

      {envelope && (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
            <Stat label="Catalog Coverage" value={`${envelope.coverage.coverage_pct}%`} sub={`${envelope.coverage.unique_products_published} / ${envelope.coverage.catalog_total}`} />
            <Stat label="Board Diversity" value={envelope.diversity.board_diversity_score} sub={`${envelope.coverage.boards_used_total} boards`} />
            <Stat label="Category Diversity" value={envelope.diversity.category_diversity_score} sub={`${envelope.coverage.categories_used_total} categories`} />
            <Stat label="Eligible Candidates" value={envelope.candidates_eligible} sub={`of ${envelope.candidates_total} total`} />
            <Stat label="Best Wave Size" value={envelope.best_wave_size} sub="max quality score" />
          </div>

          <Card>
            <CardHeader><CardTitle>Wave Simulations</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
                {envelope.simulations.map((w) => (
                  <WaveCard key={w.size} w={w} highlight={w.size === envelope.best_wave_size} />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>What-If Simulator</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div>
                  <Label htmlFor="ws">Wave size</Label>
                  <Input id="ws" type="number" min={1} max={100} value={waveSize} onChange={(e) => setWaveSize(Number(e.target.value))} />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="skip">Skip categories (comma-separated)</Label>
                  <Input id="skip" value={skipCats} onChange={(e) => setSkipCats(e.target.value)} placeholder="cat_tree, litter_box" />
                </div>
                <div className="flex items-center gap-2">
                  <input id="hm" type="checkbox" checked={highMargin} onChange={(e) => setHighMargin(e.target.checked)} />
                  <Label htmlFor="hm">High margin only (≥ 40%)</Label>
                </div>
              </div>
              <Button onClick={runWhatIf} disabled={whatIfMut.isPending}>
                {whatIfMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Simulate
              </Button>
              <p className="text-xs text-muted-foreground">No publishing. Planning only.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top 100 Recommended Candidates</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[600px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/60">
                    <tr className="text-left">
                      <th className="p-2 w-12">#</th>
                      <th className="p-2">Product</th>
                      <th className="p-2">Category</th>
                      <th className="p-2">Board</th>
                      <th className="p-2 w-20">Score</th>
                      <th className="p-2">Reasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {envelope.top_recommended.map((c: any, i: number) => (
                      <tr key={c.queue_id} className="border-t">
                        <td className="p-2 text-muted-foreground">{i + 1}</td>
                        <td className="p-2 font-mono text-xs">{c.product_slug || c.product_id?.slice(0, 8) || "—"}</td>
                        <td className="p-2">{c.category}</td>
                        <td className="p-2 font-mono text-xs">{c.board_id?.slice(0, 8) || "—"}</td>
                        <td className="p-2 font-semibold">{c.planning_score}</td>
                        <td className="p-2">
                          <div className="flex flex-wrap gap-1">
                            {(c.planning_reason ?? []).map((r: string) => (
                              <Badge key={r} variant="secondary" className="text-[10px]">{r}</Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {envelope.excluded.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Excluded ({envelope.excluded.length})</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60">
                    <tr className="text-left">
                      <th className="p-2">Product</th>
                      <th className="p-2">Category</th>
                      <th className="p-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {envelope.excluded.map((e: any) => (
                      <tr key={e.queue_id} className="border-t">
                        <td className="p-2 font-mono text-xs">{e.product_slug || "—"}</td>
                        <td className="p-2">{e.category}</td>
                        <td className="p-2 text-muted-foreground">{e.exclusion_reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          <p className="text-xs text-muted-foreground text-center">
            Generated {new Date(envelope.generated_at).toLocaleString()} • {envelope.publisher} • {envelope.mode}
          </p>
        </>
      )}
    </div>
  );
}
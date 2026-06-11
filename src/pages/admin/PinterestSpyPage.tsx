import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Run = {
  id: string;
  started_at: string;
  finished_at: string | null;
  mode: string;
  products_scanned: number;
  competitor_candidates_found: number;
  patterns_extracted: number;
  opportunities_created: number;
  drafts_generated: number;
  queued: number;
  rejected: number;
  errors: number;
  health: Record<string, boolean>;
};

type Opp = {
  product_id: string;
  product_slug: string | null;
  competitor_gap_score: number;
  components: Record<string, number>;
  top_patterns: any[];
  rank: number | null;
  generated_drafts: number;
};

type Pattern = {
  pattern_type: string;
  pattern_value: string;
  niche_key: string | null;
  sample_count: number;
  avg_success: number;
};

export default function PinterestSpyPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [opps, setOpps] = useState<Opp[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const [r, o, p] = await Promise.all([
      supabase.from("pinterest_competitor_runs").select("*").order("started_at", { ascending: false }).limit(10),
      supabase.from("pinterest_competitor_opportunities").select("*").order("rank", { ascending: true }).limit(100),
      supabase.from("pinterest_competitor_patterns").select("*").order("avg_success", { ascending: false }).limit(30),
    ]);
    setRuns((r.data as Run[]) || []);
    setOpps((o.data as Opp[]) || []);
    setPatterns((p.data as Pattern[]) || []);
  };

  useEffect(() => { load(); }, []);

  const call = async (action: string, body: Record<string, unknown> = {}, label = action) => {
    setBusy(label);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-competitor-intel", { body: { action, ...body } });
      if (error) throw error;
      toast.success(`${label} ok`, { description: JSON.stringify((data as any)?.counters || data).slice(0, 200) });
      await load();
    } catch (e: any) {
      toast.error(`${label} failed`, { description: e?.message || String(e) });
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = () => {
    const rows = [["rank", "slug", "gap_score", "drafts"], ...opps.map((o) => [o.rank ?? "", o.product_slug ?? "", o.competitor_gap_score, o.generated_drafts])];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "competitor-opportunities.csv";
    a.click();
  };

  const last = runs[0];

  return (
    <div className="p-4 space-y-4 max-w-6xl">
      <header>
        <h1 className="text-2xl font-semibold">Pinterest Competitor Spy</h1>
        <p className="text-sm text-muted-foreground">
          Learns from competitor pin patterns and generates original GetPawsy drafts. No images, video, or copy are ever
          copied — only structural metadata is used as inspiration.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button disabled={!!busy} onClick={() => call("run_full", { dry_run: true }, "dry-run")}>Dry run</Button>
        <Button disabled={!!busy} onClick={() => call("run_full", {}, "run scan")}>Run scan now</Button>
        <Button disabled={!!busy} variant="secondary" onClick={() => call("generate_drafts", { limit: 10 }, "generate drafts")}>Generate drafts (top 10)</Button>
        <Button disabled={!!busy} variant="outline" onClick={exportCsv}>Export CSV</Button>
      </div>

      {last && (
        <Card>
          <CardHeader><CardTitle>Last run · {new Date(last.started_at).toLocaleString()}</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                ["Products", last.products_scanned],
                ["Candidates", last.competitor_candidates_found],
                ["Patterns", last.patterns_extracted],
                ["Opportunities", last.opportunities_created],
                ["Drafts", last.drafts_generated],
                ["Queued", last.queued],
                ["Rejected", last.rejected],
                ["Errors", last.errors],
              ].map(([k, v]) => (
                <div key={String(k)} className="rounded border p-2"><div className="text-muted-foreground text-xs">{k}</div><div className="text-lg font-medium">{Number(v).toLocaleString()}</div></div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(last.health || {}).map(([k, v]) => (
                <Badge key={k} variant={v ? "default" : "destructive"}>{k}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Top competitor patterns</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1 text-sm">
            {patterns.length === 0 && <div className="text-muted-foreground">No patterns yet — run a scan.</div>}
            {patterns.map((p, i) => (
              <div key={i} className="flex justify-between gap-2 border-b py-1">
                <span><Badge variant="outline" className="mr-2">{p.pattern_type}</Badge>{p.pattern_value}</span>
                <span className="text-muted-foreground">{p.niche_key || "—"} · n={p.sample_count} · avg {p.avg_success}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Top product opportunities</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1 text-sm">
            {opps.length === 0 && <div className="text-muted-foreground">No opportunities yet — run a scan.</div>}
            {opps.map((o) => (
              <div key={o.product_id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2">
                <div>
                  <div className="font-medium">#{o.rank} · {o.product_slug}</div>
                  <div className="text-xs text-muted-foreground">gap {o.competitor_gap_score} · drafts {o.generated_drafts}</div>
                </div>
                <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => call("generate_drafts", { limit: 1, product_id: o.product_id }, `generate ${o.product_slug}`)}>Generate</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
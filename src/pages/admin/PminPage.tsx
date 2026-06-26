import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
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
  status: string;
  counters: Record<string, number>;
  errors: string[];
};
type Trend = {
  keyword: string;
  category_key: string | null;
  week_start: string;
  volume_proxy: number;
  velocity: number;
  opportunity_score: number;
};
type Source = { source_key: string; kind: string; enabled: boolean; last_run_at: string | null; last_status: string | null };

export default function PminPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [discovered, setDiscovered] = useState<number>(0);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const [r, t, s, c] = await Promise.all([
      supabase.from("pmin_runs").select("*").order("started_at", { ascending: false }).limit(10),
      supabase.from("pmin_keyword_trends").select("*").order("opportunity_score", { ascending: false }).limit(50),
      supabase.from("pmin_sources").select("source_key,kind,enabled,last_run_at,last_status").order("source_key"),
      supabase.from("pmin_discovered_pins").select("id", { count: "exact", head: true }),
    ]);
    setRuns((r.data as Run[]) || []);
    setTrends((t.data as Trend[]) || []);
    setSources((s.data as Source[]) || []);
    setDiscovered(c.count ?? 0);
  };

  useEffect(() => { load(); }, []);

  const call = async (action: string, dry: boolean) => {
    setBusy(action);
    try {
      const { data, error } = await supabase.functions.invoke("pmin-orchestrator", {
        body: { action, dry_run: dry },
      });
      if (error) throw error;
      toast.success(`${action} ${dry ? "(dry)" : ""} ok`, {
        description: JSON.stringify((data as { counters?: unknown })?.counters ?? data).slice(0, 200),
      });
      await load();
    } catch (e) {
      toast.error(`${action} failed`, { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = () => {
    const rows: (string | number)[][] = [["keyword", "category", "week", "volume", "velocity", "opportunity"]];
    for (const t of trends) rows.push([t.keyword, t.category_key ?? "", t.week_start, t.volume_proxy, t.velocity, t.opportunity_score]);
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pmin-trends.csv";
    a.click();
  };

  const last = runs[0];

  return (
    <div className="p-4 space-y-4 max-w-6xl">
      <Helmet><title>PMIN — Pinterest Market Intelligence</title><meta name="robots" content="noindex,nofollow" /></Helmet>
      <header>
        <h1 className="text-2xl font-semibold">PMIN — Pinterest Market Intelligence Network</h1>
        <p className="text-sm text-muted-foreground">
          Wave X1 · Public-signal discovery & keyword trend scoring. Publishing locks remain ON.
          Only statistical pattern metadata is stored — no copyrighted content.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button disabled={!!busy} onClick={() => call("run_full", true)}>Dry run</Button>
        <Button disabled={!!busy} onClick={() => call("run_full", false)}>Run now</Button>
        <Button disabled={!!busy} variant="secondary" onClick={() => call("harvest", false)}>Harvest only</Button>
        <Button disabled={!!busy} variant="secondary" onClick={() => call("score_trends", false)}>Score trends only</Button>
        <Button variant="outline" onClick={exportCsv}>Export trends CSV</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Discovered pins</div><div className="text-2xl font-medium">{discovered.toLocaleString()}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Trends (this week)</div><div className="text-2xl font-medium">{trends.length}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Active sources</div><div className="text-2xl font-medium">{sources.filter((s) => s.enabled).length}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Last run</div><div className="text-lg font-medium">{last ? last.status : "—"}</div></CardContent></Card>
      </div>

      {last && (
        <Card>
          <CardHeader><CardTitle>Last run · {new Date(last.started_at).toLocaleString()} · {last.mode}</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <div className="flex flex-wrap gap-2">
              {Object.entries(last.counters || {}).map(([k, v]) => (
                <Badge key={k} variant="outline">{k}: {String(v)}</Badge>
              ))}
              <Badge variant={last.status === "ok" ? "default" : "destructive"}>{last.status}</Badge>
            </div>
            {last.errors?.length ? (
              <pre className="text-xs bg-muted/50 rounded p-2 overflow-auto">{JSON.stringify(last.errors, null, 2)}</pre>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Top keyword opportunities</CardTitle></CardHeader>
        <CardContent>
          {trends.length === 0 ? <div className="text-sm text-muted-foreground">No trends yet — run a harvest.</div> : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-1">Keyword</th><th>Category</th><th className="text-right">Volume</th><th className="text-right">Velocity</th><th className="text-right">Opp</th></tr>
              </thead>
              <tbody>
                {trends.map((t, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-1 font-medium">{t.keyword}</td>
                    <td>{t.category_key ?? "—"}</td>
                    <td className="text-right">{t.volume_proxy}</td>
                    <td className="text-right">{t.velocity}</td>
                    <td className="text-right">{t.opportunity_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Signal sources</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {sources.map((s) => (
            <div key={s.source_key} className="flex justify-between border-b py-1">
              <span><Badge variant="outline" className="mr-2">{s.kind}</Badge>{s.source_key}</span>
              <span className="text-muted-foreground">{s.last_run_at ? new Date(s.last_run_at).toLocaleString() : "never"} · {s.last_status ?? "—"}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
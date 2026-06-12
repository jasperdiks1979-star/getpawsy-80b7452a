import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Trash2, Archive, RotateCw } from "lucide-react";
import { toast } from "sonner";

type Run = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  trigger: string;
  pins_scanned: number;
  pins_archived: number;
  pins_deleted: number;
  pins_replaced: number;
  pins_kept: number;
  pins_errored: number;
  overused_overlays: number;
  dry_run: boolean;
  summary: any;
  error_message: string | null;
};

type FreqRow = {
  id: string;
  overlay_text_sample: string;
  frequency: number;
  overused: boolean;
};

export default function PinterestCleanup() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [latest, setLatest] = useState<Run | null>(null);
  const [freq, setFreq] = useState<FreqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  async function load() {
    setLoading(true);
    const { data: r } = await supabase
      .from("pinterest_historical_cleanup_runs")
      .select("*").order("started_at", { ascending: false }).limit(20);
    const list = (r || []) as Run[];
    setRuns(list);
    const top = list[0] || null;
    setLatest(top);
    if (top) {
      const { data: f } = await supabase
        .from("pinterest_overlay_frequency")
        .select("id, overlay_text_sample, frequency, overused")
        .eq("run_id", top.id)
        .order("frequency", { ascending: false })
        .limit(50);
      setFreq((f || []) as FreqRow[]);
    } else {
      setFreq([]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function runNow(dryRun: boolean) {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-historical-cleanup", {
        body: { dry_run: dryRun },
      });
      if (error) throw error;
      toast.success(`Cleanup ${dryRun ? "dry-run" : "run"} completed`, {
        description: `Scanned ${data?.pins_scanned ?? 0} • Deleted ${data?.pins_deleted ?? 0} • Archived ${data?.pins_archived ?? 0} • Replaced ${data?.pins_replaced ?? 0}`,
      });
      await load();
    } catch (e: any) {
      toast.error("Cleanup failed", { description: e?.message });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Helmet><title>Pinterest Cleanup • Admin</title></Helmet>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pinterest Historical Cleanup</h1>
          <p className="text-muted-foreground">Removes overused, repetitive or low-performing posted pins. Runs nightly.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => runNow(true)} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Dry run
          </Button>
          <Button onClick={() => runNow(false)} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCw className="h-4 w-4 mr-2" />}
            Run cleanup now
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : !latest ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">No runs yet. Click <strong>Run cleanup now</strong> to start.</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <Stat label="Pins scanned" value={latest.pins_scanned} />
            <Stat label="Deleted" value={latest.pins_deleted} icon={<Trash2 className="h-4 w-4" />} />
            <Stat label="Archived" value={latest.pins_archived} icon={<Archive className="h-4 w-4" />} />
            <Stat label="Replaced" value={latest.pins_replaced} icon={<RotateCw className="h-4 w-4" />} />
            <Stat label="Kept" value={latest.pins_kept} />
            <Stat label="Overused overlays" value={latest.overused_overlays} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Overlay frequency (most recent 90 posted pins)</CardTitle>
            </CardHeader>
            <CardContent>
              {freq.length === 0 ? (
                <p className="text-sm text-muted-foreground">No overlays detected this run.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr><th className="py-2">Overlay</th><th>Frequency</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {freq.map(f => (
                      <tr key={f.id} className="border-t">
                        <td className="py-2 pr-4 max-w-md truncate" title={f.overlay_text_sample}>{f.overlay_text_sample}</td>
                        <td className="font-mono">{f.frequency}</td>
                        <td>
                          {f.overused
                            ? <Badge variant="destructive">OVERUSED</Badge>
                            : <Badge variant="secondary">OK</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recent runs</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2">Started</th><th>Trigger</th><th>Status</th>
                    <th>Scanned</th><th>Del</th><th>Arch</th><th>Repl</th><th>Err</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map(r => (
                    <tr key={r.id} className="border-t">
                      <td className="py-2 pr-4">{new Date(r.started_at).toLocaleString()}</td>
                      <td>{r.trigger}{r.dry_run ? " (dry)" : ""}</td>
                      <td>
                        <Badge variant={r.status === "completed" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>
                          {r.status}
                        </Badge>
                      </td>
                      <td className="font-mono">{r.pins_scanned}</td>
                      <td className="font-mono">{r.pins_deleted}</td>
                      <td className="font-mono">{r.pins_archived}</td>
                      <td className="font-mono">{r.pins_replaced}</td>
                      <td className="font-mono">{r.pins_errored}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground flex items-center gap-1">{icon}{label}</div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
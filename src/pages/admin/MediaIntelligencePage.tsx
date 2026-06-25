import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, PlayCircle, RefreshCw } from "lucide-react";

type Run = {
  id: string;
  mode: string;
  status: string;
  products_scanned: number;
  products_processed: number;
  images_rehosted: number;
  videos_rehosted: number;
  derivatives_enqueued: number;
  failures: number;
  started_at: string;
  finished_at: string | null;
};

export default function MediaIntelligencePage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [stats, setStats] = useState({
    registryAssets: 0,
    pendingDerivatives: 0,
    failedDerivatives: 0,
    pinterestEligible: 0,
    totalActive: 0,
  });
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  async function load() {
    setLoading(true);
    const [runsRes, assetsRes, pendingRes, failedRes, eligibleRes, activeRes] = await Promise.all([
      supabase.from("cj_media_sync_runs").select("*").order("started_at", { ascending: false }).limit(10),
      supabase.from("cj_media_asset_registry").select("*", { count: "exact", head: true }),
      supabase.from("cj_media_derivative_jobs").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("cj_media_derivative_jobs").select("*", { count: "exact", head: true }).eq("status", "failed"),
      supabase.from("products").select("*", { count: "exact", head: true }).eq("status", "active").eq("pinterest_eligible", true),
      supabase.from("products").select("*", { count: "exact", head: true }).eq("status", "active"),
    ]);
    setRuns((runsRes.data ?? []) as Run[]);
    setStats({
      registryAssets: assetsRes.count ?? 0,
      pendingDerivatives: pendingRes.count ?? 0,
      failedDerivatives: failedRes.count ?? 0,
      pinterestEligible: eligibleRes.count ?? 0,
      totalActive: activeRes.count ?? 0,
    });
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function triggerRun(mode: "full" | "delta") {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("cj-media-orchestrator", { body: { mode } });
      if (error) throw error;
      toast.success(`${mode} sync started`, { description: `Run ${data?.runId?.slice(0, 8)}` });
      setTimeout(load, 1500);
    } catch (e) {
      toast.error("Failed to start sync", { description: (e as Error).message });
    } finally {
      setRunning(false);
    }
  }

  async function backfill() {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("cj-media-registry-backfill", { body: { limit: 1000 } });
      if (error) throw error;
      toast.success(`Backfilled ${data?.inserted ?? 0} assets`);
      load();
    } catch (e) {
      toast.error("Backfill failed", { description: (e as Error).message });
    } finally {
      setRunning(false);
    }
  }

  const readinessPct = stats.totalActive
    ? Math.round((stats.pinterestEligible / stats.totalActive) * 100)
    : 0;

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Media Intelligence</h1>
          <p className="text-muted-foreground mt-1">Unified CJ media sync, derivatives, and AI-readiness.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={load} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button onClick={() => triggerRun("delta")} disabled={running} size="sm">
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
            Delta sync
          </Button>
          <Button onClick={() => triggerRun("full")} disabled={running} size="sm" variant="default">
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
            Full sync
          </Button>
          <Button onClick={backfill} disabled={running} size="sm" variant="secondary">
            Backfill registry
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Active products" value={stats.totalActive} />
        <StatCard label="Pinterest eligible" value={stats.pinterestEligible} accent={`${readinessPct}%`} />
        <StatCard label="Registered assets" value={stats.registryAssets} />
        <StatCard label="Derivatives pending" value={stats.pendingDerivatives} />
        <StatCard label="Derivatives failed" value={stats.failedDerivatives} accent={stats.failedDerivatives > 0 ? "alert" : undefined} />
      </div>

      <Card>
        <CardHeader><CardTitle>Recent sync runs</CardTitle></CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet. Start a delta or full sync above.</p>
          ) : (
            <div className="space-y-2">
              {runs.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-4 p-3 border rounded-md text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant={r.status === "completed" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>
                      {r.status}
                    </Badge>
                    <span className="font-mono text-xs">{r.id.slice(0, 8)}</span>
                    <span className="text-muted-foreground">{r.mode}</span>
                    <span className="text-muted-foreground">{new Date(r.started_at).toLocaleString()}</span>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground flex-shrink-0">
                    <span>imgs {r.images_rehosted}</span>
                    <span>vids {r.videos_rehosted}</span>
                    <span>processed {r.products_processed}</span>
                    {r.failures > 0 && <span className="text-destructive">fails {r.failures}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="text-2xl font-bold mt-1">{value}</div>
        {accent && (
          <div className={`text-xs mt-1 ${accent === "alert" ? "text-destructive" : "text-muted-foreground"}`}>{accent}</div>
        )}
      </CardContent>
    </Card>
  );
}
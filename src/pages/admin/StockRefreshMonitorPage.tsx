import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface RefreshRun {
  id: string;
  label: string;
  total_initial: number;
  remaining: number;
  synced_ok: number;
  synced_error: number;
  started_at: string;
  last_checked_at: string;
  completed_at: string | null;
  notified_complete_at: string | null;
}

export default function StockRefreshMonitorPage() {
  const [run, setRun] = useState<RefreshRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const { toast } = useToast();

  async function fetchLatestRun() {
    const { data, error } = await supabase
      .from("stock_refresh_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(error);
    } else {
      setRun(data as RefreshRun | null);
    }
    setLoading(false);
  }

  async function triggerMonitor() {
    setTriggering(true);
    try {
      const { data, error } = await supabase.functions.invoke("stock-refresh-monitor");
      if (error) throw error;
      toast({
        title: "Monitor refreshed",
        description: data?.message ?? "Run state updated",
      });
      await fetchLatestRun();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Monitor failed", description: msg, variant: "destructive" });
    } finally {
      setTriggering(false);
    }
  }

  useEffect(() => {
    fetchLatestRun();
    const interval = setInterval(fetchLatestRun, 30_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-4">Stock Refresh Monitor</h1>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading run state…</span>
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-4">Stock Refresh Monitor</h1>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No refresh runs recorded yet.
          </CardContent>
        </Card>
      </div>
    );
  }

  const processed = run.total_initial - run.remaining;
  const pct = run.total_initial > 0 ? Math.round((processed / run.total_initial) * 100) : 0;
  const ratePerHour = (() => {
    const elapsedH = (Date.now() - new Date(run.started_at).getTime()) / 3_600_000;
    return elapsedH > 0 ? processed / elapsedH : 0;
  })();
  const etaHours = ratePerHour > 0 ? run.remaining / ratePerHour : null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Stock Refresh Monitor</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Run: <code>{run.label}</code> · started{" "}
            {new Date(run.started_at).toLocaleString()}
          </p>
        </div>
        <Button onClick={triggerMonitor} disabled={triggering} variant="outline" size="sm">
          {triggering ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh now
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {run.completed_at ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Complete
                {run.notified_complete_at && (
                  <Badge variant="secondary" className="ml-2">Notified</Badge>
                )}
              </>
            ) : (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                In progress
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>{processed} / {run.total_initial} processed</span>
              <span className="text-muted-foreground">{pct}%</span>
            </div>
            <Progress value={pct} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
            <Stat label="Initial queue" value={run.total_initial} />
            <Stat label="Remaining" value={run.remaining} />
            <Stat label="Synced OK" value={run.synced_ok} tone="success" />
            <Stat label="Errors" value={run.synced_error} tone={run.synced_error > 0 ? "warn" : undefined} />
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2 text-sm">
            <div>
              <div className="text-muted-foreground">Last checked</div>
              <div>{new Date(run.last_checked_at).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-muted-foreground">
                {run.completed_at ? "Completed at" : "Estimated finish"}
              </div>
              <div>
                {run.completed_at
                  ? new Date(run.completed_at).toLocaleString()
                  : etaHours !== null && etaHours < 240
                  ? `~${etaHours.toFixed(1)}h from now (${ratePerHour.toFixed(1)}/h)`
                  : "Calculating…"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Auto-refreshes every 30 seconds. Monitor cron runs every 10 minutes and emails when complete.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "warn";
}) {
  const color =
    tone === "success"
      ? "text-green-600"
      : tone === "warn"
      ? "text-amber-600"
      : "text-foreground";
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
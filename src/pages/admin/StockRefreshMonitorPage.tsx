import { Fragment, useEffect, useState } from "react";
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

interface RecentProduct {
  id: string;
  name: string | null;
  slug: string | null;
  stock_sync_status: string | null;
  last_stock_sync_at: string | null;
  is_active: boolean | null;
}

interface MonitorAttempt {
  id: string;
  run_id: string | null;
  trace_id: string;
  attempt_number: number;
  status: "success" | "error" | "retrying";
  error_message: string | null;
  error_stack: string | null;
  duration_ms: number | null;
  remaining: number | null;
  synced_ok: number | null;
  synced_error: number | null;
  created_at: string;
}

export default function StockRefreshMonitorPage() {
  const [run, setRun] = useState<RefreshRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [recent, setRecent] = useState<RecentProduct[]>([]);
  const [attempts, setAttempts] = useState<MonitorAttempt[]>([]);
  const [expandedAttempt, setExpandedAttempt] = useState<string | null>(null);
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

  async function fetchRecentSynced() {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, slug, stock_sync_status, last_stock_sync_at, is_active")
      .not("last_stock_sync_at", "is", null)
      .order("last_stock_sync_at", { ascending: false })
      .limit(25);
    if (error) {
      console.error(error);
      return;
    }
    setRecent((data ?? []) as RecentProduct[]);
  }

  async function fetchAttempts() {
    const { data, error } = await supabase
      .from("stock_refresh_monitor_attempts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) {
      console.error(error);
      return;
    }
    setAttempts((data ?? []) as MonitorAttempt[]);
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
      await Promise.all([fetchLatestRun(), fetchRecentSynced(), fetchAttempts()]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Monitor failed", description: msg, variant: "destructive" });
    } finally {
      setTriggering(false);
    }
  }

  useEffect(() => {
    fetchLatestRun();
    fetchRecentSynced();
    fetchAttempts();
    const interval = setInterval(() => {
      fetchLatestRun();
      fetchRecentSynced();
      fetchAttempts();
    }, 30_000);
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent monitor attempts (with retry log)</CardTitle>
        </CardHeader>
        <CardContent>
          {attempts.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">
              No monitor attempts logged yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2 pr-3">Time</th>
                    <th className="text-left py-2 pr-3">Trace</th>
                    <th className="text-left py-2 pr-3">Attempt</th>
                    <th className="text-left py-2 pr-3">Status</th>
                    <th className="text-left py-2 pr-3">Duration</th>
                    <th className="text-left py-2">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.map((a) => {
                    const isExpanded = expandedAttempt === a.id;
                    const hasError = a.status !== "success";
                    return (
                      <Fragment key={a.id}>
                        <tr className="border-b last:border-0">
                          <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                            {new Date(a.created_at).toLocaleString()}
                          </td>
                          <td className="py-2 pr-3">
                            <code className="text-xs">{a.trace_id.slice(0, 8)}…</code>
                          </td>
                          <td className="py-2 pr-3">{a.attempt_number}</td>
                          <td className="py-2 pr-3">
                            <AttemptStatusBadge status={a.status} />
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">
                            {a.duration_ms != null ? `${a.duration_ms}ms` : "—"}
                          </td>
                          <td className="py-2">
                            {hasError && a.error_message ? (
                              <button
                                onClick={() =>
                                  setExpandedAttempt(isExpanded ? null : a.id)
                                }
                                className="text-xs underline text-foreground hover:text-primary text-left max-w-[360px] truncate"
                              >
                                {a.error_message}
                              </button>
                            ) : a.remaining != null ? (
                              <span className="text-xs text-muted-foreground">
                                remaining {a.remaining} · ok {a.synced_ok ?? 0} · err{" "}
                                {a.synced_error ?? 0}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (a.error_message || a.error_stack) && (
                          <tr className="border-b last:border-0 bg-muted/30">
                            <td colSpan={6} className="py-3 px-3">
                              <div className="text-xs space-y-2">
                                {a.error_message && (
                                  <div>
                                    <div className="font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                      Error
                                    </div>
                                    <pre className="whitespace-pre-wrap break-words text-foreground">
                                      {a.error_message}
                                    </pre>
                                  </div>
                                )}
                                {a.error_stack && (
                                  <div>
                                    <div className="font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                      Stack
                                    </div>
                                    <pre className="whitespace-pre-wrap break-words text-muted-foreground max-h-64 overflow-auto">
                                      {a.error_stack}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recently synced products</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">
              No products with a recorded sync yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2 pr-3">Product</th>
                    <th className="text-left py-2 pr-3">Product ID</th>
                    <th className="text-left py-2 pr-3">Status</th>
                    <th className="text-left py-2 pr-3">Active</th>
                    <th className="text-left py-2">Last sync</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <div className="font-medium truncate max-w-[260px]">
                          {p.name ?? "(no name)"}
                        </div>
                        {p.slug && (
                          <div className="text-xs text-muted-foreground truncate max-w-[260px]">
                            /{p.slug}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <code className="text-xs">{p.id.slice(0, 8)}…</code>
                      </td>
                      <td className="py-2 pr-3">
                        <StatusBadge status={p.stock_sync_status} />
                      </td>
                      <td className="py-2 pr-3">
                        {p.is_active ? (
                          <Badge variant="secondary">Live</Badge>
                        ) : (
                          <Badge variant="outline">Hidden</Badge>
                        )}
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {p.last_stock_sync_at
                          ? new Date(p.last_stock_sync_at).toLocaleString()
                          : "—"}
                      </td>
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

function AttemptStatusBadge({ status }: { status: "success" | "error" | "retrying" }) {
  if (status === "success") {
    return <Badge className="bg-green-600 hover:bg-green-600 text-white">success</Badge>;
  }
  if (status === "retrying") {
    return (
      <Badge variant="secondary" className="bg-amber-500/20 text-amber-700 dark:text-amber-400">
        retrying
      </Badge>
    );
  }
  return <Badge variant="destructive">error</Badge>;
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge variant="outline">unknown</Badge>;
  const s = status.toLowerCase();
  if (s === "ok" || s === "synced") {
    return <Badge className="bg-green-600 hover:bg-green-600 text-white">{status}</Badge>;
  }
  if (s === "pending_refresh" || s === "pending") {
    return <Badge variant="secondary">{status}</Badge>;
  }
  if (s.includes("error") || s.includes("fail")) {
    return <Badge variant="destructive">{status}</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
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
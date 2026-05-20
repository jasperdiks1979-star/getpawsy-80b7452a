import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, FileBarChart2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type SelfHealEvent = {
  id: string;
  created_at: string;
  payload: {
    issues_found?: number;
    healed_count?: number;
    emergency_triggered?: boolean;
    issues?: Array<{ kind: string; decision_id?: string; detail: string }>;
    healed?: Array<{ kind: string; decision_id: string; action: string }>;
  };
};

type WeeklyReport = {
  week_start: string;
  payload: {
    summary?: {
      picks_total: number;
      safe_winners: number;
      experiments: number;
      published: number;
      failed: number;
      impressions: number;
      clicks: number;
      saves: number;
      ctr: number;
      save_rate: number;
      avg_reward: number;
    };
    top_performers?: Array<{ product_name: string; angle: string; reward: number; clicks: number; impressions: number }>;
    event_counts?: Record<string, number>;
  };
};

export function GrowthHealthPanel() {
  const { toast } = useToast();
  const [events, setEvents] = useState<SelfHealEvent[]>([]);
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<"heal" | "report" | null>(null);

  async function load() {
    setLoading(true);
    const [e, r] = await Promise.all([
      supabase
        .from("growth_events")
        .select("id, created_at, payload")
        .eq("event_type", "self_heal")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("growth_weekly_reports")
        .select("week_start, payload")
        .order("week_start", { ascending: false })
        .limit(4),
    ]);
    if (e.data) setEvents(e.data as unknown as SelfHealEvent[]);
    if (r.data) setReports(r.data as unknown as WeeklyReport[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function run(fn: "growth-self-heal" | "growth-weekly-report") {
    setRunning(fn === "growth-self-heal" ? "heal" : "report");
    const { data, error } = await supabase.functions.invoke(fn, { body: {} });
    setRunning(null);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    const res = data as { ok: boolean; message?: string };
    toast({
      title: res.ok ? "Done" : "Issue",
      description: res.message ?? "",
      variant: res.ok ? "default" : "destructive",
    });
    load();
  }

  const latest = reports[0];
  const latestHeal = events[0];

  return (
    <Card className="p-5 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Self-Healing & Weekly Reports</h2>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => run("growth-self-heal")} disabled={running !== null}>
            {running === "heal" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
            Run self-heal
          </Button>
          <Button size="sm" onClick={() => run("growth-weekly-report")} disabled={running !== null}>
            {running === "report" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileBarChart2 className="h-4 w-4 mr-2" />}
            Generate weekly report
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <h3 className="font-medium">Latest self-heal</h3>
                {latestHeal?.payload?.emergency_triggered && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" /> Emergency stop
                  </Badge>
                )}
              </div>
              {!latestHeal ? (
                <p className="text-sm text-muted-foreground">No self-heal runs yet.</p>
              ) : (
                <div className="space-y-2 text-sm">
                  <div className="text-xs text-muted-foreground">
                    {new Date(latestHeal.created_at).toLocaleString()}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">Issues: {latestHeal.payload.issues_found ?? 0}</Badge>
                    <Badge variant="secondary">Healed: {latestHeal.payload.healed_count ?? 0}</Badge>
                  </div>
                  {(latestHeal.payload.issues ?? []).slice(0, 6).map((i, idx) => (
                    <div key={idx} className="text-xs text-muted-foreground">
                      • <span className="text-foreground">{i.kind}</span> — {i.detail}
                    </div>
                  ))}
                </div>
              )}
              <div className="pt-2 text-xs text-muted-foreground">
                Last 8 runs: {events.map((e) => e.payload.issues_found ?? 0).join(" · ") || "—"}
              </div>
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileBarChart2 className="h-4 w-4 text-primary" />
                <h3 className="font-medium">Latest weekly report</h3>
                {latest && <Badge variant="outline">Week of {latest.week_start}</Badge>}
              </div>
              {!latest?.payload?.summary ? (
                <p className="text-sm text-muted-foreground">No reports generated yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Stat label="Picks" value={latest.payload.summary.picks_total} />
                  <Stat label="Published" value={latest.payload.summary.published} />
                  <Stat label="Impressions" value={latest.payload.summary.impressions.toLocaleString()} />
                  <Stat label="Clicks" value={latest.payload.summary.clicks.toLocaleString()} />
                  <Stat label="CTR" value={`${(latest.payload.summary.ctr * 100).toFixed(2)}%`} />
                  <Stat label="Save rate" value={`${(latest.payload.summary.save_rate * 100).toFixed(2)}%`} />
                  <Stat label="Avg reward" value={latest.payload.summary.avg_reward.toFixed(3)} />
                  <Stat label="Failed" value={latest.payload.summary.failed} />
                </div>
              )}
            </div>
          </div>

          {latest?.payload?.top_performers && latest.payload.top_performers.length > 0 && (
            <div className="rounded-lg border p-4">
              <h3 className="font-medium mb-3 text-sm">Top performers this week</h3>
              <div className="space-y-2">
                {latest.payload.top_performers.slice(0, 5).map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                    <div className="min-w-0 truncate">
                      <span className="font-medium">{p.product_name}</span>
                      <span className="text-muted-foreground"> · {p.angle}</span>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <Badge variant="outline">{p.impressions.toLocaleString()} imp</Badge>
                      <Badge variant="secondary">{p.clicks} clicks</Badge>
                      <Badge>R {p.reward.toFixed(3)}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {reports.length > 1 && (
            <div className="text-xs text-muted-foreground">
              History: {reports.map((r) => r.week_start).join(" · ")}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-muted/40 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
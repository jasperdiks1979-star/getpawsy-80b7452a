import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Calendar, Clock, Send } from "lucide-react";

type Decision = {
  id: string;
  day: string;
  product_id: string | null;
  status: string;
  payload: Record<string, any>;
};

function fmtET(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) + " ET";
  } catch {
    return iso;
  }
}

export function GrowthSchedulePanel() {
  const { toast } = useToast();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<"schedule" | "tick" | null>(null);

  async function load() {
    setLoading(true);
    const since = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10);
    const { data } = await supabase
      .from("growth_decisions")
      .select("id, day, product_id, status, payload")
      .eq("decision_type", "daily_pick")
      .gte("day", since)
      .order("day", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(30);
    if (data) setDecisions(data as unknown as Decision[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function run(fn: "growth-schedule-pins" | "growth-publish-tick") {
    setRunning(fn === "growth-schedule-pins" ? "schedule" : "tick");
    const { data, error } = await supabase.functions.invoke(fn, { body: {} });
    setRunning(null);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    const r = data as { ok: boolean; message?: string };
    toast({ title: r.ok ? "Done" : "Issue", description: r.message ?? "", variant: r.ok ? "default" : "destructive" });
    load();
  }

  if (loading) {
    return <Card className="p-6 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading schedule…</Card>;
  }

  const sorted = [...decisions].sort((a, b) => {
    const ax = (a.payload?.scheduled_at as string) ?? "9999";
    const bx = (b.payload?.scheduled_at as string) ?? "9999";
    return ax.localeCompare(bx);
  });

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5" /> Pin schedule (US prime time)
          </h2>
          <p className="text-sm text-muted-foreground">
            Slots at 10am / 2pm / 7pm / 9pm ET. Tick fires every 15 min and releases due pins.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => run("growth-schedule-pins")} disabled={running !== null}>
            {running === "schedule" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Clock className="h-4 w-4 mr-2" />}
            Assign slots
          </Button>
          <Button size="sm" onClick={() => run("growth-publish-tick")} disabled={running !== null}>
            {running === "tick" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Publish due now
          </Button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recent decisions. Approve a daily pick first.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((d) => {
            const p = d.payload ?? {};
            const sched = p.scheduled_at as string | undefined;
            const triggered = p.publish_triggered_at as string | undefined;
            const jobId = p.cinematic_job_id as string | undefined;
            const pinId = p.pinterest_pin_id as string | undefined;
            return (
              <div key={d.id} className="flex items-center justify-between gap-3 border rounded p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{p.product_name ?? d.product_id}</span>
                    <Badge variant="outline">{d.status}</Badge>
                    {!jobId && <Badge variant="secondary">no creative</Badge>}
                    {jobId && !sched && <Badge variant="secondary">unscheduled</Badge>}
                    {sched && !triggered && <Badge>scheduled</Badge>}
                    {triggered && !pinId && <Badge variant="default" className="bg-amber-500">publishing</Badge>}
                    {pinId && <Badge className="bg-emerald-600">published</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{d.day}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-muted-foreground">slot</div>
                  <div className="font-mono text-xs">{fmtET(sched)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
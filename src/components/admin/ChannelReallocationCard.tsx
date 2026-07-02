import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Event = {
  id: string;
  triggered_at: string;
  trigger_reason: string;
  unavailable_channels: string[];
  reallocated_from: Record<string, { daily_budget: number; share_pct: number }>;
  reallocated_to: Record<string, { daily_budget: number; share_pct: number }>;
  recommendations_obsoleted: number;
  recommendations_rescored: number;
  rationale: string | null;
  dry_run: boolean;
};

export default function ChannelReallocationCard() {
  const [events, setEvents] = useState<Event[]>([]);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("channel_reallocation_events")
      .select("*")
      .order("triggered_at", { ascending: false })
      .limit(10);
    setEvents((data as Event[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function run(dryRun: boolean) {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("channel-reallocation-engine", {
        body: { dry_run: dryRun, trigger_reason: dryRun ? "manual_dry_run" : "manual_reallocation" },
      });
      if (error) throw error;
      toast.success(dryRun ? "Dry run complete" : "Reallocation applied", {
        description: (data as { rationale?: string })?.rationale ?? "Done",
      });
      await load();
    } catch (e) {
      toast.error("Reallocation failed", { description: (e as Error).message });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Channel Reallocation Engine</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={running} onClick={() => run(true)}>
            Dry run
          </Button>
          <Button size="sm" disabled={running} onClick={() => run(false)}>
            Reallocate now
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Redistributes daily budget and share of unavailable channels across healthy channels
          weighted by 30-day health score. Marks orphaned recommendations obsolete and rescores survivors.
          Every run is audited below.
        </p>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading audit log…</div>
        ) : events.length === 0 ? (
          <div className="text-sm text-muted-foreground">No reallocation events yet.</div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-auto">
            {events.map((e) => {
              const toEntries = Object.entries(e.reallocated_to ?? {});
              const fromEntries = Object.entries(e.reallocated_from ?? {});
              return (
                <div key={e.id} className="rounded-md border p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {new Date(e.triggered_at).toLocaleString()}
                    </span>
                    <div className="flex gap-1">
                      {e.dry_run && <Badge variant="outline">dry-run</Badge>}
                      <Badge variant="secondary">{e.trigger_reason}</Badge>
                    </div>
                  </div>
                  {e.rationale && <p className="text-muted-foreground">{e.rationale}</p>}
                  {fromEntries.length > 0 && (
                    <div>
                      <span className="font-medium">From:</span>{" "}
                      {fromEntries.map(([c, v]) =>
                        `${c} (-$${v.daily_budget.toFixed(2)}, -${v.share_pct.toFixed(1)}%)`
                      ).join(", ")}
                    </div>
                  )}
                  {toEntries.length > 0 && (
                    <div>
                      <span className="font-medium">To:</span>{" "}
                      {toEntries.map(([c, v]) =>
                        `${c} (+$${v.daily_budget.toFixed(2)}, +${v.share_pct.toFixed(1)}%)`
                      ).join(", ")}
                    </div>
                  )}
                  <div className="text-muted-foreground">
                    Recs obsoleted: {e.recommendations_obsoleted} · rescored: {e.recommendations_rescored}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
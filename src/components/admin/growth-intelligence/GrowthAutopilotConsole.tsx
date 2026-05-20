import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Play, RefreshCw, AlertTriangle } from "lucide-react";

type Cfg = {
  enabled: boolean;
  paused_publishing: boolean;
  max_pins_per_day: number;
  min_product_score: number;
  mode: string;
  emergency_stop: boolean;
};

type Decision = {
  id: string;
  day: string;
  product_id: string | null;
  reason: string | null;
  status: string;
  payload: Record<string, unknown>;
};

export function GrowthAutopilotConsole() {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<"score" | "select" | null>(null);

  async function load() {
    setLoading(true);
    const [c, d] = await Promise.all([
      supabase.from("growth_autopilot_config").select("*").eq("id", 1).maybeSingle(),
      supabase
        .from("growth_decisions")
        .select("id, day, product_id, reason, status, payload")
        .eq("decision_type", "daily_pick")
        .order("day", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (c.data) setCfg(c.data as unknown as Cfg);
    if (d.data) setDecisions(d.data as unknown as Decision[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function updateCfg(patch: Partial<Cfg>) {
    if (!cfg) return;
    const next = { ...cfg, ...patch };
    setCfg(next);
    const { error } = await supabase
      .from("growth_autopilot_config")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
  }

  async function run(fn: "growth-score-products" | "growth-select-daily") {
    setRunning(fn === "growth-score-products" ? "score" : "select");
    const { data, error } = await supabase.functions.invoke(fn, { body: {} });
    setRunning(null);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    const r = data as { ok: boolean; message?: string };
    toast({
      title: r.ok ? "Done" : "Issue",
      description: r.message ?? "",
      variant: r.ok ? "default" : "destructive",
    });
    load();
  }

  if (loading || !cfg) {
    return (
      <Card className="p-6 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading autopilot…
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Growth Autopilot</h2>
            <p className="text-sm text-muted-foreground">
              Daily product scoring + autonomous selection. US market only.
            </p>
          </div>
          {cfg.emergency_stop && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" /> Emergency stop
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between rounded border p-3">
            <Label>Enabled</Label>
            <Switch checked={cfg.enabled} onCheckedChange={(v) => updateCfg({ enabled: v })} />
          </div>
          <div className="flex items-center justify-between rounded border p-3">
            <Label>Pause publishing (keep learning)</Label>
            <Switch checked={cfg.paused_publishing} onCheckedChange={(v) => updateCfg({ paused_publishing: v })} />
          </div>
          <div className="flex items-center justify-between rounded border p-3">
            <Label>Mode</Label>
            <select
              className="rounded border bg-background px-2 py-1 text-sm"
              value={cfg.mode}
              onChange={(e) => updateCfg({ mode: e.target.value })}
            >
              <option value="manual">Manual approval</option>
              <option value="auto">Fully automatic</option>
            </select>
          </div>
          <div className="flex items-center justify-between rounded border p-3">
            <Label>Emergency stop</Label>
            <Switch checked={cfg.emergency_stop} onCheckedChange={(v) => updateCfg({ emergency_stop: v })} />
          </div>
          <div className="flex items-center justify-between rounded border p-3 gap-3">
            <Label className="whitespace-nowrap">Max pins/day</Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={cfg.max_pins_per_day}
              onChange={(e) => updateCfg({ max_pins_per_day: Number(e.target.value) })}
              className="w-24"
            />
          </div>
          <div className="flex items-center justify-between rounded border p-3 gap-3">
            <Label className="whitespace-nowrap">Min product score</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={cfg.min_product_score}
              onChange={(e) => updateCfg({ min_product_score: Number(e.target.value) })}
              className="w-24"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={() => run("growth-score-products")} disabled={running !== null}>
            {running === "score" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Score products now
          </Button>
          <Button variant="secondary" onClick={() => run("growth-select-daily")} disabled={running !== null}>
            {running === "select" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            Select today's products
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-3">Recent daily selections</h3>
        {decisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No selections yet. Run scoring, then selection.</p>
        ) : (
          <div className="space-y-2">
            {decisions.map((d) => {
              const p = d.payload as {
                product_name?: string;
                product_slug?: string;
                opportunity_score?: number;
                recommended_angle?: string;
                recommended_hook?: string;
                bucket?: string;
              };
              return (
                <div key={d.id} className="flex items-start justify-between gap-3 border rounded p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{p.product_name ?? d.product_id}</span>
                      <Badge variant={p.bucket === "safe_winner" ? "default" : "secondary"}>
                        {p.bucket ?? "pick"}
                      </Badge>
                      <Badge variant="outline">{d.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {d.day} · {d.reason}
                    </p>
                    {p.recommended_hook && (
                      <p className="text-sm italic mt-1 text-muted-foreground">“{p.recommended_hook}”</p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">{Math.round(Number(p.opportunity_score ?? 0))}</div>
                    <div className="text-[10px] text-muted-foreground">score</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
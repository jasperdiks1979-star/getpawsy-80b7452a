// Genesis V3.4 — Autonomous First Sale Mode toggle + status strip.
// Intentionally lightweight: no new page, no duplicate analytics. Reads the
// gv34_settings flag and the three V3.4 status views, and exposes Run-now buttons.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type ConnectorRow = {
  source_name: string;
  scheduler_ok: boolean;
  error_step: string | null;
  last_signal_at: string | null;
};

type EfficiencyRow = {
  action_kind: string;
  revenue_per_credit: number;
  success_rate: number;
  executed_total: number;
};

export function AutonomousFirstSaleStrip() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [connectors, setConnectors] = useState<ConnectorRow[]>([]);
  const [efficiency, setEfficiency] = useState<EfficiencyRow[]>([]);

  async function load() {
    setLoading(true);
    const [flagRes, cRes, eRes] = await Promise.all([
      supabase.from("gv34_settings").select("value").eq("key", "first_sale_autonomous_mode").maybeSingle(),
      supabase.from("gv34_connector_health").select("source_name,scheduler_ok,error_step,last_signal_at").order("source_name"),
      supabase.from("gv34_ai_credit_efficiency_v").select("action_kind,revenue_per_credit,success_rate,executed_total").order("revenue_per_credit", { ascending: false }),
    ]);
    setEnabled(!!(flagRes.data?.value as { enabled?: boolean } | null)?.enabled);
    setConnectors((cRes.data as ConnectorRow[]) ?? []);
    setEfficiency((eRes.data as EfficiencyRow[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function toggle(v: boolean) {
    setSaving(true);
    const { error } = await supabase
      .from("gv34_settings")
      .upsert({ key: "first_sale_autonomous_mode", value: { enabled: v } }, { onConflict: "key" });
    setSaving(false);
    if (error) { toast({ title: "Failed to update mode", description: error.message, variant: "destructive" }); return; }
    setEnabled(v);
    toast({ title: v ? "Autonomous First Sale Mode ON" : "Mode OFF" });
  }

  async function run(fn: string) {
    setRunning(fn);
    const { error } = await supabase.functions.invoke(fn, { body: {} });
    setRunning(null);
    if (error) toast({ title: `${fn} failed`, description: error.message, variant: "destructive" });
    else { toast({ title: `${fn} ok` }); void load(); }
  }

  const healthy = connectors.filter((c) => !c.error_step).length;
  const placeholders = connectors.filter((c) => c.error_step === "collector_not_implemented").length;

  return (
    <Card className="border-primary/60">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>🤖 Autonomous First Sale Mode · V3.4</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            When ON, the hourly decision loop enqueues actions and the dispatcher executes critical/high ones automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{enabled ? "ON" : "OFF"}</span>
          <Switch checked={enabled} disabled={saving} onCheckedChange={(v) => void toggle(v)} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Stat label="Connectors healthy" value={`${healthy}/${connectors.length}`} hint={`${placeholders} placeholder`} />
          <Stat label="Action kinds learned" value={`${efficiency.length}`} hint={`${efficiency.reduce((a, b) => a + b.executed_total, 0)} executed`} />
          <Stat label="Best revenue / credit" value={efficiency[0] ? `€${Number(efficiency[0].revenue_per_credit).toFixed(2)}` : "—"} hint={efficiency[0]?.action_kind ?? ""} />
          <Stat label="Mode" value={enabled ? "AUTONOMOUS" : "MANUAL"} hint={loading ? "loading" : "ready"} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!!running} onClick={() => void run("gv34-connector-health-audit")}>{running === "gv34-connector-health-audit" ? "…" : "Audit connectors"}</Button>
          <Button size="sm" variant="outline" disabled={!!running} onClick={() => void run("gv34-decision-loop")}>{running === "gv34-decision-loop" ? "…" : "Run decision loop"}</Button>
          <Button size="sm" variant="outline" disabled={!!running} onClick={() => void run("gv34-creative-diversity")}>{running === "gv34-creative-diversity" ? "…" : "Score creative diversity"}</Button>
          <Button size="sm" variant="outline" disabled={!!running} onClick={() => void run("gv34-learning-evaluator")}>{running === "gv34-learning-evaluator" ? "…" : "Evaluate learning"}</Button>
        </div>

        {connectors.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
            {connectors.map((c) => (
              <div key={c.source_name} className="flex items-center justify-between border rounded px-2 py-1">
                <span className="truncate font-medium">{c.source_name}</span>
                <Badge variant={c.error_step ? "secondary" : "default"}>{c.error_step ?? "ok"}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border rounded p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground truncate">{hint}</div>}
    </div>
  );
}
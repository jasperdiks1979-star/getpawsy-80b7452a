import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  probe_key: string;
  status: "green" | "yellow" | "red";
  latency_ms: number | null;
  last_success_at: string | null;
  failure_reason: string | null;
  suggested_fix: string | null;
  checked_at: string;
};

const STATUS_COLOR: Record<string, string> = {
  green: "bg-emerald-500/20 text-emerald-300 border-emerald-700",
  yellow: "bg-amber-500/20 text-amber-300 border-amber-700",
  red: "bg-rose-500/20 text-rose-300 border-rose-700",
};

export default function AnalyticsHealthPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    // latest row per probe_key
    const { data } = await supabase
      .from("analytics_health_checks")
      .select("probe_key,status,latency_ms,last_success_at,failure_reason,suggested_fix,checked_at")
      .order("checked_at", { ascending: false })
      .limit(200);
    const seen = new Set<string>();
    const latest: Row[] = [];
    (data || []).forEach((r: any) => {
      if (!seen.has(r.probe_key)) { seen.add(r.probe_key); latest.push(r); }
    });
    setRows(latest);
    const { data: al } = await supabase
      .from("analytics_alerts").select("*").eq("status", "open").order("opened_at", { ascending: false }).limit(50);
    setAlerts(al || []);
    setLoading(false);
  }

  async function runProbe() {
    await supabase.functions.invoke("analytics-health-probe", { body: {} });
    await load();
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics Health</h1>
          <p className="text-sm text-muted-foreground">Per-probe status, latency, and suggested fix. Auto-refreshes every 60s.</p>
        </div>
        <button onClick={runProbe} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm">Run now</button>
      </div>

      {alerts.length > 0 && (
        <div className="rounded-lg border border-rose-700 bg-rose-500/10 p-4">
          <h2 className="font-semibold mb-2 text-rose-200">Open alerts ({alerts.length})</h2>
          <ul className="text-sm space-y-1">
            {alerts.map((a) => (
              <li key={a.id}><span className="font-medium">{a.title}</span> — {a.message} <span className="text-xs text-muted-foreground">[{a.suggested_fix}]</span></li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading && <div className="text-muted-foreground text-sm">Loading…</div>}
        {rows.map((r) => (
          <div key={r.probe_key} className={`rounded-lg border p-4 ${STATUS_COLOR[r.status] || "border-border"}`}>
            <div className="flex items-center justify-between">
              <div className="font-semibold">{r.probe_key}</div>
              <span className="uppercase text-xs px-2 py-0.5 rounded bg-background/40">{r.status}</span>
            </div>
            <div className="text-xs mt-2 space-y-1">
              <div>Last success: {r.last_success_at ? new Date(r.last_success_at).toLocaleString() : "—"}</div>
              <div>Latency: {r.latency_ms ?? "—"} ms</div>
              <div>Checked: {new Date(r.checked_at).toLocaleString()}</div>
              {r.failure_reason && <div className="text-foreground">⚠ {r.failure_reason}</div>}
              {r.suggested_fix && <div className="text-muted-foreground italic">Fix: {r.suggested_fix}</div>}
            </div>
          </div>
        ))}
        {!loading && rows.length === 0 && (
          <div className="col-span-full text-sm text-muted-foreground">No probe data yet. Click <em>Run now</em>.</div>
        )}
      </div>
    </div>
  );
}
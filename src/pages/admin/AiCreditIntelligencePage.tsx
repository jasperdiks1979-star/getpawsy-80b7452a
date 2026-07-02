import { useEffect, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";

type Stats = {
  credits_7d: number;
  credits_24h: number;
  posted_7d: number;
  posted_24h: number;
  rejected_7d: number;
  rejected_24h: number;
  draft: number;
  cred_per_pin: number;
  yield_pct: number;
};

type Budget = {
  id: string;
  scope: string;
  scope_key: string;
  period: string;
  credits_limit: number;
  credits_used: number;
  paused: boolean;
  paused_reason: string | null;
};

type Recovery = {
  id: string;
  event_type: string;
  source: string | null;
  credits_saved_estimate: number;
  created_at: string;
  detail: any;
};

type Circuit = {
  circuit_key: string;
  state: string;
  failure_count: number;
  reason: string | null;
  opened_at: string | null;
};

const Metric = ({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) => (
  <Card>
    <CardContent className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub ? <div className="text-xs text-muted-foreground mt-1">{sub}</div> : null}
    </CardContent>
  </Card>
);

export default function AiCreditIntelligencePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [recovery, setRecovery] = useState<Recovery[]>([]);
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const since7d = new Date(Date.now() - 7 * 86400000).toISOString();
    const since24h = new Date(Date.now() - 86400000).toISOString();
    const [ev, posted7d, posted24h, rej7d, rej24h, draft, b, r, c] = await Promise.all([
      supabase.from("pinterest_credit_events").select("credits_used,created_at").gte("created_at", since7d),
      supabase.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "posted").gte("posted_at", since7d),
      supabase.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "posted").gte("posted_at", since24h),
      supabase.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "rejected").gte("updated_at", since7d),
      supabase.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "rejected").gte("updated_at", since24h),
      supabase.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "draft"),
      supabase.from("ai_credit_budgets").select("*").order("scope"),
      supabase.from("ai_credit_recovery_log").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("ai_credit_circuit_state").select("*").order("updated_at", { ascending: false }),
    ]);
    const events = ev.data ?? [];
    const c24 = Date.now() - 86400000;
    const credits_7d = events.reduce((s: number, e: any) => s + (e.credits_used ?? 0), 0);
    const credits_24h = events.filter((e: any) => new Date(e.created_at).getTime() > c24).reduce((s: number, e: any) => s + (e.credits_used ?? 0), 0);
    const p7 = posted7d.count ?? 0;
    const rj7 = rej7d.count ?? 0;
    setStats({
      credits_7d,
      credits_24h,
      posted_7d: p7,
      posted_24h: posted24h.count ?? 0,
      rejected_7d: rj7,
      rejected_24h: rej24h.count ?? 0,
      draft: draft.count ?? 0,
      cred_per_pin: p7 > 0 ? credits_7d / p7 : 0,
      yield_pct: p7 + rj7 > 0 ? (p7 / (p7 + rj7)) * 100 : 0,
    });
    setBudgets((b.data as Budget[]) ?? []);
    setRecovery((r.data as Recovery[]) ?? []);
    setCircuits((c.data as Circuit[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const savedTotal = recovery.reduce((s, r) => s + (r.credits_saved_estimate ?? 0), 0);

  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      <Helmet><title>AI Credit Intelligence | Admin</title></Helmet>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">AI Credit Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-1">GENESIS V11.2 — live credit economics, budgets, circuit breakers, and recovery ledger.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="Credits · 7d" value={stats?.credits_7d.toLocaleString() ?? "…"} />
        <Metric label="Credits · 24h" value={stats?.credits_24h.toLocaleString() ?? "…"} />
        <Metric label="Pins posted · 7d" value={stats?.posted_7d ?? "…"} />
        <Metric label="Credits / published pin" value={stats ? stats.cred_per_pin.toFixed(1) : "…"} sub="V11 baseline: 311.6" />
        <Metric label="Publish yield" value={stats ? `${stats.yield_pct.toFixed(2)}%` : "…"} sub="V11 baseline: 2.66%" />
        <Metric label="Rejected · 7d" value={stats?.rejected_7d ?? "…"} />
        <Metric label="Draft queue" value={stats?.draft ?? "…"} />
        <Metric label="Credits saved (log)" value={savedTotal.toLocaleString()} sub={`${recovery.length} interventions`} />
      </div>

      <Card>
        <CardHeader><CardTitle>Credit budgets</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr><th>Scope</th><th>Key</th><th>Period</th><th className="text-right">Used</th><th className="text-right">Limit</th><th>State</th></tr>
            </thead>
            <tbody>
              {budgets.map((b) => (
                <tr key={b.id} className="border-t">
                  <td>{b.scope}</td>
                  <td className="font-mono text-xs">{b.scope_key}</td>
                  <td>{b.period}</td>
                  <td className="text-right">{b.credits_used.toLocaleString()}</td>
                  <td className="text-right">{b.credits_limit.toLocaleString()}</td>
                  <td>{b.paused ? <Badge variant="destructive">paused</Badge> : <Badge variant="outline">active</Badge>}</td>
                </tr>
              ))}
              {budgets.length === 0 && <tr><td colSpan={6} className="text-muted-foreground py-4 text-center">No budgets configured.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Circuit breakers</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {circuits.length === 0 && <div className="text-muted-foreground">No circuits tripped.</div>}
            {circuits.map((c) => (
              <div key={c.circuit_key} className="flex justify-between border-t pt-2">
                <span className="font-mono text-xs">{c.circuit_key}</span>
                <Badge variant={c.state === "open" ? "destructive" : "outline"}>{c.state} · {c.failure_count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recovery ledger (recent)</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr><th>When</th><th>Event</th><th>Source</th><th className="text-right">Saved</th></tr>
              </thead>
              <tbody>
                {recovery.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="text-xs">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="text-xs">{r.event_type}</td>
                    <td className="text-xs font-mono">{r.source ?? "—"}</td>
                    <td className="text-right">{r.credits_saved_estimate}</td>
                  </tr>
                ))}
                {recovery.length === 0 && <tr><td colSpan={4} className="text-muted-foreground py-4 text-center">No interventions logged yet.</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, AlertTriangle, RefreshCw, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Snap = {
  channel_key: string; channel_label: string; status: string; available: boolean;
  health_score: number; dependency_score: number; spof_score: number;
  revenue_30d_usd: number; visitors_30d: number; revenue_share: number;
};
type Report = {
  id: string; generated_at: string; diversification_score: number;
  top_spof_channel: string | null; top_spof_revenue_pct: number;
  active_channels: number; unavailable_channels: number; sha256: string;
};
type Sim = {
  scenario: string; expected_revenue_loss_usd: number;
  expected_revenue_loss_pct: number; best_alternative: string | null;
  recovery_time_days: number | null; operational_impact: string | null;
};

function statusColor(s: string) {
  return s === "ACTIVE" ? "bg-emerald-600" :
    s === "LIMITED" ? "bg-amber-500" :
    s === "DEGRADED" ? "bg-orange-500" :
    s === "UNAVAILABLE" ? "bg-red-600" : "bg-slate-500";
}

export default function ChannelIntelligenceCard() {
  const [report, setReport] = useState<Report | null>(null);
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [sims, setSims] = useState<Sim[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data: r } = await supabase
      .from("channel_intelligence_reports")
      .select("*").order("generated_at", { ascending: false }).limit(1).maybeSingle();
    setReport(r as any);

    const { data: s } = await supabase
      .from("channel_intelligence_snapshots")
      .select("channel_key,channel_label,status,available,health_score,dependency_score,spof_score,revenue_30d_usd,visitors_30d,revenue_share,captured_at")
      .order("captured_at", { ascending: false }).limit(30);
    // Keep only latest snapshot per channel
    const latest = new Map<string, Snap>();
    for (const row of (s as any[]) ?? []) if (!latest.has(row.channel_key)) latest.set(row.channel_key, row);
    setSnaps(Array.from(latest.values()).sort((a, b) => b.revenue_share - a.revenue_share));

    const { data: sm } = await supabase
      .from("channel_survival_simulations")
      .select("scenario,expected_revenue_loss_usd,expected_revenue_loss_pct,best_alternative,recovery_time_days,operational_impact,simulated_at")
      .order("simulated_at", { ascending: false }).limit(10);
    setSims((sm as any) ?? []);
  }

  useEffect(() => { load(); }, []);

  async function run() {
    setBusy(true);
    try {
      await supabase.functions.invoke("channel-intelligence-engine", { body: {} });
      await load();
    } finally { setBusy(false); }
  }

  return (
    <Card className="border-indigo-300">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <Shield className="h-4 w-4" /> Channel Intelligence Engine
          {report && (
            <>
              <Badge className="bg-indigo-600 text-white">Diversification {report.diversification_score}/100</Badge>
              <Badge variant="outline">{report.active_channels} active</Badge>
              <Badge variant="outline" className="border-red-400 text-red-700">{report.unavailable_channels} off</Badge>
            </>
          )}
          <Button size="sm" variant="outline" className="ml-auto" onClick={run} disabled={busy}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Running..." : "Run engine"}
          </Button>
        </CardTitle>
        {report && (
          <p className="text-xs text-muted-foreground mt-1">
            Top SPOF: <span className="font-medium">{report.top_spof_channel}</span>
            {" "}({(Number(report.top_spof_revenue_pct) * 100).toFixed(1)}% revenue) ·
            SHA-256 <span className="font-mono">{report.sha256.slice(0, 12)}…</span>
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {snaps.length === 0 ? (
          <p className="text-xs text-muted-foreground">No snapshots yet — click "Run engine" to compute channel health.</p>
        ) : (
          <div>
            <div className="text-xs font-semibold mb-2 flex items-center gap-1">
              <Activity className="h-3.5 w-3.5" /> Channel Health (30d)
            </div>
            <div className="grid gap-1.5">
              {snaps.map((s) => (
                <div key={s.channel_key} className="flex items-center gap-2 text-xs">
                  <Badge className={`${statusColor(s.status)} text-white shrink-0 w-24 justify-center`}>{s.status}</Badge>
                  <span className="font-medium min-w-[8rem]">{s.channel_label}</span>
                  <span className="text-muted-foreground">H {s.health_score}</span>
                  <span className="text-muted-foreground">Dep {s.dependency_score}</span>
                  <span className={s.spof_score >= 40 ? "text-red-600 font-medium" : "text-muted-foreground"}>
                    SPOF {s.spof_score}
                  </span>
                  <span className="ml-auto tabular-nums">${s.revenue_30d_usd.toFixed(0)}</span>
                  <span className="text-muted-foreground tabular-nums w-14 text-right">{s.visitors_30d}v</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {sims.length > 0 && (
          <div>
            <div className="text-xs font-semibold mb-2 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Survival Simulations
            </div>
            <div className="space-y-1.5">
              {sims.slice(0, 5).map((s, i) => (
                <div key={i} className="text-xs rounded border p-2">
                  <div className="font-medium">{s.scenario}</div>
                  <div className="text-muted-foreground mt-0.5">
                    Loss: ${s.expected_revenue_loss_usd.toFixed(0)} ({(Number(s.expected_revenue_loss_pct) * 100).toFixed(1)}%) ·
                    Recovery {s.recovery_time_days}d · Best alt: <span className="font-medium">{s.best_alternative}</span>
                  </div>
                  {s.operational_impact && <div className="text-muted-foreground italic">{s.operational_impact}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
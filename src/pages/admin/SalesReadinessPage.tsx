import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Download, Sparkles } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";

type Sub = {
  key: string; label: string; score: number; weight: number;
  confidence: number; evidence: Record<string, unknown>; note: string;
};
type SimRow = { visitors: number; expected_atc: number; expected_checkout: number; expected_purchases: number; expected_revenue: number; confidence: number };
type Priority = { key: string; label: string; score: number; weight: number; gap_points: number; revenue_impact: number; confidence: number; note: string };
type Snapshot = {
  id: string; captured_at: string; overall_score: number; confidence: number;
  status: string; simulation: { rows: SimRow[] }; priorities: Priority[];
  executive_summary: { biggest_blocker?: string; biggest_opportunity?: string; highest_roi_fix?: string; highest_risk?: string; expected_revenue_impact_usd?: number };
};

function statusBadge(status: string, score: number) {
  if (status === "ready" || score >= 80) return <Badge className="bg-emerald-600">🟢 READY</Badge>;
  if (status === "watch" || score >= 50) return <Badge className="bg-amber-500">🟡 WATCH</Badge>;
  return <Badge variant="destructive">🔴 CRITICAL</Badge>;
}
function scoreColor(n: number) {
  if (n >= 80) return "text-emerald-600";
  if (n >= 50) return "text-amber-600";
  return "text-red-600";
}

async function sha256(text: string) {
  const buf = new TextEncoder().encode(text);
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function SalesReadinessPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [range, setRange] = useState<"7"|"30"|"90"|"365"|"all">("30");
  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState(false);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("sales_readiness_snapshots").select("*")
      .order("captured_at", { ascending: false }).limit(1).maybeSingle();
    if (data) {
      setSnapshot(data as Snapshot);
      const { data: subRows } = await supabase
        .from("sales_readiness_subscores").select("*")
        .eq("snapshot_id", (data as Snapshot).id);
      setSubs((subRows ?? []) as Sub[]);
    }
    setLoading(false);
  }, []);

  const loadHistory = useCallback(async () => {
    const since = range === "all" ? null : new Date(Date.now() - Number(range) * 86400e3).toISOString();
    let q = supabase.from("sales_readiness_snapshots").select("*").order("captured_at", { ascending: true });
    if (since) q = q.gte("captured_at", since);
    const { data } = await q;
    setHistory((data ?? []) as Snapshot[]);
  }, [range]);

  useEffect(() => { loadLatest(); }, [loadLatest]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function compute() {
    setComputing(true);
    const { data, error } = await supabase.functions.invoke("sales-readiness-compute", { body: {} });
    setComputing(false);
    if (error) { toast.error(`Compute failed: ${error.message}`); return; }
    toast.success(`CEO Score: ${data?.overall}/100`);
    await loadLatest(); await loadHistory();
  }

  async function exportCertification() {
    if (!snapshot) return;
    const payload = {
      title: "GENESIS V13.1 — SALES READINESS CERTIFICATION",
      captured_at: snapshot.captured_at, overall_score: snapshot.overall_score,
      confidence: snapshot.confidence, status: snapshot.status,
      subscores: subs, priorities: snapshot.priorities,
      simulation: snapshot.simulation, executive_summary: snapshot.executive_summary,
    };
    const json = JSON.stringify(payload);
    const fingerprint = await sha256(json);

    await supabase.from("sales_readiness_certifications").insert({
      snapshot_id: snapshot.id, overall_score: snapshot.overall_score,
      fingerprint_sha256: fingerprint, payload,
    });

    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const W = pdf.internal.pageSize.getWidth();
    let y = 48;
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(18);
    pdf.text("GENESIS V13.1", 40, y); y += 20;
    pdf.setFontSize(14); pdf.text("Sales Readiness Certification", 40, y); y += 24;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(10);
    pdf.text(`Captured: ${new Date(snapshot.captured_at).toLocaleString()}`, 40, y); y += 14;
    pdf.text(`Overall CEO Score: ${snapshot.overall_score} / 100  (${snapshot.status.toUpperCase()})`, 40, y); y += 14;
    pdf.text(`Confidence: ${snapshot.confidence}%`, 40, y); y += 20;

    pdf.setFont("helvetica", "bold"); pdf.text("Executive Summary", 40, y); y += 14;
    pdf.setFont("helvetica", "normal");
    const es = snapshot.executive_summary || {};
    const lines = [
      `Top blocker: ${es.biggest_blocker ?? "—"}`,
      `Top opportunity: ${es.biggest_opportunity ?? "—"}`,
      `Highest ROI fix: ${es.highest_roi_fix ?? "—"}`,
      `Highest risk: ${es.highest_risk ?? "—"}`,
      `Expected 30d revenue impact: $${es.expected_revenue_impact_usd ?? 0}`,
    ];
    for (const l of lines) { pdf.text(pdf.splitTextToSize(l, W - 80), 40, y); y += 14; }
    y += 8;

    pdf.setFont("helvetica", "bold"); pdf.text("Subscores (score · weight · confidence)", 40, y); y += 14;
    pdf.setFont("helvetica", "normal");
    for (const s of subs) {
      if (y > 760) { pdf.addPage(); y = 48; }
      pdf.text(`${s.label}: ${Math.round(s.score)} · w=${s.weight}% · c=${Math.round(s.confidence)}%`, 40, y);
      y += 12;
      const nt = pdf.splitTextToSize(`  ↳ ${s.note}`, W - 60);
      pdf.text(nt, 40, y); y += 12 * nt.length;
    }

    if (y > 720) { pdf.addPage(); y = 48; }
    pdf.setFont("helvetica", "bold"); pdf.text("Revenue Simulation", 40, y); y += 14;
    pdf.setFont("helvetica", "normal");
    for (const r of snapshot.simulation.rows) {
      pdf.text(`${r.visitors} visitors → ATC ${r.expected_atc} · Checkout ${r.expected_checkout} · Purchases ${r.expected_purchases} · Rev $${r.expected_revenue}`, 40, y);
      y += 12;
    }
    y += 8;
    pdf.setFont("helvetica", "bold"); pdf.text("Fingerprint (SHA-256)", 40, y); y += 12;
    pdf.setFont("courier", "normal"); pdf.setFontSize(8);
    pdf.text(pdf.splitTextToSize(fingerprint, W - 80), 40, y);

    pdf.save(`genesis-v13.1-sales-readiness-${snapshot.captured_at.slice(0,10)}.pdf`);
    toast.success("Certification archived + downloaded");
  }

  const subMap = useMemo(() => new Map(subs.map((s) => [s.key, s])), [subs]);

  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      <Helmet><title>Sales Readiness · CEO Score | Admin</title></Helmet>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Sales Readiness · CEO Score</h1>
          <p className="text-sm text-muted-foreground">
            GENESIS V13.1 — one unified answer: how likely is a real visitor to become a satisfied paying customer today?
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={loadLatest} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={compute} disabled={computing}>
            <Sparkles className={`w-4 h-4 mr-2 ${computing ? "animate-pulse" : ""}`} /> {computing ? "Computing…" : "Compute now"}
          </Button>
          <Button size="sm" variant="secondary" onClick={exportCertification} disabled={!snapshot}>
            <Download className="w-4 h-4 mr-2" /> Export certification
          </Button>
        </div>
      </div>

      <Card className="border-2">
        <CardContent className="p-8 flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Sales Readiness</div>
            <div className={`text-7xl font-bold mt-1 ${scoreColor(snapshot?.overall_score ?? 0)}`}>
              {snapshot ? Math.round(snapshot.overall_score) : "—"}
              <span className="text-2xl text-muted-foreground">/100</span>
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              Confidence {snapshot ? Math.round(snapshot.confidence) : 0}% ·
              {snapshot?.captured_at ? ` snapshot ${new Date(snapshot.captured_at).toLocaleString()}` : " no snapshot yet"}
            </div>
          </div>
          <div>{snapshot ? statusBadge(snapshot.status, snapshot.overall_score) : <Badge variant="outline">no data</Badge>}</div>
        </CardContent>
      </Card>

      {snapshot && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Executive Summary</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <div><b>Top blocker:</b> {snapshot.executive_summary.biggest_blocker ?? "—"}</div>
              <div><b>Top opportunity:</b> {snapshot.executive_summary.biggest_opportunity ?? "—"}</div>
              <div><b>Highest ROI fix:</b> {snapshot.executive_summary.highest_roi_fix ?? "—"}</div>
              <div><b>Highest risk:</b> {snapshot.executive_summary.highest_risk ?? "—"}</div>
              <div><b>Expected 30d impact:</b> ${snapshot.executive_summary.expected_revenue_impact_usd ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Revenue Simulation</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr><th className="text-left py-1">Visitors</th><th>ATC</th><th>Checkout</th><th>Purchases</th><th className="text-right">Revenue</th></tr>
                </thead>
                <tbody>
                  {snapshot.simulation.rows.map((r) => (
                    <tr key={r.visitors} className="border-t">
                      <td className="py-1">{r.visitors.toLocaleString()}</td>
                      <td className="text-center">{r.expected_atc}</td>
                      <td className="text-center">{r.expected_checkout}</td>
                      <td className="text-center">{r.expected_purchases}</td>
                      <td className="text-right font-medium">${r.expected_revenue.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-[11px] text-muted-foreground mt-2">
                Confidence interval based on observed 7-day funnel rates.
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {snapshot && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Auto-Prioritized Actions</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-xs">
                <tr><th className="text-left py-1">#</th><th className="text-left">Area</th><th>Score</th><th>Weight</th><th>Gap · pts</th><th>ROI ($)</th><th>Conf.</th></tr>
              </thead>
              <tbody>
                {snapshot.priorities.map((p, i) => (
                  <tr key={p.key} className="border-t">
                    <td className="py-1">{i + 1}</td>
                    <td>{p.label}<div className="text-[11px] text-muted-foreground">{p.note}</div></td>
                    <td className={`text-center ${scoreColor(p.score)}`}>{p.score}</td>
                    <td className="text-center">{p.weight}%</td>
                    <td className="text-center">{p.gap_points}</td>
                    <td className="text-center">${p.revenue_impact}</td>
                    <td className="text-center">{p.confidence}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Subscores</h2>
          <div className="text-xs text-muted-foreground">{subs.length} of 28 evidence-backed axes</div>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          {subs.map((s) => (
            <Card key={s.key}>
              <CardHeader className="pb-1 flex-row justify-between items-center">
                <CardTitle className="text-sm">{s.label}</CardTitle>
                <Badge variant="outline">w {s.weight}%</Badge>
              </CardHeader>
              <CardContent className="pt-0">
                <div className={`text-3xl font-semibold ${scoreColor(s.score)}`}>{Math.round(s.score)}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{s.note}</div>
                <div className="text-[10px] text-muted-foreground mt-1">confidence {Math.round(s.confidence)}%</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2 flex-row justify-between items-center">
          <CardTitle className="text-base">Executive History</CardTitle>
          <div className="flex gap-1">
            {(["7","30","90","365","all"] as const).map((r) => (
              <Button key={r} variant={range === r ? "default" : "outline"} size="sm" onClick={() => setRange(r)}>
                {r === "all" ? "Lifetime" : `${r}d`}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-sm text-muted-foreground">No snapshots in this range yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr><th className="text-left py-1">When</th><th>Overall</th><th>Status</th><th className="text-right">Confidence</th></tr>
                </thead>
                <tbody>
                  {history.slice().reverse().slice(0, 60).map((h) => (
                    <tr key={h.id} className="border-t">
                      <td className="py-1">{new Date(h.captured_at).toLocaleString()}</td>
                      <td className={`text-center ${scoreColor(h.overall_score)}`}>{Math.round(h.overall_score)}</td>
                      <td className="text-center">{h.status}</td>
                      <td className="text-right">{Math.round(h.confidence)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {!!subMap.size || null}
    </div>
  );
}
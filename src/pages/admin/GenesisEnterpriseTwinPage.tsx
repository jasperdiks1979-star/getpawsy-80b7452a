// GENESIS V15 — Enterprise Digital Twin
// Autonomous CEO • CFO • COO • CMO intelligence platform.
// Sources evidence only from Ω.3 canonical truth tables via genesis-v15-twin.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Brain, Download, Loader2, RefreshCw, Sparkles, ShieldCheck, TrendingUp, Waypoints } from "lucide-react";
import jsPDF from "jspdf";

type Snap = { id: string; captured_at: string; revenue: number; orders: number; visitors: number; aov: number; conversion_rate: number; business_health_overall: number; subscores: Record<string, number>; kpis: Record<string, number>; fingerprint_sha256: string | null };
type Pred = { id: string; metric: string; horizon: string; target_date: string; predicted_value: number; ci_low: number; ci_high: number; confidence: number };
type Rec = { id: string; problem: string; root_cause: string; confidence: number; expected_impact: string; estimated_roi: number; estimated_effort: string; priority: number; domain: string; suggested_actions: string[] };
type Bot = { id: string; domain: string; label: string; severity: number; metric: string; metric_value: number; target_value: number };
type Sim = { id: string; name: string; scenario: string; predicted: Record<string, number>; expected_revenue_delta: number; expected_profit_delta: number; expected_roi: number; confidence: number };
type Brief = { id: string; kind: string; role: string; markdown: string; created_at: string; kpis: Record<string, number> };
type Cert = {
  id: string; issued_at: string;
  business_intelligence_score: number; prediction_accuracy: number; business_health: number; financial_health: number;
  marketing_health: number; infrastructure_health: number; automation_health: number; tax_readiness: number;
  audit_readiness: number; executive_readiness: number; overall_genesis_intelligence: number;
  subscores: Record<string, number>; narrative: string; fingerprint_sha256: string;
};

export default function GenesisEnterpriseTwinPage() {
  const [snap, setSnap] = useState<Snap | null>(null);
  const [preds, setPreds] = useState<Pred[]>([]);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [sims, setSims] = useState<Sim[]>([]);
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [certs, setCerts] = useState<Cert[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [pdfLayout, setPdfLayout] = useState<"compact" | "executive">("executive");

  // simulator inputs
  const [trafficMul, setTrafficMul] = useState("2");
  const [convDelta, setConvDelta] = useState("1");
  const [aov, setAov] = useState("60");
  const [aiMul, setAiMul] = useState("1");

  async function load() {
    const [s, p, r, b, sim, br, c] = await Promise.all([
      supabase.from("genesis_v15_twin_snapshots").select("*").order("captured_at", { ascending: false }).limit(1),
      supabase.from("genesis_v15_predictions").select("*").order("created_at", { ascending: false }).limit(10),
      supabase.from("genesis_v15_recommendations").select("*").order("priority", { ascending: true }).limit(20),
      supabase.from("genesis_v15_bottlenecks").select("*").order("severity", { ascending: false }).limit(20),
      supabase.from("genesis_v15_simulations").select("*").order("created_at", { ascending: false }).limit(10),
      supabase.from("genesis_v15_briefings").select("*").order("created_at", { ascending: false }).limit(10),
      supabase.from("genesis_v15_certifications").select("*").order("issued_at", { ascending: false }).limit(5),
    ]);
    setSnap((s.data?.[0] as any) ?? null);
    setPreds((p.data as any) ?? []);
    setRecs((r.data as any) ?? []);
    setBots((b.data as any) ?? []);
    setSims((sim.data as any) ?? []);
    setBriefs((br.data as any) ?? []);
    setCerts((c.data as any) ?? []);
  }
  useEffect(() => { load(); }, []);

  async function run(action: string, body: Record<string, unknown> = {}) {
    setBusy(action);
    try {
      await supabase.functions.invoke("genesis-v15-twin", { body: { action, ...body } });
      await load();
    } finally { setBusy(null); }
  }

  const latestCert = certs[0];

  function exportCertificationPdf() {
    if (!latestCert) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const left = 48;
    let y = 56;
    const isCompact = pdfLayout === "compact";

    doc.setFont("helvetica", "bold"); doc.setFontSize(isCompact ? 15 : 18);
    doc.text("GENESIS V15 — Enterprise Digital Twin Certification", left, y); y += isCompact ? 18 : 22;
    doc.setFont("helvetica", "normal"); doc.setFontSize(isCompact ? 9 : 10); doc.setTextColor(110, 110, 110);
    doc.text(`Issued: ${new Date(latestCert.issued_at).toLocaleString()}`, left, y); y += isCompact ? 12 : 14;
    doc.text(`Certification ID: ${latestCert.id}`, left, y); y += isCompact ? 14 : 20;
    doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "bold"); doc.setFontSize(isCompact ? 18 : 24);
    doc.text(`Overall Intelligence: ${latestCert.overall_genesis_intelligence} / 100`, left, y); y += isCompact ? 20 : 26;

    const axes: Array<[string, number]> = [
      ["Business Intelligence", latestCert.business_intelligence_score],
      ["Prediction Accuracy", latestCert.prediction_accuracy],
      ["Business Health", latestCert.business_health],
      ["Financial Health", latestCert.financial_health],
      ["Marketing Health", latestCert.marketing_health],
      ["Infrastructure Health", latestCert.infrastructure_health],
      ["Automation Health", latestCert.automation_health],
      ["Tax Readiness", latestCert.tax_readiness],
      ["Audit Readiness", latestCert.audit_readiness],
      ["Executive Readiness", latestCert.executive_readiness],
    ];

    if (isCompact) {
      // Compact: 2-column axis grid, minimal narrative, tight spacing.
      doc.setFont("helvetica", "bold"); doc.setFontSize(11);
      doc.text("Axis Scores (0–100)", left, y); y += 13;
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      const colW = (pageW - left * 2) / 2;
      for (let i = 0; i < axes.length; i += 2) {
        if (y > 780) { doc.addPage(); y = 56; }
        const drawCell = (k: string, v: number, x: number) => {
          doc.setTextColor(110, 110, 110); doc.text(k, x, y);
          doc.setTextColor(0, 0, 0); doc.text(String(v ?? "—"), x + colW - 40, y);
        };
        drawCell(axes[i][0], axes[i][1], left);
        if (axes[i + 1]) drawCell(axes[i + 1][0], axes[i + 1][1], left + colW);
        y += 13;
      }
      y += 8;
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("SHA-256", left, y); y += 11;
      doc.setFont("courier", "normal"); doc.setFontSize(8);
      const fp = doc.splitTextToSize(latestCert.fingerprint_sha256 ?? "—", pageW - left * 2);
      doc.text(fp, left, y);
    } else {
      // Executive: narrative-heavy, per-axis interpretation, wide fingerprint block.
      doc.setFont("helvetica", "bold"); doc.setFontSize(12);
      doc.text("Executive Narrative", left, y); y += 16;
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      const nar = doc.splitTextToSize(latestCert.narrative ?? "—", pageW - left * 2);
      doc.text(nar, left, y); y += nar.length * 12 + 16;

      if (y > 700) { doc.addPage(); y = 56; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(12);
      doc.text("Axis Scores & Interpretation", left, y); y += 14;
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      const band = (v: number) => v >= 85 ? "Excellent" : v >= 70 ? "Strong" : v >= 55 ? "Developing" : v >= 40 ? "At risk" : "Critical";
      for (const [k, v] of axes) {
        if (y > 770) { doc.addPage(); y = 56; }
        doc.setFont("helvetica", "bold"); doc.setFontSize(10);
        doc.setTextColor(0, 0, 0); doc.text(`${k}`, left, y);
        doc.text(`${v ?? "—"} / 100`, left + 260, y);
        doc.setFont("helvetica", "italic"); doc.setTextColor(110, 110, 110);
        doc.text(band(Number(v ?? 0)), left + 360, y);
        y += 12;
        doc.setFont("helvetica", "normal"); doc.setTextColor(80, 80, 80); doc.setFontSize(9);
        const line = doc.splitTextToSize(
          `Assessed against Ω.3 canonical truth. Score ${v ?? "—"} reflects trailing 30-day observations and prior certification lineage.`,
          pageW - left * 2,
        );
        doc.text(line, left, y); y += line.length * 11 + 4;
        doc.setTextColor(0, 0, 0);
      }

      if (y > 720) { doc.addPage(); y = 56; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(12);
      doc.text("Evidence & Fingerprint", left, y); y += 14;
      doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(80, 80, 80);
      const evid = doc.splitTextToSize(
        "Evidence anchored exclusively to Ω.3 canonical truth (orders, canonical_sessions, pinterest_pins) and prior Ω∞ certifications. No fabricated values. This document is immutable and independently reproducible from the source tables.",
        pageW - left * 2,
      );
      doc.text(evid, left, y); y += evid.length * 12 + 10;
      doc.setTextColor(0, 0, 0);
      doc.setFont("courier", "normal"); doc.setFontSize(9);
      const fp = doc.splitTextToSize(latestCert.fingerprint_sha256 ?? "—", pageW - left * 2);
      doc.text(fp, left, y);
    }

    doc.save(`genesis-v15-certification-${pdfLayout}-${latestCert.id}.pdf`);
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="w-7 h-7" /> Genesis V15 — Enterprise Digital Twin
          </h1>
          <p className="text-muted-foreground">Autonomous CEO · CFO · COO · CMO · CTO intelligence. Evidence sourced exclusively from Ω.3 canonical truth.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => run("run-all")} disabled={!!busy}>
            {busy === "run-all" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Run Full Cycle
          </Button>
          <Button variant="outline" onClick={() => run("certify")} disabled={!!busy}>
            <ShieldCheck className="w-4 h-4 mr-2" /> Certify V15
          </Button>
          <Button variant="outline" onClick={exportCertificationPdf} disabled={!latestCert}>
            <Download className="w-4 h-4 mr-2" /> Export PDF ({pdfLayout})
          </Button>
          <Button variant="ghost" size="icon" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-6">
        {[
          ["Revenue 30d", snap ? `$${Number(snap.revenue).toFixed(0)}` : "—"],
          ["Orders", snap ? String(snap.orders) : "—"],
          ["Visitors", snap ? String(snap.visitors) : "—"],
          ["AOV", snap ? `$${Number(snap.aov).toFixed(2)}` : "—"],
          ["Conv", snap ? `${(Number(snap.conversion_rate) * 100).toFixed(2)}%` : "—"],
          ["Health", snap ? `${snap.business_health_overall}/100` : "—"],
        ].map(([k, v]) => (
          <Card key={k}><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">{k}</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{v}</div></CardContent></Card>
        ))}
      </div>

      <Tabs defaultValue="command">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="command">Command</TabsTrigger>
          <TabsTrigger value="predictions">Predictions</TabsTrigger>
          <TabsTrigger value="bottlenecks">Bottlenecks</TabsTrigger>
          <TabsTrigger value="recommendations">Decisions</TabsTrigger>
          <TabsTrigger value="simulator">Scenario Lab</TabsTrigger>
          <TabsTrigger value="briefings">Briefings</TabsTrigger>
          <TabsTrigger value="certification">Certification</TabsTrigger>
        </TabsList>

        <TabsContent value="command" className="space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4" /> Health Subscores</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {snap && Object.entries(snap.subscores ?? {}).map(([k, v]) => (
                <div key={k} className="border rounded-md p-3">
                  <div className="text-xs text-muted-foreground">{k}</div>
                  <div className="text-2xl font-semibold">{v as number}</div>
                </div>
              ))}
              {!snap && <p className="text-muted-foreground text-sm">Run a full cycle to capture the first snapshot.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="predictions" className="space-y-2">
          <Button size="sm" variant="outline" onClick={() => run("predict")} disabled={!!busy}>
            <TrendingUp className="w-4 h-4 mr-2" /> Refresh Predictions
          </Button>
          {preds.map((p) => (
            <Card key={p.id}><CardContent className="py-3 flex justify-between items-center text-sm">
              <div>
                <div className="font-medium">{p.metric} · {p.horizon}</div>
                <div className="text-xs text-muted-foreground">target {p.target_date} · CI [${Number(p.ci_low).toFixed(0)} — ${Number(p.ci_high).toFixed(0)}]</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold">${Number(p.predicted_value).toFixed(0)}</div>
                <div className="text-xs text-muted-foreground">confidence {(Number(p.confidence) * 100).toFixed(0)}%</div>
              </div>
            </CardContent></Card>
          ))}
          {!preds.length && <p className="text-muted-foreground text-sm">No predictions yet.</p>}
        </TabsContent>

        <TabsContent value="bottlenecks" className="space-y-2">
          <Button size="sm" variant="outline" onClick={() => run("bottlenecks")} disabled={!!busy}>Refresh Bottlenecks</Button>
          {bots.map((b) => (
            <Card key={b.id}><CardContent className="py-3 flex justify-between items-center text-sm">
              <div>
                <div className="font-medium">{b.label}</div>
                <div className="text-xs text-muted-foreground">{b.domain} · {b.metric} = {Number(b.metric_value).toFixed(2)} (target {Number(b.target_value).toFixed(2)})</div>
              </div>
              <Badge variant={b.severity >= 80 ? "destructive" : "secondary"}>severity {b.severity}</Badge>
            </CardContent></Card>
          ))}
          {!bots.length && <p className="text-muted-foreground text-sm">No bottlenecks detected.</p>}
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-2">
          <Button size="sm" variant="outline" onClick={() => run("recommendations")} disabled={!!busy}>Refresh Decisions</Button>
          {recs.map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex justify-between items-center">
                  <span>#{r.priority} · {r.problem}</span>
                  <Badge variant="default">ROI {Number(r.estimated_roi).toFixed(1)}×</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <div><span className="text-muted-foreground">Root cause:</span> {r.root_cause}</div>
                <div><span className="text-muted-foreground">Impact:</span> {r.expected_impact} · <span className="text-muted-foreground">effort:</span> {r.estimated_effort} · <span className="text-muted-foreground">confidence:</span> {(Number(r.confidence) * 100).toFixed(0)}%</div>
                <ul className="list-disc pl-5">{(r.suggested_actions ?? []).map((a, i) => <li key={i}>{a}</li>)}</ul>
              </CardContent>
            </Card>
          ))}
          {!recs.length && <p className="text-muted-foreground text-sm">No recommendations yet.</p>}
        </TabsContent>

        <TabsContent value="simulator" className="space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Waypoints className="w-4 h-4" /> Scenario Lab</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-5">
              <label className="text-sm space-y-1"><div>Traffic ×</div><Input value={trafficMul} onChange={(e) => setTrafficMul(e.target.value)} /></label>
              <label className="text-sm space-y-1"><div>Conv Δ pts</div><Input value={convDelta} onChange={(e) => setConvDelta(e.target.value)} /></label>
              <label className="text-sm space-y-1"><div>AOV $</div><Input value={aov} onChange={(e) => setAov(e.target.value)} /></label>
              <label className="text-sm space-y-1"><div>AI cost ×</div><Input value={aiMul} onChange={(e) => setAiMul(e.target.value)} /></label>
              <div className="flex items-end">
                <Button className="w-full" onClick={() => run("simulate", {
                  name: `Scenario ${new Date().toLocaleTimeString()}`,
                  scenario: `traffic×${trafficMul} conv+${convDelta}pt AOV=${aov} AI×${aiMul}`,
                  inputs: { traffic_multiplier: Number(trafficMul), conversion_delta_pct: Number(convDelta), aov: Number(aov), ai_cost_multiplier: Number(aiMul) },
                })} disabled={!!busy}>Simulate</Button>
              </div>
            </CardContent>
          </Card>
          {sims.map((s) => (
            <Card key={s.id}><CardContent className="py-3 text-sm">
              <div className="flex justify-between"><div className="font-medium">{s.name}</div><Badge variant="outline">ROI {Number(s.expected_roi).toFixed(2)}×</Badge></div>
              <div className="text-xs text-muted-foreground">{s.scenario}</div>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.entries(s.predicted ?? {}).map(([k, v]) => (
                  <div key={k} className="border rounded p-2"><div className="text-[10px] text-muted-foreground">{k}</div><div className="font-semibold">{typeof v === "number" ? v.toLocaleString() : String(v)}</div></div>
                ))}
              </div>
            </CardContent></Card>
          ))}
        </TabsContent>

        <TabsContent value="briefings" className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            {["morning_ceo", "evening_ceo", "cfo_daily", "cmo_daily", "coo_daily", "cto_daily"].map((k) => (
              <Button key={k} size="sm" variant="outline" onClick={() => run("briefing", { kind: k })} disabled={!!busy}>{k.replace(/_/g, " ")}</Button>
            ))}
          </div>
          {briefs.map((b) => (
            <Card key={b.id}><CardHeader className="pb-2"><CardTitle className="text-base flex justify-between"><span>{b.role} · {b.kind}</span><span className="text-xs text-muted-foreground">{new Date(b.created_at).toLocaleString()}</span></CardTitle></CardHeader>
              <CardContent><pre className="text-xs whitespace-pre-wrap font-mono">{b.markdown}</pre></CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="certification" className="space-y-3">
          {latestCert ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5" /> V15 Enterprise Certification</CardTitle>
                <p className="text-xs text-muted-foreground break-all">SHA-256: {latestCert.fingerprint_sha256}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-4xl font-bold">{latestCert.overall_genesis_intelligence}/100</div>
                <p className="text-sm">{latestCert.narrative}</p>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {([
                    ["BI Score", latestCert.business_intelligence_score],
                    ["Prediction Acc.", latestCert.prediction_accuracy],
                    ["Business", latestCert.business_health],
                    ["Financial", latestCert.financial_health],
                    ["Marketing", latestCert.marketing_health],
                    ["Infrastructure", latestCert.infrastructure_health],
                    ["Automation", latestCert.automation_health],
                    ["Tax", latestCert.tax_readiness],
                    ["Audit", latestCert.audit_readiness],
                    ["Executive", latestCert.executive_readiness],
                  ] as Array<[string, number]>).map(([k, v]) => (
                    <div key={k} className="border rounded-md p-3">
                      <div className="text-xs text-muted-foreground">{k}</div>
                      <div className="text-2xl font-semibold">{v ?? "—"}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : <p className="text-muted-foreground text-sm">No certification issued yet. Click Certify V15.</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
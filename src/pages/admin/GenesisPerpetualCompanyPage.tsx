// GENESIS Ω∞.1 — Perpetual Company
// The permanent stewardship layer. Runs the perpetual loop and issues Perpetual Certification.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Infinity as InfinityIcon, Loader2, RefreshCw, ShieldCheck, ScrollText, Download } from "lucide-react";
import jsPDF from "jspdf";

type Principle = { id: string; code: string; title: string; body: string; pillar: string | null };
type Cycle = { id: string; cycle_number: number; started_at: string; ended_at: string | null; status: string; learnings: any; priorities: any; observations: any; fingerprint_sha256: string | null };
type Cert = {
  id: string; issued_at: string; overall_company_maturity: number;
  business_sustainability: number; customer_sustainability: number; financial_sustainability: number;
  technical_sustainability: number; operational_sustainability: number; architectural_sustainability: number;
  knowledge_sustainability: number; executive_governance: number; long_term_readiness: number;
  century_readiness: number; narrative: string; fingerprint_sha256: string;
};
type Compass = { id: string; recommendation: string; expected_roi: number; confidence: number; decision: string; board_approval: boolean; century_test_pass: boolean };

export default function GenesisPerpetualCompanyPage() {
  const [principles, setPrinciples] = useState<Principle[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [certs, setCerts] = useState<Cert[]>([]);
  const [compass, setCompass] = useState<Compass[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [p, c, cert, cp] = await Promise.all([
      supabase.from("genesis_perpetual_principles").select("*").order("code"),
      supabase.from("genesis_perpetual_cycles").select("*").order("started_at", { ascending: false }).limit(10),
      supabase.from("genesis_perpetual_certifications").select("*").order("issued_at", { ascending: false }).limit(5),
      supabase.from("genesis_business_compass").select("*").order("created_at", { ascending: false }).limit(20),
    ]);
    setPrinciples((p.data as any) ?? []);
    setCycles((c.data as any) ?? []);
    setCerts((cert.data as any) ?? []);
    setCompass((cp.data as any) ?? []);
  }
  useEffect(() => { load(); }, []);

  async function runCycle() {
    setBusy(true);
    try {
      await supabase.functions.invoke("genesis-omega-perpetual", { body: { action: "cycle" } });
      await load();
    } finally { setBusy(false); }
  }

  const latest = certs[0];
  const axes: Array<[string, number | undefined]> = latest ? [
    ["Business", latest.business_sustainability],
    ["Customer", latest.customer_sustainability],
    ["Financial", latest.financial_sustainability],
    ["Technical", latest.technical_sustainability],
    ["Operational", latest.operational_sustainability],
    ["Architectural", latest.architectural_sustainability],
    ["Knowledge", latest.knowledge_sustainability],
    ["Governance", latest.executive_governance],
    ["Long-Term", latest.long_term_readiness],
    ["Century", latest.century_readiness],
  ] : [];

  function exportCertificationPdf() {
    if (!latest) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const left = 48;
    let y = 56;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("GENESIS Ω∞.1 — Perpetual Company Certification", left, y);
    y += 22;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(110, 110, 110);
    doc.text(`Issued: ${new Date(latest.issued_at).toLocaleString()}`, left, y);
    y += 14;
    doc.text(`Certification ID: ${latest.id}`, left, y);
    y += 18;

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Overall Scores", left, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`Company Maturity: ${latest.overall_company_maturity} / 100`, left, y); y += 14;
    doc.text(`Century Readiness: ${latest.century_readiness} / 100`, left, y); y += 22;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Axis Scores (0–100)", left, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    for (const [label, val] of axes) {
      if (y > 760) { doc.addPage(); y = 56; }
      doc.setTextColor(110, 110, 110);
      doc.text(`${label}`, left, y);
      doc.setTextColor(0, 0, 0);
      doc.text(String(val ?? "—"), left + 200, y);
      y += 16;
    }

    y += 10;
    if (y > 720) { doc.addPage(); y = 56; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Narrative", left, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const narrativeLines = doc.splitTextToSize(latest.narrative || "—", pageW - left * 2);
    doc.text(narrativeLines, left, y);
    y += narrativeLines.length * 13 + 14;

    if (y > 740) { doc.addPage(); y = 56; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("SHA-256 Fingerprint", left, y);
    y += 14;
    doc.setFont("courier", "normal");
    doc.setFontSize(9);
    const fp = doc.splitTextToSize(latest.fingerprint_sha256 ?? "—", pageW - left * 2);
    doc.text(fp, left, y);
    y += fp.length * 12 + 8;

    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text("Immutable certification issued by Genesis Ω∞.1 — Perpetual Company.", left, y);

    doc.save(`perpetual-certification-${latest.id}.pdf`);
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <InfinityIcon className="w-7 h-7" /> Genesis Ω∞.1 — Perpetual Company
          </h1>
          <p className="text-muted-foreground">Permanent stewardship. Observe → Understand → Explain → Prioritize → Simulate → Validate → Execute → Measure → Learn → Archive → Improve.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={runCycle} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
            Run Perpetual Cycle + Certify
          </Button>
          <Button variant="outline" onClick={exportCertificationPdf} disabled={!latest}>
            <Download className="w-4 h-4 mr-2" /> Export Certification PDF
          </Button>
          <Button variant="ghost" size="icon" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Company Maturity</CardTitle></CardHeader>
          <CardContent><div className="text-4xl font-bold">{latest?.overall_company_maturity ?? "—"}</div><p className="text-xs text-muted-foreground">Overall (0–100)</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Century Readiness</CardTitle></CardHeader>
          <CardContent><div className="text-4xl font-bold">{latest?.century_readiness ?? "—"}</div><p className="text-xs text-muted-foreground">100-year test</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Cycles Run</CardTitle></CardHeader>
          <CardContent><div className="text-4xl font-bold">{cycles.length}</div><p className="text-xs text-muted-foreground">Recent perpetual loops</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Principles</CardTitle></CardHeader>
          <CardContent><div className="text-4xl font-bold">{principles.length}</div><p className="text-xs text-muted-foreground">Immutable laws</p></CardContent></Card>
      </div>

      <Tabs defaultValue="certification">
        <TabsList>
          <TabsTrigger value="certification">Certification</TabsTrigger>
          <TabsTrigger value="cycles">Cycles</TabsTrigger>
          <TabsTrigger value="compass">Business Compass</TabsTrigger>
          <TabsTrigger value="principles">Immutable Principles</TabsTrigger>
        </TabsList>

        <TabsContent value="certification" className="space-y-4">
          {latest ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5" /> Perpetual Certification</CardTitle>
                <p className="text-xs text-muted-foreground break-all">SHA-256: {latest.fingerprint_sha256}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm">{latest.narrative}</p>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {axes.map(([label, val]) => (
                    <div key={label} className="border rounded-md p-3">
                      <div className="text-xs text-muted-foreground">{label}</div>
                      <div className="text-2xl font-semibold">{val ?? "—"}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : <p className="text-muted-foreground">No certification yet. Run a perpetual cycle.</p>}
        </TabsContent>

        <TabsContent value="cycles" className="space-y-3">
          {cycles.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Cycle #{c.cycle_number} — {new Date(c.started_at).toLocaleString()}</span>
                  <Badge variant={c.status === "completed" ? "default" : "secondary"}>{c.status}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <div><strong>Learnings:</strong> {Array.isArray(c.learnings) ? c.learnings.join(" • ") : "—"}</div>
                <div className="text-xs text-muted-foreground break-all">fp: {c.fingerprint_sha256}</div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="compass" className="space-y-2">
          {compass.map((c) => (
            <Card key={c.id}>
              <CardContent className="py-3 flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{c.recommendation}</div>
                  <div className="text-xs text-muted-foreground">ROI {Number(c.expected_roi).toFixed(2)} · confidence {(Number(c.confidence) * 100).toFixed(0)}%</div>
                </div>
                <div className="flex gap-2">
                  {c.board_approval && <Badge variant="default">Board ✓</Badge>}
                  {c.century_test_pass && <Badge variant="secondary">100-Year ✓</Badge>}
                  <Badge variant={c.decision === "approve" ? "default" : "outline"}>{c.decision}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
          {!compass.length && <p className="text-muted-foreground">No compass entries yet.</p>}
        </TabsContent>

        <TabsContent value="principles" className="grid gap-3 md:grid-cols-2">
          {principles.map((p) => (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ScrollText className="w-4 h-4" /> {p.title}
                </CardTitle>
                <p className="text-xs text-muted-foreground">{p.code} · {p.pillar}</p>
              </CardHeader>
              <CardContent className="text-sm">{p.body}</CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
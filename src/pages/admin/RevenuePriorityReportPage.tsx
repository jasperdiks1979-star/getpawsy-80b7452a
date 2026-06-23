import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileDown, FileJson, FileSpreadsheet, FileText, Play } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Report = any;

async function callFn(action: "report" | "compute_all" | "validate" | "report_v21" | "compare_v21"): Promise<Report> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/revenue-priority-v2`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json?.message ?? `HTTP ${res.status}`);
  return json.report;
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toCsv(report: Report): string {
  const rows = [
    ["rank", "slug", "name", "category", "tier", "score", "pinterest", "conversion", "margin", "opportunity", "inventory", "video", "margin_percent", "price", "has_pinterest_data", "has_video", "has_cost"].join(","),
    ...report.top_100.concat(report.bottom_100).map((r: any) => [
      r.rank, r.slug, JSON.stringify(r.name ?? ""), r.category ?? "", r.tier, r.score,
      r.pinterest, r.conversion, r.margin, r.opportunity, r.inventory, r.video,
      r.margin_percent ?? "", r.price ?? "", r.has_pinterest_data, r.has_video, r.has_cost,
    ].join(",")),
  ];
  return rows.join("\n");
}

function generatePdf(report: Report) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, 60, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text("Revenue Priority V2 — Boardroom Report", 40, 35);
  doc.setFontSize(10);
  doc.text(`${report.store} · ${report.version} · Generated ${new Date(report.generated_at).toLocaleString()}`, 40, 52);
  doc.setTextColor(0, 0, 0);

  let y = 90;
  const section = (title: string) => {
    if (y > 480) { doc.addPage(); y = 60; }
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(title, 40, y);
    y += 16;
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
  };

  // Executive Summary
  section("Executive Summary");
  const summary = [
    `Active products: ${report.catalog.active_products}`,
    `Median margin: ${report.catalog.median_margin_pct}%`,
    `Tier A (top 5%): ${report.tier_distribution.A}   Tier B: ${report.tier_distribution.B}   Tier C: ${report.tier_distribution.C}   Tier D: ${report.tier_distribution.D}`,
    `Missing Pinterest data: ${report.missing_pinterest_data.length}   Missing videos: ${report.missing_videos.length}   Missing cost: ${report.missing_cost_data.length}`,
    `Diversification adjustments: ${report.diversification_log.length}`,
  ];
  summary.forEach((line) => { doc.text(line, 40, y); y += 14; });
  y += 10;

  // Histogram (text bars)
  section("Score Distribution (0–100)");
  const maxBucket = Math.max(...report.score_histogram.map((b: any) => b.count), 1);
  report.score_histogram.forEach((b: any) => {
    const barWidth = (b.count / maxBucket) * 400;
    doc.setFillColor(59, 130, 246);
    doc.rect(120, y - 8, barWidth, 10, "F");
    doc.text(`${b.bucket}`, 40, y);
    doc.text(`${b.count}`, 530, y);
    y += 14;
  });
  y += 10;

  // Category distribution table
  doc.addPage(); y = 60;
  section("Category Distribution");
  autoTable(doc, {
    startY: y,
    head: [["Category", "Products"]],
    body: report.category_distribution.slice(0, 30).map((c: any) => [c.category, c.count]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [15, 23, 42] },
  });

  // Helper to render product table
  const productTable = (title: string, rows: any[], cols: string[]) => {
    doc.addPage(); y = 60;
    section(title);
    autoTable(doc, {
      startY: y,
      head: [["#", "Slug", "Name", "Cat", "Tier", "Score", "Pin", "Conv", "Marg", "Opp", "Inv", "Vid"]],
      body: rows.map((r: any) => [
        r.rank, r.slug, (r.name ?? "").slice(0, 38), r.category ?? "", r.tier,
        r.score?.toFixed?.(1) ?? r.score,
        r.pinterest?.toFixed?.(0), r.conversion?.toFixed?.(0),
        r.margin?.toFixed?.(0), r.opportunity?.toFixed?.(0),
        r.inventory?.toFixed?.(0), r.video ? "✓" : "—",
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [15, 23, 42] },
    });
  };

  productTable("Top 50 Products", report.top_50, []);
  productTable("Top 100 Products (full)", report.top_100, []);
  productTable("Bottom 100 Products", report.bottom_100, []);

  // Improved / Declined
  doc.addPage(); y = 60;
  section("Most Improved (vs legacy opportunity rank)");
  autoTable(doc, {
    startY: y,
    head: [["New", "Legacy", "Δ", "Slug", "Name", "Score"]],
    body: report.most_improved.map((r: any) => [r.rank, r.legacy_rank ?? "—", r.delta, r.slug, (r.name ?? "").slice(0, 40), r.score?.toFixed(1)]),
    styles: { fontSize: 8 }, headStyles: { fillColor: [15, 23, 42] },
  });
  doc.addPage(); y = 60;
  section("Most Declined");
  autoTable(doc, {
    startY: y,
    head: [["New", "Legacy", "Δ", "Slug", "Name", "Score"]],
    body: report.most_declined.map((r: any) => [r.rank, r.legacy_rank ?? "—", r.delta, r.slug, (r.name ?? "").slice(0, 40), r.score?.toFixed(1)]),
    styles: { fontSize: 8 }, headStyles: { fillColor: [15, 23, 42] },
  });

  // Pinterest winners/losers
  doc.addPage(); y = 60;
  section("Pinterest Winners (top momentum)");
  autoTable(doc, {
    startY: y,
    head: [["#", "Slug", "Pin score", "Tier"]],
    body: report.pinterest_winners.map((r: any) => [r.rank, r.slug, r.pinterest?.toFixed(0), r.tier]),
    styles: { fontSize: 8 }, headStyles: { fillColor: [15, 23, 42] },
  });

  // Inventory & margin
  doc.addPage(); y = 60;
  section("Inventory Risks");
  autoTable(doc, {
    startY: y,
    head: [["#", "Slug", "Inv score", "Tier"]],
    body: report.inventory_risks.map((r: any) => [r.rank, r.slug, r.inventory?.toFixed(0), r.tier]),
    styles: { fontSize: 8 }, headStyles: { fillColor: [15, 23, 42] },
  });

  doc.addPage(); y = 60;
  section("Margin Leaders");
  autoTable(doc, {
    startY: y,
    head: [["#", "Slug", "Margin %", "Price", "Tier"]],
    body: report.margin_leaders.map((r: any) => [r.rank, r.slug, r.margin_percent?.toFixed?.(1), r.price, r.tier]),
    styles: { fontSize: 8 }, headStyles: { fillColor: [15, 23, 42] },
  });

  // Gaps
  doc.addPage(); y = 60;
  section("Products Missing Videos");
  autoTable(doc, { startY: y, head: [["Slug", "Name", "Tier"]], body: report.missing_videos.map((r: any) => [r.slug, (r.name ?? "").slice(0, 50), r.tier]), styles: { fontSize: 8 }, headStyles: { fillColor: [15, 23, 42] } });
  doc.addPage(); y = 60;
  section("Products Missing Pinterest Data");
  autoTable(doc, { startY: y, head: [["Slug", "Name", "Tier"]], body: report.missing_pinterest_data.map((r: any) => [r.slug, (r.name ?? "").slice(0, 50), r.tier]), styles: { fontSize: 8 }, headStyles: { fillColor: [15, 23, 42] } });
  doc.addPage(); y = 60;
  section("Products Missing Cost Data");
  autoTable(doc, { startY: y, head: [["Slug", "Name", "Price"]], body: report.missing_cost_data.map((r: any) => [r.slug, (r.name ?? "").slice(0, 50), r.price]), styles: { fontSize: 8 }, headStyles: { fillColor: [15, 23, 42] } });

  // Diversification log
  doc.addPage(); y = 60;
  section("Diversification Adjustments");
  if (report.diversification_log.length === 0) {
    doc.text("No adjustments required — natural category balance.", 40, y);
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Window", "Category", "Demoted", "Promoted"]],
      body: report.diversification_log.map((d: any) => [`Top ${d.window}`, d.category, d.demoted, d.promoted]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [15, 23, 42] },
    });
  }

  // Recommended actions
  doc.addPage(); y = 60;
  section("Recommended Actions");
  report.recommended_actions.forEach((a: string, i: number) => {
    doc.text(`${i + 1}. ${a}`, 40, y);
    y += 16;
  });

  // Footer pagination
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Page ${i} of ${pages} · ${report.store} · ${report.version}`, 40, doc.internal.pageSize.getHeight() - 20);
  }

  doc.save(`revenue-priority-v2_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export default function RevenuePriorityReportPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [v21, setV21] = useState<Report | null>(null);
  const [compare, setCompare] = useState<Report | null>(null);
  const [loading, setLoading] = useState<"" | "report" | "compute" | "v21" | "compare">("");

  async function handle(action: "report" | "compute") {
    setLoading(action);
    try {
      const r = await callFn(action === "compute" ? "compute_all" : "report");
      setReport(r);
      toast.success(action === "compute" ? `Persisted ${r.catalog.active_products} products` : `Report generated`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setLoading("");
    }
  }

  async function handleV21() {
    setLoading("v21");
    try {
      const r = await callFn("report_v21");
      setV21(r);
      toast.success(`V2.1 preview generated · ${r.catalog.active_products} products`);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setLoading(""); }
  }

  async function handleCompare() {
    setLoading("compare");
    try {
      const r = await callFn("compare_v21");
      setCompare(r);
      setReport(r.v2); setV21(r.v21);
      toast.success(`Comparison generated · ${r.compare.distribution_pass ? "SAFE" : "HOLD"}`);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setLoading(""); }
  }

  function downloadCompare(format: "pdf" | "csv" | "json") {
    if (!compare) return;
    const ts = new Date().toISOString().slice(0, 10);
    if (format === "json") {
      downloadBlob(`rps-v2-vs-v21_${ts}.json`, new Blob([JSON.stringify(compare, null, 2)], { type: "application/json" }));
      return;
    }
    if (format === "csv") {
      const rows = [
        ["v21_rank","v2_rank","delta_rank","v21_score","v2_score","delta_score","tier","slug","category","name","penalties","boosts"].join(","),
        ...compare.compare.movers_up.concat(compare.compare.movers_down).map((r: any) => [
          r.v21_rank, r.v2_rank ?? "", r.delta_rank, r.v21_score, r.v2_score ?? "", r.delta_score,
          r.v21_tier, r.slug, r.category ?? "", JSON.stringify(r.name ?? ""),
          (r.penalties ?? []).join("|"), (r.boosts ?? []).join("|"),
        ].join(",")),
      ];
      downloadBlob(`rps-v2-vs-v21_${ts}.csv`, new Blob([rows.join("\n")], { type: "text/csv" }));
      return;
    }
    // PDF
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 60, "F");
    doc.setTextColor(255, 255, 255); doc.setFontSize(20);
    doc.text("Revenue Priority V2 vs V2.1 — Calibration Report", 40, 35);
    doc.setFontSize(10);
    doc.text(`GetPawsy · ${compare.compare.version} · ${new Date(compare.compare.generated_at).toLocaleString()}`, 40, 52);
    doc.setTextColor(0, 0, 0);

    let y = 90;
    doc.setFontSize(14); doc.text("Recommendation", 40, y); y += 18;
    doc.setFontSize(11);
    doc.setTextColor(compare.compare.distribution_pass ? 22 : 180, compare.compare.distribution_pass ? 163 : 50, compare.compare.distribution_pass ? 74 : 50);
    doc.text(compare.compare.recommendation, 40, y); y += 24;
    doc.setTextColor(0, 0, 0); doc.setFontSize(10);

    const t = compare.compare.distribution_target, g = compare.compare.distribution_actual;
    const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
    doc.text(`Target  A=${pct(t.a)}  B=${pct(t.b)}  C=${pct(t.c)}  D=${pct(t.d)}`, 40, y); y += 14;
    doc.text(`Actual  A=${pct(g.a)}  B=${pct(g.b)}  C=${pct(g.c)}  D=${pct(g.d)}`, 40, y); y += 22;

    autoTable(doc, { startY: y, head: [["Penalty","Count"]], body: Object.entries(compare.v21.penalty_counts).map(([k,v]) => [k, v as any]), styles: { fontSize: 9 }, headStyles: { fillColor: [15,23,42] }, margin: { left: 40 }, tableWidth: 220 });
    autoTable(doc, { startY: y, head: [["Boost","Count"]], body: Object.entries(compare.v21.boost_counts).map(([k,v]) => [k, v as any]), styles: { fontSize: 9 }, headStyles: { fillColor: [15,23,42] }, margin: { left: 300 }, tableWidth: 220 });

    doc.addPage();
    doc.setFontSize(14); doc.text("Top 50 (V2.1)", 40, 50);
    autoTable(doc, { startY: 60, head: [["#","Slug","Cat","Tier","Score"]], body: compare.compare.top_50_v21.map((r: any) => [r.rank, r.slug, r.category ?? "", r.tier, r.score?.toFixed?.(1)]), styles: { fontSize: 7 }, headStyles: { fillColor: [15,23,42] } });

    doc.addPage();
    doc.setFontSize(14); doc.text("Bottom 50 (V2.1)", 40, 50);
    autoTable(doc, { startY: 60, head: [["#","Slug","Cat","Tier","Score"]], body: compare.compare.bottom_50_v21.map((r: any) => [r.rank, r.slug, r.category ?? "", r.tier, r.score?.toFixed?.(1)]), styles: { fontSize: 7 }, headStyles: { fillColor: [15,23,42] } });

    doc.addPage();
    doc.setFontSize(14); doc.text("Biggest Movers Up (V2 → V2.1)", 40, 50);
    autoTable(doc, { startY: 60, head: [["Δ rank","V2 rank","V2.1 rank","V2 score","V2.1 score","Slug","Boosts"]], body: compare.compare.movers_up.map((r: any) => [r.delta_rank, r.v2_rank ?? "—", r.v21_rank, r.v2_score?.toFixed?.(1) ?? "—", r.v21_score?.toFixed?.(1), r.slug, (r.boosts ?? []).join(", ")]), styles: { fontSize: 7 }, headStyles: { fillColor: [15,23,42] } });

    doc.addPage();
    doc.setFontSize(14); doc.text("Biggest Movers Down", 40, 50);
    autoTable(doc, { startY: 60, head: [["Δ rank","V2 rank","V2.1 rank","V2 score","V2.1 score","Slug","Penalties"]], body: compare.compare.movers_down.map((r: any) => [r.delta_rank, r.v2_rank ?? "—", r.v21_rank, r.v2_score?.toFixed?.(1) ?? "—", r.v21_score?.toFixed?.(1), r.slug, (r.penalties ?? []).join(", ")]), styles: { fontSize: 7 }, headStyles: { fillColor: [15,23,42] } });

    doc.save(`rps-v2-vs-v21_${ts}.pdf`);
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <Helmet>
        <title>Revenue Priority V2 Report · Admin</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Revenue Priority V2 Report</h1>
        <p className="text-muted-foreground text-sm">
          Boardroom-quality report for the unified RPS V2 scoring engine. Generate a dry-run report or persist
          scores + tiers across all active products. Feature flag <code>revenue_priority_v2_active</code> stays OFF
          until validation is approved.
        </p>
      </header>

      <Card>
        <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={() => handle("report")} disabled={!!loading} variant="outline">
            {loading === "report" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Generate Report (dry-run)
          </Button>
          <Button onClick={() => handle("compute")} disabled={!!loading}>
            {loading === "compute" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Compute & Persist V2 Scores
          </Button>
          <Button onClick={handleV21} disabled={!!loading} variant="outline">
            {loading === "v21" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            V2.1 Preview (dry-run)
          </Button>
          <Button onClick={handleCompare} disabled={!!loading} variant="secondary">
            {loading === "compare" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Compare V2 vs V2.1
          </Button>
          <Button onClick={() => report && generatePdf(report)} disabled={!report || !!loading} variant="outline">
            <FileText className="h-4 w-4 mr-2" /> Download PDF
          </Button>
          <Button onClick={() => report && downloadBlob(`rps-v2_${Date.now()}.csv`, new Blob([toCsv(report)], { type: "text/csv" }))} disabled={!report} variant="outline">
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Download CSV
          </Button>
          <Button onClick={() => report && downloadBlob(`rps-v2_${Date.now()}.json`, new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }))} disabled={!report} variant="outline">
            <FileJson className="h-4 w-4 mr-2" /> Download JSON
          </Button>
          <Button onClick={() => downloadCompare("pdf")} disabled={!compare} variant="outline">
            <FileText className="h-4 w-4 mr-2" /> Compare PDF
          </Button>
          <Button onClick={() => downloadCompare("csv")} disabled={!compare} variant="outline">
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Compare CSV
          </Button>
          <Button onClick={() => downloadCompare("json")} disabled={!compare} variant="outline">
            <FileJson className="h-4 w-4 mr-2" /> Compare JSON
          </Button>
        </CardContent>
      </Card>

      {compare && (
        <Card className={compare.compare.distribution_pass ? "border-emerald-400" : "border-amber-400"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              V2.1 Activation Recommendation
              <Badge variant={compare.compare.distribution_pass ? "default" : "destructive"}>
                {compare.compare.distribution_pass ? "SAFE TO ACTIVATE" : "HOLD"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div>{compare.compare.recommendation}</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
              {(["a","b","c","d"] as const).map((k) => (
                <div key={k} className="rounded border p-2">
                  <div className="text-xs text-muted-foreground uppercase">Band {k}</div>
                  <div className="text-sm">target {(compare.compare.distribution_target[k]*100).toFixed(1)}%</div>
                  <div className="text-sm font-mono">actual {(compare.compare.distribution_actual[k]*100).toFixed(1)}%</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {v21 && (
        <Card>
          <CardHeader><CardTitle>V2.1 Preview · score bands & gates</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(v21.score_bands).map(([band, count]) => (
                <div key={band} className="rounded border p-2">
                  <div className="text-xs text-muted-foreground">Score {band}</div>
                  <div className="text-2xl font-bold">{count as any}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(v21.penalty_counts).map(([k, v]) => (
                <div key={k} className="rounded border border-red-200 p-2">
                  <div className="text-xs text-red-600">penalty · {k}</div>
                  <div className="text-lg font-semibold">{v as any}</div>
                </div>
              ))}
              {Object.entries(v21.boost_counts).map(([k, v]) => (
                <div key={k} className="rounded border border-emerald-200 p-2">
                  <div className="text-xs text-emerald-700">boost · {k}</div>
                  <div className="text-lg font-semibold">{v as any}</div>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <div className="font-medium mb-1">V2.1 Top 25</div>
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-2">#</th><th className="pr-2">Product</th><th className="pr-2">Cat</th>
                  <th className="pr-2">Tier</th><th className="pr-2">Score</th><th className="pr-2">Conf</th>
                  <th className="pr-2">Boosts</th><th>Penalties</th>
                </tr></thead>
                <tbody>
                  {v21.top_50.slice(0, 25).map((r: any) => (
                    <tr key={r.slug} className="border-b align-top">
                      <td className="py-1.5 pr-2">{r.rank}</td>
                      <td className="pr-2">{r.name}</td>
                      <td className="pr-2 text-xs text-muted-foreground">{r.category}</td>
                      <td className="pr-2"><Badge variant="outline">{r.tier}</Badge></td>
                      <td className="pr-2 font-mono">{r.score.toFixed(1)}</td>
                      <td className="pr-2">{r.data_confidence}</td>
                      <td className="pr-2 text-xs text-emerald-700">{(r.boosts ?? []).join(", ") || "—"}</td>
                      <td className="text-xs text-red-600">{(r.penalties ?? []).join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Active</div><div className="text-2xl font-bold">{report.catalog.active_products}</div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Tier A</div><div className="text-2xl font-bold">{report.tier_distribution.A}</div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Tier B</div><div className="text-2xl font-bold">{report.tier_distribution.B}</div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Tier C</div><div className="text-2xl font-bold">{report.tier_distribution.C}</div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Tier D</div><div className="text-2xl font-bold">{report.tier_distribution.D}</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Top 25</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-2">#</th><th className="pr-2">Product</th><th className="pr-2">Cat</th>
                    <th className="pr-2">Tier</th><th className="pr-2">Score</th><th className="pr-2">Pin</th>
                    <th className="pr-2">Conv</th><th className="pr-2">Margin</th><th className="pr-2">Inv</th><th>Vid</th>
                  </tr></thead>
                  <tbody>
                    {report.top_50.slice(0, 25).map((r: any) => (
                      <tr key={r.slug} className="border-b">
                        <td className="py-1.5 pr-2">{r.rank}</td>
                        <td className="pr-2">{r.name}</td>
                        <td className="pr-2 text-xs text-muted-foreground">{r.category}</td>
                        <td className="pr-2"><Badge variant="outline">{r.tier}</Badge></td>
                        <td className="pr-2 font-mono">{r.score.toFixed(1)}</td>
                        <td className="pr-2">{r.pinterest.toFixed(0)}</td>
                        <td className="pr-2">{r.conversion.toFixed(0)}</td>
                        <td className="pr-2">{r.margin.toFixed(0)}</td>
                        <td className="pr-2">{r.inventory.toFixed(0)}</td>
                        <td>{r.video ? "✓" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Gaps</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div><div className="font-medium mb-1">Missing Pinterest data</div><div className="text-muted-foreground">{report.missing_pinterest_data.length} products</div></div>
              <div><div className="font-medium mb-1">Missing videos</div><div className="text-muted-foreground">{report.missing_videos.length} products</div></div>
              <div><div className="font-medium mb-1">Missing cost data</div><div className="text-muted-foreground">{report.missing_cost_data.length} products</div></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recommended Actions</CardTitle></CardHeader>
            <CardContent>
              <ol className="list-decimal pl-5 space-y-1 text-sm">
                {report.recommended_actions.map((a: string, i: number) => <li key={i}>{a}</li>)}
              </ol>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

function toCsv(rows: any[]): string {
  if (!rows.length) return "";
  const cols = Array.from(rows.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set<string>()));
  const esc = (v: any) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function RevenuePriorityRemediationPage() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);

  async function run() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("revenue-priority-v2", {
        body: { action: "remediation_report" },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || "Failed");
      setReport(data.report);
      toast.success("Remediation report ready");
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  const r = report;
  return (
    <div className="container max-w-7xl py-8 space-y-6">
      <Helmet>
        <title>V2.1 Remediation · Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Revenue Priority V2.1 — Remediation Report</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Read-only diagnosis across all active products. Nothing is persisted. <code>revenue_priority_v2_active</code> stays OFF.
          </p>
        </div>
        <Button onClick={run} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {r ? "Re-run" : "Run Remediation Report"}
        </Button>
      </div>

      {!r && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Click "Run Remediation Report" to scan all active products.</CardContent></Card>
      )}

      {r && (
        <>
          {/* Activation dashboard */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Activation Readiness Dashboard</CardTitle>
                <Badge variant={r.activation_dashboard.go_no_go.startsWith("GO") ? "default" : "destructive"}>
                  {r.activation_dashboard.go_no_go.split(" — ")[0]}
                </Badge>
              </div>
              <CardDescription>{r.activation_dashboard.go_no_go}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Stat label="Catalog" value={r.activation_dashboard.catalog} />
                <Stat label="Pinterest Ready" value={`${r.activation_dashboard.pinterest_ready_pct}%`} />
                <Stat label="Creative Ready" value={`${r.activation_dashboard.creative_ready_pct}%`} />
                <Stat label="Fully Ready" value={`${r.activation_dashboard.fully_activation_ready} (${r.activation_dashboard.fully_activation_ready_pct}%)`} />
                <Stat label="Tiers A/B/C/D" value={`${r.activation_dashboard.v21_tier_distribution.A}/${r.activation_dashboard.v21_tier_distribution.B}/${r.activation_dashboard.v21_tier_distribution.C}/${r.activation_dashboard.v21_tier_distribution.D}`} />
              </div>
              {r.activation_dashboard.blocking_issues.length > 0 && (
                <div className="mt-4 p-3 rounded-md border border-destructive/30 bg-destructive/5 text-sm">
                  <strong className="block mb-1">Blocking issues:</strong>
                  <ul className="list-disc pl-5">
                    {r.activation_dashboard.blocking_issues.map((b: string, i: number) => <li key={i}>{b}</li>)}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* OOS */}
          <Section
            title={`Out-of-stock products (${r.out_of_stock.total})`}
            description={`By status: ${Object.entries(r.out_of_stock.by_status).map(([k, v]) => `${k}=${v}`).join(", ")}`}
            onCsv={() => download(`oos-${Date.now()}.csv`, toCsv(r.out_of_stock.products), "text/csv")}
            onJson={() => download(`oos-${Date.now()}.json`, JSON.stringify(r.out_of_stock, null, 2), "application/json")}
          >
            <Table cols={["slug", "name", "category", "stock_sync_status", "us_stock", "eu_stock", "v21_score", "recommended_action"]} rows={r.out_of_stock.products.slice(0, 100)} />
            {r.out_of_stock.total > 100 && <p className="text-xs text-muted-foreground mt-2">Showing first 100 of {r.out_of_stock.total}. Download CSV for full list.</p>}
          </Section>

          {/* Duplicates */}
          <Section
            title={`Duplicate clusters (${r.duplicate_clusters.total_clusters} clusters, ${r.duplicate_clusters.total_products_in_clusters} products)`}
            description="Grouped by normalized first-6-word name signature."
            onCsv={() => download(`dup-clusters-${Date.now()}.csv`, toCsv(r.duplicate_clusters.clusters.flatMap((c: any) => c.members.map((m: any) => ({ signature: c.signature, cluster_size: c.cluster_size, keep_candidate: c.keep_candidate, ...m })))), "text/csv")}
            onJson={() => download(`dup-clusters-${Date.now()}.json`, JSON.stringify(r.duplicate_clusters, null, 2), "application/json")}
          >
            <div className="space-y-3 max-h-[500px] overflow-auto">
              {r.duplicate_clusters.clusters.slice(0, 50).map((c: any, i: number) => (
                <div key={i} className="border rounded p-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <strong className="truncate">{c.signature}</strong>
                    <Badge variant="secondary">{c.cluster_size} products</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Keep candidate: <code>{c.keep_candidate}</code></p>
                  <ul className="mt-2 text-xs space-y-1">
                    {c.members.map((m: any) => (
                      <li key={m.product_id} className="flex justify-between gap-2">
                        <span className="truncate">{m.slug} — {m.name}</span>
                        <span className="shrink-0 text-muted-foreground">score {m.v21_score ?? "–"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>

          {/* Creative ready diagnosis */}
          <Section
            title={`Creative-ready diagnosis (${r.creative_ready_diagnosis.qualifies} qualify)`}
            description={r.creative_ready_diagnosis.root_cause}
            onCsv={() => download(`creative-ready-diag-${Date.now()}.csv`, toCsv(r.creative_ready_diagnosis.detail), "text/csv")}
            onJson={() => download(`creative-ready-diag-${Date.now()}.json`, JSON.stringify(r.creative_ready_diagnosis, null, 2), "application/json")}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <Stat label="Qualifies" value={r.creative_ready_diagnosis.qualifies} />
              <Stat label="Missing video only" value={r.creative_ready_diagnosis.missing_video} />
              <Stat label="Weak SEO only" value={r.creative_ready_diagnosis.weak_seo} />
              <Stat label="Both missing" value={r.creative_ready_diagnosis.both_missing} />
            </div>
            <Table cols={["slug", "name", "has_video", "seo_raw", "reason"]} rows={r.creative_ready_diagnosis.detail.slice(0, 50)} />
          </Section>

          {/* Pinterest readiness */}
          <Section
            title={`Pinterest Readiness Scores (avg ${r.pinterest_readiness.avg_score})`}
            description={`${r.pinterest_readiness.ready} ready · ${r.pinterest_readiness.not_ready} not ready`}
            onCsv={() => download(`pinterest-readiness-${Date.now()}.csv`, toCsv(r.pinterest_readiness.products.map((p: any) => ({ ...p, blockers: p.blockers.join("|") }))), "text/csv")}
            onJson={() => download(`pinterest-readiness-${Date.now()}.json`, JSON.stringify(r.pinterest_readiness, null, 2), "application/json")}
          >
            <div className="mb-3 text-sm">
              <strong>Top blockers:</strong>{" "}
              {r.pinterest_readiness.top_blockers.slice(0, 6).map((b: any) => (
                <Badge key={b.reason} variant="outline" className="mr-1">{b.reason} ({b.count})</Badge>
              ))}
            </div>
            <Table cols={["slug", "name", "score", "blockers"]} rows={r.pinterest_readiness.products.slice().sort((a: any, b: any) => a.score - b.score).slice(0, 50).map((p: any) => ({ ...p, blockers: p.blockers.join(", ") }))} />
          </Section>

          {/* Creative readiness */}
          <Section
            title={`Creative Readiness Scores (avg ${r.creative_readiness.avg_score})`}
            description={`${r.creative_readiness.ready} ready · ${r.creative_readiness.not_ready} not ready`}
            onCsv={() => download(`creative-readiness-${Date.now()}.csv`, toCsv(r.creative_readiness.products.map((p: any) => ({ ...p, missing: p.missing.join("|") }))), "text/csv")}
            onJson={() => download(`creative-readiness-${Date.now()}.json`, JSON.stringify(r.creative_readiness, null, 2), "application/json")}
          >
            <div className="mb-3 text-sm">
              <strong>Top missing:</strong>{" "}
              {r.creative_readiness.top_missing.slice(0, 6).map((b: any) => (
                <Badge key={b.reason} variant="outline" className="mr-1">{b.reason} ({b.count})</Badge>
              ))}
            </div>
            <Table cols={["slug", "name", "score", "missing"]} rows={r.creative_readiness.products.slice().sort((a: any, b: any) => a.score - b.score).slice(0, 50).map((p: any) => ({ ...p, missing: p.missing.join(", ") }))} />
          </Section>

          <div className="flex justify-end">
            <Button variant="outline" className="gap-2" onClick={() => download(`v21-remediation-${Date.now()}.json`, JSON.stringify(r, null, 2), "application/json")}>
              <Download className="w-4 h-4" /> Download full JSON
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function Section({ title, description, children, onCsv, onJson }: { title: string; description?: string; children: React.ReactNode; onCsv?: () => void; onJson?: () => void }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          <div className="flex gap-2 shrink-0">
            {onCsv && <Button size="sm" variant="outline" onClick={onCsv}>CSV</Button>}
            {onJson && <Button size="sm" variant="outline" onClick={onJson}>JSON</Button>}
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Table({ cols, rows }: { cols: string[]; rows: any[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No rows.</p>;
  return (
    <div className="overflow-auto max-h-[500px] border rounded">
      <table className="w-full text-xs">
        <thead className="bg-muted sticky top-0">
          <tr>{cols.map((c) => <th key={c} className="text-left p-2 font-medium">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              {cols.map((c) => <td key={c} className="p-2 align-top">{r[c] === null || r[c] === undefined ? "" : typeof r[c] === "object" ? JSON.stringify(r[c]) : String(r[c])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
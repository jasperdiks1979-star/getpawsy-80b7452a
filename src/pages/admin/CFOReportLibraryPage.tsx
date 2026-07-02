import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthenticatedFetch } from "@/hooks/useAuthenticatedFetch";
import { toast } from "sonner";
import { Download, FileText, Loader2, RefreshCw, Sparkles } from "lucide-react";

type ReportType =
  | "monthly" | "quarterly" | "annual" | "lifetime"
  | "ai_spending" | "infrastructure" | "assets" | "suppliers" | "tax_readiness";

interface ReportRow {
  id: string;
  report_type: ReportType;
  period_year: number | null;
  period_number: number | null;
  title: string;
  storage_path: string;
  sha256: string;
  file_size: number | null;
  summary: Record<string, unknown> | null;
  generated_at: string;
  signed_url: string | null;
  json_signed_url: string | null;
}

const TYPES: Array<{ id: ReportType; label: string; blurb: string; needs: "month" | "quarter" | "year" | "none" }> = [
  { id: "monthly", label: "Monthly", blurb: "Revenue, expenses, VAT for one calendar month.", needs: "month" },
  { id: "quarterly", label: "Quarterly", blurb: "Full quarter, VAT-ready totals.", needs: "quarter" },
  { id: "annual", label: "Annual", blurb: "Full-year P&L and VAT movement.", needs: "year" },
  { id: "lifetime", label: "Lifetime", blurb: "Every euro since day one.", needs: "none" },
  { id: "ai_spending", label: "AI Spending", blurb: "OpenAI, Anthropic, Gemini, Lovable AI, etc.", needs: "year" },
  { id: "infrastructure", label: "Infrastructure", blurb: "Hosting, database, CDN, monitoring.", needs: "year" },
  { id: "assets", label: "Business Assets", blurb: "Register with cost, depreciation, book value.", needs: "none" },
  { id: "suppliers", label: "Suppliers", blurb: "Scorecard: spend, health, completeness.", needs: "year" },
  { id: "tax_readiness", label: "Tax Readiness", blurb: "Recoverable VAT, missing docs, anomalies.", needs: "year" },
];

const now = new Date();
const CURRENT_YEAR = now.getUTCFullYear();
const CURRENT_MONTH = now.getUTCMonth() + 1;
const CURRENT_QUARTER = Math.floor(now.getUTCMonth() / 3) + 1;

function fmtBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function CFOReportLibraryPage() {
  const { invokeFunction } = useAuthenticatedFetch();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<ReportType | null>(null);
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [month, setMonth] = useState<number>(CURRENT_MONTH);
  const [quarter, setQuarter] = useState<number>(CURRENT_QUARTER);
  const [filter, setFilter] = useState<"all" | ReportType>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await invokeFunction<{ ok: boolean; reports: ReportRow[] }>("finance-cfo-reports", {
      body: { action: "list" },
    });
    setLoading(false);
    if (error) return;
    setReports(data?.reports ?? []);
  }, [invokeFunction]);

  useEffect(() => { load(); }, [load]);

  const generate = useCallback(async (rt: ReportType) => {
    setBusy(rt);
    const spec = TYPES.find((t) => t.id === rt)!;
    const body: Record<string, unknown> = { action: "generate", report_type: rt, year };
    if (spec.needs === "month") body.month = month;
    if (spec.needs === "quarter") body.quarter = quarter;
    const { data, error } = await invokeFunction<{ ok: boolean; signed_url?: string }>("finance-cfo-reports", { body });
    setBusy(null);
    if (error) { toast.error(`Report failed: ${error.message}`); return; }
    toast.success(`${spec.label} report generated`);
    if (data?.signed_url) window.open(data.signed_url, "_blank", "noopener");
    load();
  }, [invokeFunction, year, month, quarter, load]);

  const grouped = useMemo(() => {
    const list = filter === "all" ? reports : reports.filter((r) => r.report_type === filter);
    return list;
  }, [reports, filter]);

  const yearOptions = useMemo(() => Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i), []);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Sparkles className="h-6 w-6 text-primary" /> CFO Report Library
          </h1>
          <p className="text-sm text-muted-foreground">
            Generate, browse and download every financial report — Monthly through Tax Readiness.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Global period</CardTitle>
          <CardDescription>Used when a report needs a year, quarter or month.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase text-muted-foreground">Year</span>
            <select className="rounded-md border border-input bg-background px-3 py-2" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase text-muted-foreground">Quarter</span>
            <select className="rounded-md border border-input bg-background px-3 py-2" value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
              {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase text-muted-foreground">Month</span>
            <select className="rounded-md border border-input bg-background px-3 py-2" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{String(m).padStart(2, "0")}</option>)}
            </select>
          </label>
        </CardContent>
      </Card>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {TYPES.map((t) => (
          <Card key={t.id} className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">{t.label}</CardTitle>
              <CardDescription>{t.blurb}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {t.needs === "month" ? `Uses ${year}-${String(month).padStart(2, "0")}` :
                 t.needs === "quarter" ? `Uses ${year} Q${quarter}` :
                 t.needs === "year" ? `Uses ${year}` : "No period"}
              </span>
              <Button size="sm" onClick={() => generate(t.id)} disabled={busy !== null}>
                {busy === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Generate
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generated reports</CardTitle>
          <CardDescription>Every report is fingerprinted with SHA-256 and archived in the Evidence Vault.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as "all" | ReportType)}>
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="all">All</TabsTrigger>
              {TYPES.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
            </TabsList>
            <TabsContent value={filter} className="mt-4">
              {grouped.length === 0 ? (
                <p className="text-sm text-muted-foreground">No reports yet — generate one above.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-muted-foreground">
                        <th className="px-3 py-2">Title</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Generated</th>
                        <th className="px-3 py-2">Size</th>
                        <th className="px-3 py-2">SHA-256</th>
                        <th className="px-3 py-2 text-right">Download</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grouped.map((r) => (
                        <tr key={r.id} className="border-t border-border">
                          <td className="px-3 py-2 font-medium">{r.title}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.report_type}</td>
                          <td className="px-3 py-2 text-muted-foreground">{new Date(r.generated_at).toLocaleString()}</td>
                          <td className="px-3 py-2 text-muted-foreground">{fmtBytes(r.file_size)}</td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.sha256?.slice(0, 12)}…</td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex justify-end gap-2">
                              {r.signed_url && (
                                <a href={r.signed_url} target="_blank" rel="noopener noreferrer">
                                  <Button size="sm" variant="outline"><Download className="h-4 w-4" /> HTML</Button>
                                </a>
                              )}
                              {r.json_signed_url && (
                                <a href={r.json_signed_url} target="_blank" rel="noopener noreferrer">
                                  <Button size="sm" variant="ghost"><Download className="h-4 w-4" /> JSON</Button>
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

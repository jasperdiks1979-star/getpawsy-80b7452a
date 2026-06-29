import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, Radar, ShieldAlert, Bot, UserCheck, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  TSI_BUCKET_LABEL,
  TSI_CLASSIFICATION_LABEL,
  type TSIBucket,
  type TSIClassification,
} from "@/lib/trafficSourceIntelligence";

type EnrichmentRow = {
  session_id: string;
  original_source: string | null;
  original_medium: string | null;
  recovered_source: string;
  classification: TSIClassification;
  bucket: TSIBucket;
  confidence: number;
  reason: string | null;
  evidence: Array<{ signal: string; detail: string; weight: number }> | null;
  is_recovered: boolean;
  is_bot: boolean;
  is_internal: boolean;
  classified_at: string;
};

const BUCKET_FILTERS: Array<{ value: "all" | TSIBucket | "real_or_recovered"; label: string }> = [
  { value: "all", label: "All Traffic" },
  { value: "real_or_recovered", label: "Real + Recovered" },
  { value: "real_customer", label: TSI_BUCKET_LABEL.real_customer },
  { value: "recovered", label: TSI_BUCKET_LABEL.recovered },
  { value: "direct", label: TSI_BUCKET_LABEL.direct },
  { value: "internal", label: TSI_BUCKET_LABEL.internal },
  { value: "qa", label: TSI_BUCKET_LABEL.qa },
  { value: "smoke_test", label: TSI_BUCKET_LABEL.smoke_test },
  { value: "lovable_preview", label: TSI_BUCKET_LABEL.lovable_preview },
  { value: "ai_worker", label: TSI_BUCKET_LABEL.ai_worker },
  { value: "search_bot", label: TSI_BUCKET_LABEL.search_bot },
  { value: "ai_crawler", label: TSI_BUCKET_LABEL.ai_crawler },
  { value: "bot", label: TSI_BUCKET_LABEL.bot },
  { value: "unknown", label: TSI_BUCKET_LABEL.unknown },
];

const BUCKET_TONE: Record<TSIBucket, string> = {
  real_customer: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  recovered: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  direct: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  internal: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  qa: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  smoke_test: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  lovable_preview: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  ai_worker: "bg-muted text-muted-foreground",
  bot: "bg-destructive/10 text-destructive",
  search_bot: "bg-muted text-muted-foreground",
  ai_crawler: "bg-muted text-muted-foreground",
  unknown: "bg-muted text-muted-foreground",
};

export default function TrafficIntelligencePage() {
  const [rows, setRows] = useState<EnrichmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<typeof BUCKET_FILTERS[number]["value"]>("all");

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("tsi_session_enrichment")
        .select("*")
        .order("classified_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      setRows((data || []) as EnrichmentRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load enrichment");
    } finally {
      setLoading(false);
    }
  }

  async function reclassify() {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("tsi-classify", {
        body: { limit: 2000, since_days: 30 },
      });
      if (error) throw error;
      toast.success(`Classified ${data?.classified ?? 0} sessions`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Classification failed");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "real_or_recovered")
      return rows.filter((r) => r.bucket === "real_customer" || r.bucket === "recovered");
    return rows.filter((r) => r.bucket === filter);
  }, [rows, filter]);

  const summary = useMemo(() => {
    const total = rows.length;
    const byBucket: Record<string, number> = {};
    const byClass: Record<string, number> = {};
    const reasons: Record<string, number> = {};
    let conf = 0;
    for (const r of rows) {
      byBucket[r.bucket] = (byBucket[r.bucket] || 0) + 1;
      byClass[r.classification] = (byClass[r.classification] || 0) + 1;
      if (r.is_recovered && r.reason) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
      conf += r.confidence;
    }
    const qualityScore = total
      ? Math.round(((byBucket.real_customer || 0) + (byBucket.recovered || 0) * 0.9) / total * 100)
      : 0;
    const avgConf = total ? Math.round(conf / total) : 0;
    const topReasons = Object.entries(reasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return { total, byBucket, byClass, qualityScore, avgConf, topReasons };
  }, [rows]);

  const insights = useMemo(() => {
    const tips: string[] = [];
    if ((summary.byClass.pinterest_recovered || 0) >= 5)
      tips.push("Many sessions are being recovered as Pinterest — improve Pinterest UTM tagging on outbound pins.");
    if ((summary.byBucket.unknown || 0) / Math.max(1, summary.total) > 0.15)
      tips.push("Over 15% of sessions are Unknown — add UTM tagging on all marketing surfaces.");
    if ((summary.byBucket.internal || 0) / Math.max(1, summary.total) > 0.25)
      tips.push("Internal traffic dominates — expand the internal-traffic cookie / allowlist to keep analytics clean.");
    if (tips.length === 0) tips.push("No structural attribution issues detected.");
    return tips;
  }, [summary]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Radar className="h-6 w-6" /> Traffic Source Intelligence
          </h1>
          <p className="text-sm text-muted-foreground">
            Genesis V3.3 — evidence-based source recovery for every session. Originals are preserved; this layer only enriches them.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={reclassify} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Run classifier
          </Button>
        </div>
      </div>

      {/* Executive summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <SummaryStat icon={<UserCheck className="h-4 w-4" />} label="Real customers" value={summary.byBucket.real_customer || 0} sub={`${summary.total} sessions scored`} />
        <SummaryStat icon={<Radar className="h-4 w-4" />} label="Recovered sources" value={summary.byBucket.recovered || 0} sub="Direct → real channel" />
        <SummaryStat icon={<EyeOff className="h-4 w-4" />} label="Internal / QA / preview" value={(summary.byBucket.internal || 0) + (summary.byBucket.qa || 0) + (summary.byBucket.smoke_test || 0) + (summary.byBucket.lovable_preview || 0)} sub="Excluded from customer KPIs" />
        <SummaryStat icon={<Bot className="h-4 w-4" />} label="Bots & crawlers" value={(summary.byBucket.bot || 0) + (summary.byBucket.search_bot || 0) + (summary.byBucket.ai_crawler || 0) + (summary.byBucket.ai_worker || 0)} sub={`Quality score ${summary.qualityScore}%`} />
      </div>

      {/* Classification distribution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Classification distribution</CardTitle>
          <CardDescription>Average confidence: {summary.avgConf}%</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.byClass)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => (
                <Badge key={k} variant="secondary">
                  {TSI_CLASSIFICATION_LABEL[k as TSIClassification] || k}: {v}
                </Badge>
              ))}
            {Object.keys(summary.byClass).length === 0 && (
              <span className="text-sm text-muted-foreground">No classifications yet — run the classifier.</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Insights */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> First-sale insights</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside text-sm space-y-1">
            {insights.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
          {summary.topReasons.length > 0 && (
            <div className="mt-3">
              <div className="text-xs uppercase text-muted-foreground mb-1">Top recovery reasons</div>
              <ul className="text-sm space-y-1">
                {summary.topReasons.map(([r, n]) => (
                  <li key={r}><span className="text-muted-foreground">{n}×</span> {r}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Source audit */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Source audit</CardTitle>
            <CardDescription>Original vs. recovered source with confidence and evidence.</CardDescription>
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BUCKET_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Original</TableHead>
                  <TableHead>Recovered</TableHead>
                  <TableHead>Classification</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Evidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 200).map((r) => (
                  <TableRow key={r.session_id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.original_source || "—"}
                      {r.original_medium ? <span className="opacity-60"> / {r.original_medium}</span> : null}
                    </TableCell>
                    <TableCell className="text-sm font-medium">{r.recovered_source}</TableCell>
                    <TableCell>
                      <Badge className={`${BUCKET_TONE[r.bucket]} border-0`}>
                        {TSI_CLASSIFICATION_LABEL[r.classification] || r.classification}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">{r.confidence}%</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[280px]">{r.reason}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[280px]">
                      {(r.evidence || []).map((e, i) => (
                        <div key={i}><span className="font-medium">{e.signal}:</span> {e.detail}</div>
                      ))}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No sessions in this bucket.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryStat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">{icon}{label}</div>
        <div className="text-2xl font-semibold tabular-nums mt-1">{value.toLocaleString()}</div>
        {sub ? <div className="text-xs text-muted-foreground mt-1">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}
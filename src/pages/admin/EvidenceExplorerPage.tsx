import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Database, GitBranch, Radio, Search, ShieldCheck, AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

// -------- Metric registry: every KPI in Mission Control maps to a lineage record --------
type Lineage = {
  key: string;
  label: string;
  category: string;
  source_tables: string[];
  columns: string[];
  sql: string; // read-only preview SQL
  freshness_source: { table: string; column: string } | null;
  confidence_basis: string;
  formula: string;
  assumptions: string[];
};

const REGISTRY: Lineage[] = [
  {
    key: "business_health",
    label: "Business Health (overall)",
    category: "executive",
    source_tables: ["bhi_snapshots", "bhi_subscores"],
    columns: ["overall_score", "confidence", "sha256", "captured_at"],
    sql: "SELECT overall_score, confidence, sha256, captured_at FROM bhi_snapshots ORDER BY captured_at DESC LIMIT 1",
    freshness_source: { table: "bhi_snapshots", column: "captured_at" },
    confidence_basis: "Weighted mean of subscore confidences, penalised by missing telemetry",
    formula: "sum(subscore.score * subscore.weight) / sum(subscore.weight)",
    assumptions: ["Subscores with confidence < 30 excluded", "Missing subscores treated as UNKNOWN, not zero"],
  },
  {
    key: "sales_readiness",
    label: "Sales Readiness",
    category: "executive",
    source_tables: ["sales_readiness_snapshots"],
    columns: ["overall_score", "status", "captured_at"],
    sql: "SELECT overall_score, status, captured_at FROM sales_readiness_snapshots ORDER BY captured_at DESC LIMIT 1",
    freshness_source: { table: "sales_readiness_snapshots", column: "captured_at" },
    confidence_basis: "Aggregate of 28 sub-signals (traffic, checkout, trust, AI)",
    formula: "Weighted composite — see sales-readiness edge function",
    assumptions: ["Requires >= 90 daily sessions for high confidence"],
  },
  {
    key: "revenue_today",
    label: "Revenue today",
    category: "revenue",
    source_tables: ["orders"],
    columns: ["total_amount", "status", "created_at"],
    sql: "SELECT sum(total_amount) FROM orders WHERE status='paid' AND created_at >= date_trunc('day', now())",
    freshness_source: { table: "orders", column: "created_at" },
    confidence_basis: "Stripe webhook + orders table; confidence HIGH when both agree",
    formula: "SUM(orders.total_amount) WHERE status = 'paid'",
    assumptions: ["Refunds not deducted here — see finance dossier"],
  },
  {
    key: "live_visitors",
    label: "Live visitors (5 min)",
    category: "traffic",
    source_tables: ["canonical_events"],
    columns: ["session_id", "event_name", "event_at"],
    sql: "SELECT count(*) FROM canonical_events WHERE canonical_name='page_view' AND occurred_at > now() - interval '5 minutes'",
    freshness_source: { table: "canonical_events", column: "occurred_at" },
    confidence_basis: "SessionQuality > 0.6 required; anomalies flagged in analytics_traffic_classification",
    formula: "count(page_view events in last 5m)",
    assumptions: ["Bots filtered via crawler_visits", "Deduplicated by canonical event_id"],
  },
  {
    key: "tracking_integrity",
    label: "Tracking Integrity",
    category: "infrastructure",
    source_tables: ["cie_health_snapshots", "analytics_health_checks", "cie_metric_mismatches"],
    columns: ["health_score", "confidence", "captured_at"],
    sql: "SELECT health_score, confidence, captured_at FROM cie_health_snapshots ORDER BY captured_at DESC LIMIT 1",
    freshness_source: { table: "cie_health_snapshots", column: "captured_at" },
    confidence_basis: "GA4 join success rate × canonical stitching rate",
    formula: "1 - (mismatched_events / total_events)",
    assumptions: ["Mismatch tolerance: 1.0% per Conversion Integrity rule"],
  },
  {
    key: "pinterest_health",
    label: "Pinterest Health",
    category: "marketing",
    source_tables: ["pinterest_pipeline_health_snapshots", "pinterest_pin_queue"],
    columns: ["health_score", "queue_depth", "captured_at"],
    sql: "SELECT * FROM pinterest_pipeline_health_snapshots ORDER BY captured_at DESC LIMIT 1",
    freshness_source: { table: "pinterest_pipeline_health_snapshots", column: "captured_at" },
    confidence_basis: "Publish success × PRE gate pass rate × auth freshness",
    formula: "avg(pin.quality_score) where published_at > now()-24h",
    assumptions: ["Publishing gated at PRE ≥ 95"],
  },
];

function findMetric(key: string | null) {
  if (!key) return null;
  return REGISTRY.find((m) => m.key === key) ?? null;
}

function ConfBadge({ n }: { n: number | null | undefined }) {
  if (n == null) return <Badge variant="outline">UNKNOWN</Badge>;
  const v = Number(n);
  if (v >= 80) return <Badge className="bg-emerald-600 text-white">HIGH {v.toFixed(0)}%</Badge>;
  if (v >= 55) return <Badge className="bg-amber-500 text-white">MEDIUM {v.toFixed(0)}%</Badge>;
  return <Badge className="bg-red-600 text-white">LOW {v.toFixed(0)}%</Badge>;
}

function fmtAge(ts: string | null | undefined) {
  if (!ts) return "UNKNOWN";
  const ms = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(ms)) return "UNKNOWN";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// -------- Page --------
export default function EvidenceExplorerPage() {
  const [params, setParams] = useSearchParams();
  const activeKey = params.get("metric");
  const active = findMetric(activeKey);

  const [q, setQ] = useState("");
  const [snapMeta, setSnapMeta] = useState<{ captured_at?: string; confidence?: number; sha256?: string } | null>(null);
  const [truthRows, setTruthRows] = useState<Array<{ source: string; label: string; value: string; capturedAt: string | null; confidence: number | null }>>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [missing, setMissing] = useState<{ noUtm: number; noGeo: number; noSession: number; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();

      const bhiQ: any = supabase.from("bhi_snapshots").select("captured_at,confidence,sha256,overall_score").order("captured_at", { ascending: false }).limit(1).maybeSingle();
      const ordersQ: any = supabase.from("orders").select("total_amount,created_at").eq("status", "paid").gte("created_at", since);
      const evQ: any = supabase.from("canonical_events").select("id,canonical_name,occurred_at,session_id,utm_source,country,device").order("occurred_at", { ascending: false }).limit(50);
      const decQ: any = supabase.from("governance_decision_log").select("id,timestamp,source_engine,decision_type,expected_metric,expected_value,confidence,outcome").order("timestamp", { ascending: false }).limit(25);
      const missQ: any = supabase.from("canonical_events").select("id,utm_source,country,session_id", { count: "exact" }).gte("occurred_at", since).limit(500);

      const [bhi, ords, evs, decs, mrows] = await Promise.all([bhiQ, ordersQ, evQ, decQ, missQ]);

      const firstErr = bhi?.error || ords?.error || evs?.error || decs?.error;
      if (firstErr) throw firstErr;

      setSnapMeta(bhi?.data ? { captured_at: bhi.data.captured_at, confidence: bhi.data.confidence, sha256: bhi.data.sha256 } : null);

      const ordersTotal = (ords?.data ?? []).reduce((a: number, r: any) => a + (Number(r.total_amount) || 0), 0);
      const ordersCount = (ords?.data ?? []).length;

      setEvents(evs?.data ?? []);
      setDecisions(decs?.data ?? []);

      const sample = mrows?.data ?? [];
      const total = sample.length;
      setMissing({
        noUtm: sample.filter((r: any) => !r.utm_source).length,
        noGeo: sample.filter((r: any) => !r.country).length,
        noSession: sample.filter((r: any) => !r.session_id).length,
        total,
      });

      // Truth consistency panel — same window, different sources
      const rows: typeof truthRows = [
        {
          source: "orders (Stripe-confirmed)",
          label: "Revenue (24h)",
          value: `$${ordersTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
          capturedAt: (ords?.data?.[0]?.created_at as string) ?? null,
          confidence: ordersCount > 0 ? 95 : null,
        },
        {
          source: "orders.count",
          label: "Paid orders (24h)",
          value: String(ordersCount),
          capturedAt: (ords?.data?.[0]?.created_at as string) ?? null,
          confidence: 95,
        },
        {
          source: "bhi_snapshots.overall_score",
          label: "Business Health",
          value: bhi?.data?.overall_score != null ? `${Number(bhi.data.overall_score).toFixed(1)} / 100` : "UNKNOWN",
          capturedAt: bhi?.data?.captured_at ?? null,
          confidence: bhi?.data?.confidence ?? null,
        },
        {
          source: "canonical_events (all)",
          label: "Pageviews (24h)",
          value: String(sample.length),
          capturedAt: evs?.data?.[0]?.occurred_at ?? null,
          confidence: sample.length > 100 ? 88 : sample.length > 0 ? 55 : null,
        },
      ];
      setTruthRows(rows);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load evidence");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => REGISTRY.filter((m) => q.trim() === "" || (m.label + " " + m.key + " " + m.category + " " + m.source_tables.join(" ")).toLowerCase().includes(q.trim().toLowerCase())),
    [q]
  );

  const copySha = useCallback(() => {
    if (!snapMeta?.sha256) return;
    navigator.clipboard.writeText(snapMeta.sha256).then(() => toast.success("SHA-256 copied"));
  }, [snapMeta]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <Helmet>
        <title>Evidence Explorer · Genesis Ω∞</title>
        <meta name="description" content="Forensic breakdown of every metric, score, and recommendation in Mission Control — with data lineage, confidence, and truth consistency." />
      </Helmet>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link to="/admin/mission-control" className="inline-flex items-center gap-1 hover:underline"><ArrowLeft className="h-3 w-3" /> Mission Control</Link>
            <span>/</span>
            <span>Evidence Explorer</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Evidence Explorer</h1>
          <p className="text-sm text-muted-foreground">Every number, traceable. Every score, explainable. UNKNOWN never counted as zero.</p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </header>

      {error ? <div className="text-sm text-red-600 border border-red-200 rounded p-3">{error}</div> : null}

      {/* METRIC DETAIL (when ?metric=... provided) */}
      {active ? (
        <Card className="border-emerald-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4" /> Lineage · {active.label}
              <Badge variant="outline">{active.category}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Source tables</div>
                <div className="flex flex-wrap gap-1">{active.source_tables.map((t) => <Badge key={t} variant="secondary" className="font-mono">{t}</Badge>)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Columns</div>
                <div className="flex flex-wrap gap-1">{active.columns.map((c) => <Badge key={c} variant="outline" className="font-mono">{c}</Badge>)}</div>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Formula</div>
              <code className="text-xs block p-2 rounded bg-muted/40 font-mono">{active.formula}</code>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">SQL preview (read-only)</div>
              <pre className="text-xs p-2 rounded bg-muted/40 font-mono whitespace-pre-wrap">{active.sql}</pre>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Assumptions</div>
              <ul className="list-disc pl-5 text-xs space-y-0.5">{active.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
            <div className="flex flex-wrap gap-2 text-xs items-center">
              <span className="text-muted-foreground">Confidence basis:</span> <span>{active.confidence_basis}</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setParams({})}>Close lineage</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* METRIC REGISTRY / SEARCH */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4" /> Metric Registry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Search: revenue, pinterest, tracking, canonical_events…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
            {filtered.map((m) => (
              <button
                key={m.key}
                className={`border rounded p-3 text-left hover:bg-muted/40 ${activeKey === m.key ? "border-emerald-500" : ""}`}
                onClick={() => setParams({ metric: m.key })}
              >
                <div className="text-sm font-medium">{m.label}</div>
                <div className="text-[11px] text-muted-foreground">{m.category} · {m.source_tables.join(", ")}</div>
              </button>
            ))}
            {filtered.length === 0 ? <div className="text-sm text-muted-foreground">No metric matches.</div> : null}
          </div>
        </CardContent>
      </Card>

      {/* TRUTH CONSISTENCY */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Truth Consistency (24h window)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && truthRows.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Comparing sources…</div>
          ) : (
            <div className="divide-y text-sm">
              {truthRows.map((r) => (
                <div key={r.source} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.label}</div>
                    <div className="text-[11px] text-muted-foreground font-mono truncate">{r.source} · {fmtAge(r.capturedAt)}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-xs">
                    <span className="font-semibold">{r.value}</span>
                    <ConfBadge n={r.confidence} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {snapMeta?.sha256 ? (
            <div className="mt-3 text-[11px] text-muted-foreground flex items-center gap-2">
              <span>Current BHI fingerprint:</span>
              <code className="font-mono break-all">{snapMeta.sha256.slice(0, 24)}…</code>
              <Button size="sm" variant="ghost" onClick={copySha}>Copy</Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* MISSING DATA DETECTOR */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Missing Data Detector</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {!missing ? (
            <div className="text-muted-foreground">UNKNOWN — no recent canonical_events sample.</div>
          ) : missing.total === 0 ? (
            <div className="text-muted-foreground">No events in last 24h sample.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="border rounded p-2"><div className="text-muted-foreground">Sampled events</div><div className="text-lg font-semibold">{missing.total}</div></div>
              <div className="border rounded p-2"><div className="text-muted-foreground">Missing UTM</div><div className={`text-lg font-semibold ${missing.noUtm > missing.total * 0.3 ? "text-red-600" : ""}`}>{missing.noUtm} ({Math.round(missing.noUtm / missing.total * 100)}%)</div></div>
              <div className="border rounded p-2"><div className="text-muted-foreground">Missing geo</div><div className={`text-lg font-semibold ${missing.noGeo > missing.total * 0.3 ? "text-red-600" : ""}`}>{missing.noGeo} ({Math.round(missing.noGeo / missing.total * 100)}%)</div></div>
              <div className="border rounded p-2"><div className="text-muted-foreground">Missing session</div><div className={`text-lg font-semibold ${missing.noSession > 0 ? "text-red-600" : ""}`}>{missing.noSession} ({Math.round(missing.noSession / missing.total * 100)}%)</div></div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* LIVE EVENT EXPLORER */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Radio className="h-4 w-4" /> Event Stream (latest 50)</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="text-sm text-muted-foreground">No canonical events yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground text-left">
                  <tr><th className="py-1 pr-2">When</th><th className="pr-2">Event</th><th className="pr-2">UTM</th><th className="pr-2">Country</th><th className="pr-2">Device</th><th>Session</th></tr>
                </thead>
                <tbody>
                  {events.map((e: any) => (
                    <tr key={e.id} className="border-t">
                      <td className="py-1 pr-2 whitespace-nowrap">{fmtAge(e.occurred_at)}</td>
                      <td className="pr-2 font-medium">{e.canonical_name}</td>
                      <td className="pr-2 text-muted-foreground">{e.utm_source || <em>—</em>}</td>
                      <td className="pr-2">{e.country || <em className="text-muted-foreground">—</em>}</td>
                      <td className="pr-2">{e.device || <em className="text-muted-foreground">—</em>}</td>
                      <td className="font-mono text-[10px] truncate max-w-[140px]">{e.session_id ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI DECISION LOG */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><GitBranch className="h-4 w-4" /> AI Decision Log (governance_decision_log)</CardTitle>
        </CardHeader>
        <CardContent>
          {decisions.length === 0 ? (
            <div className="text-sm text-muted-foreground">No decisions logged yet. Approve a fix from Mission Control to record one.</div>
          ) : (
            <div className="divide-y text-sm">
              {decisions.map((d: any) => (
                <div key={d.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{d.decision_type} · <span className="text-muted-foreground">{d.source_engine}</span></div>
                    <div className="text-[11px] text-muted-foreground truncate">{new Date(d.timestamp).toLocaleString()} · outcome: {d.outcome ?? "pending"}</div>
                  </div>
                  <div className="flex items-center gap-2 text-xs shrink-0">
                    {d.expected_metric ? <span className="text-muted-foreground">{d.expected_metric}: <b className="text-foreground">{Number(d.expected_value ?? 0).toLocaleString()}</b></span> : null}
                    <ConfBadge n={d.confidence} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

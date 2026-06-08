/**
 * /admin/pinterest-url-recovery — admin-gated dashboard for the Pinterest
 * URL recovery system.
 *
 * Lazy-loaded from App.tsx; renders KPI tiles for the latest audit run,
 * a per-pin table with repair strategy + final URL, and three action buttons:
 *   - Run URL audit   → POST /functions/v1/pinterest-url-audit
 *   - Run repair sweep → POST /functions/v1/pinterest-pin-repair
 *   - Refresh
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

type AuditRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  pins_total: number;
  pins_valid: number;
  pins_broken: number;
  summary: Record<string, number>;
};

type AuditRow = {
  id: string;
  pinterest_pin_id: string | null;
  destination_url: string;
  final_resolved_url: string | null;
  http_status: number | null;
  resolver_step: string;
  repair_strategy: string;
  product_exists: boolean;
  product_in_stock: boolean;
  category: string | null;
  pin_queue_id?: string | null;
};

type ImageMatch = {
  pin_queue_id: string;
  score: number;
  verdict: string;
  vision_verdict: string | null;
  category_score: number | null;
  title_score: number | null;
  tag_score: number | null;
};

export default function PinterestUrlRecoveryPage() {
  const [run, setRun] = useState<AuditRun | null>(null);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [matches, setMatches] = useState<Record<string, ImageMatch>>({});
  const [matchSummary, setMatchSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [reports, setReports] = useState<{
    worst: any[];
    traffic: any[];
    deleted: any[];
    mismatch: any[];
    trafficSource: string;
  }>({ worst: [], traffic: [], deleted: [], mismatch: [], trafficSource: "none" });
  const [reportTab, setReportTab] = useState<"worst" | "traffic" | "deleted" | "mismatch">("worst");

  const load = async () => {
    setLoading(true);
    const { data: latest } = await supabase
      .from("pinterest_pin_audit_runs" as any)
      .select("*")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setRun((latest as any) || null);
    if (latest) {
      const { data } = await supabase
        .from("pinterest_pin_audit" as any)
        .select("id, pin_queue_id, pinterest_pin_id, destination_url, final_resolved_url, http_status, resolver_step, repair_strategy, product_exists, product_in_stock, category")
        .eq("run_id", (latest as any).id)
        .order("created_at", { ascending: false })
        .limit(500);
      setRows((data as any) || []);
      const ids = (data as any[] || []).map((r) => r.pin_queue_id).filter(Boolean);
      if (ids.length) {
        const { data: m } = await supabase
          .from("pinterest_pin_image_match" as any)
          .select("pin_queue_id, score, verdict, vision_verdict, category_score, title_score, tag_score")
          .in("pin_queue_id", ids);
        const map: Record<string, ImageMatch> = {};
        const sum: Record<string, number> = { exact_match: 0, close_match: 0, partial_match: 0, mismatch: 0 };
        for (const row of (m as any[]) || []) {
          map[row.pin_queue_id] = row;
          sum[row.verdict] = (sum[row.verdict] || 0) + 1;
        }
        setMatches(map);
        setMatchSummary(sum);
      } else {
        setMatches({}); setMatchSummary({});
      }
    } else {
      setRows([]);
      setMatches({}); setMatchSummary({});
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    (async () => {
      // Top 100 worst by image match score
      const { data: worst } = await supabase
        .from("pinterest_pin_image_match" as any)
        .select("pin_queue_id, score, verdict, vision_verdict, reasons")
        .order("score", { ascending: true })
        .limit(100);
      const worstIds = (worst as any[] || []).map((w) => w.pin_queue_id);
      const { data: worstPins } = worstIds.length
        ? await supabase
            .from("pinterest_pin_queue" as any)
            .select("id, pin_title, pinterest_pin_id, final_resolved_url, pin_image_url, product_slug, validation_status")
            .in("id", worstIds)
        : { data: [] };
      const pinMap: Record<string, any> = {};
      for (const p of (worstPins as any[] || [])) pinMap[p.id] = p;
      const worstJoined = (worst as any[] || []).map((w) => ({ ...w, pin: pinMap[w.pin_queue_id] }));

      // Pins linking to deleted/unrecoverable products
      const { data: deleted } = await supabase
        .from("pinterest_pin_queue" as any)
        .select("id, pinterest_pin_id, pin_title, destination_link, product_slug, final_resolved_url, repair_strategy, last_validated_at")
        .eq("status", "posted")
        .eq("validation_status", "invalid")
        .order("posted_at", { ascending: false })
        .limit(100);

      // Pins with mismatching images
      const { data: mismatchRows } = await supabase
        .from("pinterest_pin_image_match" as any)
        .select("pin_queue_id, score, verdict, vision_verdict, reasons")
        .eq("verdict", "mismatch")
        .order("score", { ascending: true })
        .limit(100);
      const mIds = (mismatchRows as any[] || []).map((w) => w.pin_queue_id);
      const { data: mPins } = mIds.length
        ? await supabase
            .from("pinterest_pin_queue" as any)
            .select("id, pin_title, pinterest_pin_id, final_resolved_url, pin_image_url")
            .in("id", mIds)
        : { data: [] };
      const mMap: Record<string, any> = {};
      for (const p of (mPins as any[] || [])) mMap[p.id] = p;
      const mismatchJoined = (mismatchRows as any[] || []).map((w) => ({ ...w, pin: mMap[w.pin_queue_id] }));

      // Top 100 highest-traffic pins (prefer pinterest_analytics_daily, fall back to gi_pinterest_pin_metrics)
      let trafficSource = "pinterest_analytics_daily";
      let traffic: any[] = [];
      const { data: pad } = await supabase
        .from("pinterest_analytics_daily" as any)
        .select("pin_id, impressions, outbound_clicks")
        .order("impressions", { ascending: false })
        .limit(500);
      if ((pad as any[] || []).length === 0) {
        trafficSource = "gi_pinterest_pin_metrics";
        const { data: gi } = await supabase
          .from("gi_pinterest_pin_metrics" as any)
          .select("pin_id, impressions, outbound_clicks")
          .order("impressions", { ascending: false })
          .limit(500);
        traffic = (gi as any[] || []);
      } else {
        traffic = (pad as any[] || []);
      }
      // Aggregate by pin_id (analytics tables are per-day rows)
      const agg: Record<string, { impressions: number; clicks: number }> = {};
      for (const r of traffic) {
        const k = r.pin_id;
        if (!k) continue;
        agg[k] = agg[k] || { impressions: 0, clicks: 0 };
        agg[k].impressions += Number(r.impressions || 0);
        agg[k].clicks += Number(r.outbound_clicks || 0);
      }
      const top = Object.entries(agg)
        .sort((a, b) => b[1].impressions - a[1].impressions)
        .slice(0, 100)
        .map(([pid, v]) => ({ pinterest_pin_id: pid, ...v }));
      let trafficJoined: any[] = top;
      if (top.length) {
        const { data: tp } = await supabase
          .from("pinterest_pin_queue" as any)
          .select("pinterest_pin_id, pin_title, final_resolved_url, validation_status, image_match_score")
          .in("pinterest_pin_id", top.map((t) => t.pinterest_pin_id));
        const tm: Record<string, any> = {};
        for (const p of (tp as any[] || [])) tm[p.pinterest_pin_id] = p;
        trafficJoined = top.map((t) => ({ ...t, pin: tm[t.pinterest_pin_id] }));
      } else {
        trafficSource = "none";
      }

      setReports({
        worst: worstJoined,
        traffic: trafficJoined,
        deleted: (deleted as any[] || []),
        mismatch: mismatchJoined,
        trafficSource,
      });
    })();
  }, [run?.id, matchSummary.mismatch]);


  const callFn = async (name: string) => {
    setBusy(name);
    try {
      const { data, error } = await supabase.functions.invoke(name, { body: {} });
      if (error) throw error;
      console.log(`[${name}]`, data);
      await load();
    } catch (e) {
      console.error(e);
      alert(`${name} failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (filter.startsWith("match:")) {
      const v = filter.slice(6);
      return rows.filter((r) => r.pin_queue_id && matches[r.pin_queue_id]?.verdict === v);
    }
    if (filter === "confidence:high") return rows.filter((r) => r.http_status === 200 && (matches[r.pin_queue_id || ""]?.score ?? 0) >= 90);
    if (filter === "confidence:medium") return rows.filter((r) => r.http_status === 200 && (matches[r.pin_queue_id || ""]?.score ?? 0) >= 80 && (matches[r.pin_queue_id || ""]?.score ?? 0) < 90);
    if (filter === "confidence:low") return rows.filter((r) => r.http_status === 200 && (matches[r.pin_queue_id || ""]?.score ?? 0) > 0 && (matches[r.pin_queue_id || ""]?.score ?? 0) < 80);
    if (filter === "confidence:critical") return rows.filter((r) => r.http_status !== 200 || (matches[r.pin_queue_id || ""]?.verdict === "mismatch"));
    return rows.filter((r) => r.repair_strategy === filter);
  }, [rows, filter, matches]);

  const summary = run?.summary || {};

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pinterest URL Recovery</h1>
          <p className="text-sm text-muted-foreground">
            Audit historical Pinterest destinations, recover broken pins via the
            redirect engine, and gate future publishing.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => callFn("pinterest-url-audit")} disabled={!!busy}>
            {busy === "pinterest-url-audit" && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Run URL audit
          </Button>
          <Button onClick={() => callFn("pinterest-pin-repair")} disabled={!!busy} variant="secondary">
            {busy === "pinterest-pin-repair" && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Run repair sweep
          </Button>
          <Button onClick={() => callFn("pinterest-image-product-match")} disabled={!!busy} variant="secondary">
            {busy === "pinterest-image-product-match" && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Run image audit
          </Button>
          <Button onClick={load} disabled={loading} variant="outline">Refresh</Button>
        </div>
      </header>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : !run ? (
        <Card className="p-6 text-sm">
          No audit runs yet. Click <b>Run URL audit</b> to start.
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <Kpi label="Total" value={run.pins_total} />
            <Kpi label="Working" value={run.pins_valid} tone="success" />
            <Kpi label="Broken" value={run.pins_broken} tone="danger" />
            <Kpi label="Via redirect" value={summary.recoverable_via_redirect ?? 0} />
            <Kpi label="Slug history" value={summary.recoverable_via_slug_history ?? 0} />
            <Kpi label="Alias" value={summary.recoverable_via_alias ?? 0} />
            <Kpi label="Similar" value={summary.recoverable_via_similar ?? 0} />
            <Kpi label="Category" value={summary.recoverable_via_category ?? 0} />
            <Kpi label="Needs replacement" value={summary.requires_replacement ?? 0} tone="warn" />
            <Kpi label="Missing products" value={summary.missing_products ?? 0} />
            <Kpi label="OOS products" value={summary.oos_products ?? 0} />
            <Kpi label="Inactive products" value={summary.inactive_products ?? 0} />
            <Kpi label="Exact match" value={matchSummary.exact_match ?? 0} tone="success" />
            <Kpi label="Close match" value={matchSummary.close_match ?? 0} />
            <Kpi label="Partial match" value={matchSummary.partial_match ?? 0} tone="warn" />
            <Kpi label="Mismatch" value={matchSummary.mismatch ?? 0} tone="danger" />
          </div>

          <div className="flex gap-2 flex-wrap">
            {[
              "all","valid","recoverable_via_redirect","recoverable_via_slug_history","recoverable_via_alias","recoverable_via_similar","recoverable_via_category","needs_replacement",
              "match:exact_match","match:close_match","match:partial_match","match:mismatch",
              "confidence:high","confidence:medium","confidence:low","confidence:critical",
            ].map((k) => (
              <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)}>
                {k}
              </Button>
            ))}
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2">Pinterest ID</th>
                  <th className="text-left p-2">Destination</th>
                  <th className="text-left p-2">Final URL</th>
                  <th className="text-center p-2">HTTP</th>
                  <th className="text-left p-2">Step</th>
                  <th className="text-left p-2">Strategy</th>
                  <th className="text-center p-2">Match</th>
                  <th className="text-left p-2">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 200).map((r) => {
                  const m = r.pin_queue_id ? matches[r.pin_queue_id] : undefined;
                  const conf =
                    r.http_status !== 200 || m?.verdict === "mismatch" ? "CRITICAL" :
                    (m?.score ?? 0) >= 90 ? "HIGH" :
                    (m?.score ?? 0) >= 80 ? "MEDIUM" :
                    (m?.score ?? 0) > 0 ? "LOW" : "—";
                  return (
                  <tr key={r.id} className="border-t">
                    <td className="p-2 font-mono">{r.pinterest_pin_id?.slice(0, 18) || "—"}</td>
                    <td className="p-2 truncate max-w-[260px]" title={r.destination_url}>{r.destination_url}</td>
                    <td className="p-2 truncate max-w-[260px]" title={r.final_resolved_url || ""}>{r.final_resolved_url || "—"}</td>
                    <td className="p-2 text-center">
                      <Badge variant={r.http_status === 200 ? "default" : "destructive"}>{r.http_status ?? "—"}</Badge>
                    </td>
                    <td className="p-2">{r.resolver_step}</td>
                    <td className="p-2">{r.repair_strategy}</td>
                    <td className="p-2 text-center">
                      {m ? <Badge variant={m.score >= 80 ? "default" : "destructive"}>{m.score} · {m.verdict}</Badge> : "—"}
                    </td>
                    <td className="p-2">{conf}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length > 200 && (
              <div className="p-2 text-xs text-muted-foreground">Showing first 200 of {filtered.length}</div>
            )}
          </Card>

          <section className="space-y-3 pt-4 border-t">
            <header className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-semibold">Recovery reports</h2>
              <div className="flex gap-2">
                {([
                  ["worst", `Worst pins (${reports.worst.length})`],
                  ["traffic", `Top traffic (${reports.traffic.length})`],
                  ["deleted", `Deleted-product pins (${reports.deleted.length})`],
                  ["mismatch", `Image mismatches (${reports.mismatch.length})`],
                ] as const).map(([k, label]) => (
                  <Button key={k} size="sm" variant={reportTab === k ? "default" : "outline"} onClick={() => setReportTab(k)}>
                    {label}
                  </Button>
                ))}
              </div>
            </header>

            {reportTab === "worst" && (
              <Card className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2">Pinterest ID</th>
                      <th className="text-left p-2">Pin title</th>
                      <th className="text-center p-2">Score</th>
                      <th className="text-left p-2">Verdict</th>
                      <th className="text-left p-2">Vision</th>
                      <th className="text-left p-2">Final URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.worst.map((r: any) => (
                      <tr key={r.pin_queue_id} className="border-t">
                        <td className="p-2 font-mono">{r.pin?.pinterest_pin_id?.slice(0,18) || "—"}</td>
                        <td className="p-2 truncate max-w-[280px]">{r.pin?.pin_title || "—"}</td>
                        <td className="p-2 text-center"><Badge variant="destructive">{r.score}</Badge></td>
                        <td className="p-2">{r.verdict}</td>
                        <td className="p-2">{r.vision_verdict || "—"}</td>
                        <td className="p-2 truncate max-w-[260px]" title={r.pin?.final_resolved_url || ""}>{r.pin?.final_resolved_url || "—"}</td>
                      </tr>
                    ))}
                    {reports.worst.length === 0 && (
                      <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Run the image audit to populate this table.</td></tr>
                    )}
                  </tbody>
                </table>
              </Card>
            )}

            {reportTab === "traffic" && (
              <Card className="overflow-x-auto">
                <div className="p-2 text-xs text-muted-foreground border-b">Source: {reports.trafficSource}</div>
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2">Pinterest ID</th>
                      <th className="text-left p-2">Pin title</th>
                      <th className="text-right p-2">Impressions</th>
                      <th className="text-right p-2">Clicks</th>
                      <th className="text-left p-2">Validation</th>
                      <th className="text-center p-2">Img match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.traffic.map((r: any) => (
                      <tr key={r.pinterest_pin_id} className="border-t">
                        <td className="p-2 font-mono">{r.pinterest_pin_id?.slice(0,18) || "—"}</td>
                        <td className="p-2 truncate max-w-[280px]">{r.pin?.pin_title || "—"}</td>
                        <td className="p-2 text-right">{r.impressions}</td>
                        <td className="p-2 text-right">{r.clicks}</td>
                        <td className="p-2">{r.pin?.validation_status || "—"}</td>
                        <td className="p-2 text-center">{r.pin?.image_match_score ?? "—"}</td>
                      </tr>
                    ))}
                    {reports.traffic.length === 0 && (
                      <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No Pinterest analytics ingested yet (pinterest_analytics_daily and gi_pinterest_pin_metrics are empty).</td></tr>
                    )}
                  </tbody>
                </table>
              </Card>
            )}

            {reportTab === "deleted" && (
              <Card className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2">Pinterest ID</th>
                      <th className="text-left p-2">Pin title</th>
                      <th className="text-left p-2">Dead slug</th>
                      <th className="text-left p-2">Resolver</th>
                      <th className="text-left p-2">Last validated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.deleted.map((r: any) => (
                      <tr key={r.id} className="border-t">
                        <td className="p-2 font-mono">{r.pinterest_pin_id?.slice(0,18) || "—"}</td>
                        <td className="p-2 truncate max-w-[260px]">{r.pin_title || "—"}</td>
                        <td className="p-2 truncate max-w-[220px]">{r.product_slug || "—"}</td>
                        <td className="p-2">{r.repair_strategy || "—"}</td>
                        <td className="p-2">{r.last_validated_at ? new Date(r.last_validated_at).toLocaleString() : "—"}</td>
                      </tr>
                    ))}
                    {reports.deleted.length === 0 && (
                      <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No invalid pins.</td></tr>
                    )}
                  </tbody>
                </table>
              </Card>
            )}

            {reportTab === "mismatch" && (
              <Card className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2">Pinterest ID</th>
                      <th className="text-left p-2">Pin title</th>
                      <th className="text-center p-2">Score</th>
                      <th className="text-left p-2">Vision verdict</th>
                      <th className="text-left p-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.mismatch.map((r: any) => {
                      const visionReason = Array.isArray(r.reasons) ? r.reasons.find((x: any) => x?.kind === "vision")?.reason : null;
                      return (
                        <tr key={r.pin_queue_id} className="border-t">
                          <td className="p-2 font-mono">{r.pin?.pinterest_pin_id?.slice(0,18) || "—"}</td>
                          <td className="p-2 truncate max-w-[280px]">{r.pin?.pin_title || "—"}</td>
                          <td className="p-2 text-center"><Badge variant="destructive">{r.score}</Badge></td>
                          <td className="p-2">{r.vision_verdict || "—"}</td>
                          <td className="p-2 truncate max-w-[320px]" title={visionReason || ""}>{visionReason || "—"}</td>
                        </tr>
                      );
                    })}
                    {reports.mismatch.length === 0 && (
                      <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No mismatches detected yet (run the image audit).</td></tr>
                    )}
                  </tbody>
                </table>
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: "success" | "danger" | "warn" }) {
  const cls =
    tone === "success" ? "text-emerald-600" :
    tone === "danger" ? "text-red-600" :
    tone === "warn" ? "text-amber-600" : "";
  return (
    <Card className="p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold ${cls}`}>{value}</div>
    </Card>
  );
}
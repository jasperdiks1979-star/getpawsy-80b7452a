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
import { useEffect, useMemo, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { format } from "date-fns";
import { Activity, RefreshCw, CalendarIcon, CheckCircle2, XCircle, Search, ChevronDown, ChevronRight, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface RunRow {
  id: string;
  function_name: string | null;
  trace_id: string | null;
  status: string | null;
  success: boolean | null;
  run_type: string | null;
  duration_ms: number | null;
  watches_total: number | null;
  watches_unhealthy: number | null;
  checks_passed: number | null;
  checks_failed: number | null;
  new_alerts: string[] | null;
  results: unknown;
  details: unknown;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

function statusOf(r: RunRow): "success" | "error" | "unknown" {
  if (r.status === "success" || r.status === "error") return r.status as "success" | "error";
  if (r.success === true) return "success";
  if (r.success === false) return "error";
  return "unknown";
}

export default function MonitoringRunsPage() {
  const [rows, setRows] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [from, setFrom] = useState<Date | undefined>(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); d.setHours(0, 0, 0, 0); return d;
  });
  const [to, setTo] = useState<Date | undefined>(() => {
    const d = new Date(); d.setHours(23, 59, 59, 999); return d;
  });
  const [functionName, setFunctionName] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      let q = (supabase as any)
        .from("monitoring_runs")
        .select("id, function_name, trace_id, status, success, run_type, duration_ms, watches_total, watches_unhealthy, checks_passed, checks_failed, new_alerts, results, details, error_message, started_at, completed_at, created_at")
        .order("started_at", { ascending: false })
        .limit(1000);

      if (from) q = q.gte("started_at", from.toISOString());
      if (to) q = q.lte("started_at", to.toISOString());
      if (functionName !== "all") q = q.eq("function_name", functionName);

      const { data, error: err } = await q;
      if (err) throw err;
      setRows(((data as unknown) || []) as RunRow[]);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      console.error("[MonitoringRuns] fetch error", e);
      setError(e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }, [from, to, functionName]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const functionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.function_name) set.add(r.function_name);
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && statusOf(r) !== status) return false;
      if (!s) return true;
      return [
        r.function_name,
        r.trace_id,
        r.error_message,
        r.run_type,
        ...(r.new_alerts || []),
      ].filter(Boolean).some((v) => (v as string).toLowerCase().includes(s));
    });
  }, [rows, status, search]);

  const summary = useMemo(() => {
    let success = 0, errors = 0, unhealthy = 0;
    let totalDur = 0, durCount = 0;
    for (const r of filtered) {
      const st = statusOf(r);
      if (st === "success") success++;
      else if (st === "error") errors++;
      if (r.watches_unhealthy && r.watches_unhealthy > 0) unhealthy++;
      if (typeof r.duration_ms === "number") { totalDur += r.duration_ms; durCount++; }
    }
    const avgDur = durCount > 0 ? Math.round(totalDur / durCount) : 0;
    return { total: filtered.length, success, errors, unhealthy, avgDur };
  }, [filtered]);

  const exportCsv = () => {
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      "started_at","completed_at","function_name","status","duration_ms","watches_total","watches_unhealthy","checks_passed","checks_failed","new_alerts","trace_id","error_message",
    ];
    const lines = [header.join(",")];
    for (const r of filtered) {
      lines.push([
        r.started_at, r.completed_at || "", r.function_name || "", statusOf(r), r.duration_ms ?? "",
        r.watches_total ?? "", r.watches_unhealthy ?? "", r.checks_passed ?? "", r.checks_failed ?? "",
        (r.new_alerts || []).join("|"), r.trace_id || "", r.error_message || "",
      ].map(esc).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `monitoring-runs-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Helmet>
        <title>Monitoring Runs | Admin</title>
      </Helmet>
      <div className="container py-6 space-y-6 max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              Monitoring Runs
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Audit-log van heartbeat- en monitoring-runs uit <code>monitoring_runs</code>. Filter op datum, function_name en status.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-xs text-muted-foreground">
                Laatst bijgewerkt {lastUpdated.toLocaleTimeString("nl-NL")}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={fetchRows} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="h-4 w-4 mr-1.5" />CSV
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4 flex flex-wrap items-end gap-3">
            <DatePick label="Van" value={from} onChange={setFrom} />
            <DatePick label="Tot" value={to} onChange={setTo} />
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Function</span>
              <Select value={functionName} onValueChange={setFunctionName}>
                <SelectTrigger className="w-[240px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle functions</SelectItem>
                  {functionOptions.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                  {functionOptions.length === 0 && (
                    <SelectItem value="monitoring-tracking-heartbeat">monitoring-tracking-heartbeat</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Status</span>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle statussen</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <span className="text-xs text-muted-foreground">Zoek</span>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
                <Input
                  placeholder="trace id, alert key, error…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value.slice(0, 100))}
                  className="pl-8 h-9"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {error && (
          <Card className="border-destructive">
            <CardContent className="p-4 text-sm text-destructive">Fout bij laden: {error}</CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Stat label="Runs" value={summary.total} />
          <Stat label="Success" value={summary.success} tone="ok" />
          <Stat label="Errors" value={summary.errors} tone={summary.errors > 0 ? "bad" : "default"} />
          <Stat label="Met unhealthy watches" value={summary.unhealthy} tone={summary.unhealthy > 0 ? "warn" : "default"} />
          <Stat label="Avg duration" value={`${summary.avgDur} ms`} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Runs ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">Geen runs gevonden.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="w-6 p-2"></th>
                      <th className="text-left p-2">Tijd</th>
                      <th className="text-left p-2">Function</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-left p-2">Duur</th>
                      <th className="text-left p-2">Watches</th>
                      <th className="text-left p-2">New alerts</th>
                      <th className="text-left p-2">Trace</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const st = statusOf(r);
                      const isOpen = expanded === r.id;
                      return (
                        <>
                          <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                            <td className="p-2 align-top">
                              <button
                                onClick={() => setExpanded(isOpen ? null : r.id)}
                                className="p-0.5 rounded hover:bg-muted"
                                aria-label={isOpen ? "Inklappen" : "Uitklappen"}
                              >
                                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </button>
                            </td>
                            <td className="p-2 align-top whitespace-nowrap text-xs text-muted-foreground">
                              {new Date(r.started_at).toLocaleString("nl-NL")}
                            </td>
                            <td className="p-2 align-top text-xs font-mono">{r.function_name || "—"}</td>
                            <td className="p-2 align-top">
                              {st === "success" ? (
                                <Badge className="bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="h-3 w-3 mr-1" />Success</Badge>
                              ) : st === "error" ? (
                                <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Error</Badge>
                              ) : (
                                <Badge variant="outline">—</Badge>
                              )}
                            </td>
                            <td className="p-2 align-top text-xs">{r.duration_ms != null ? `${r.duration_ms} ms` : "—"}</td>
                            <td className="p-2 align-top text-xs">
                              {(r.watches_total ?? r.checks_passed ?? r.checks_failed) != null ? (
                                <span>
                                  {r.watches_total ?? ((r.checks_passed || 0) + (r.checks_failed || 0))} ·
                                  <span className={`ml-1 ${((r.watches_unhealthy ?? r.checks_failed) || 0) > 0 ? "text-destructive" : "text-emerald-600"}`}>
                                    {(r.watches_unhealthy ?? r.checks_failed) || 0} unhealthy
                                  </span>
                                </span>
                              ) : "—"}
                            </td>
                            <td className="p-2 align-top text-xs">
                              {(r.new_alerts || []).length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {(r.new_alerts || []).map((a) => (
                                    <Badge key={a} variant="outline" className="text-[10px]">{a}</Badge>
                                  ))}
                                </div>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="p-2 align-top text-xs font-mono" title={r.trace_id || ""}>
                              {r.trace_id ? `${r.trace_id.slice(0, 8)}…` : "—"}
                            </td>
                          </tr>
                          {isOpen && (
                            <tr key={`${r.id}-d`} className="border-t border-border bg-muted/10">
                              <td></td>
                              <td colSpan={7} className="p-3">
                                {r.error_message && (
                                  <div className="mb-2 text-xs text-destructive">
                                    <strong>Error:</strong> {r.error_message}
                                  </div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <pre className="text-[11px] bg-background border border-border rounded p-2 overflow-x-auto max-h-64">
{JSON.stringify(r.results ?? null, null, 2)}
                                  </pre>
                                  <pre className="text-[11px] bg-background border border-border rounded p-2 overflow-x-auto max-h-64">
{JSON.stringify(r.details ?? null, null, 2)}
                                  </pre>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function DatePick({ label, value, onChange }: { label: string; value: Date | undefined; onChange: (d: Date | undefined) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("w-[180px] h-9 justify-start text-left font-normal", !value && "text-muted-foreground")}>
            <CalendarIcon className="h-4 w-4 mr-2" />
            {value ? format(value, "PPP") : "Kies datum"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={onChange}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "ok" | "warn" | "bad" }) {
  const border =
    tone === "ok" ? "border-emerald-500/40" :
    tone === "warn" ? "border-amber-500/50" :
    tone === "bad" ? "border-destructive/50" : "";
  return (
    <Card className={border}>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-1">{typeof value === "number" ? value.toLocaleString("nl-NL") : value}</p>
      </CardContent>
    </Card>
  );
}
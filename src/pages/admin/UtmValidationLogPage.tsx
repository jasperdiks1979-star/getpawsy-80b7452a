import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { ShieldAlert, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Search, BellRing, BellOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Range = "1h" | "24h" | "7d" | "30d";

const RANGE_MS: Record<Range, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

interface LogRow {
  id: string;
  session_id: string;
  source_channel: string | null;
  validation_status: string;
  missing_fields: string[];
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  ttclid: string | null;
  gclid: string | null;
  fbclid: string | null;
  referrer: string | null;
  landing_page: string | null;
  is_internal: boolean;
  created_at: string;
}

function statusBadge(status: string) {
  switch (status) {
    case "valid":
      return <Badge className="bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="h-3 w-3 mr-1" />Valid</Badge>;
    case "partial":
      return <Badge className="bg-amber-500 hover:bg-amber-500"><AlertTriangle className="h-3 w-3 mr-1" />Partial</Badge>;
    case "missing":
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Missing</Badge>;
    case "direct":
      return <Badge variant="outline">Direct</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function UtmValidationLogPage() {
  const [range, setRange] = useState<Range>("24h");
  const [channel, setChannel] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    try {
      const cutoff = new Date(Date.now() - RANGE_MS[range]).toISOString();
      let q = supabase
        .from("utm_session_log")
        .select(
          "id, session_id, source_channel, validation_status, missing_fields, utm_source, utm_medium, utm_campaign, utm_content, utm_term, ttclid, gclid, fbclid, referrer, landing_page, is_internal, created_at"
        )
        .gte("created_at", cutoff)
        .eq("is_internal", false)
        .order("created_at", { ascending: false })
        .limit(500);

      if (channel !== "all") q = q.eq("source_channel", channel);

      const { data, error: err } = await q;
      if (err) throw err;
      setRows((data || []) as LogRow[]);
      setError(null);
    } catch (e) {
      console.error("[UtmValidationLog] fetch error", e);
      setError(e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }, [range, channel]);

  useEffect(() => {
    setLoading(true);
    fetchRows();
  }, [fetchRows]);

  // Realtime updates
  useEffect(() => {
    const ch = supabase
      .channel("utm-validation-log")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "utm_session_log" }, () => fetchRows())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [fetchRows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.session_id, r.utm_source, r.utm_campaign, r.utm_content, r.landing_page, r.referrer]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(s))
    );
  }, [rows, search]);

  const summary = useMemo(() => {
    const total = rows.length;
    let valid = 0, partial = 0, missing = 0, direct = 0;
    const byChannel: Record<string, number> = {};
    const missingFieldCounts: Record<string, number> = {};
    for (const r of rows) {
      if (r.validation_status === "valid") valid++;
      else if (r.validation_status === "partial") partial++;
      else if (r.validation_status === "missing") missing++;
      else if (r.validation_status === "direct") direct++;
      const c = r.source_channel || "unknown";
      byChannel[c] = (byChannel[c] || 0) + 1;
      for (const f of r.missing_fields || []) {
        missingFieldCounts[f] = (missingFieldCounts[f] || 0) + 1;
      }
    }
    return { total, valid, partial, missing, direct, byChannel, missingFieldCounts };
  }, [rows]);

  const tiktokRows = rows.filter((r) => r.source_channel === "tiktok");
  const tiktokValid = tiktokRows.filter((r) => r.validation_status === "valid").length;
  const tiktokRate = tiktokRows.length > 0 ? (tiktokValid / tiktokRows.length) * 100 : 0;

  // ---- TikTok UTM-validatie alert ----
  const THRESHOLD_KEY = "admin.utmAlert.tiktokThreshold";
  const MIN_SAMPLE_KEY = "admin.utmAlert.tiktokMinSample";
  const ENABLED_KEY = "admin.utmAlert.tiktokEnabled";
  const [threshold, setThreshold] = useState<number>(() => {
    const v = Number(localStorage.getItem(THRESHOLD_KEY));
    return Number.isFinite(v) && v > 0 ? v : 80;
  });
  const [minSample, setMinSample] = useState<number>(() => {
    const v = Number(localStorage.getItem(MIN_SAMPLE_KEY));
    return Number.isFinite(v) && v > 0 ? v : 10;
  });
  const [alertEnabled, setAlertEnabled] = useState<boolean>(() => {
    return localStorage.getItem(ENABLED_KEY) !== "false";
  });
  useEffect(() => { localStorage.setItem(THRESHOLD_KEY, String(threshold)); }, [threshold]);
  useEffect(() => { localStorage.setItem(MIN_SAMPLE_KEY, String(minSample)); }, [minSample]);
  useEffect(() => { localStorage.setItem(ENABLED_KEY, String(alertEnabled)); }, [alertEnabled]);

  const hasEnoughSample = tiktokRows.length >= minSample;
  const isBelowThreshold = alertEnabled && hasEnoughSample && tiktokRate < threshold;

  // Fire a toast once per "breach episode" (when crossing from OK → below)
  const wasBelowRef = useRef<boolean>(false);
  useEffect(() => {
    if (loading) return;
    if (isBelowThreshold && !wasBelowRef.current) {
      toast.error(
        `TikTok UTM-validatie onder drempel: ${tiktokRate.toFixed(0)}% (drempel ${threshold}%)`,
        {
          description: `${tiktokValid}/${tiktokRows.length} sessions valide in ${range}.`,
          duration: 8000,
        },
      );
    }
    wasBelowRef.current = isBelowThreshold;
  }, [isBelowThreshold, tiktokRate, threshold, tiktokValid, tiktokRows.length, range, loading]);

  return (
    <>
      <Helmet>
        <title>UTM Validation Log | Admin</title>
      </Helmet>
      <div className="container py-6 space-y-6 max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-primary" />
              UTM Validation Log
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Per sessie de eerste UTM-set, automatisch gevalideerd per kanaal. Detecteert ontbrekende of incorrecte parameters.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
              <TabsList>
                <TabsTrigger value="1h">1h</TabsTrigger>
                <TabsTrigger value="24h">24h</TabsTrigger>
                <TabsTrigger value="7d">7d</TabsTrigger>
                <TabsTrigger value="30d">30d</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" size="sm" onClick={fetchRows} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {error && (
          <Card className="border-destructive">
            <CardContent className="p-4 text-sm text-destructive">Fout bij laden: {error}</CardContent>
          </Card>
        )}

        {/* TikTok validatie-alert + drempelinstelling */}
        <Card className={isBelowThreshold ? "border-destructive bg-destructive/5" : "border-border"}>
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              {isBelowThreshold ? (
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              ) : alertEnabled ? (
                <BellRing className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              ) : (
                <BellOff className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              )}
              <div className="text-sm">
                <div className="font-medium">
                  {isBelowThreshold
                    ? `⚠️ TikTok UTM-validatie ${tiktokRate.toFixed(0)}% — onder drempel van ${threshold}%`
                    : !alertEnabled
                      ? "Alert uitgeschakeld"
                      : !hasEnoughSample
                        ? `Onvoldoende sample (${tiktokRows.length}/${minSample}) — geen alert`
                        : `TikTok UTM-validatie OK: ${tiktokRate.toFixed(0)}% (drempel ${threshold}%)`}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Alert vuurt wanneer het percentage valide TikTok-sessies in het gekozen tijdvenster onder de drempel komt en de sample groot genoeg is.
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                Drempel %
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={threshold}
                  onChange={(e) => setThreshold(Math.max(1, Math.min(100, Number(e.target.value) || 0)))}
                  className="h-8 w-20"
                />
              </label>
              <label className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                Min. sample
                <Input
                  type="number"
                  min={1}
                  max={10000}
                  value={minSample}
                  onChange={(e) => setMinSample(Math.max(1, Math.min(10000, Number(e.target.value) || 0)))}
                  className="h-8 w-20"
                />
              </label>
              <Button
                variant={alertEnabled ? "outline" : "secondary"}
                size="sm"
                onClick={() => setAlertEnabled((v) => !v)}
                title={alertEnabled ? "Alert uitschakelen" : "Alert inschakelen"}
              >
                {alertEnabled ? <><BellRing className="h-4 w-4 mr-1.5" />Aan</> : <><BellOff className="h-4 w-4 mr-1.5" />Uit</>}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Stat label="Totaal sessions" value={summary.total} sub="met UTM-log" />
          <Stat label="Valid" value={summary.valid} sub={`${summary.total ? ((summary.valid / summary.total) * 100).toFixed(0) : 0}%`} tone="ok" />
          <Stat label="Partial" value={summary.partial} sub={`${summary.total ? ((summary.partial / summary.total) * 100).toFixed(0) : 0}%`} tone="warn" />
          <Stat label="Missing" value={summary.missing} sub={`${summary.total ? ((summary.missing / summary.total) * 100).toFixed(0) : 0}%`} tone="bad" />
          <Stat label="TikTok valid rate" value={`${tiktokRate.toFixed(0)}%`} sub={`${tiktokValid}/${tiktokRows.length} sessions`} tone={tiktokRate >= 80 ? "ok" : tiktokRate >= 50 ? "warn" : "bad"} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Sessions per kanaal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {Object.entries(summary.byChannel).sort((a, b) => b[1] - a[1]).map(([ch, n]) => (
                <div key={ch} className="flex items-center justify-between text-sm">
                  <button
                    onClick={() => setChannel(channel === ch ? "all" : ch)}
                    className={`text-left hover:underline ${channel === ch ? "font-semibold text-primary" : ""}`}
                  >
                    {ch}
                  </button>
                  <span className="font-mono text-xs">{n}</span>
                </div>
              ))}
              {Object.keys(summary.byChannel).length === 0 && (
                <p className="text-xs text-muted-foreground">Geen data.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Meest ontbrekende UTM-velden</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {Object.entries(summary.missingFieldCounts).sort((a, b) => b[1] - a[1]).map(([f, n]) => (
                <div key={f} className="flex items-center justify-between text-sm">
                  <code className="text-xs">{f}</code>
                  <span className="font-mono text-xs">{n}× ontbreekt</span>
                </div>
              ))}
              {Object.keys(summary.missingFieldCounts).length === 0 && (
                <p className="text-xs text-muted-foreground">Geen ontbrekende velden 🎉</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">
              Sessie-log {channel !== "all" && <span className="text-xs text-muted-foreground">· filter: {channel}</span>}
            </CardTitle>
            <div className="relative w-full max-w-xs">
              <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Zoek campaign / pad / source…"
                value={search}
                onChange={(e) => setSearch(e.target.value.slice(0, 100))}
                className="pl-8 h-9"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">Geen sessies in dit venster.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left p-2">Tijd</th>
                      <th className="text-left p-2">Kanaal</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-left p-2">Source / Medium / Campaign</th>
                      <th className="text-left p-2">Content</th>
                      <th className="text-left p-2">Landing</th>
                      <th className="text-left p-2">Ontbreekt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id} className="border-t border-border align-top">
                        <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleString("nl-NL")}
                        </td>
                        <td className="p-2 text-xs">{r.source_channel || "—"}</td>
                        <td className="p-2">{statusBadge(r.validation_status)}</td>
                        <td className="p-2 text-xs">
                          <div>{r.utm_source || <span className="text-muted-foreground">—</span>}</div>
                          <div className="text-muted-foreground">{r.utm_medium || "—"}</div>
                          <div className="text-muted-foreground">{r.utm_campaign || "—"}</div>
                        </td>
                        <td className="p-2 text-xs max-w-[180px] truncate" title={r.utm_content || ""}>
                          {r.utm_content || "—"}
                        </td>
                        <td className="p-2 text-xs max-w-[200px] truncate" title={r.landing_page || ""}>
                          {r.landing_page || "—"}
                        </td>
                        <td className="p-2 text-xs">
                          {r.missing_fields && r.missing_fields.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {r.missing_fields.map((f) => (
                                <Badge key={f} variant="outline" className="text-[10px]">{f}</Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
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

function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: "default" | "ok" | "warn" | "bad";
}) {
  const border =
    tone === "ok" ? "border-emerald-500/40" : tone === "warn" ? "border-amber-500/50" : tone === "bad" ? "border-destructive/50" : "";
  return (
    <Card className={border}>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-1">{typeof value === "number" ? value.toLocaleString("nl-NL") : value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}
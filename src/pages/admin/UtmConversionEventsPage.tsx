import { useEffect, useMemo, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { ShoppingCart, CreditCard, RefreshCw, Search, Link2, AlertTriangle, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

type Range = "1h" | "24h" | "7d" | "30d";
type EventFilter = "all" | "cart" | "checkout";

const RANGE_MS: Record<Range, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

interface EventRow {
  id: string;
  session_id: string;
  activity_type: string; // "cart" | "checkout"
  page_path: string | null;
  created_at: string;
  // joined UTM-set (may be missing)
  utm: UtmRow | null;
}

interface UtmRow {
  source_channel: string | null;
  validation_status: string;
  missing_fields: string[] | null;
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
}

function statusBadge(status: string | undefined) {
  switch (status) {
    case "valid":
      return <Badge className="bg-emerald-600 hover:bg-emerald-600">Valid</Badge>;
    case "partial":
      return <Badge className="bg-amber-500 hover:bg-amber-500">Partial</Badge>;
    case "missing":
      return <Badge variant="destructive">Missing</Badge>;
    case "direct":
      return <Badge variant="outline">Direct</Badge>;
    default:
      return <Badge variant="outline">No log</Badge>;
  }
}

function eventBadge(t: string) {
  if (t === "checkout") return <Badge className="bg-emerald-600 hover:bg-emerald-600"><CreditCard className="h-3 w-3 mr-1" />Checkout</Badge>;
  if (t === "cart") return <Badge className="bg-amber-500 hover:bg-amber-500"><ShoppingCart className="h-3 w-3 mr-1" />Add to cart</Badge>;
  return <Badge variant="outline">{t}</Badge>;
}

export default function UtmConversionEventsPage() {
  const [range, setRange] = useState<Range>("24h");
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const cutoff = new Date(Date.now() - RANGE_MS[range]).toISOString();
      const types = eventFilter === "all" ? ["cart", "checkout"] : [eventFilter];

      // 1) Fetch conversion events
      const { data: events, error: eErr } = await supabase
        .from("visitor_activity")
        .select("id, session_id, activity_type, page_path, created_at")
        .in("activity_type", types)
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (eErr) throw eErr;

      const sessionIds = Array.from(new Set((events || []).map((e) => e.session_id).filter(Boolean)));

      // 2) Fetch matching UTM logs (chunk to avoid IN limits)
      const utmMap = new Map<string, UtmRow>();
      const CHUNK = 200;
      for (let i = 0; i < sessionIds.length; i += CHUNK) {
        const chunk = sessionIds.slice(i, i + CHUNK);
        const { data: utms, error: uErr } = await supabase
          .from("utm_session_log")
          .select(
            "session_id, source_channel, validation_status, missing_fields, utm_source, utm_medium, utm_campaign, utm_content, utm_term, ttclid, gclid, fbclid, referrer, landing_page",
          )
          .in("session_id", chunk);
        if (uErr) throw uErr;
        for (const u of utms || []) {
          // Keep first (one row per session is the standard log behaviour)
          if (!utmMap.has(u.session_id)) utmMap.set(u.session_id, u as UtmRow);
        }
      }

      const joined: EventRow[] = (events || []).map((e) => ({
        id: e.id,
        session_id: e.session_id,
        activity_type: e.activity_type,
        page_path: e.page_path,
        created_at: e.created_at,
        utm: utmMap.get(e.session_id) || null,
      }));

      setRows(joined);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      console.error("[UtmConversionEvents] fetch error", e);
      setError(e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }, [range, eventFilter]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  // Realtime: refresh when a new cart/checkout event lands
  useEffect(() => {
    const ch = supabase
      .channel("utm-conversion-events")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "visitor_activity" },
        (payload: { new: { activity_type?: string } }) => {
          const t = payload?.new?.activity_type;
          if (t === "cart" || t === "checkout") fetchRows();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [fetchRows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [
        r.session_id,
        r.page_path,
        r.utm?.utm_source,
        r.utm?.utm_medium,
        r.utm?.utm_campaign,
        r.utm?.utm_content,
        r.utm?.source_channel,
      ]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(s)),
    );
  }, [rows, search]);

  const summary = useMemo(() => {
    let carts = 0, checkouts = 0, missingUtm = 0;
    const byChannel: Record<string, { cart: number; checkout: number }> = {};
    for (const r of rows) {
      if (r.activity_type === "cart") carts++;
      else if (r.activity_type === "checkout") checkouts++;
      const ch = r.utm?.source_channel || "unknown";
      byChannel[ch] = byChannel[ch] || { cart: 0, checkout: 0 };
      if (r.activity_type === "cart") byChannel[ch].cart++;
      else if (r.activity_type === "checkout") byChannel[ch].checkout++;
      if (!r.utm) missingUtm++;
    }
    return { carts, checkouts, missingUtm, byChannel };
  }, [rows]);

  const exportCsv = () => {
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      "event_time","event_type","session_id","page_path",
      "utm_status","source_channel","utm_source","utm_medium","utm_campaign","utm_content","utm_term",
      "ttclid","gclid","fbclid","referrer","landing_page","missing_fields",
    ];
    const lines = [header.join(",")];
    for (const r of filtered) {
      lines.push([
        r.created_at,
        r.activity_type,
        r.session_id,
        r.page_path || "",
        r.utm?.validation_status || "no_log",
        r.utm?.source_channel || "",
        r.utm?.utm_source || "",
        r.utm?.utm_medium || "",
        r.utm?.utm_campaign || "",
        r.utm?.utm_content || "",
        r.utm?.utm_term || "",
        r.utm?.ttclid || "",
        r.utm?.gclid || "",
        r.utm?.fbclid || "",
        r.utm?.referrer || "",
        r.utm?.landing_page || "",
        (r.utm?.missing_fields || []).join("|"),
      ].map(esc).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `utm-conversion-events-${range}-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Helmet>
        <title>UTM Conversion Events | Admin</title>
      </Helmet>
      <div className="container py-6 space-y-6 max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Link2 className="h-6 w-6 text-primary" />
              UTM × Conversion events
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Per <code>add_to_cart</code> en <code>checkout</code> event de bijbehorende UTM-set van die sessie. Sessies zonder gelogde UTM verschijnen als <em>No log</em>.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
              <TabsList>
                <TabsTrigger value="1h">1h</TabsTrigger>
                <TabsTrigger value="24h">24h</TabsTrigger>
                <TabsTrigger value="7d">7d</TabsTrigger>
                <TabsTrigger value="30d">30d</TabsTrigger>
              </TabsList>
            </Tabs>
            <Tabs value={eventFilter} onValueChange={(v) => setEventFilter(v as EventFilter)}>
              <TabsList>
                <TabsTrigger value="all">Alle</TabsTrigger>
                <TabsTrigger value="cart">Cart</TabsTrigger>
                <TabsTrigger value="checkout">Checkout</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" size="sm" onClick={fetchRows} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={loading || filtered.length === 0}>
              <Download className="h-4 w-4 mr-1.5" />CSV
            </Button>
          </div>
        </div>

        {error && (
          <Card className="border-destructive">
            <CardContent className="p-4 text-sm text-destructive">Fout bij laden: {error}</CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Add to cart" value={summary.carts} />
          <Stat label="Checkout" value={summary.checkouts} />
          <Stat
            label="Zonder UTM-log"
            value={summary.missingUtm}
            tone={summary.missingUtm > 0 ? "warn" : "default"}
            sub={rows.length ? `${((summary.missingUtm / rows.length) * 100).toFixed(0)}% van events` : undefined}
          />
          <Stat label="Unieke sessies" value={new Set(rows.map((r) => r.session_id)).size} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Conversies per kanaal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {Object.entries(summary.byChannel).sort((a, b) => (b[1].cart + b[1].checkout) - (a[1].cart + a[1].checkout)).map(([ch, n]) => (
              <div key={ch} className="flex items-center justify-between text-sm">
                <span className={ch === "unknown" ? "text-muted-foreground" : ""}>{ch}</span>
                <span className="font-mono text-xs">
                  <span className="text-amber-600">{n.cart} cart</span> · <span className="text-emerald-600">{n.checkout} checkout</span>
                </span>
              </div>
            ))}
            {Object.keys(summary.byChannel).length === 0 && (
              <p className="text-xs text-muted-foreground">Geen conversie-events in dit venster.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">
              Events × UTM
              {lastUpdated && (
                <span className="ml-2 text-xs text-muted-foreground font-normal">
                  · laatst bijgewerkt {lastUpdated.toLocaleTimeString("nl-NL")}
                </span>
              )}
            </CardTitle>
            <div className="relative w-full max-w-xs">
              <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Zoek campaign / source / pad…"
                value={search}
                onChange={(e) => setSearch(e.target.value.slice(0, 100))}
                className="pl-8 h-9"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">Geen events in dit venster.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left p-2">Tijd</th>
                      <th className="text-left p-2">Event</th>
                      <th className="text-left p-2">Session</th>
                      <th className="text-left p-2">Pagina</th>
                      <th className="text-left p-2">UTM-status</th>
                      <th className="text-left p-2">Source / Medium / Campaign</th>
                      <th className="text-left p-2">Content</th>
                      <th className="text-left p-2">Click ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id} className="border-t border-border align-top">
                        <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleString("nl-NL")}
                        </td>
                        <td className="p-2">{eventBadge(r.activity_type)}</td>
                        <td className="p-2 font-mono text-xs" title={r.session_id}>{r.session_id.slice(0, 10)}…</td>
                        <td className="p-2 text-xs max-w-[200px] truncate" title={r.page_path || ""}>{r.page_path || "—"}</td>
                        <td className="p-2">
                          <div className="flex items-center gap-1.5">
                            {statusBadge(r.utm?.validation_status)}
                            {!r.utm && (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-label="Geen UTM-log gevonden voor deze sessie" />
                            )}
                          </div>
                        </td>
                        <td className="p-2 text-xs">
                          {r.utm ? (
                            <>
                              <div>{r.utm.utm_source || <span className="text-muted-foreground">—</span>}</div>
                              <div className="text-muted-foreground">{r.utm.utm_medium || "—"}</div>
                              <div className="text-muted-foreground">{r.utm.utm_campaign || "—"}</div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">geen UTM-log</span>
                          )}
                        </td>
                        <td className="p-2 text-xs max-w-[160px] truncate" title={r.utm?.utm_content || ""}>
                          {r.utm?.utm_content || "—"}
                        </td>
                        <td className="p-2 text-xs font-mono">
                          {r.utm?.ttclid ? <div title={r.utm.ttclid}>tt:{r.utm.ttclid.slice(0, 6)}…</div> : null}
                          {r.utm?.gclid ? <div title={r.utm.gclid}>gc:{r.utm.gclid.slice(0, 6)}…</div> : null}
                          {r.utm?.fbclid ? <div title={r.utm.fbclid}>fb:{r.utm.fbclid.slice(0, 6)}…</div> : null}
                          {!r.utm?.ttclid && !r.utm?.gclid && !r.utm?.fbclid && <span className="text-muted-foreground">—</span>}
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
  tone?: "default" | "warn";
}) {
  const border = tone === "warn" ? "border-amber-500/50" : "";
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
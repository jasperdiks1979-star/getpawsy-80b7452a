import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";

type PinRow = {
  pin_id: string;
  utm_content: string;
  label: string;
  angle: string;
  pin_url: string;
  pinterest: {
    IMPRESSION: number;
    SAVE: number;
    PIN_CLICK: number;
    OUTBOUND_CLICK: number;
    ctr: number;
    save_rate: number;
    error: string | null;
    daily?: Array<{
      date: string;
      IMPRESSION: number;
      SAVE: number;
      PIN_CLICK: number;
      OUTBOUND_CLICK: number;
      ctr: number;
    }>;
  };
  site: { sessions: number; orders: number; reached_checkout: number };
};

type Payload = {
  ok: boolean;
  account: string | null;
  window: { start_date: string; end_date: string; days: number };
  totals: {
    impressions: number;
    saves: number;
    pin_clicks: number;
    outbound_clicks: number;
    site_sessions: number;
    site_orders: number;
  };
  pins: PinRow[];
  error?: string;
};

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

const csvEscape = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function downloadPinsCsv(data: Payload) {
  const headers = [
    "pin_id", "utm_content", "label", "angle", "pin_url",
    "impressions", "saves", "save_rate", "pin_clicks", "outbound_clicks", "ctr",
    "site_sessions", "reached_checkout", "site_orders",
    "window_start", "window_end", "window_days",
  ];
  const rows = data.pins.map((p) => [
    p.pin_id, p.utm_content, p.label, p.angle, p.pin_url,
    p.pinterest.IMPRESSION, p.pinterest.SAVE, p.pinterest.save_rate,
    p.pinterest.PIN_CLICK, p.pinterest.OUTBOUND_CLICK, p.pinterest.ctr,
    p.site.sessions, p.site.reached_checkout, p.site.orders,
    data.window.start_date, data.window.end_date, data.window.days,
  ]);
  const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ailurova-pin-metrics_${data.window.start_date}_to_${data.window.end_date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const SERIES_COLORS = ["hsl(var(--primary))", "#f59e0b", "#10b981", "#ef4444", "#6366f1", "#ec4899"];

type MetricKey = "IMPRESSION" | "OUTBOUND_CLICK" | "SAVE" | "ctr";
const METRICS: Array<{ key: MetricKey; title: string; format: (n: number) => string }> = [
  { key: "IMPRESSION", title: "Impressions", format: fmt },
  { key: "OUTBOUND_CLICK", title: "Outbound clicks", format: fmt },
  { key: "SAVE", title: "Saves", format: fmt },
  { key: "ctr", title: "CTR", format: pct },
];

function buildSeries(pins: PinRow[], metric: MetricKey) {
  const dateSet = new Set<string>();
  pins.forEach((p) => p.pinterest.daily?.forEach((d) => dateSet.add(d.date)));
  const dates = Array.from(dateSet).sort();
  return dates.map((date) => {
    const row: Record<string, string | number> = { date };
    pins.forEach((p) => {
      const d = p.pinterest.daily?.find((x) => x.date === date);
      row[p.utm_content] = d ? Number(d[metric] ?? 0) : 0;
    });
    return row;
  });
}

export default function AilurovaPinMetrics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async (d = days) => {
    setLoading(true);
    setErr(null);
    try {
      const { data: res, error } = await supabase.functions.invoke(
        `ailurova-pin-metrics?days=${d}`,
        {
          method: "GET",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          body: undefined as any,
        },
      );
      // Fall back to a direct fetch (also carries ?days=) if invoke fails
      let payload: Payload | null = res as Payload | null;
      if (error || !payload) {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ailurova-pin-metrics?days=${d}`;
        const r = await fetch(url, {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string}`,
          },
        });
        payload = (await r.json()) as Payload;
      }
      if (!payload?.ok) throw new Error(payload?.error ?? "Failed to load");
      setData(payload);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Ailurova Pinterest — Launch Pins</h1>
          <p className="text-sm text-muted-foreground">
            Clicks &amp; saves per pin by UTM content. Pinterest metrics via v5 pin analytics;
            site sessions via <code>canonical_sessions</code>.
            {data?.account ? <> Account: <strong>@{data.account}</strong>.</> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Window</label>
          <select
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
            value={days}
            onChange={(e) => { const d = Number(e.target.value); setDays(d); load(d); }}
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
          <button
            className="rounded-md border border-input bg-background px-3 py-1 text-sm hover:bg-muted"
            onClick={() => load(days)}
            disabled={loading}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            className="rounded-md border border-input bg-background px-3 py-1 text-sm hover:bg-muted disabled:opacity-50"
            onClick={() => data && downloadPinsCsv(data)}
            disabled={!data || loading}
            title="Download current metrics as CSV"
          >
            Export CSV
          </button>
        </div>
      </header>

      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {err}
        </div>
      )}

      {data && (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Impressions", data.totals.impressions],
              ["Saves", data.totals.saves],
              ["Pin clicks", data.totals.pin_clicks],
              ["Outbound clicks", data.totals.outbound_clicks],
              ["Site sessions", data.totals.site_sessions],
              ["Orders", data.totals.site_orders],
            ].map(([label, val]) => (
              <div key={String(label)} className="rounded-lg border border-border bg-card p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
                <div className="mt-1 text-xl font-semibold text-foreground">{fmt(Number(val))}</div>
              </div>
            ))}
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {METRICS.map((m, idx) => {
              const chartPins = data.pins;
              const chartData = buildSeries(chartPins, m.key);
              return (
                <div key={m.key} className="rounded-lg border border-border bg-card p-4">
                  <div className="mb-2 flex items-baseline justify-between">
                    <h2 className="text-sm font-semibold text-foreground">{m.title} over time</h2>
                    <span className="text-xs text-muted-foreground">by utm_content</span>
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          stroke="hsl(var(--muted-foreground))"
                          tickFormatter={(v) => (m.key === "ctr" ? `${(Number(v) * 100).toFixed(1)}%` : fmt(Number(v)))}
                          width={m.key === "ctr" ? 48 : 40}
                        />
                        <Tooltip
                          contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                          formatter={(v: number) => m.format(Number(v))}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {chartPins.map((p, i) => (
                          <Line
                            key={p.utm_content}
                            type="monotone"
                            dataKey={p.utm_content}
                            name={p.utm_content}
                            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                            strokeWidth={2}
                            dot={false}
                            isAnimationActive={false}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  {idx === 0 && chartData.length === 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      No daily datapoints yet. Pinterest typically populates 24–72h after publish.
                    </p>
                  )}
                </div>
              );
            })}
          </section>

          <section className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Pin</th>
                  <th className="px-3 py-2">UTM content</th>
                  <th className="px-3 py-2 text-right">Impr.</th>
                  <th className="px-3 py-2 text-right">Saves</th>
                  <th className="px-3 py-2 text-right">Save rate</th>
                  <th className="px-3 py-2 text-right">Pin clicks</th>
                  <th className="px-3 py-2 text-right">Outbound</th>
                  <th className="px-3 py-2 text-right">CTR</th>
                  <th className="px-3 py-2 text-right">Site sessions</th>
                  <th className="px-3 py-2 text-right">Orders</th>
                </tr>
              </thead>
              <tbody>
                {data.pins.map((p) => (
                  <tr key={p.pin_id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <a href={p.pin_url} target="_blank" rel="noreferrer" className="font-medium text-foreground underline-offset-2 hover:underline">
                        {p.label}
                      </a>
                      <div className="text-xs text-muted-foreground">{p.angle}</div>
                      {p.pinterest.error && (
                        <div className="mt-1 text-xs text-destructive">{p.pinterest.error}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{p.utm_content}</td>
                    <td className="px-3 py-2 text-right">{fmt(p.pinterest.IMPRESSION)}</td>
                    <td className="px-3 py-2 text-right">{fmt(p.pinterest.SAVE)}</td>
                    <td className="px-3 py-2 text-right">{pct(p.pinterest.save_rate)}</td>
                    <td className="px-3 py-2 text-right">{fmt(p.pinterest.PIN_CLICK)}</td>
                    <td className="px-3 py-2 text-right">{fmt(p.pinterest.OUTBOUND_CLICK)}</td>
                    <td className="px-3 py-2 text-right">{pct(p.pinterest.ctr)}</td>
                    <td className="px-3 py-2 text-right">{fmt(p.site.sessions)}</td>
                    <td className="px-3 py-2 text-right">{fmt(p.site.orders)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <p className="text-xs text-muted-foreground">
            Window: {data.window.start_date} → {data.window.end_date} ({data.window.days} days).
            New pins typically take 24–72h before Pinterest reports impressions/saves.
          </p>
        </>
      )}
    </div>
  );
}
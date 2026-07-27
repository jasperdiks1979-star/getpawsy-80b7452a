import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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

export default function AilurovaPinMetrics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async (d = days) => {
    setLoading(true);
    setErr(null);
    try {
      const { data: res, error } = await supabase.functions.invoke("ailurova-pin-metrics", {
        method: "GET",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        body: undefined as any,
      });
      // supabase.functions.invoke doesn't pass query params; fall back to fetch
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
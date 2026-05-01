import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Activity, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

const TRACKED_EVENTS = ['add_to_cart', 'begin_checkout', 'checkout', 'purchase', 'view_item', 'lp_cta_click'] as const;

type Row = {
  hour: string;
  event_name: string;
  is_internal: boolean;
  count: number;
};

type EventRow = {
  created_at: string;
  event_name: string;
  is_internal: boolean | null;
  session_id: string | null;
  page_path: string | null;
  product_name: string | null;
  value: number | null;
  utm_source: string | null;
};

export default function EventsLivePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [recent, setRecent] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hours, setHours] = useState(24);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const since = new Date(Date.now() - hours * 3600_000).toISOString();

      // Pull raw events; aggregate client-side for flexibility
      const { data, error } = await supabase
        .from('lp_funnel_events')
        .select('created_at, event_name, is_internal, session_id, page_path, product_name, value, utm_source')
        .in('event_name', TRACKED_EVENTS as unknown as string[])
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5000);

      if (error) throw error;
      const events = (data ?? []) as EventRow[];

      // Aggregate per hour × event × is_internal
      const buckets = new Map<string, Row>();
      for (const e of events) {
        const d = new Date(e.created_at);
        d.setMinutes(0, 0, 0);
        const hour = d.toISOString();
        const internal = !!e.is_internal;
        const key = `${hour}|${e.event_name}|${internal}`;
        const existing = buckets.get(key);
        if (existing) existing.count++;
        else buckets.set(key, { hour, event_name: e.event_name, is_internal: internal, count: 1 });
      }
      setRows(Array.from(buckets.values()).sort((a, b) => b.hour.localeCompare(a.hour)));
      setRecent(events.slice(0, 50));
      setLastRefresh(new Date());
    } catch (err) {
      console.error('[EventsLive] load failed', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours]);

  // Pivot: hour → { event: { internal, external } }
  const pivot = useMemo(() => {
    const map = new Map<string, Record<string, { internal: number; external: number }>>();
    for (const r of rows) {
      const h = map.get(r.hour) ?? {};
      const cur = h[r.event_name] ?? { internal: 0, external: 0 };
      if (r.is_internal) cur.internal += r.count;
      else cur.external += r.count;
      h[r.event_name] = cur;
      map.set(r.hour, h);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  // Totals (per event, split internal/external)
  const totals = useMemo(() => {
    const t: Record<string, { internal: number; external: number }> = {};
    for (const r of rows) {
      t[r.event_name] = t[r.event_name] ?? { internal: 0, external: 0 };
      if (r.is_internal) t[r.event_name].internal += r.count;
      else t[r.event_name].external += r.count;
    }
    return t;
  }, [rows]);

  return (
    <>
      <Helmet>
        <title>Events Live | Admin</title>
      </Helmet>
      <div className="container py-6 space-y-6 max-w-7xl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              Events Live
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Per-uur conversie-events (add_to_cart, begin_checkout, purchase, …) gesplitst naar internal vs external.
              Auto-refresh elke 30s.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {[6, 24, 72, 168].map((h) => (
              <Button
                key={h}
                size="sm"
                variant={hours === h ? 'default' : 'outline'}
                onClick={() => setHours(h)}
              >
                {h <= 24 ? `${h}u` : `${h / 24}d`}
              </Button>
            ))}
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {lastRefresh && (
          <p className="text-xs text-muted-foreground">
            Laatste refresh: {lastRefresh.toLocaleTimeString()} · venster: laatste {hours}u
          </p>
        )}

        {/* Totals per event */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {TRACKED_EVENTS.map((name) => {
            const t = totals[name] ?? { internal: 0, external: 0 };
            const total = t.internal + t.external;
            return (
              <Card key={name}>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground truncate" title={name}>{name}</p>
                  <p className="text-2xl font-bold">{total}</p>
                  <div className="flex gap-1 mt-1 text-[11px]">
                    <Badge variant="default" className="px-1.5 py-0">ext {t.external}</Badge>
                    <Badge variant="secondary" className="px-1.5 py-0">int {t.internal}</Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Hourly pivot */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per uur × event (ext / int)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">Uur (UTC)</th>
                  {TRACKED_EVENTS.map((n) => (
                    <th key={n} className="text-right p-2 font-medium whitespace-nowrap">{n}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pivot.length === 0 ? (
                  <tr>
                    <td colSpan={TRACKED_EVENTS.length + 1} className="p-6 text-center text-muted-foreground">
                      Geen events in dit venster.
                    </td>
                  </tr>
                ) : (
                  pivot.map(([hour, perEvent]) => (
                    <tr key={hour} className="border-t">
                      <td className="p-2 font-mono whitespace-nowrap">
                        {new Date(hour).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      {TRACKED_EVENTS.map((n) => {
                        const v = perEvent[n];
                        if (!v) return <td key={n} className="p-2 text-right text-muted-foreground">—</td>;
                        return (
                          <td key={n} className="p-2 text-right whitespace-nowrap">
                            <span className="font-semibold">{v.external}</span>
                            {v.internal > 0 && <span className="text-muted-foreground"> / {v.internal}i</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Recent stream */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recente events (laatste 50)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2">Tijd</th>
                  <th className="text-left p-2">Event</th>
                  <th className="text-left p-2">Internal</th>
                  <th className="text-left p-2">Path</th>
                  <th className="text-left p-2">Product</th>
                  <th className="text-right p-2">Value</th>
                  <th className="text-left p-2">Source</th>
                  <th className="text-left p-2">Session</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((e, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2 font-mono whitespace-nowrap">{new Date(e.created_at).toLocaleTimeString()}</td>
                    <td className="p-2 font-medium">{e.event_name}</td>
                    <td className="p-2">
                      {e.is_internal ? (
                        <Badge variant="secondary" className="px-1.5 py-0">internal</Badge>
                      ) : (
                        <Badge variant="default" className="px-1.5 py-0">external</Badge>
                      )}
                    </td>
                    <td className="p-2 truncate max-w-[200px]" title={e.page_path ?? ''}>{e.page_path ?? '—'}</td>
                    <td className="p-2 truncate max-w-[180px]" title={e.product_name ?? ''}>{e.product_name ?? '—'}</td>
                    <td className="p-2 text-right">{e.value != null ? `$${e.value}` : '—'}</td>
                    <td className="p-2">{e.utm_source ?? '—'}</td>
                    <td className="p-2 font-mono text-muted-foreground truncate max-w-[100px]" title={e.session_id ?? ''}>
                      {e.session_id?.slice(0, 8) ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
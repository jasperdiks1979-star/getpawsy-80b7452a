import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Filter, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

const FUNNEL_STEPS = ['view_item', 'add_to_cart', 'begin_checkout', 'purchase'] as const;
type Step = typeof FUNNEL_STEPS[number];

type Ev = {
  created_at: string;
  event_name: string;
  is_internal: boolean | null;
  session_id: string | null;
  utm_source: string | null;
  value: number | null;
};

type Counts = Record<Step, number>;

function emptyCounts(): Counts {
  return { view_item: 0, add_to_cart: 0, begin_checkout: 0, purchase: 0 };
}

function normalizeSource(s: string | null | undefined): string {
  if (!s) return 'direct';
  const lc = s.toLowerCase().trim();
  if (!lc) return 'direct';
  return lc;
}

export default function FunnelBySourcePage() {
  const [days, setDays] = useState(7);
  const [includeInternal, setIncludeInternal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<Ev[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      const { data, error } = await supabase
        .from('lp_funnel_events')
        .select('created_at, event_name, is_internal, session_id, utm_source, value')
        .in('event_name', FUNNEL_STEPS as unknown as string[])
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(20000);
      if (error) throw error;
      setEvents((data ?? []) as Ev[]);
      setLastRefresh(new Date());
    } catch (e) {
      console.error('[FunnelBySource] load failed', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  // Per-source unique-session funnel + revenue
  const { bySource, totals } = useMemo(() => {
    // source -> step -> Set<session_id>
    const sets = new Map<string, Record<Step, Set<string>>>();
    const revenue = new Map<string, number>();

    // Per session, remember its first non-empty utm_source so later steps
    // (which often lose UTMs) still attribute to the originating source.
    const sessionSource = new Map<string, string>();
    // Sort ascending to pick earliest source per session
    const ordered = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const e of ordered) {
      if (!e.session_id) continue;
      if (!includeInternal && e.is_internal) continue;
      if (!sessionSource.has(e.session_id)) {
        sessionSource.set(e.session_id, normalizeSource(e.utm_source));
      } else if (sessionSource.get(e.session_id) === 'direct' && e.utm_source) {
        sessionSource.set(e.session_id, normalizeSource(e.utm_source));
      }
    }

    for (const e of events) {
      if (!e.session_id) continue;
      if (!includeInternal && e.is_internal) continue;
      if (!FUNNEL_STEPS.includes(e.event_name as Step)) continue;
      const step = e.event_name as Step;
      const src = sessionSource.get(e.session_id) ?? normalizeSource(e.utm_source);

      let bucket = sets.get(src);
      if (!bucket) {
        bucket = { view_item: new Set(), add_to_cart: new Set(), begin_checkout: new Set(), purchase: new Set() };
        sets.set(src, bucket);
      }
      bucket[step].add(e.session_id);

      if (step === 'purchase' && typeof e.value === 'number') {
        revenue.set(src, (revenue.get(src) ?? 0) + (e.value ?? 0));
      }
    }

    const bySource = Array.from(sets.entries())
      .map(([source, b]) => {
        const counts: Counts = {
          view_item: b.view_item.size,
          add_to_cart: b.add_to_cart.size,
          begin_checkout: b.begin_checkout.size,
          purchase: b.purchase.size,
        };
        return {
          source,
          counts,
          revenue: revenue.get(source) ?? 0,
        };
      })
      .sort((a, b) => (b.counts.view_item + b.counts.purchase * 10) - (a.counts.view_item + a.counts.purchase * 10));

    const totals: Counts = emptyCounts();
    let totalRev = 0;
    for (const r of bySource) {
      for (const k of FUNNEL_STEPS) totals[k] += r.counts[k];
      totalRev += r.revenue;
    }

    return { bySource, totals: { counts: totals, revenue: totalRev } };
  }, [events, includeInternal]);

  const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : 0);
  const fmtPct = (n: number) => `${n.toFixed(1)}%`;
  const fmtMoney = (n: number) => `$${n.toFixed(2)}`;

  return (
    <>
      <Helmet>
        <title>Funnel by Source | Admin</title>
      </Helmet>
      <div className="container py-6 space-y-6 max-w-7xl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Filter className="h-6 w-6 text-primary" />
              Funnel by Source
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Unieke sessies per UTM-bron door de funnel: view_item → add_to_cart → begin_checkout → purchase.
              Conversie- en drop-off% per stap. Auto-refresh elke 60s.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {[1, 7, 30].map((d) => (
              <Button
                key={d}
                size="sm"
                variant={days === d ? 'default' : 'outline'}
                onClick={() => setDays(d)}
              >
                {d === 1 ? '24u' : `${d}d`}
              </Button>
            ))}
            <Button
              size="sm"
              variant={includeInternal ? 'secondary' : 'outline'}
              onClick={() => setIncludeInternal((v) => !v)}
              title="Toggle internal traffic (Founder Mode)"
            >
              {includeInternal ? 'incl. internal' : 'excl. internal'}
            </Button>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {lastRefresh && (
          <p className="text-xs text-muted-foreground">
            Laatste refresh: {lastRefresh.toLocaleTimeString()} · venster: laatste {days === 1 ? '24u' : `${days} dagen`} ·
            {' '}{events.length.toLocaleString()} events
          </p>
        )}

        {/* Totals */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {FUNNEL_STEPS.map((s) => (
            <Card key={s}>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">{s}</p>
                <p className="text-2xl font-bold">{totals.counts[s].toLocaleString()}</p>
                {s !== 'view_item' && totals.counts.view_item > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {fmtPct(pct(totals.counts[s], totals.counts.view_item))} of view_item
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">revenue (purchase)</p>
              <p className="text-2xl font-bold">{fmtMoney(totals.revenue)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Per-source funnel table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Funnel per bron (unieke sessies)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">Bron</th>
                  <th className="text-right p-2 font-medium">view_item</th>
                  <th className="text-right p-2 font-medium">add_to_cart</th>
                  <th className="text-right p-2 font-medium">begin_checkout</th>
                  <th className="text-right p-2 font-medium">purchase</th>
                  <th className="text-right p-2 font-medium">VI→ATC</th>
                  <th className="text-right p-2 font-medium">ATC→BC</th>
                  <th className="text-right p-2 font-medium">BC→Purch</th>
                  <th className="text-right p-2 font-medium">VI→Purch</th>
                  <th className="text-right p-2 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {bySource.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-6 text-center text-muted-foreground">
                      Geen funnel-events in dit venster.
                    </td>
                  </tr>
                ) : (
                  bySource.map((r) => {
                    const c = r.counts;
                    return (
                      <tr key={r.source} className="border-t">
                        <td className="p-2 font-medium">
                          <Badge variant={r.source === 'tiktok' ? 'default' : 'secondary'} className="px-2 py-0.5">
                            {r.source}
                          </Badge>
                        </td>
                        <td className="p-2 text-right tabular-nums">{c.view_item}</td>
                        <td className="p-2 text-right tabular-nums">{c.add_to_cart}</td>
                        <td className="p-2 text-right tabular-nums">{c.begin_checkout}</td>
                        <td className="p-2 text-right tabular-nums font-semibold">{c.purchase}</td>
                        <td className="p-2 text-right tabular-nums text-muted-foreground">
                          {c.view_item ? fmtPct(pct(c.add_to_cart, c.view_item)) : '—'}
                        </td>
                        <td className="p-2 text-right tabular-nums text-muted-foreground">
                          {c.add_to_cart ? fmtPct(pct(c.begin_checkout, c.add_to_cart)) : '—'}
                        </td>
                        <td className="p-2 text-right tabular-nums text-muted-foreground">
                          {c.begin_checkout ? fmtPct(pct(c.purchase, c.begin_checkout)) : '—'}
                        </td>
                        <td className="p-2 text-right tabular-nums font-semibold">
                          {c.view_item ? fmtPct(pct(c.purchase, c.view_item)) : '—'}
                        </td>
                        <td className="p-2 text-right tabular-nums">{fmtMoney(r.revenue)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Visual bars per source */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Visuele funnel per bron</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {bySource.slice(0, 8).map((r) => {
              const max = r.counts.view_item || 1;
              return (
                <div key={r.source} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium capitalize">{r.source}</span>
                    <span className="text-muted-foreground">
                      {r.counts.purchase}/{r.counts.view_item} sessies · {fmtMoney(r.revenue)}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {FUNNEL_STEPS.map((s) => {
                      const v = r.counts[s];
                      const w = (v / max) * 100;
                      return (
                        <div key={s} className="space-y-0.5">
                          <div className="h-6 rounded bg-muted overflow-hidden">
                            <div
                              className="h-full bg-primary/70 transition-all"
                              style={{ width: `${w}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>{s.replace('_', ' ')}</span>
                            <span className="tabular-nums">{v}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {bySource.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nog geen data om te visualiseren.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/**
 * TikTokCtaCtrPage — focused CTR-per-placement dashboard for the /go landing
 * page. Compares the three CTA placements (bio_primary, bio_secondary,
 * bio_sticky) side-by-side and ties each one to its downstream PDP views and
 * add-to-cart events through the same `get_lp_funnel_report` RPC used by the
 * full funnel report. This is the "which CTA is winning" view.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trophy, MousePointerClick, ShoppingCart, Eye } from 'lucide-react';

type RawRow = {
  placement: string | null;
  utm_campaign: string | null;
  lp_view: number;
  lp_cta_impression: number;
  lp_cta_click: number;
  pdp_view: number;
  add_to_cart: number;
};

type Aggregated = {
  placement: string;
  lp_view: number;
  lp_cta_impression: number;
  lp_cta_click: number;
  pdp_view: number;
  add_to_cart: number;
  ctr: number; // click / impression
  click_to_pdp: number; // pdp / click
  pdp_to_atc: number; // atc / pdp
  end_to_end: number; // atc / impression
};

const PLACEMENTS = ['bio_primary', 'bio_secondary', 'bio_sticky'] as const;

const PLACEMENT_LABELS: Record<string, string> = {
  bio_primary: 'Primary (above the fold)',
  bio_secondary: 'Secondary (final CTA)',
  bio_sticky: 'Sticky (mobile bar)',
};

function pct(n: number, d: number): number {
  if (!d) return 0;
  return (n / d) * 100;
}

function fmtPct(value: number, denominator: number): string {
  if (!denominator) return '—';
  return `${value.toFixed(1)}%`;
}

export default function TikTokCtaCtrPage() {
  const [days, setDays] = useState(14);
  const [campaign, setCampaign] = useState<string>('all');
  const [rows, setRows] = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    supabase
      .rpc('get_lp_funnel_report', {
        p_days: days,
        p_campaign: campaign === 'all' ? null : campaign,
        p_include_internal: false,
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error.message);
          setRows([]);
        } else {
          setRows((data ?? []) as RawRow[]);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days, campaign]);

  const campaigns = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.utm_campaign && set.add(r.utm_campaign));
    return Array.from(set).sort();
  }, [rows]);

  /** Aggregate raw rows (which are split by placement × campaign) into a single
   *  row per placement so we can directly compare bio_primary vs secondary vs sticky. */
  const aggregated = useMemo<Aggregated[]>(() => {
    const map = new Map<string, Aggregated>();
    for (const placement of PLACEMENTS) {
      map.set(placement, {
        placement,
        lp_view: 0,
        lp_cta_impression: 0,
        lp_cta_click: 0,
        pdp_view: 0,
        add_to_cart: 0,
        ctr: 0,
        click_to_pdp: 0,
        pdp_to_atc: 0,
        end_to_end: 0,
      });
    }
    rows.forEach((r) => {
      const key = r.placement ?? '';
      if (!map.has(key)) return;
      const agg = map.get(key)!;
      agg.lp_view += r.lp_view;
      agg.lp_cta_impression += r.lp_cta_impression;
      agg.lp_cta_click += r.lp_cta_click;
      agg.pdp_view += r.pdp_view;
      agg.add_to_cart += r.add_to_cart;
    });
    const out = Array.from(map.values()).map((a) => ({
      ...a,
      ctr: pct(a.lp_cta_click, a.lp_cta_impression),
      click_to_pdp: pct(a.pdp_view, a.lp_cta_click),
      pdp_to_atc: pct(a.add_to_cart, a.pdp_view),
      end_to_end: pct(a.add_to_cart, a.lp_cta_impression),
    }));
    return out;
  }, [rows]);

  const winnerPlacement = useMemo(() => {
    const eligible = aggregated.filter((a) => a.lp_cta_impression > 0);
    if (eligible.length === 0) return null;
    return eligible.reduce((a, b) => (a.ctr >= b.ctr ? a : b));
  }, [aggregated]);

  const maxCtr = Math.max(1, ...aggregated.map((a) => a.ctr));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">TikTok CTA CTR Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Click-through rate per /go CTA placement, tied to downstream PDP views and add-to-cart conversions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 1 day</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={campaign} onValueChange={setCampaign}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All campaigns" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All campaigns</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-2 text-sm text-muted-foreground py-10">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading CTR data…
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="py-10">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Side-by-side placement comparison */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {aggregated.map((a) => {
              const isWinner = winnerPlacement?.placement === a.placement && a.lp_cta_impression > 0;
              const barWidth = Math.max(2, (a.ctr / maxCtr) * 100);
              return (
                <Card key={a.placement} className={isWinner ? 'border-primary shadow-md' : ''}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">{PLACEMENT_LABELS[a.placement]}</CardTitle>
                        <Badge variant="outline" className="mt-1 font-mono text-[10px]">{a.placement}</Badge>
                      </div>
                      {isWinner && (
                        <Badge className="gap-1"><Trophy className="w-3 h-3" /> Winner</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">CTR (click / impression)</p>
                      <p className="text-3xl font-bold">
                        {a.lp_cta_impression ? `${a.ctr.toFixed(2)}%` : '—'}
                      </p>
                      <div className="h-2 mt-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-md border p-2">
                        <Eye className="w-3 h-3 mx-auto text-muted-foreground" />
                        <p className="text-[10px] uppercase text-muted-foreground mt-1">Impr.</p>
                        <p className="text-sm font-semibold">{a.lp_cta_impression.toLocaleString()}</p>
                      </div>
                      <div className="rounded-md border p-2">
                        <MousePointerClick className="w-3 h-3 mx-auto text-muted-foreground" />
                        <p className="text-[10px] uppercase text-muted-foreground mt-1">Clicks</p>
                        <p className="text-sm font-semibold">{a.lp_cta_click.toLocaleString()}</p>
                      </div>
                      <div className="rounded-md border p-2">
                        <ShoppingCart className="w-3 h-3 mx-auto text-muted-foreground" />
                        <p className="text-[10px] uppercase text-muted-foreground mt-1">ATC</p>
                        <p className="text-sm font-semibold">{a.add_to_cart.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Click → PDP</span>
                        <span className="font-medium">{fmtPct(a.click_to_pdp, a.lp_cta_click)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">PDP → Add-to-Cart</span>
                        <span className="font-medium">{fmtPct(a.pdp_to_atc, a.pdp_view)}</span>
                      </div>
                      <div className="flex justify-between border-t pt-1 mt-1">
                        <span className="text-muted-foreground">Impression → ATC</span>
                        <span className="font-semibold">{fmtPct(a.end_to_end, a.lp_cta_impression)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Detail table per placement × campaign */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Per placement × campaign</CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6">No funnel events recorded in this window yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-4">Placement</th>
                        <th className="py-2 pr-4">Campaign</th>
                        <th className="py-2 pr-4 text-right">Impr.</th>
                        <th className="py-2 pr-4 text-right">Clicks</th>
                        <th className="py-2 pr-4 text-right">CTR</th>
                        <th className="py-2 pr-4 text-right">PDP</th>
                        <th className="py-2 pr-4 text-right">ATC</th>
                        <th className="py-2 pr-4 text-right">Click→PDP</th>
                        <th className="py-2 pr-4 text-right">PDP→ATC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows
                        .filter((r) => r.placement && PLACEMENTS.includes(r.placement as typeof PLACEMENTS[number]))
                        .map((r, idx) => {
                          const ctr = pct(r.lp_cta_click, r.lp_cta_impression);
                          const c2p = pct(r.pdp_view, r.lp_cta_click);
                          const p2a = pct(r.add_to_cart, r.pdp_view);
                          return (
                            <tr key={`${r.placement}-${r.utm_campaign}-${idx}`}>
                              <td className="py-2 pr-4">
                                <Badge variant="outline" className="font-mono text-[10px]">{r.placement}</Badge>
                              </td>
                              <td className="py-2 pr-4 text-muted-foreground">{r.utm_campaign ?? '—'}</td>
                              <td className="py-2 pr-4 text-right">{r.lp_cta_impression.toLocaleString()}</td>
                              <td className="py-2 pr-4 text-right">{r.lp_cta_click.toLocaleString()}</td>
                              <td className="py-2 pr-4 text-right font-semibold">
                                {r.lp_cta_impression ? `${ctr.toFixed(2)}%` : '—'}
                              </td>
                              <td className="py-2 pr-4 text-right">{r.pdp_view.toLocaleString()}</td>
                              <td className="py-2 pr-4 text-right">{r.add_to_cart.toLocaleString()}</td>
                              <td className="py-2 pr-4 text-right">{fmtPct(c2p, r.lp_cta_click)}</td>
                              <td className="py-2 pr-4 text-right">{fmtPct(p2a, r.pdp_view)}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
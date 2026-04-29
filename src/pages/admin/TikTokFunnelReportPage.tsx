/**
 * TikTokFunnelReportPage — admin drop-off report for the /go (TikTok bio)
 * funnel. Pulls aggregated counts from the `get_lp_funnel_report` RPC and
 * renders, per CTA placement and hook campaign:
 *
 *   lp_view → lp_cta_impression → lp_cta_click → view_item → add_to_cart
 *
 * Each transition is shown both as an absolute count and as a drop-off
 * percentage so we can see exactly where the funnel leaks per hook.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingDown } from 'lucide-react';

type Row = {
  placement: string | null;
  utm_campaign: string | null;
  lp_view: number;
  lp_cta_impression: number;
  lp_cta_click: number;
  pdp_view: number;
  add_to_cart: number;
  click_through_rate: number | null;
  pdp_rate: number | null;
  atc_rate: number | null;
  end_to_end_rate: number | null;
};

const STEPS = [
  { key: 'lp_view', label: 'LP View' },
  { key: 'lp_cta_impression', label: 'CTA Impression' },
  { key: 'lp_cta_click', label: 'CTA Click' },
  { key: 'pdp_view', label: 'PDP View' },
  { key: 'add_to_cart', label: 'Add to Cart' },
] as const;

function dropOff(prev: number, current: number): string {
  if (!prev) return '—';
  const pct = ((prev - current) / prev) * 100;
  return `${pct.toFixed(1)}%`;
}

function rate(numerator: number, denominator: number): string {
  if (!denominator) return '—';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export default function TikTokFunnelReportPage() {
  const [days, setDays] = useState(14);
  const [campaign, setCampaign] = useState<string>('all');
  const [rows, setRows] = useState<Row[]>([]);
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
          setRows((data ?? []) as Row[]);
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

  const totals = useMemo(() => {
    const sum = { lp_view: 0, lp_cta_impression: 0, lp_cta_click: 0, pdp_view: 0, add_to_cart: 0 };
    rows.forEach((r) => {
      sum.lp_view += r.lp_view;
      sum.lp_cta_impression += r.lp_cta_impression;
      sum.lp_cta_click += r.lp_cta_click;
      sum.pdp_view += r.pdp_view;
      sum.add_to_cart += r.add_to_cart;
    });
    return sum;
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">TikTok Funnel Report</h1>
          <p className="text-sm text-muted-foreground">
            Drop-off per CTA placement and hook campaign for /go → PDP → Add to Cart.
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

      <Card>
        <CardHeader><CardTitle className="text-base">Totals across selection</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {STEPS.map((step, i) => {
              const current = totals[step.key];
              const prev = i === 0 ? current : totals[STEPS[i - 1].key];
              return (
                <div key={step.key} className="rounded-lg border p-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{step.label}</p>
                  <p className="text-2xl font-bold">{current.toLocaleString()}</p>
                  {i > 0 && (
                    <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <TrendingDown className="w-3 h-3" /> drop {dropOff(prev, current)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per placement × campaign</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading funnel data…
            </div>
          ) : error ? (
            <p className="text-sm text-destructive py-6">{error}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6">No funnel events recorded in this window yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">Placement</th>
                    <th className="py-2 pr-4">Campaign</th>
                    {STEPS.map((s) => <th key={s.key} className="py-2 pr-4">{s.label}</th>)}
                    <th className="py-2 pr-4">CTR</th>
                    <th className="py-2 pr-4">Click→PDP</th>
                    <th className="py-2 pr-4">PDP→ATC</th>
                    <th className="py-2 pr-4">View→ATC</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r, idx) => (
                    <tr key={`${r.placement}-${r.utm_campaign}-${idx}`} className="align-top">
                      <td className="py-2 pr-4 font-medium">
                        <Badge variant="outline">{r.placement ?? '—'}</Badge>
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">{r.utm_campaign ?? '—'}</td>
                      <td className="py-2 pr-4">{r.lp_view.toLocaleString()}</td>
                      <td className="py-2 pr-4">
                        {r.lp_cta_impression.toLocaleString()}
                        <span className="block text-[11px] text-muted-foreground">{rate(r.lp_cta_impression, r.lp_view)} of view</span>
                      </td>
                      <td className="py-2 pr-4">
                        {r.lp_cta_click.toLocaleString()}
                        <span className="block text-[11px] text-muted-foreground">drop {dropOff(r.lp_cta_impression, r.lp_cta_click)}</span>
                      </td>
                      <td className="py-2 pr-4">
                        {r.pdp_view.toLocaleString()}
                        <span className="block text-[11px] text-muted-foreground">drop {dropOff(r.lp_cta_click, r.pdp_view)}</span>
                      </td>
                      <td className="py-2 pr-4">
                        {r.add_to_cart.toLocaleString()}
                        <span className="block text-[11px] text-muted-foreground">drop {dropOff(r.pdp_view, r.add_to_cart)}</span>
                      </td>
                      <td className="py-2 pr-4">{r.click_through_rate != null ? `${r.click_through_rate}%` : '—'}</td>
                      <td className="py-2 pr-4">{r.pdp_rate != null ? `${r.pdp_rate}%` : '—'}</td>
                      <td className="py-2 pr-4">{r.atc_rate != null ? `${r.atc_rate}%` : '—'}</td>
                      <td className="py-2 pr-4 font-semibold">{r.end_to_end_rate != null ? `${r.end_to_end_rate}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
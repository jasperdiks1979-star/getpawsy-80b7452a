/**
 * TikTokVariantKpis — Per-variant performance widget.
 *
 * Rolls up impressions, clicks, ATC, and purchases per `utm_campaign`
 * (the variant ID, e.g. `conv_timepain` / `conv_smell` / `conv_direct`)
 * inside a date window controlled by the parent dashboard. Computes:
 *   - CTR    = clicks / impressions
 *   - CVR    = purchases / impressions
 *   - CPA    = manual ad spend / purchases (entered per variant)
 *
 * Ad spend is NOT in the database (we don't have a TikTok Ads API
 * connection), so CPA is calculated from a per-variant spend input
 * that the admin types in. The input persists to localStorage so the
 * value is remembered across sessions.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Trophy, DollarSign, Target } from 'lucide-react';

interface Props {
  /** Inclusive ISO timestamp for the window start. */
  startIso: string;
  /** Inclusive ISO timestamp for the window end. */
  endIso: string;
  /** Optional human label shown in the header (e.g. "Last 14 days"). */
  windowLabel?: string;
}

type Row = {
  utm_campaign: string;
  utm_content: string;
  impressions: number;
  clicks: number;
  pdp_views: number;
  add_to_carts: number;
  purchases: number;
  revenue: number;
  ctr: number;
  view_to_atc: number;
  view_to_purchase: number;
  arpv: number;
};

const SPEND_KEY = 'gp_tt_variant_spend_v1';

function readSpendMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SPEND_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function writeSpendMap(map: Record<string, number>) {
  try {
    localStorage.setItem(SPEND_KEY, JSON.stringify(map));
  } catch {
    /* quota — non-fatal */
  }
}

function fmt(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtPct(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '—';
  return `${n.toFixed(2)}%`;
}

function fmtUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '—';
  return `$${n.toFixed(2)}`;
}

export function TikTokVariantKpis({ startIso, endIso, windowLabel }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spend, setSpend] = useState<Record<string, number>>(() => readSpendMap());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    supabase
      .rpc('get_tiktok_variant_kpis', {
        p_start: startIso,
        p_end: endIso,
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
  }, [startIso, endIso]);

  const handleSpendChange = (campaign: string, raw: string) => {
    const value = raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(value) || value < 0) return;
    setSpend((prev) => {
      const next = { ...prev, [campaign]: value };
      writeSpendMap(next);
      return next;
    });
  };

  // Compute the winning variant by purchases CVR. Fall back to CTR if
  // no purchases have happened in the window yet (cold-start case).
  const winnerCampaign = useMemo(() => {
    const eligible = rows.filter((r) => r.impressions > 0);
    if (eligible.length === 0) return null;
    const hasPurchases = eligible.some((r) => r.purchases > 0);
    return eligible.reduce((a, b) => {
      if (hasPurchases) {
        return a.view_to_purchase >= b.view_to_purchase ? a : b;
      }
      return a.ctr >= b.ctr ? a : b;
    }).utm_campaign;
  }, [rows]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        impressions: acc.impressions + r.impressions,
        clicks: acc.clicks + r.clicks,
        purchases: acc.purchases + r.purchases,
        revenue: acc.revenue + Number(r.revenue || 0),
        spend: acc.spend + (spend[r.utm_campaign] ?? 0),
      }),
      { impressions: 0, clicks: 0, purchases: 0, revenue: 0, spend: 0 },
    );
  }, [rows, spend]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              TikTok Variant KPIs
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Per-variant impressions, CTR, CVR and CPA{windowLabel ? ` — ${windowLabel}` : ''}.
              Enter your TikTok Ads spend per variant to compute CPA.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Impr: <strong className="text-foreground">{fmt(totals.impressions)}</strong></span>
            <span>Purch: <strong className="text-foreground">{fmt(totals.purchases)}</strong></span>
            <span>Spend: <strong className="text-foreground">{fmtUsd(totals.spend)}</strong></span>
            <span>Rev: <strong className="text-foreground">{fmtUsd(totals.revenue)}</strong></span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading variant KPIs…
          </div>
        ) : error ? (
          <p className="text-sm text-destructive py-6">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">
            No TikTok variant events recorded in this window yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-3">Variant</th>
                  <th className="py-2 px-2 text-right">Impr.</th>
                  <th className="py-2 px-2 text-right">Clicks</th>
                  <th className="py-2 px-2 text-right">CTR</th>
                  <th className="py-2 px-2 text-right">ATC</th>
                  <th className="py-2 px-2 text-right">Purch.</th>
                  <th className="py-2 px-2 text-right">CVR</th>
                  <th className="py-2 px-2 text-right">Revenue</th>
                  <th className="py-2 px-2 text-right w-32">
                    <DollarSign className="w-3 h-3 inline" /> Spend (USD)
                  </th>
                  <th className="py-2 pl-2 text-right">CPA</th>
                  <th className="py-2 pl-2 text-right">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const spendValue = spend[r.utm_campaign] ?? 0;
                  const cpa = r.purchases > 0 ? spendValue / r.purchases : 0;
                  const roas = spendValue > 0 ? Number(r.revenue) / spendValue : 0;
                  const isWinner = winnerCampaign === r.utm_campaign;
                  return (
                    <tr
                      key={`${r.utm_campaign}__${r.utm_content}`}
                      className={`border-b last:border-0 ${isWinner ? 'bg-primary/5' : ''}`}
                    >
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">{r.utm_campaign}</span>
                          {isWinner && (
                            <Badge className="gap-1 h-5 text-[10px]">
                              <Trophy className="w-3 h-3" /> Winner
                            </Badge>
                          )}
                        </div>
                        {r.utm_content !== '(none)' && (
                          <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                            {r.utm_content}
                          </p>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmt(r.impressions)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmt(r.clicks)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmtPct(r.ctr)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmt(r.add_to_carts)}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-semibold">
                        {fmt(r.purchases)}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {fmtPct(r.view_to_purchase)}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmtUsd(Number(r.revenue))}</td>
                      <td className="py-2 px-2 text-right">
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={spendValue || ''}
                          onChange={(e) => handleSpendChange(r.utm_campaign, e.target.value)}
                          className="h-7 text-xs text-right tabular-nums"
                          placeholder="0.00"
                          aria-label={`Ad spend for ${r.utm_campaign}`}
                        />
                      </td>
                      <td className="py-2 pl-2 text-right tabular-nums font-semibold">
                        {cpa > 0 ? fmtUsd(cpa) : '—'}
                      </td>
                      <td className="py-2 pl-2 text-right tabular-nums">
                        {roas > 0 ? `${roas.toFixed(2)}×` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-3 flex items-start gap-2">
              <Label className="text-[11px] text-muted-foreground leading-snug">
                CPA = your spend ÷ purchases. ROAS = revenue ÷ spend. Spend is stored
                locally in your browser, not on the server.
              </Label>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default TikTokVariantKpis;
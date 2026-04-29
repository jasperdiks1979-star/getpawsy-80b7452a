/**
 * UtmCampaignFunnelMatching — admin widget that groups raw funnel events by
 * utm_campaign across the four canonical funnel steps and surfaces anomalies:
 *
 *   1. Unmatched events    — rows missing utm_campaign (orphans, can't attribute)
 *   2. Funnel breaks       — downstream count > upstream (impossible sequence,
 *                            usually a tagging or RLS bug)
 *   3. Critical step gaps  — purchase events for a campaign with zero matching
 *                            landing views (lost-attribution candidates)
 *   4. Dropoff cliffs      — >70% step-to-step drop on a campaign with material
 *                            volume — flags hooks that are losing users hard
 *
 * Reads directly from public.lp_funnel_events with a single bounded SELECT so
 * the widget renders even when the dedicated RPC isn't available. is_internal
 * = true (Founder Mode) is excluded so dashboards reflect real visitors only.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, ShieldAlert, Unlink2 } from 'lucide-react';

type Props = {
  startIso: string;
  endIso: string;
  windowLabel: string;
  /** Step-to-step drop above this fraction is flagged as a cliff. Default 0.7. */
  cliffThreshold?: number;
  /** Minimum upstream volume before cliff detection kicks in. Default 20. */
  cliffMinVolume?: number;
};

const STEPS = ['lp_landing_view', 'lp_pdp_view', 'begin_checkout', 'purchase'] as const;
type Step = (typeof STEPS)[number];
const STEP_LABEL: Record<Step, string> = {
  lp_landing_view: 'Landing',
  lp_pdp_view: 'PDP',
  begin_checkout: 'Checkout',
  purchase: 'Purchase',
};

type CampaignRow = {
  campaign: string;
  counts: Record<Step, number>;
  total: number;
  /** Anomaly flags surfaced inline. */
  flags: Array<{
    severity: 'warn' | 'error';
    label: string;
    detail: string;
  }>;
};

type RawRow = {
  utm_campaign: string | null;
  event_name: string;
};

export function UtmCampaignFunnelMatching({
  startIso,
  endIso,
  windowLabel,
  cliffThreshold = 0.7,
  cliffMinVolume = 20,
}: Props) {
  const [rows, setRows] = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Bounded read: only the four funnel steps we report, only external traffic,
    // limited to 50k rows so an outlier window can't lock the dashboard.
    supabase
      .from('lp_funnel_events')
      .select('utm_campaign,event_name')
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .in('event_name', STEPS as unknown as string[])
      .eq('is_internal', false)
      .limit(50000)
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
  }, [startIso, endIso]);

  /** Group raw events into per-campaign funnel buckets + compute anomalies. */
  const { matched, unmatched, totals } = useMemo(() => {
    const map = new Map<string, Record<Step, number>>();
    const orphan: Record<Step, number> = {
      lp_landing_view: 0, lp_pdp_view: 0, begin_checkout: 0, purchase: 0,
    };
    let totalEvents = 0;
    for (const r of rows) {
      totalEvents++;
      const step = r.event_name as Step;
      if (!STEPS.includes(step)) continue;
      if (!r.utm_campaign) {
        orphan[step]++;
        continue;
      }
      let entry = map.get(r.utm_campaign);
      if (!entry) {
        entry = { lp_landing_view: 0, lp_pdp_view: 0, begin_checkout: 0, purchase: 0 };
        map.set(r.utm_campaign, entry);
      }
      entry[step]++;
    }

    const matchedRows: CampaignRow[] = Array.from(map.entries())
      .map(([campaign, counts]) => {
        const total = STEPS.reduce((s, k) => s + counts[k], 0);
        const flags: CampaignRow['flags'] = [];

        // Impossible sequence: any downstream > upstream
        for (let i = 1; i < STEPS.length; i++) {
          const upstream = counts[STEPS[i - 1]];
          const downstream = counts[STEPS[i]];
          if (downstream > upstream && upstream + downstream >= 5) {
            flags.push({
              severity: 'error',
              label: 'Impossible sequence',
              detail: `${STEP_LABEL[STEPS[i]]} (${downstream}) > ${STEP_LABEL[STEPS[i - 1]]} (${upstream})`,
            });
          }
        }

        // Critical gap: purchases without any landing
        if (counts.purchase > 0 && counts.lp_landing_view === 0) {
          flags.push({
            severity: 'error',
            label: 'Lost attribution',
            detail: `${counts.purchase} purchase(s) with 0 landing views`,
          });
        }

        // Dropoff cliffs (only when upstream has material volume)
        for (let i = 1; i < STEPS.length; i++) {
          const upstream = counts[STEPS[i - 1]];
          const downstream = counts[STEPS[i]];
          if (upstream >= cliffMinVolume) {
            const drop = (upstream - downstream) / upstream;
            if (drop >= cliffThreshold) {
              flags.push({
                severity: 'warn',
                label: `${(drop * 100).toFixed(0)}% drop`,
                detail: `${STEP_LABEL[STEPS[i - 1]]} → ${STEP_LABEL[STEPS[i]]} (${upstream} → ${downstream})`,
              });
            }
          }
        }

        return { campaign, counts, total, flags };
      })
      .sort((a, b) => b.total - a.total);

    return {
      matched: matchedRows,
      unmatched: orphan,
      totals: { totalEvents, matchedEvents: totalEvents - STEPS.reduce((s, k) => s + orphan[k], 0) },
    };
  }, [rows, cliffThreshold, cliffMinVolume]);

  const orphanTotal = STEPS.reduce((s, k) => s + unmatched[k], 0);
  const orphanPct = totals.totalEvents
    ? (orphanTotal / totals.totalEvents) * 100
    : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            UTM Campaign Matching
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Funnel events grouped by utm_campaign · {windowLabel} · external traffic only
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Match rate</div>
          <div className={`text-lg font-bold ${orphanPct > 5 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {totals.totalEvents ? (100 - orphanPct).toFixed(1) : '—'}%
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading funnel events…
          </div>
        ) : error ? (
          <div className="text-sm text-destructive py-2">{error}</div>
        ) : (
          <>
            {/* Unmatched events panel — always visible, intensity scales with severity */}
            <div
              className={`rounded-lg border p-3 flex items-start gap-3 ${
                orphanTotal === 0
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : orphanPct > 5
                    ? 'border-amber-500/40 bg-amber-500/10'
                    : 'border-border bg-muted/30'
              }`}
            >
              <Unlink2 className={`h-4 w-4 mt-0.5 ${orphanTotal === 0 ? 'text-emerald-600' : 'text-amber-600'}`} />
              <div className="flex-1 text-sm">
                <div className="font-semibold">
                  {orphanTotal === 0
                    ? 'All events matched to a UTM campaign'
                    : `${orphanTotal} unmatched event${orphanTotal === 1 ? '' : 's'} (${orphanPct.toFixed(1)}%)`}
                </div>
                {orphanTotal > 0 && (
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                    {STEPS.filter((s) => unmatched[s] > 0).map((s) => (
                      <span key={s}>
                        {STEP_LABEL[s]}: <strong className="text-foreground">{unmatched[s]}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Per-campaign table */}
            {matched.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                No campaign-attributed funnel events in this window.
              </div>
            ) : (
              <div className="overflow-x-auto -mx-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-left font-medium px-3 py-2">Campaign</th>
                      {STEPS.map((s) => (
                        <th key={s} className="text-right font-medium px-3 py-2">
                          {STEP_LABEL[s]}
                        </th>
                      ))}
                      <th className="text-left font-medium px-3 py-2">Anomalies</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matched.map((row) => {
                      const hasError = row.flags.some((f) => f.severity === 'error');
                      return (
                        <tr
                          key={row.campaign}
                          className={`border-b last:border-0 ${hasError ? 'bg-destructive/5' : ''}`}
                        >
                          <td className="px-3 py-2 font-mono text-xs">
                            {row.campaign}
                          </td>
                          {STEPS.map((s) => (
                            <td key={s} className="px-3 py-2 text-right tabular-nums">
                              {row.counts[s] || <span className="text-muted-foreground">0</span>}
                            </td>
                          ))}
                          <td className="px-3 py-2">
                            {row.flags.length === 0 ? (
                              <span className="text-xs text-emerald-600">✓ healthy</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {row.flags.map((f, i) => (
                                  <Badge
                                    key={i}
                                    variant={f.severity === 'error' ? 'destructive' : 'secondary'}
                                    className="text-[10px] gap-1"
                                    title={f.detail}
                                  >
                                    <AlertTriangle className="h-3 w-3" />
                                    {f.label}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              Anomaly rules: impossible sequence (downstream &gt; upstream), lost attribution
              (purchase without landing), dropoff cliff (≥{(cliffThreshold * 100).toFixed(0)}%
              step-to-step on ≥{cliffMinVolume} upstream events).
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
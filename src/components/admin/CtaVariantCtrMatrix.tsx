/**
 * CtaVariantCtrMatrix — admin widget that builds a matrix of
 *   rows    = cta_variant   (e.g. high_conv_v1, high_conv_v2, …)
 *   cols    = placement     (bio_primary | bio_secondary | bio_sticky)
 *   cell    = CTR%          (lp_cta_click / lp_cta_impression)
 *
 * This is the experiment-attribution view: when we ship a new CTA stack
 * (proof line, nudge, arrow, copy change …) we bump CTA_VARIANT in
 * `src/pages/LinkInBio.tsx` so the new traffic gets tagged. This widget
 * proves whether the new variant beats the previous one and where —
 * primary, secondary or sticky — the lift actually came from.
 *
 * Data path: lp_funnel_events.cta_variant (added 2026-04-29 migration).
 * Founder Mode (is_internal = true) is excluded so dashboards reflect
 * real visitors only. Variants with <30 impressions on a placement get
 * a low-volume hint instead of a misleading CTR.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, FlaskConical, TrendingUp, TrendingDown, Minus } from 'lucide-react';

type Props = {
  startIso: string;
  endIso: string;
  windowLabel: string;
  /** Below this impression count we don't trust the CTR. Default 30. */
  minVolume?: number;
};

const PLACEMENTS = ['bio_primary', 'bio_secondary', 'bio_sticky'] as const;
type Placement = (typeof PLACEMENTS)[number];
const PLACEMENT_LABEL: Record<Placement, string> = {
  bio_primary: 'Primary',
  bio_secondary: 'Secondary',
  bio_sticky: 'Sticky',
};

type RawRow = {
  cta_variant: string | null;
  placement: string | null;
  event_name: string;
};

type Cell = { impressions: number; clicks: number; ctr: number };
type VariantRow = {
  variant: string;
  cells: Record<Placement, Cell>;
  totalImpressions: number;
  totalClicks: number;
  overallCtr: number;
};

function pct(n: number, d: number): number {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}

export function CtaVariantCtrMatrix({ startIso, endIso, windowLabel, minVolume = 30 }: Props) {
  const [rows, setRows] = useState<RawRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const { data, error: qErr } = await supabase
        .from('lp_funnel_events')
        .select('cta_variant, placement, event_name')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .eq('is_internal', false)
        .in('event_name', ['lp_cta_impression', 'lp_cta_click'])
        .in('placement', [...PLACEMENTS])
        .limit(50000);
      if (cancelled) return;
      if (qErr) {
        setError(qErr.message);
        setRows(null);
      } else {
        setRows((data ?? []) as RawRow[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [startIso, endIso]);

  const variantRows: VariantRow[] = useMemo(() => {
    if (!rows) return [];
    // Bucket: variant → placement → { impressions, clicks }
    const byVariant = new Map<string, Record<Placement, { imp: number; clk: number }>>();
    const variantsSeen = new Set<string>();
    for (const r of rows) {
      // Untagged rows (historical, before the cta_variant column existed)
      // bucket under 'untagged' so they're visible but separable.
      const variant = r.cta_variant && r.cta_variant.trim() ? r.cta_variant : 'untagged';
      const placement = r.placement as Placement;
      if (!PLACEMENTS.includes(placement)) continue;
      variantsSeen.add(variant);
      let bucket = byVariant.get(variant);
      if (!bucket) {
        bucket = {
          bio_primary: { imp: 0, clk: 0 },
          bio_secondary: { imp: 0, clk: 0 },
          bio_sticky: { imp: 0, clk: 0 },
        };
        byVariant.set(variant, bucket);
      }
      if (r.event_name === 'lp_cta_impression') bucket[placement].imp += 1;
      else if (r.event_name === 'lp_cta_click') bucket[placement].clk += 1;
    }
    return [...byVariant.entries()]
      .map(([variant, b]) => {
        const cells: Record<Placement, Cell> = {
          bio_primary: { impressions: b.bio_primary.imp, clicks: b.bio_primary.clk, ctr: pct(b.bio_primary.clk, b.bio_primary.imp) },
          bio_secondary: { impressions: b.bio_secondary.imp, clicks: b.bio_secondary.clk, ctr: pct(b.bio_secondary.clk, b.bio_secondary.imp) },
          bio_sticky: { impressions: b.bio_sticky.imp, clicks: b.bio_sticky.clk, ctr: pct(b.bio_sticky.clk, b.bio_sticky.imp) },
        };
        const totalImpressions = cells.bio_primary.impressions + cells.bio_secondary.impressions + cells.bio_sticky.impressions;
        const totalClicks = cells.bio_primary.clicks + cells.bio_secondary.clicks + cells.bio_sticky.clicks;
        return {
          variant,
          cells,
          totalImpressions,
          totalClicks,
          overallCtr: pct(totalClicks, totalImpressions),
        };
      })
      // Sort newest tag first when names follow the high_conv_vN pattern,
      // otherwise alphabetically. 'untagged' always last.
      .sort((a, b) => {
        if (a.variant === 'untagged') return 1;
        if (b.variant === 'untagged') return -1;
        return b.variant.localeCompare(a.variant, undefined, { numeric: true });
      });
  }, [rows]);

  /** Per-placement winning variant — the one with the highest CTR
   *  among variants that cleared the volume threshold. */
  const winners: Record<Placement, string | null> = useMemo(() => {
    const out: Record<Placement, string | null> = {
      bio_primary: null, bio_secondary: null, bio_sticky: null,
    };
    for (const placement of PLACEMENTS) {
      let best: { variant: string; ctr: number } | null = null;
      for (const row of variantRows) {
        const cell = row.cells[placement];
        if (cell.impressions < minVolume) continue;
        if (!best || cell.ctr > best.ctr) best = { variant: row.variant, ctr: cell.ctr };
      }
      out[placement] = best?.variant ?? null;
    }
    return out;
  }, [variantRows, minVolume]);

  /** Compare each variant's CTR to the previous variant on the same placement
   *  (rows are sorted newest-first, so "previous" = next row in the array). */
  function deltaIndicator(rowIdx: number, placement: Placement): { delta: number; direction: 'up' | 'down' | 'flat' } | null {
    const current = variantRows[rowIdx].cells[placement];
    if (current.impressions < minVolume) return null;
    for (let j = rowIdx + 1; j < variantRows.length; j++) {
      const prev = variantRows[j].cells[placement];
      if (prev.impressions < minVolume) continue;
      const delta = Math.round((current.ctr - prev.ctr) * 10) / 10;
      const direction = delta > 0.2 ? 'up' : delta < -0.2 ? 'down' : 'flat';
      return { delta, direction };
    }
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4" />
          CTA Variant CTR Matrix
          <Badge variant="outline" className="font-normal">{windowLabel}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading variant data…
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">Failed to load: {error}</p>
        ) : variantRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No CTA events recorded in this window.</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-3">
              CTR = clicks / impressions. Cells with &lt;{minVolume} impressions are dimmed and
              excluded from winner selection. Δ shows lift vs the previous variant on the same placement.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="text-left py-2 pr-3">Variant</th>
                    {PLACEMENTS.map((p) => (
                      <th key={p} className="text-right px-3 py-2">{PLACEMENT_LABEL[p]}</th>
                    ))}
                    <th className="text-right pl-3 py-2">Overall</th>
                  </tr>
                </thead>
                <tbody>
                  {variantRows.map((row, idx) => (
                    <tr key={row.variant} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <code className="font-mono">{row.variant}</code>
                          {row.variant === 'untagged' && (
                            <Badge variant="secondary" className="text-[10px]">pre-tag</Badge>
                          )}
                        </div>
                      </td>
                      {PLACEMENTS.map((p) => {
                        const cell = row.cells[p];
                        const lowVol = cell.impressions < minVolume;
                        const isWinner = !lowVol && winners[p] === row.variant;
                        const delta = deltaIndicator(idx, p);
                        return (
                          <td key={p} className={`text-right px-3 py-2 ${lowVol ? 'opacity-40' : ''}`}>
                            <div className="flex items-center justify-end gap-1.5">
                              {delta && (
                                <span
                                  className={`text-[10px] flex items-center gap-0.5 ${
                                    delta.direction === 'up'
                                      ? 'text-emerald-600'
                                      : delta.direction === 'down'
                                        ? 'text-rose-600'
                                        : 'text-muted-foreground'
                                  }`}
                                  title={`Δ vs previous variant: ${delta.delta > 0 ? '+' : ''}${delta.delta} pp`}
                                >
                                  {delta.direction === 'up' && <TrendingUp className="h-3 w-3" />}
                                  {delta.direction === 'down' && <TrendingDown className="h-3 w-3" />}
                                  {delta.direction === 'flat' && <Minus className="h-3 w-3" />}
                                  {delta.delta > 0 ? '+' : ''}{delta.delta}
                                </span>
                              )}
                              <span className={`font-mono font-semibold ${isWinner ? 'text-emerald-700' : ''}`}>
                                {cell.ctr}%
                              </span>
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {cell.clicks.toLocaleString()} / {cell.impressions.toLocaleString()}
                            </div>
                          </td>
                        );
                      })}
                      <td className="text-right pl-3 py-2">
                        <span className="font-mono font-semibold">{row.overallCtr}%</span>
                        <div className="text-[10px] text-muted-foreground">
                          {row.totalClicks.toLocaleString()} / {row.totalImpressions.toLocaleString()}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Per-placement winner summary — quick visual takeaway */}
            <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
              {PLACEMENTS.map((p) => (
                <div key={p} className="rounded border border-border bg-muted/30 px-3 py-2">
                  <div className="text-[10px] uppercase text-muted-foreground tracking-wide">
                    {PLACEMENT_LABEL[p]} winner
                  </div>
                  <div className="font-mono font-semibold">
                    {winners[p] ? (
                      <span className="text-emerald-700">{winners[p]}</span>
                    ) : (
                      <span className="text-muted-foreground">— low volume —</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
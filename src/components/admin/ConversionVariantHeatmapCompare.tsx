/**
 * ConversionVariantHeatmapCompare — side-by-side heatmap-filter dashboard
 * for the three conversion-video variants (conv_timepain, conv_smell,
 * conv_direct). One card per variant, each card surfaces:
 *
 *   • Funnel volume per variant (lp_view → cta_click → pdp_view → atc)
 *   • CTR + click→PDP conversion ratios
 *   • Best-performing CTA placement for that variant
 *   • Direct deeplink into Microsoft Clarity heatmaps pre-filtered on
 *     the matching `utm_campaign` tag (the tag is set by clarityTag()
 *     on /go landing — see mem://analytics/clarity-event-taxonomy)
 *
 * The deeplink uses Clarity's standard URL filter syntax:
 *   https://clarity.microsoft.com/projects/view/{PROJECT_ID}/heatmaps?filters=...
 * If VITE_CLARITY_PROJECT_ID is unset the link button is disabled with
 * a hint instead of pointing nowhere.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ExternalLink, Flame, MousePointerClick, Eye, ShoppingCart, Trophy } from 'lucide-react';
import { CONVERSION_CAMPAIGNS, type ConversionCampaign } from '@/lib/bioHookBucket';

type Props = {
  startIso: string;
  endIso: string;
  windowLabel: string;
};

const VARIANT_LABEL: Record<ConversionCampaign, string> = {
  conv_timepain: 'Time Pain',
  conv_smell: 'Smell Problem',
  conv_direct: 'Direct Buyer',
};

const VARIANT_DESCRIPTION: Record<ConversionCampaign, string> = {
  conv_timepain: 'Hook: scooping eats your week',
  conv_smell: 'Hook: apartment-smell problem',
  conv_direct: 'Hook: straight product pitch',
};

const TRACKED_EVENTS = ['lp_view', 'lp_cta_click', 'lp_pdp_view', 'add_to_cart'] as const;
type TrackedEvent = (typeof TRACKED_EVENTS)[number];

type RawRow = {
  utm_campaign: string | null;
  event_name: string;
  placement: string | null;
};

type VariantStats = {
  campaign: ConversionCampaign;
  counts: Record<TrackedEvent, number>;
  ctr: number;            // cta_click / lp_view
  clickToPdp: number;     // pdp_view / cta_click
  endToEnd: number;       // atc / lp_view
  topPlacement: { placement: string; clicks: number } | null;
};

const CLARITY_PROJECT_ID = (import.meta.env.VITE_CLARITY_PROJECT_ID as string | undefined)?.trim();

function pct(n: number, d: number): number {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}

/**
 * Build a Clarity heatmaps deeplink pre-filtered by the utm_campaign tag.
 * Clarity's filter param is a base64-encoded JSON array of filter objects.
 * Schema (reverse-engineered from the dashboard URL — stable since 2023):
 *   [{ "key": "<tagName>", "operator": "is", "value": ["<value>"] }]
 * The tag name matches what we set in `clarityTag('utm_campaign', ...)`.
 */
function buildClarityHeatmapUrl(campaign: ConversionCampaign, startIso: string, endIso: string): string | null {
  if (!CLARITY_PROJECT_ID) return null;
  const filters = [
    { key: 'utm_campaign', operator: 'is', value: [campaign] },
    { key: 'page', operator: 'is', value: ['/go'] },
  ];
  let encoded: string;
  try {
    encoded = btoa(JSON.stringify(filters));
  } catch {
    return null;
  }
  const start = startIso.slice(0, 10);
  const end = endIso.slice(0, 10);
  return `https://clarity.microsoft.com/projects/view/${CLARITY_PROJECT_ID}/heatmaps?date=${start},${end}&filters=${encodeURIComponent(encoded)}`;
}

export function ConversionVariantHeatmapCompare({ startIso, endIso, windowLabel }: Props) {
  const [rows, setRows] = useState<RawRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      // Pull only the conversion-variant rows so the payload stays tight even
      // on long windows. Founder Mode (is_internal = true) is excluded.
      const { data, error: qErr } = await supabase
        .from('lp_funnel_events')
        .select('utm_campaign, event_name, placement')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .eq('is_internal', false)
        .in('utm_campaign', [...CONVERSION_CAMPAIGNS])
        .in('event_name', [...TRACKED_EVENTS])
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

  const variants: VariantStats[] = useMemo(() => {
    return CONVERSION_CAMPAIGNS.map((campaign) => {
      const empty: Record<TrackedEvent, number> = {
        lp_view: 0, lp_cta_click: 0, lp_pdp_view: 0, add_to_cart: 0,
      };
      const counts = { ...empty };
      const placementClicks = new Map<string, number>();
      for (const row of rows ?? []) {
        if (row.utm_campaign !== campaign) continue;
        const ev = row.event_name as TrackedEvent;
        if (!(ev in counts)) continue;
        counts[ev] += 1;
        if (ev === 'lp_cta_click' && row.placement) {
          placementClicks.set(row.placement, (placementClicks.get(row.placement) ?? 0) + 1);
        }
      }
      const top = [...placementClicks.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        campaign,
        counts,
        ctr: pct(counts.lp_cta_click, counts.lp_view),
        clickToPdp: pct(counts.lp_pdp_view, counts.lp_cta_click),
        endToEnd: pct(counts.add_to_cart, counts.lp_view),
        topPlacement: top ? { placement: top[0], clicks: top[1] } : null,
      };
    });
  }, [rows]);

  // Identify the winner across variants (highest end-to-end), but only when
  // every variant has material volume so we don't crown a 1-visitor outlier.
  const winner = useMemo(() => {
    const eligible = variants.filter((v) => v.counts.lp_view >= 25);
    if (eligible.length === 0) return null;
    return eligible.reduce((best, v) => (v.endToEnd > best.endToEnd ? v : best));
  }, [variants]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="h-4 w-4" />
          Conversion Variant Heatmap Compare
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
        ) : (
          <>
            {!CLARITY_PROJECT_ID && (
              <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <strong>Clarity heatmap deeplinks disabled.</strong> Set
                {' '}<code>VITE_CLARITY_PROJECT_ID</code> to enable one-click
                jumping into per-variant heatmaps.
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {variants.map((v) => {
                const heatmapUrl = buildClarityHeatmapUrl(v.campaign, startIso, endIso);
                const isWinner = winner?.campaign === v.campaign;
                return (
                  <div
                    key={v.campaign}
                    className={`relative rounded-lg border p-4 flex flex-col gap-3 ${
                      isWinner ? 'border-amber-400 bg-amber-50/50' : 'border-border'
                    }`}
                  >
                    {isWinner && (
                      <Badge className="absolute -top-2 right-3 bg-amber-500 text-white">
                        <Trophy className="h-3 w-3 mr-1" /> Winner
                      </Badge>
                    )}
                    <div>
                      <h4 className="font-semibold">{VARIANT_LABEL[v.campaign]}</h4>
                      <p className="text-xs text-muted-foreground">{VARIANT_DESCRIPTION[v.campaign]}</p>
                      <code className="text-[10px] text-muted-foreground">{v.campaign}</code>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <Stat icon={<Eye className="h-3 w-3" />} label="Landings" value={v.counts.lp_view} />
                      <Stat icon={<MousePointerClick className="h-3 w-3" />} label="CTA clicks" value={v.counts.lp_cta_click} />
                      <Stat icon={<Eye className="h-3 w-3" />} label="PDP views" value={v.counts.lp_pdp_view} />
                      <Stat icon={<ShoppingCart className="h-3 w-3" />} label="Add-to-cart" value={v.counts.add_to_cart} />
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs border-t pt-2">
                      <RatioStat label="CTR" value={v.ctr} />
                      <RatioStat label="Click→PDP" value={v.clickToPdp} />
                      <RatioStat label="End-to-end" value={v.endToEnd} highlight />
                    </div>

                    {v.topPlacement && (
                      <div className="text-xs text-muted-foreground">
                        Top CTA: <span className="font-medium text-foreground">{v.topPlacement.placement}</span>
                        {' '}({v.topPlacement.clicks} clicks)
                      </div>
                    )}

                    <Button
                      asChild={Boolean(heatmapUrl)}
                      size="sm"
                      variant={isWinner ? 'default' : 'outline'}
                      disabled={!heatmapUrl}
                      className="mt-auto"
                    >
                      {heatmapUrl ? (
                        <a href={heatmapUrl} target="_blank" rel="noopener noreferrer">
                          <Flame className="h-3 w-3 mr-1" />
                          Open Clarity heatmap
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      ) : (
                        <span><Flame className="h-3 w-3 mr-1" /> Heatmap (set project id)</span>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded bg-muted/40 px-2 py-1">
      <span className="flex items-center gap-1 text-muted-foreground">{icon}{label}</span>
      <span className="font-mono font-semibold">{value.toLocaleString()}</span>
    </div>
  );
}

function RatioStat({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`text-center rounded px-2 py-1 ${highlight ? 'bg-primary/10 text-primary' : 'bg-muted/40'}`}>
      <div className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className="font-mono font-semibold">{value}%</div>
    </div>
  );
}
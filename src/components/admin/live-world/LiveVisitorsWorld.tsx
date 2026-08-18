/**
 * LIVE VISITORS — world presence module for /admin/analytics.
 *
 * Source of truth: public.gp_live_visitors(p_minutes) (admin-only, SECURITY DEFINER).
 * The RPC mirrors the gp_unified_analytics_v2 classification model exactly, so a
 * session that is INTERNAL_ADMIN / INTERNAL_QA / AUTOMATION / BOT_CRAWLER /
 * MONITORING_HEALTHCHECK in the historical dashboard is also excluded here.
 * Only REAL_SHOPPER + LIKELY_HUMAN count as live.
 *
 * Live window: last 5 minutes of visitor heartbeat/activity (heartbeat cadence 30s).
 * Refresh: every 45s, independent of the historical date range (Phase 18).
 * Privacy: country granularity only — no IP, no coordinates, no city, no identity.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw } from 'lucide-react';
import { WORLD_LAND_PATH } from './worldPath';
import { countryPoint, flagEmoji, projectXY } from './countryCentroids';

export const LIVE_WINDOW_MINUTES = 5;
const REFRESH_MS = 45_000;

type Count = { label: string; count: number };

export interface LiveCountry {
  country: string;
  visitors: number;
  channels: Count[] | null;
  pages: Count[] | null;
}

export interface LiveVisitor {
  country: string | null;
  channel: string;
  page_type: string;
  product_name: string | null;
  device: string | null;
  seconds_idle: number;
  has_atc: boolean;
  has_checkout: boolean;
  session_class: string;
}

export interface LiveMoment {
  kind: string;
  country: string | null;
  channel: string;
  product_name: string | null;
  seconds_ago: number;
}

export interface LivePayload {
  ok: boolean;
  generated_at: string;
  window_minutes: number;
  last_activity_at: string | null;
  active_total: number;
  known_location: number;
  unknown_location: number;
  excluded_total: number;
  excluded_by_class: Count[];
  countries: LiveCountry[];
  channels: Count[];
  products: Count[];
  pinterest: { visitors: number; targets: Count[] };
  visitors: LiveVisitor[];
  moments: LiveMoment[];
  health: { status: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE'; reason: string | null; last_activity_at: string | null };
}

export type LiveHealth = LivePayload['health'] & { error?: string };

function ago(sec: number): string {
  if (sec < 60) return `${sec} sec ago`;
  const m = Math.floor(sec / 60);
  return m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ago`;
}

function momentLabel(m: LiveMoment): string {
  const what = m.product_name || 'a product';
  if (m.kind === 'add_to_cart') return `Added ${what} to cart`;
  if (m.kind === 'checkout') return 'Started checkout';
  return `Viewed ${what}`;
}

/** Bubble radius scales gently with visitor count so one visitor stays tappable. */
function radiusFor(n: number): number {
  return Math.min(26, 11 + Math.log2(n + 1) * 6);
}

export function LiveVisitorsWorld({ onHealth }: { onHealth?: (h: LiveHealth) => void }) {
  const [data, setData] = useState<LivePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const onHealthRef = useRef(onHealth);
  onHealthRef.current = onHealth;

  const load = useCallback(async () => {
    setLoading(true);
    const { data: raw, error: err } = await supabase.rpc(
      'gp_live_visitors' as never,
      { p_minutes: LIVE_WINDOW_MINUTES } as never,
    );
    if (err) {
      setError(err.message);
      onHealthRef.current?.({ status: 'UNAVAILABLE', reason: err.message, last_activity_at: null, error: err.message });
    } else {
      const payload = raw as unknown as LivePayload;
      setData(payload);
      setError(null);
      setUpdatedAt(new Date());
      onHealthRef.current?.(payload.health);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => { if (!document.hidden) void load(); }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const markers = useMemo(() => {
    if (!data) return [];
    return data.countries
      .map((c) => {
        const pt = countryPoint(c.country);
        if (!pt) return null;
        const { x, y } = projectXY(pt.lon, pt.lat);
        return { ...c, iso: pt.iso, x, y, r: radiusFor(c.visitors) };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);
  }, [data]);

  const detail = useMemo(
    () => (selected ? data?.countries.find((c) => c.country === selected) ?? null : null),
    [selected, data],
  );

  const degraded = !!error || data?.health.status !== 'HEALTHY';
  const total = data?.active_total ?? 0;
  const topCountry = data?.countries?.[0];
  const topChannel = data?.channels?.[0];
  const topProduct = data?.products?.[0];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-4 sm:p-6 sm:pb-3 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${degraded ? 'bg-destructive' : 'bg-emerald-500 animate-pulse'}`}
                aria-hidden
              />
              {degraded ? 'Live data degraded' : 'Live'}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1 break-words [overflow-wrap:anywhere]">
              {updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : 'Connecting…'} · {LIVE_WINDOW_MINUTES}-min activity window
              {error ? ` · ${error}` : data?.health.reason ? ` · ${data.health.reason}` : ''}
            </p>
          </div>
          <Button
            size="icon"
            variant="outline"
            className="h-11 w-11 shrink-0"
            aria-label="Refresh live visitors"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0 space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
          {/* LIVE NOW summary */}
          <div className="space-y-3">
            <div className="rounded-xl border p-4">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Live now</span>
              <div className="text-4xl font-semibold tabular-nums leading-tight">{total}</div>
              <span className="text-xs text-muted-foreground">
                {total === 1 ? 'qualified visitor' : 'qualified visitors'}
              </span>
              <div className="mt-2 text-xs text-muted-foreground">
                Known location {data?.known_location ?? 0} · Unknown {data?.unknown_location ?? 0}
              </div>
            </div>

            <ul className="space-y-1.5 text-sm">
              {topCountry && (
                <li className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {flagEmoji(countryPoint(topCountry.country)?.iso)} {topCountry.country}
                  </span>
                  <span className="tabular-nums font-medium">{topCountry.visitors}</span>
                </li>
              )}
              {topChannel && (
                <li className="flex items-center justify-between gap-2">
                  <span className="truncate">{topChannel.label}</span>
                  <span className="tabular-nums font-medium">{topChannel.count}</span>
                </li>
              )}
              {topProduct && (
                <li className="flex items-center justify-between gap-2">
                  <span className="truncate">Viewing: {topProduct.label}</span>
                  <span className="tabular-nums font-medium">{topProduct.count}</span>
                </li>
              )}
              {!!data?.pinterest?.visitors && (
                <li className="flex items-center justify-between gap-2">
                  <span className="truncate">Pinterest live</span>
                  <span className="tabular-nums font-medium">{data.pinterest.visitors}</span>
                </li>
              )}
              {!!data?.excluded_total && (
                <li className="text-xs text-muted-foreground pt-1">
                  {data.excluded_total} non-qualified session{data.excluded_total === 1 ? '' : 's'} excluded (admin / QA / bot)
                </li>
              )}
            </ul>
          </div>

          {/* World visualization */}
          <div className="relative rounded-xl border bg-muted/30 overflow-hidden">
            <svg
              viewBox="0 0 1000 500"
              className="w-full h-auto block max-h-[13rem] sm:max-h-[18rem]"
              role="img"
              aria-label={`World map with ${total} live qualified visitors`}
            >
              <path d={WORLD_LAND_PATH} className="fill-muted-foreground/25 stroke-muted-foreground/30" strokeWidth={0.4} />
              {markers.map((m) => (
                <g
                  key={m.country}
                  className="cursor-pointer"
                  onClick={() => setSelected(selected === m.country ? null : m.country)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${m.country}: ${m.visitors} live visitors`}
                  onKeyDown={(e) => { if (e.key === 'Enter') setSelected(selected === m.country ? null : m.country); }}
                >
                  <circle cx={m.x} cy={m.y} r={m.r + 10} className="fill-emerald-500/15">
                    <animate attributeName="r" values={`${m.r};${m.r + 16};${m.r}`} dur="2.4s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.5;0;0.5" dur="2.4s" repeatCount="indefinite" />
                  </circle>
                  <circle
                    cx={m.x}
                    cy={m.y}
                    r={m.r}
                    className={`fill-emerald-500/85 ${selected === m.country ? 'stroke-foreground' : 'stroke-background'}`}
                    strokeWidth={selected === m.country ? 4 : 2}
                  />
                  {m.visitors > 1 && (
                    <text x={m.x} y={m.y + 6} textAnchor="middle" className="fill-background font-semibold" fontSize={18}>
                      {m.visitors}
                    </text>
                  )}
                </g>
              ))}
            </svg>

            {total === 0 && (
              <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
                <span className="text-sm text-muted-foreground bg-background/80 rounded-lg px-3 py-2">
                  No qualified visitors live right now
                </span>
              </div>
            )}
            {total > 0 && markers.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
                <span className="text-sm text-muted-foreground bg-background/80 rounded-lg px-3 py-2">
                  {total} live · unknown location (not placed on the map)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Tapped country detail */}
        {detail && (
          <div className="rounded-xl border p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                {flagEmoji(countryPoint(detail.country)?.iso)} {detail.country}
              </span>
              <Badge variant="secondary">{detail.visitors} live</Badge>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <ul className="space-y-1 text-xs text-muted-foreground">
                {(detail.channels ?? []).map((c) => (
                  <li key={`ch-${c.label}`} className="flex justify-between gap-2">
                    <span className="truncate">{c.label}</span><span className="tabular-nums">{c.count}</span>
                  </li>
                ))}
              </ul>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {(detail.pages ?? []).map((p) => (
                  <li key={`pg-${p.label}`} className="flex justify-between gap-2">
                    <span className="truncate">{p.label}</span><span className="tabular-nums">{p.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Live visitor list + commerce moments */}
        {(!!data?.visitors.length || !!data?.moments.length) && (
          <div className="grid gap-4 lg:grid-cols-2">
            {!!data?.visitors.length && (
              <div>
                <h3 className="text-sm font-medium mb-2">Active qualified sessions</h3>
                <ul className="space-y-2">
                  {data.visitors.map((v, i) => (
                    <li key={`v-${i}`} className="rounded-lg border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          {v.country ? `${flagEmoji(countryPoint(v.country)?.iso)} ${v.country}` : 'Unknown location'}
                        </span>
                        <Badge variant="outline" className="shrink-0">{v.channel}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 break-words [overflow-wrap:anywhere]">
                        {v.product_name ? `Viewing: ${v.product_name}` : v.page_type}
                        {v.device ? ` · ${v.device}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {v.has_checkout ? 'In checkout' : v.has_atc ? 'Added to cart' : 'Active'} · {ago(v.seconds_idle)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!!data?.moments.length && (
              <div>
                <h3 className="text-sm font-medium mb-2">Live commerce moments</h3>
                <ul className="space-y-2">
                  {data.moments.map((m, i) => (
                    <li key={`m-${i}`} className="rounded-lg border p-3 text-sm">
                      <span className="text-xs text-muted-foreground">
                        {m.country || 'Unknown location'} · {m.channel}
                      </span>
                      <p className="break-words [overflow-wrap:anywhere]">{momentLabel(m)}</p>
                      <span className="text-xs text-muted-foreground">{ago(m.seconds_ago)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

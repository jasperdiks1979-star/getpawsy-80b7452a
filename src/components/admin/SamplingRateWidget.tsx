import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Gauge, RefreshCw, AlertTriangle, CheckCircle2, Settings2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

// ---------------------------------------------------------------------------
// SamplingRateWidget
// ---------------------------------------------------------------------------
// Compact admin verification widget for the render-trace dashboard. Shows:
//   1. The persisted `crawler_visit_sample_rate` from `site_settings`.
//   2. The *effective* rate the edge function is currently using (probe).
//   3. The last-hour effective sampling outcome (logged vs sampled out, plus
//      always-log vs probabilistic) so ops can confirm at a glance that the
//      configured rate is actually being honored end-to-end.
// ---------------------------------------------------------------------------

const SETTING_KEY = 'crawler_visit_sample_rate';

type Probe = {
  ok: boolean;
  effectiveSampleRate: number;
  cachedAgeMs: number | null;
};

type LastHour = {
  window_minutes: number;
  totals: {
    total: number;
    logged: number;
    sampled_out: number;
    always_log: number;
    sampled_probabilistic: number;
    render_trace: number;
    verified_bot: number;
    spoofed_bot: number;
  };
};

function formatPercent(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`;
}

async function fetchProbe(): Promise<Probe> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const url = new URL(`${supabaseUrl}/functions/v1/log-crawler-visit`);
  url.searchParams.set('probe', 'sample-rate');
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  if (!res.ok) throw new Error(`Probe HTTP ${res.status}`);
  return (await res.json()) as Probe;
}

export function SamplingRateWidget() {
  const [refreshKey, setRefreshKey] = useState(0);

  const persisted = useQuery({
    queryKey: ['site-settings', SETTING_KEY, refreshKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value,updated_at')
        .eq('key', SETTING_KEY)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchOnWindowFocus: false,
  });

  const probe = useQuery({
    queryKey: ['sampling-widget-probe', refreshKey],
    queryFn: fetchProbe,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const lastHour = useQuery({
    queryKey: ['sampling-widget-last-hour', refreshKey],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_crawler_sampling_last_hour', {
        p_top_pages: 1,
        p_minutes: 60,
      });
      if (error) throw error;
      return data as unknown as LastHour;
    },
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  // Auto-refresh every 60s so the widget stays current without user action.
  useEffect(() => {
    const id = setInterval(() => setRefreshKey((k) => k + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const persistedRate = useMemo(() => {
    const v = persisted.data?.value;
    if (v === undefined || v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }, [persisted.data?.value]);

  const effectiveRate = probe.data?.effectiveSampleRate ?? null;
  const totals = lastHour.data?.totals;

  // Drift = persisted vs effective edge cache. >0.5pp is worth surfacing.
  const drift =
    persistedRate !== null && effectiveRate !== null
      ? Math.abs(persistedRate - effectiveRate)
      : null;
  const driftWarning = drift !== null && drift > 0.005;

  // Observed keep-rate of the *probabilistic* slice. Pings flagged
  // `always_log` (render-trace, appeals, verified bots) bypass sampling and
  // are excluded from this ratio so the number reflects the dial we actually
  // turn — not the priority traffic we never drop.
  const probabilistic = totals?.sampled_probabilistic ?? 0;
  const probabilisticLogged =
    totals !== undefined ? totals.logged - totals.always_log : 0;
  const observedKeepRate =
    probabilistic > 0 ? Math.max(0, probabilisticLogged) / probabilistic : null;

  // The observed keep-rate should be close to the configured rate. Tolerate
  // wider drift for tiny samples (n<50) where variance is expected.
  const observedDrift =
    observedKeepRate !== null && persistedRate !== null
      ? Math.abs(observedKeepRate - persistedRate)
      : null;
  const observedTolerance = probabilistic >= 200 ? 0.1 : probabilistic >= 50 ? 0.2 : 0.5;
  const observedHealthy =
    observedDrift === null ? true : observedDrift <= observedTolerance;

  const isLoading = persisted.isLoading || probe.isLoading || lastHour.isLoading;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" />
              Crawler-visit sampling
              {driftWarning && (
                <Badge variant="destructive" className="gap-1 text-[11px]">
                  <AlertTriangle className="h-3 w-3" />
                  cache drift
                </Badge>
              )}
              {!driftWarning && !observedHealthy && (
                <Badge variant="secondary" className="gap-1 text-[11px]">
                  <AlertTriangle className="h-3 w-3" />
                  observed drift
                </Badge>
              )}
              {!driftWarning && observedHealthy && persistedRate !== null && (
                <Badge variant="outline" className="gap-1 text-[11px] text-emerald-600 border-emerald-600/40">
                  <CheckCircle2 className="h-3 w-3" />
                  honored
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1">
              Quick verification that the configured sample rate matches what the edge function
              and database are actually doing right now.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefreshKey((k) => k + 1)}
              disabled={isLoading}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/crawler-sample-rate">
                <Settings2 className="h-3.5 w-3.5 mr-1" />
                Tune
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ── Rate row ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <RateTile
            label="Configured"
            value={persistedRate}
            loading={persisted.isLoading}
            sublabel={
              persisted.data?.updated_at
                ? `updated ${new Date(persisted.data.updated_at).toLocaleString()}`
                : 'site_settings'
            }
          />
          <RateTile
            label="Edge effective"
            value={effectiveRate}
            loading={probe.isLoading}
            sublabel={
              probe.error
                ? 'probe failed'
                : probe.data?.cachedAgeMs == null
                ? 'live (cold cache)'
                : `cache age ${Math.round(probe.data.cachedAgeMs / 1000)}s`
            }
            error={!!probe.error}
          />
          <RateTile
            label="Observed (last 60m)"
            value={observedKeepRate}
            loading={lastHour.isLoading}
            sublabel={
              probabilistic === 0
                ? 'no probabilistic pings yet'
                : `${probabilisticLogged.toLocaleString()} kept of ${probabilistic.toLocaleString()}`
            }
            warning={!observedHealthy}
          />
        </div>

        {/* ── Outcome breakdown ────────────────────────────────────── */}
        {lastHour.isLoading ? (
          <Skeleton className="h-[60px] w-full" />
        ) : totals ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <OutcomeStat
              label="Logged"
              value={totals.logged}
              total={totals.total}
              tone="positive"
            />
            <OutcomeStat
              label="Sampled out"
              value={totals.sampled_out}
              total={totals.total}
              tone="muted"
            />
            <OutcomeStat
              label="Always-log"
              value={totals.always_log}
              total={totals.total}
              tone="info"
              hint="render-trace / appeals / verified bots"
            />
            <OutcomeStat
              label="Probabilistic"
              value={totals.sampled_probabilistic}
              total={totals.total}
              tone="info"
              hint="subject to sample-rate dial"
            />
          </div>
        ) : null}

        {totals && totals.total === 0 && (
          <p className="text-xs text-muted-foreground">
            No crawler-visit pings recorded in the last hour. The sampling decision log only
            populates when traffic flows through the edge function.
          </p>
        )}

        {driftWarning && persistedRate !== null && effectiveRate !== null && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
            Edge cache reports {formatPercent(effectiveRate)} but {formatPercent(persistedRate)} is
            persisted. Hit <strong>Tune</strong> and force a cache refresh to re-align.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function RateTile({
  label,
  value,
  sublabel,
  loading,
  warning,
  error,
}: {
  label: string;
  value: number | null;
  sublabel: string;
  loading?: boolean;
  warning?: boolean;
  error?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-3 ${
        error
          ? 'border-destructive/40 bg-destructive/5'
          : warning
          ? 'border-amber-500/40 bg-amber-500/5'
          : 'border-border bg-muted/30'
      }`}
    >
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums mt-0.5">
        {loading ? (
          <Skeleton className="h-6 w-16" />
        ) : value === null ? (
          <span className="text-muted-foreground text-sm">—</span>
        ) : (
          formatPercent(value)
        )}
      </div>
      <div className="text-[11px] text-muted-foreground mt-1 truncate" title={sublabel}>
        {sublabel}
      </div>
    </div>
  );
}

function OutcomeStat({
  label,
  value,
  total,
  tone,
  hint,
}: {
  label: string;
  value: number;
  total: number;
  tone: 'positive' | 'muted' | 'info';
  hint?: string;
}) {
  const pct = total > 0 ? value / total : 0;
  const toneClass =
    tone === 'positive'
      ? 'text-emerald-600'
      : tone === 'info'
      ? 'text-primary'
      : 'text-muted-foreground';
  return (
    <div className="rounded-md border p-2 bg-background">
      <div className="flex items-baseline justify-between gap-1">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`text-[11px] tabular-nums ${toneClass}`}>{formatPercent(pct, 0)}</div>
      </div>
      <div className="text-base font-semibold tabular-nums">{value.toLocaleString()}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

export default SamplingRateWidget;
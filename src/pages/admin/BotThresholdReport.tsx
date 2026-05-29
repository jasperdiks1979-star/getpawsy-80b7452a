/**
 * /admin/bot-threshold — validates the client-side bot classifier
 * (src/lib/botDetection.ts) against real funnel data. Surfaces:
 *   - Bot share over time (24h / 7d) — confirms we are not over-flagging
 *     legitimate visitors after the TRK-1 geo / device hardening.
 *   - Distribution of traffic_quality_score buckets — visualises how close
 *     real sessions sit to the `score < 50` cutoff.
 *   - Top bot_reason codes (which signals are doing the flagging).
 *   - False-positive risk: rows flagged is_bot=true that *also* fired a
 *     high-intent event (add_to_cart, checkout_click, payment_success).
 *     A healthy classifier keeps this number at ~0.
 *   - Envelope coverage: % of recent rows that carry the new
 *     classification/geo/device columns (so we know which slice of traffic
 *     this report can actually reason about).
 *
 * Read-only. No mutations. Admin-guarded by the existing AdminRouteGuard
 * on the parent route.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2, ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2,
} from 'lucide-react';

type Range = '24h' | '7d';

interface Row {
  created_at: string;
  event_name: string;
  is_bot: boolean | null;
  bot_reason: string | null;
  traffic_quality_score: number | null;
  classification: string | null;
  qa: boolean | null;
  device: string | null;
  geo_tier: string | null;
}

const HIGH_INTENT = new Set([
  'add_to_cart', 'checkout_click', 'checkout_redirect_success', 'payment_success',
]);

const SCORE_BUCKETS: Array<{ label: string; min: number; max: number; bot: boolean }> = [
  { label: '0–29 (bot)', min: 0, max: 29, bot: true },
  { label: '30–49 (bot)', min: 30, max: 49, bot: true },
  { label: '50–69 (human, weak)', min: 50, max: 69, bot: false },
  { label: '70–89 (human, strong)', min: 70, max: 89, bot: false },
  { label: '90–100 (verified)', min: 90, max: 100, bot: false },
];

function rangeStart(r: Range): string {
  const ms = r === '24h' ? 24 * 3600e3 : 7 * 24 * 3600e3;
  return new Date(Date.now() - ms).toISOString();
}

export default function BotThresholdReport() {
  const [range, setRange] = useState<Range>('24h');
  const [rows, setRows] = useState<Row[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const since = rangeStart(range);
    try {
      // Total count (including legacy rows without envelope columns).
      const { count, error: cErr } = await supabase
        .from('lp_funnel_events')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since);
      if (cErr) throw cErr;
      setTotalRows(count ?? 0);

      // Pull up to 5000 envelope-tagged rows for distribution analysis.
      const { data, error: dErr } = await supabase
        .from('lp_funnel_events')
        .select(
          'created_at,event_name,is_bot,bot_reason,traffic_quality_score,' +
            'classification,qa,device,geo_tier',
        )
        .gte('created_at', since)
        .not('classification', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5000);
      if (dErr) throw dErr;
      setRows((data ?? []) as unknown as Row[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  const metrics = useMemo(() => {
    const enveloped = rows.length;
    const real = rows.filter(r => !r.qa);
    const bots = real.filter(r => r.is_bot === true).length;
    const humans = real.length - bots;
    const botPct = real.length ? (bots / real.length) * 100 : 0;
    const coveragePct = totalRows ? (enveloped / totalRows) * 100 : 0;

    // Score bucket distribution.
    const buckets = SCORE_BUCKETS.map(b => ({
      ...b,
      count: real.filter(r => {
        const s = r.traffic_quality_score ?? 0;
        return s >= b.min && s <= b.max;
      }).length,
    }));

    // Top bot_reason codes.
    const reasonMap = new Map<string, number>();
    for (const r of real) {
      if (!r.is_bot || !r.bot_reason) continue;
      for (const reason of r.bot_reason.split(',').map(s => s.trim()).filter(Boolean)) {
        reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1);
      }
    }
    const topReasons = [...reasonMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    // False-positive risk: bot-flagged rows that fired a high-intent event.
    const falsePosRows = real.filter(
      r => r.is_bot === true && HIGH_INTENT.has(r.event_name),
    );

    // Borderline window: score in 45–55, not bot. These would flip on
    // a small threshold change.
    const borderline = real.filter(r => {
      const s = r.traffic_quality_score ?? 0;
      return s >= 45 && s <= 55;
    }).length;

    return {
      enveloped, real: real.length, bots, humans, botPct, coveragePct,
      buckets, topReasons, falsePosCount: falsePosRows.length, borderline,
    };
  }, [rows, totalRows]);

  // Verdict on the threshold.
  const verdict = useMemo(() => {
    if (!metrics.real) {
      return { tone: 'muted' as const, label: 'No envelope data yet', icon: AlertTriangle };
    }
    if (metrics.falsePosCount > 0) {
      return {
        tone: 'destructive' as const,
        label: `Over-flagging risk: ${metrics.falsePosCount} bot row(s) completed a conversion event`,
        icon: ShieldAlert,
      };
    }
    if (metrics.botPct > 25) {
      return {
        tone: 'warning' as const,
        label: `Bot share ${metrics.botPct.toFixed(1)}% — investigate before trusting Clean KPIs`,
        icon: AlertTriangle,
      };
    }
    return {
      tone: 'ok' as const,
      label: `Threshold healthy — bots ${metrics.botPct.toFixed(1)}%, 0 false positives in ${range}`,
      icon: ShieldCheck,
    };
  }, [metrics, range]);

  const VerdictIcon = verdict.icon;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <Helmet>
        <title>Bot Threshold Report — Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Bot threshold report</h1>
          <p className="text-sm text-muted-foreground">
            Validates the client-side classifier (score &lt; 50 ⇒ bot) against real traffic.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={range} onValueChange={v => setRange(v as Range)}>
            <TabsList>
              <TabsTrigger value="24h">Last 24h</TabsTrigger>
              <TabsTrigger value="7d">Last 7d</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Query failed</AlertTitle>
          <AlertDescription className="font-mono text-xs">{error}</AlertDescription>
        </Alert>
      )}

      <Alert
        variant={verdict.tone === 'destructive' ? 'destructive' : 'default'}
        className={
          verdict.tone === 'ok'
            ? 'border-emerald-500/40 bg-emerald-500/5'
            : verdict.tone === 'warning'
              ? 'border-amber-500/40 bg-amber-500/5'
              : undefined
        }
      >
        <VerdictIcon className="w-4 h-4" />
        <AlertTitle>Verdict</AlertTitle>
        <AlertDescription>{verdict.label}</AlertDescription>
      </Alert>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Envelope rows" value={metrics.enveloped.toLocaleString()}
          sub={`${metrics.coveragePct.toFixed(0)}% of ${totalRows.toLocaleString()} total`} />
        <KpiCard label="Humans (non-QA)" value={metrics.humans.toLocaleString()} />
        <KpiCard label="Bots (non-QA)" value={metrics.bots.toLocaleString()}
          sub={`${metrics.botPct.toFixed(1)}% of envelope rows`} />
        <KpiCard label="Borderline 45–55" value={metrics.borderline.toLocaleString()}
          sub="rows close to the cutoff" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>traffic_quality_score distribution</CardTitle>
          <CardDescription>
            How tightly real sessions cluster around the bot/human boundary (50).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {metrics.buckets.map(b => {
              const pct = metrics.real ? (b.count / metrics.real) * 100 : 0;
              return (
                <div key={b.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className={b.bot ? 'text-destructive' : 'text-muted-foreground'}>
                      {b.label}
                    </span>
                    <span className="tabular-nums">
                      {b.count.toLocaleString()} ({pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={b.bot ? 'h-full bg-destructive' : 'h-full bg-primary'}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Top bot_reason codes</CardTitle>
            <CardDescription>Which signals are flipping the classifier.</CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.topReasons.length === 0 ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                No bot reasons fired in {range}.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {metrics.topReasons.map(([reason, n]) => (
                  <li key={reason} className="flex items-center justify-between text-sm">
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{reason}</code>
                    <Badge variant="secondary">{n}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>False-positive risk</CardTitle>
            <CardDescription>
              Bot-flagged rows that also fired add_to_cart / checkout_click /
              payment_success. Healthy ≈ 0.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.falsePosCount === 0 ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                No bot-flagged conversion events in {range}. Threshold is not over-flagging.
              </p>
            ) : (
              <Alert variant="destructive">
                <ShieldAlert className="w-4 h-4" />
                <AlertTitle>{metrics.falsePosCount} bot-flagged conversion event(s)</AlertTitle>
                <AlertDescription>
                  Either the cutoff (score &lt; 50) is too aggressive or a real visitor
                  matched a bot UA pattern. Inspect rows in /admin/funnel-health Raw mode.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Envelope coverage</CardTitle>
          <CardDescription>
            % of events written with the new classification/geo/device columns.
            Legacy rows (pre-TRK-1) appear as raw count only and are excluded from
            the threshold analysis above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold tabular-nums">
              {metrics.coveragePct.toFixed(1)}%
            </span>
            <span className="text-sm text-muted-foreground">
              {metrics.enveloped.toLocaleString()} of {totalRows.toLocaleString()} rows
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden mt-3">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.min(100, metrics.coveragePct)}%` }}
            />
          </div>
          {metrics.coveragePct < 80 && (
            <p className="text-xs text-amber-600 mt-2">
              Coverage &lt; 80% — older rows still in the window. Threshold conclusions
              will sharpen as legacy rows age out.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}
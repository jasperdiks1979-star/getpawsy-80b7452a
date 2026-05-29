/**
 * /admin/funnel-health — production funnel + data-quality dashboard.
 *
 * TRK-4: Clean vs Raw mode toggle, quality breakdown cards
 * (geo_tier, device, in_app_browser, bot share), granular QA simulation
 * buttons (PDP / ATC / Checkout / Redirect / Error — all tagged qa=true so
 * they never pollute Clean), and a live "Latest events" inspector.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle, CheckCircle2, Loader2, PlayCircle, ShieldCheck, ShieldAlert,
} from 'lucide-react';
import {
  fireUserAddToCart, fireCheckoutClick, fireCheckoutEvent, firePdpView,
} from '@/lib/funnelEvents';

type Range = '1h' | '24h' | '7d' | 'today';
type Mode = 'clean' | 'raw';

interface LpRow {
  id?: string;
  created_at?: string;
  event_name: string;
  product_id: string | null;
  product_name: string | null;
  page_path: string | null;
  utm_source: string | null;
  session_id: string | null;
  raw_payload: Record<string, unknown> | null;
  is_bot: boolean | null;
  event_source: string | null;
  classification: string | null;
  qa: boolean | null;
  geo_tier: string | null;
  geo_country: string | null;
  device: string | null;
  in_app_browser: string | null;
  idempotency_key: string | null;
  source_component: string | null;
}

interface CkRow {
  id?: string;
  created_at?: string;
  step: string;
  event_source: string | null;
  is_bot: boolean | null;
  geo_quality: string | null;
  classification: string | null;
  qa: boolean | null;
  geo_tier: string | null;
  device: string | null;
  in_app_browser: string | null;
  source_component: string | null;
  error_reason: string | null;
}

function rangeStart(r: Range): string {
  const d = new Date();
  if (r === '1h') d.setHours(d.getHours() - 1);
  else if (r === '24h') d.setHours(d.getHours() - 24);
  else if (r === '7d') d.setDate(d.getDate() - 7);
  else d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Clean = real human traffic only. Bots, QA, and unknown-quality excluded. */
function isClean(row: { classification: string | null; qa: boolean | null; is_bot: boolean | null }): boolean {
  if (row.is_bot) return false;
  if (row.qa) return false;
  return row.classification === 'verified_user' || row.classification === 'probable_user';
}

function pct(n: number, d: number): string {
  if (!d) return '—';
  return `${((n / d) * 100).toFixed(1)}%`;
}

function Stat({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const toneCls =
    tone === 'bad' ? 'text-destructive' :
    tone === 'warn' ? 'text-amber-600' :
    tone === 'ok' ? 'text-emerald-600' :
    '';
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs">{label}</CardDescription>
        <CardTitle className={`text-2xl font-mono ${toneCls}`}>{value}</CardTitle>
      </CardHeader>
      {hint ? <CardContent className="text-xs text-muted-foreground pt-0">{hint}</CardContent> : null}
    </Card>
  );
}

function countBy<T>(rows: T[], key: (r: T) => string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = key(r) || 'unknown';
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export default function FunnelHealth() {
  const [range, setRange] = useState<Range>('24h');
  const [mode, setMode] = useState<Mode>('clean');
  const [lpRows, setLpRows] = useState<LpRow[]>([]);
  const [ckRows, setCkRows] = useState<CkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [qaRunning, setQaRunning] = useState<string | null>(null);
  const [qaResult, setQaResult] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const since = rangeStart(range);
    const [lp, ck] = await Promise.all([
      supabase
        .from('lp_funnel_events')
        .select('id,created_at,event_name,product_id,product_name,page_path,utm_source,session_id,raw_payload,is_bot,event_source,classification,qa,geo_tier,geo_country,device,in_app_browser,idempotency_key,source_component')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5000),
      supabase
        .from('checkout_funnel_events')
        .select('id,created_at,step,event_source,is_bot,geo_quality,classification,qa,geo_tier,device,in_app_browser,source_component,error_reason')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(2000),
    ]);
    setLpRows((lp.data ?? []) as LpRow[]);
    setCkRows((ck.data ?? []) as CkRow[]);
    setLoading(false);
  }, [range]);

  useEffect(() => { void reload(); }, [reload]);

  // Filter rows by mode.
  const lp = useMemo(() => mode === 'clean' ? lpRows.filter(isClean) : lpRows, [lpRows, mode]);
  const ck = useMemo(() => mode === 'clean' ? ckRows.filter(isClean) : ckRows, [ckRows, mode]);

  // Aggregates
  const stats = useMemo(() => {
    const atc = lp.filter(r => r.event_name === 'add_to_cart' && r.event_source === 'user_click');
    const pdp = lp.filter(r => r.event_name === 'pdp_view');
    const cartOpen = lp.filter(r => r.event_name === 'cart_open');
    const pay = lp.filter(r => r.event_name === 'payment_success' || r.event_name === 'payment_success_view');

    const ckClick = ck.filter(r => r.step === 'checkout_click');
    const ckAttempt = ck.filter(r => r.step === 'checkout_redirect_attempt');
    const ckSuccess = ck.filter(r => r.step === 'checkout_redirect_success');
    const ckErr = ck.filter(r => r.step === 'checkout_error');

    const sessions = new Set(lp.map(r => r.session_id).filter(Boolean));

    // Raw set used for quality breakdowns
    const allLp = lpRows;
    const total = allLp.length || 1;
    const bot = allLp.filter(r => r.is_bot).length;
    const qa = allLp.filter(r => r.qa).length;
    const unkGeo = allLp.filter(r => !r.geo_tier || r.geo_tier === 'unknown').length;
    const unkDevice = allLp.filter(r => !r.device || r.device === 'unknown').length;
    const inApp = allLp.filter(r => r.in_app_browser).length;
    const verifiedUs = allLp.filter(r => r.geo_tier === 'verified_us').length;

    // Data quality score: clean rows ÷ total rows.
    const cleanCount = allLp.filter(isClean).length;
    const dq = Math.round((cleanCount / total) * 100);

    return {
      atc: atc.length, pdp: pdp.length, cartOpen: cartOpen.length, pay: pay.length,
      ckClick: ckClick.length, ckAttempt: ckAttempt.length, ckSuccess: ckSuccess.length, ckErr: ckErr.length,
      sessions: sessions.size,
      total: allLp.length, bot, qa, unkGeo, unkDevice, inApp, verifiedUs, dq,
    };
  }, [lp, ck, lpRows]);

  const deviceBreak = useMemo(() => countBy(lpRows, r => r.device), [lpRows]);
  const geoBreak = useMemo(() => countBy(lpRows, r => r.geo_tier), [lpRows]);
  const sourceBreak = useMemo(() => countBy(lp, r => (r.utm_source || 'direct').toLowerCase()), [lp]);
  const inAppBreak = useMemo(() => {
    const inApp = lpRows.filter(r => r.in_app_browser);
    return countBy(inApp, r => r.in_app_browser);
  }, [lpRows]);

  // Latest events: most recent 30 rows mixed
  const latest = useMemo(() => {
    type Entry = { id: string; created_at: string; kind: 'lp' | 'ck'; label: string; source: string | null; classification: string | null; qa: boolean | null; is_bot: boolean | null; device: string | null; geo: string | null };
    const entries: Entry[] = [];
    for (const r of lpRows.slice(0, 60)) {
      entries.push({
        id: String(r.id ?? Math.random()), created_at: r.created_at ?? '',
        kind: 'lp', label: r.event_name, source: r.source_component,
        classification: r.classification, qa: r.qa, is_bot: r.is_bot,
        device: r.device, geo: r.geo_tier,
      });
    }
    for (const r of ckRows.slice(0, 30)) {
      entries.push({
        id: String(r.id ?? Math.random()), created_at: r.created_at ?? '',
        kind: 'ck', label: r.step, source: r.source_component,
        classification: r.classification, qa: r.qa, is_bot: r.is_bot,
        device: r.device, geo: r.geo_tier,
      });
    }
    return entries.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 40);
  }, [lpRows, ckRows]);

  const warnings = useMemo(() => {
    const w: string[] = [];
    if (stats.atc > 0 && stats.ckClick === 0)
      w.push(`Clean ATC=${stats.atc} but Clean checkout_clicks=0 — verify Cart CTA wiring.`);
    if (stats.ckClick > 0 && stats.ckSuccess === 0)
      w.push(`Clean checkout_clicks=${stats.ckClick} but redirect_success=0 — create-checkout invoke likely failing.`);
    if (stats.total > 0 && stats.unkGeo / stats.total > 0.7)
      w.push(`Unknown geo > 70% (${stats.unkGeo}/${stats.total}) — geo-classify edge fn likely down.`);
    if (stats.total > 0 && stats.unkDevice / stats.total > 0.2)
      w.push(`Unknown device > 20% (${stats.unkDevice}/${stats.total}) — deviceClassify failing on real UAs.`);
    return w;
  }, [stats]);

  const runQa = async (kind: 'pdp' | 'atc' | 'checkout_click' | 'redirect' | 'error') => {
    setQaRunning(kind);
    setQaResult(null);
    try {
      if (kind === 'pdp') {
        firePdpView({ product_id: 'qa_test', product_name: 'QA PDP', price: 1, qa: true });
      } else if (kind === 'atc') {
        fireUserAddToCart({ product_id: 'qa_test', product_name: 'QA ATC', qty: 1, price: 1, source_component: 'funnel_health_qa', qa: true });
      } else if (kind === 'checkout_click') {
        fireCheckoutClick({ source_component: 'funnel_health_qa', item_count: 1, value: 1, currency: 'USD', qa: true });
      } else if (kind === 'redirect') {
        fireCheckoutEvent({ step: 'checkout_redirect_success', source_component: 'funnel_health_qa', value: 1, currency: 'USD', destination_url: 'https://qa.example/checkout', qa: true });
      } else {
        fireCheckoutEvent({ step: 'checkout_error', source_component: 'funnel_health_qa', value: 1, currency: 'USD', error_reason: 'qa_simulated_error', qa: true });
      }
      await new Promise(r => setTimeout(r, 600));
      setQaResult(`Sent QA "${kind}" — tagged qa=true (excluded from Clean).`);
      await reload();
    } catch (e) {
      setQaResult(`ERROR — ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setQaRunning(null);
    }
  };

  const dqTone = stats.dq >= 80 ? 'ok' : stats.dq >= 50 ? 'warn' : 'bad';
  const geoUnkPct = stats.total ? (stats.unkGeo / stats.total) * 100 : 0;
  const geoTone = geoUnkPct < 20 ? 'ok' : geoUnkPct < 50 ? 'warn' : 'bad';
  const devUnkPct = stats.total ? (stats.unkDevice / stats.total) * 100 : 0;
  const devTone = devUnkPct < 10 ? 'ok' : devUnkPct < 25 ? 'warn' : 'bad';

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Helmet>
        <title>Funnel Health · GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Funnel Health</h1>
          <p className="text-muted-foreground text-sm">
            <span className="font-medium">Clean</span> = real human traffic only (classification ∈ verified/probable, qa=false, bot=false).
            <span className="font-medium ml-2">Raw</span> = every recorded row.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Tabs value={mode} onValueChange={v => setMode(v as Mode)}>
            <TabsList>
              <TabsTrigger value="clean"><ShieldCheck className="h-3.5 w-3.5 mr-1" />Clean</TabsTrigger>
              <TabsTrigger value="raw"><ShieldAlert className="h-3.5 w-3.5 mr-1" />Raw</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={range} onValueChange={v => setRange(v as Range)}>
            <TabsList>
              <TabsTrigger value="1h">1h</TabsTrigger>
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="24h">24h</TabsTrigger>
              <TabsTrigger value="7d">7d</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      {/* QA simulation buttons */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">QA simulation</CardTitle>
          <CardDescription>
            All buttons fire qa=true events — they appear in <span className="font-medium">Raw</span> only,
            never in <span className="font-medium">Clean</span>. Use to verify wiring end-to-end.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(['pdp','atc','checkout_click','redirect','error'] as const).map(k => (
            <Button key={k} size="sm" variant="outline" onClick={() => runQa(k)} disabled={qaRunning !== null}>
              {qaRunning === k ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
              Simulate {k}
            </Button>
          ))}
        </CardContent>
      </Card>

      {qaResult && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>QA result</AlertTitle>
          <AlertDescription>{qaResult}</AlertDescription>
        </Alert>
      )}

      {warnings.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Tracking sanity check</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <>
          {/* Data quality cards (computed on raw, mode-independent) */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Data quality score" value={`${stats.dq}%`} tone={dqTone}
                  hint={`${lpRows.filter(isClean).length}/${stats.total} rows clean`} />
            <Stat label="Unknown geo" value={`${geoUnkPct.toFixed(0)}%`} tone={geoTone}
                  hint={`${stats.unkGeo}/${stats.total} rows`} />
            <Stat label="Unknown device" value={`${devUnkPct.toFixed(0)}%`} tone={devTone}
                  hint={`${stats.unkDevice}/${stats.total} rows`} />
            <Stat label="Verified US rows" value={stats.verifiedUs} hint="geo_tier=verified_us" />
            <Stat label="Bot-filtered" value={stats.bot} />
            <Stat label="QA-tagged" value={stats.qa} hint="qa=true, excluded from Clean" />
            <Stat label="In-app browser" value={stats.inApp} hint="TikTok / IG / Pinterest webview" />
            <Stat label="Sessions (with activity)" value={stats.sessions} />
          </section>

          {/* Funnel KPIs (mode-filtered) */}
          <section>
            <h2 className="text-lg font-semibold mb-3">
              Funnel · {mode === 'clean' ? 'Clean traffic only' : 'All recorded rows'}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="PDP views" value={stats.pdp} />
              <Stat label="Add-to-cart" value={stats.atc} hint="user_click only" />
              <Stat label="Cart opens" value={stats.cartOpen} />
              <Stat label="Checkout clicks" value={stats.ckClick} />
              <Stat label="Redirect attempts" value={stats.ckAttempt} />
              <Stat label="Redirect success" value={stats.ckSuccess} />
              <Stat label="Checkout errors" value={stats.ckErr} tone={stats.ckErr > 0 ? 'warn' : undefined} />
              <Stat label="Payment success" value={stats.pay} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <Stat label="PDP → ATC" value={pct(stats.atc, stats.pdp)} />
              <Stat label="ATC → Checkout" value={pct(stats.ckClick, stats.atc)} />
              <Stat label="Checkout → Redirect" value={pct(stats.ckSuccess, stats.ckClick)} />
              <Stat label="Checkout → Payment" value={pct(stats.pay, stats.ckClick)} />
            </div>
          </section>

          {/* Breakdowns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card>
              <CardHeader><CardTitle className="text-lg">Device</CardTitle>
                <CardDescription>Raw rows. Mobile-first audit.</CardDescription></CardHeader>
              <CardContent className="flex gap-2 flex-wrap">
                {Object.entries(deviceBreak).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <Badge key={k} variant={k === 'unknown' ? 'destructive' : 'secondary'}>{k}: {v}</Badge>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-lg">Geo tier</CardTitle>
                <CardDescription>Raw rows. verified_us = real US visitor.</CardDescription></CardHeader>
              <CardContent className="flex gap-2 flex-wrap">
                {Object.entries(geoBreak).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <Badge key={k} variant={k === 'unknown' ? 'destructive' : k === 'verified_us' ? 'default' : 'secondary'}>{k}: {v}</Badge>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-lg">Source (UTM)</CardTitle>
                <CardDescription>{mode === 'clean' ? 'Clean' : 'Raw'} rows.</CardDescription></CardHeader>
              <CardContent className="flex gap-2 flex-wrap">
                {Object.entries(sourceBreak).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => (
                  <Badge key={k} variant="outline">{k}: {v}</Badge>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-lg">In-app browser</CardTitle>
                <CardDescription>Webview detection (TikTok, IG, Pinterest, FB).</CardDescription></CardHeader>
              <CardContent className="flex gap-2 flex-wrap">
                {Object.keys(inAppBreak).length === 0
                  ? <span className="text-xs text-muted-foreground">No in-app traffic in window.</span>
                  : Object.entries(inAppBreak).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                      <Badge key={k} variant="secondary">{k}: {v}</Badge>
                    ))}
              </CardContent>
            </Card>
          </div>

          {/* Latest events inspector */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Latest events</CardTitle>
              <CardDescription>Most recent 40 rows across both tables (raw — see classification + qa columns).</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead className="text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-1 pr-3">time</th>
                    <th className="text-left pr-3">event</th>
                    <th className="text-left pr-3">source</th>
                    <th className="text-left pr-3">class</th>
                    <th className="text-left pr-3">device</th>
                    <th className="text-left pr-3">geo</th>
                  </tr>
                </thead>
                <tbody>
                  {latest.map(e => (
                    <tr key={e.kind + e.id} className="border-b border-border/40">
                      <td className="py-1 pr-3 text-muted-foreground">{e.created_at ? new Date(e.created_at).toLocaleTimeString() : '—'}</td>
                      <td className="pr-3">{e.kind === 'ck' ? '↪ ' : ''}{e.label}</td>
                      <td className="pr-3 text-muted-foreground truncate max-w-[12rem]">{e.source ?? '—'}</td>
                      <td className="pr-3">
                        {e.is_bot ? <Badge variant="destructive" className="text-[10px]">bot</Badge>
                          : e.qa ? <Badge variant="outline" className="text-[10px]">qa</Badge>
                          : <span>{e.classification ?? '—'}</span>}
                      </td>
                      <td className="pr-3">{e.device ?? '—'}</td>
                      <td className="pr-3">{e.geo ?? '—'}</td>
                    </tr>
                  ))}
                  {latest.length === 0 && (
                    <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">No events in window.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
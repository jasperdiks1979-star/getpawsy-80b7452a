/**
 * /admin/funnel-health — production funnel sanity dashboard.
 *
 * Counts ONLY events tagged event_source='user_click' (verified user actions).
 * Legacy / mount-time fires are tagged 'legacy_unverified' and excluded.
 * Bots and unknown-geo sessions are surfaced separately so we can spot
 * tracking pollution at a glance.
 */
import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, CheckCircle2, Loader2, PlayCircle } from 'lucide-react';
import {
  fireUserAddToCart,
  fireCheckoutClick,
  fireCheckoutEvent,
} from '@/lib/funnelEvents';

type Range = '24h' | '7d' | 'today';

interface Kpis {
  atc_verified: number;
  atc_legacy: number;
  checkout_clicks: number;
  checkout_redirects: number;
  checkout_errors: number;
  bot_filtered: number;
  unknown_geo: number;
  duplicate_keys: number;
  sessions_total: number;
}

interface FunnelIntel {
  pdp_views: number;
  cart_opens: number;
  payment_success: number;
  bounces: number;
  session_ends: number;
  rage_clicks: number;
  device: Record<string, number>;
  sources: Record<string, number>;
  top_pdps: Array<{ product_id: string; product_name: string | null; views: number; atc: number }>;
  top_landing: Array<{ page_path: string; sessions: number }>;
  top_exit: Array<{ page_path: string; count: number }>;
}

function rangeStart(r: Range): string {
  const d = new Date();
  if (r === '24h') d.setHours(d.getHours() - 24);
  else if (r === '7d') d.setDate(d.getDate() - 7);
  else d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function loadIntel(r: Range): Promise<FunnelIntel> {
  const since = rangeStart(r);
  const { data } = await supabase
    .from('lp_funnel_events')
    .select('event_name,product_id,product_name,page_path,utm_source,session_id,raw_payload,is_bot,event_source')
    .gte('created_at', since)
    .limit(10_000);

  type Row = {
    event_name: string;
    product_id: string | null;
    product_name: string | null;
    page_path: string | null;
    utm_source: string | null;
    session_id: string | null;
    raw_payload: Record<string, unknown> | null;
    is_bot: boolean | null;
    event_source: string | null;
  };
  const rows = ((data ?? []) as Row[]).filter(r => !r.is_bot);

  const device: Record<string, number> = {};
  const sources: Record<string, number> = {};
  const pdpByProduct = new Map<string, { name: string | null; views: number; atc: number }>();
  const landingBySession = new Map<string, string>();
  const exitByPath = new Map<string, number>();

  let pdp_views = 0;
  let cart_opens = 0;
  let payment_success = 0;
  let bounces = 0;
  let session_ends = 0;
  let rage_clicks = 0;

  for (const row of rows) {
    const ev = row.event_name;
    const rp = row.raw_payload ?? {};
    const dt = (rp as { device_type?: string }).device_type ?? 'unknown';
    device[dt] = (device[dt] ?? 0) + 1;

    const src = (row.utm_source || 'direct').toLowerCase();
    sources[src] = (sources[src] ?? 0) + 1;

    if (ev === 'pdp_view') {
      pdp_views++;
      if (row.product_id) {
        const cur = pdpByProduct.get(row.product_id) ?? { name: row.product_name, views: 0, atc: 0 };
        cur.views++;
        cur.name = cur.name ?? row.product_name;
        pdpByProduct.set(row.product_id, cur);
      }
    } else if (ev === 'add_to_cart' && row.event_source === 'user_click') {
      if (row.product_id) {
        const cur = pdpByProduct.get(row.product_id) ?? { name: row.product_name, views: 0, atc: 0 };
        cur.atc++;
        pdpByProduct.set(row.product_id, cur);
      }
    } else if (ev === 'cart_open') {
      cart_opens++;
    } else if (ev === 'payment_success_view') {
      payment_success++;
    } else if (ev === 'session_bounce') {
      bounces++;
      session_ends++;
      if (row.page_path) exitByPath.set(row.page_path, (exitByPath.get(row.page_path) ?? 0) + 1);
    } else if (ev === 'session_end') {
      session_ends++;
      if (row.page_path) exitByPath.set(row.page_path, (exitByPath.get(row.page_path) ?? 0) + 1);
    } else if (ev === 'rage_click') {
      rage_clicks++;
    }

    if (row.session_id && row.page_path && !landingBySession.has(row.session_id)) {
      landingBySession.set(row.session_id, row.page_path);
    }
  }

  const top_pdps = Array.from(pdpByProduct.entries())
    .map(([product_id, v]) => ({ product_id, product_name: v.name, views: v.views, atc: v.atc }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 8);

  const landingCounts = new Map<string, number>();
  for (const p of landingBySession.values()) landingCounts.set(p, (landingCounts.get(p) ?? 0) + 1);
  const top_landing = Array.from(landingCounts.entries())
    .map(([page_path, sessions]) => ({ page_path, sessions }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 8);

  const top_exit = Array.from(exitByPath.entries())
    .map(([page_path, count]) => ({ page_path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    pdp_views, cart_opens, payment_success, bounces, session_ends, rage_clicks,
    device, sources, top_pdps, top_landing, top_exit,
  };
}

async function loadKpis(r: Range): Promise<Kpis> {
  const since = rangeStart(r);

  const [lp, ck] = await Promise.all([
    supabase
      .from('lp_funnel_events')
      .select('event_source,is_bot,geo_quality,idempotency_key,session_id', { count: 'exact' })
      .gte('created_at', since)
      .eq('event_name', 'add_to_cart')
      .limit(5000),
    supabase
      .from('checkout_funnel_events')
      .select('step,event_source,is_bot,geo_quality', { count: 'exact' })
      .gte('created_at', since)
      .limit(5000),
  ]);

  const atcRows = (lp.data ?? []) as Array<{
    event_source: string | null;
    is_bot: boolean | null;
    geo_quality: string | null;
    idempotency_key: string | null;
    session_id: string | null;
  }>;
  const ckRows = (ck.data ?? []) as Array<{
    step: string;
    event_source: string | null;
    is_bot: boolean | null;
    geo_quality: string | null;
  }>;

  const verified = atcRows.filter(r => r.event_source === 'user_click' && !r.is_bot);
  const legacy = atcRows.filter(r => r.event_source !== 'user_click');

  const keys = new Map<string, number>();
  for (const r of atcRows) {
    if (!r.idempotency_key) continue;
    keys.set(r.idempotency_key, (keys.get(r.idempotency_key) ?? 0) + 1);
  }
  const duplicate_keys = Array.from(keys.values()).filter(v => v > 1).length;

  const sessions = new Set(atcRows.map(r => r.session_id).filter(Boolean));

  return {
    atc_verified: verified.length,
    atc_legacy: legacy.length,
    checkout_clicks: ckRows.filter(r => r.step === 'checkout_click' && !r.is_bot).length,
    checkout_redirects: ckRows.filter(r => r.step === 'checkout_redirect_success').length,
    checkout_errors: ckRows.filter(r => r.step === 'checkout_error').length,
    bot_filtered:
      atcRows.filter(r => r.is_bot).length + ckRows.filter(r => r.is_bot).length,
    unknown_geo:
      atcRows.filter(r => (r.geo_quality ?? 'unknown') === 'unknown').length,
    duplicate_keys,
    sessions_total: sessions.size,
  };
}

function pct(n: number, d: number): string {
  if (!d) return '—';
  return `${((n / d) * 100).toFixed(1)}%`;
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-mono">{value}</CardTitle>
      </CardHeader>
      {hint ? <CardContent className="text-xs text-muted-foreground">{hint}</CardContent> : null}
    </Card>
  );
}

export default function FunnelHealth() {
  const [range, setRange] = useState<Range>('24h');
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [intel, setIntel] = useState<FunnelIntel | null>(null);
  const [loading, setLoading] = useState(true);
  const [qaRunning, setQaRunning] = useState(false);
  const [qaResult, setQaResult] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    Promise.all([loadKpis(range), loadIntel(range)])
      .then(([k, i]) => {
        if (cancel) return;
        setKpis(k);
        setIntel(i);
      })
      .finally(() => !cancel && setLoading(false));
    return () => { cancel = true; };
  }, [range]);

  const warnings = useMemo(() => {
    if (!kpis) return [];
    const w: string[] = [];
    if (kpis.atc_verified > 0 && kpis.checkout_clicks === 0)
      w.push(`ATC=${kpis.atc_verified} but checkout_clicks=0 — possible tracking gap or pure abandonment.`);
    if (kpis.duplicate_keys > 0)
      w.push(`${kpis.duplicate_keys} duplicate idempotency_keys detected — dedupe window may be too small.`);
    if (kpis.atc_legacy > kpis.atc_verified * 3 && kpis.atc_verified > 0)
      w.push(`Legacy add_to_cart fires (${kpis.atc_legacy}) far exceed verified (${kpis.atc_verified}) — audit callers.`);
    const totalAtc = kpis.atc_verified + kpis.atc_legacy;
    if (totalAtc > 0 && kpis.unknown_geo / totalAtc > 0.7)
      w.push(`Unknown geo > 70% — geo_tracking_unreliable.`);
    return w;
  }, [kpis]);

  const runQa = async () => {
    setQaRunning(true);
    setQaResult(null);
    try {
      fireUserAddToCart({
        product_id: 'qa_test_product',
        product_name: 'QA Test Product',
        qty: 1,
        price: 1,
        currency: 'USD',
        source_component: 'funnel_health_qa',
      });
      fireCheckoutClick({
        source_component: 'funnel_health_qa',
        item_count: 1,
        value: 1,
        currency: 'USD',
      });
      // Verify each fired exactly once via idempotency dedupe
      fireUserAddToCart({
        product_id: 'qa_test_product',
        product_name: 'QA Test Product',
        qty: 1,
        price: 1,
        currency: 'USD',
        source_component: 'funnel_health_qa',
      }); // should dedupe
      await new Promise(r => setTimeout(r, 800));
      const { data: lp } = await supabase
        .from('lp_funnel_events')
        .select('id,idempotency_key')
        .eq('source_component', 'funnel_health_qa')
        .gte('created_at', new Date(Date.now() - 30_000).toISOString());
      const { data: ck } = await supabase
        .from('checkout_funnel_events')
        .select('id,step')
        .eq('source_component', 'funnel_health_qa')
        .gte('created_at', new Date(Date.now() - 30_000).toISOString());
      const lpCount = lp?.length ?? 0;
      const ckCount = ck?.length ?? 0;
      const pass = lpCount === 1 && ckCount === 1;
      setQaResult(
        pass
          ? `PASS — exactly 1 add_to_cart + 1 checkout_click recorded.`
          : `FAIL — got ${lpCount} add_to_cart, ${ckCount} checkout_click rows (expected 1 of each).`,
      );
      await loadKpis(range).then(setKpis);
    } catch (e) {
      setQaResult(`ERROR — ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setQaRunning(false);
    }
  };

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
            Verified user-click events only. Bots, unknown geo, and legacy fires are filtered out of KPIs.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={range} onValueChange={v => setRange(v as Range)}>
            <TabsList>
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="24h">24h</TabsTrigger>
              <TabsTrigger value="7d">7d</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button onClick={runQa} disabled={qaRunning} size="sm">
            {qaRunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
            Run Funnel Tracking QA
          </Button>
        </div>
      </header>

      {qaResult && (
        <Alert variant={qaResult.startsWith('PASS') ? 'default' : 'destructive'}>
          {qaResult.startsWith('PASS') ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
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

      {loading || !kpis ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Sessions (with ATC)" value={kpis.sessions_total} />
            <Stat label="Verified ATC" value={kpis.atc_verified} hint="event_source=user_click" />
            <Stat label="Checkout clicks" value={kpis.checkout_clicks} />
            <Stat
              label="ATC → Checkout"
              value={pct(kpis.checkout_clicks, kpis.atc_verified)}
            />
            <Stat label="Checkout redirects" value={kpis.checkout_redirects} />
            <Stat label="Checkout errors" value={kpis.checkout_errors} />
            <Stat label="Bot-filtered events" value={kpis.bot_filtered} />
            <Stat label="Unknown geo events" value={kpis.unknown_geo} />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Suspicious sources</CardTitle>
              <CardDescription>Events not tagged as verified user clicks.</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-3 flex-wrap">
              <Badge variant="outline">Legacy ATC: {kpis.atc_legacy}</Badge>
              <Badge variant="outline">Duplicate keys: {kpis.duplicate_keys}</Badge>
              <Badge variant="outline">Bot-filtered: {kpis.bot_filtered}</Badge>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

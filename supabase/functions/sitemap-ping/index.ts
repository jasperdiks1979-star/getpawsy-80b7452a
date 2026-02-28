import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CANONICAL_HOST = 'https://getpawsy.pet';
const PING_TIMEOUT_MS = 10_000;
const RATE_LIMIT_MAX_PER_HOUR = 6;
const IDEMPOTENCY_WINDOW_MS = 10 * 60 * 1000;
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 30 * 60 * 1000;

const ENGINES = [
  { name: 'google', template: (s: string) => `https://www.google.com/ping?sitemap=${encodeURIComponent(s)}` },
  { name: 'bing', template: (s: string) => `https://www.bing.com/ping?sitemap=${encodeURIComponent(s)}` },
];

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Auth check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ ok: false, reason: 'Unauthorized' }, 200);
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) {
    return jsonResponse({ ok: false, reason: 'Invalid session' }, 200);
  }
  const userId = claims.claims.sub as string;

  // Admin check
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();

  if (!roleData) {
    return jsonResponse({ ok: false, reason: 'Admin access required' }, 200);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'ping'; // 'ping' | 'history' | 'status'
    const forceRun = body.force === true;
    const sitemapUrl = body.sitemapUrl || `${CANONICAL_HOST}/sitemap.xml`;

    // Validate sitemap URL
    if (!sitemapUrl.startsWith('https://getpawsy.pet/') || !sitemapUrl.endsWith('.xml')) {
      return jsonResponse({ ok: false, reason: 'Invalid sitemap URL. Must be https://getpawsy.pet/*.xml' });
    }

    if (action === 'history') {
      const { data: logs } = await supabase
        .from('sitemap_ping_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(40);
      return jsonResponse({ ok: true, logs: logs || [] });
    }

    if (action === 'status') {
      // Return circuit breaker + rate limit status
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count: hourlyCount } = await supabase
        .from('sitemap_ping_log')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', oneHourAgo);

      const { data: recent } = await supabase
        .from('sitemap_ping_log')
        .select('engine, status, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      const circuitStatus: Record<string, { open: boolean; consecutiveFailures: number }> = {};
      for (const engine of ENGINES) {
        const hist = (recent || []).filter(r => r.engine === engine.name).slice(0, CIRCUIT_BREAKER_THRESHOLD);
        const allFailed = hist.length >= CIRCUIT_BREAKER_THRESHOLD && hist.every(h => h.status !== 'success');
        const lastFailTime = hist[0] ? new Date(hist[0].created_at).getTime() : 0;
        circuitStatus[engine.name] = {
          open: allFailed && (Date.now() - lastFailTime < CIRCUIT_BREAKER_COOLDOWN_MS),
          consecutiveFailures: hist.findIndex(h => h.status === 'success'),
        };
      }

      return jsonResponse({
        ok: true,
        hourlyPingCount: hourlyCount || 0,
        maxPerHour: RATE_LIMIT_MAX_PER_HOUR * ENGINES.length,
        circuitStatus,
        recentPings: recent || [],
      });
    }

    // === PING ACTION ===

    // Rate limit check
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await supabase
      .from('sitemap_ping_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', oneHourAgo);

    if ((recentCount || 0) >= RATE_LIMIT_MAX_PER_HOUR * ENGINES.length && !forceRun) {
      return jsonResponse({ ok: false, reason: `Rate limit: ${recentCount} pings in last hour (max ${RATE_LIMIT_MAX_PER_HOUR * ENGINES.length})` });
    }

    // Idempotency check
    if (!forceRun) {
      const threshold = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS).toISOString();
      const { data: cached } = await supabase
        .from('sitemap_ping_log')
        .select('id, created_at')
        .eq('status', 'success')
        .eq('sitemap_url', sitemapUrl)
        .gte('created_at', threshold)
        .limit(1);

      if (cached?.length) {
        return jsonResponse({ ok: true, cached: true, reason: 'Successful ping within last 10 min', lastPingAt: cached[0].created_at });
      }
    }

    // Circuit breaker check
    const { data: cbRecent } = await supabase
      .from('sitemap_ping_log')
      .select('engine, status, created_at')
      .order('created_at', { ascending: false })
      .limit(CIRCUIT_BREAKER_THRESHOLD * 2);

    const circuitOpen: Record<string, boolean> = {};
    for (const engine of ENGINES) {
      const hist = (cbRecent || []).filter(r => r.engine === engine.name).slice(0, CIRCUIT_BREAKER_THRESHOLD);
      if (hist.length >= CIRCUIT_BREAKER_THRESHOLD && hist.every(h => h.status !== 'success')) {
        const lastTime = new Date(hist[0].created_at).getTime();
        if (Date.now() - lastTime < CIRCUIT_BREAKER_COOLDOWN_MS && !forceRun) {
          circuitOpen[engine.name] = true;
        }
      }
    }

    // Execute pings with retries
    interface PingResult {
      engine: string;
      sitemapUrl: string;
      status: 'success' | 'timeout' | 'http_error' | 'circuit_open';
      httpStatus?: number;
      duration_ms: number;
      error?: string;
      attempt: number;
    }

    const results: PingResult[] = [];
    const MAX_RETRIES = 3;
    const BACKOFF = [500, 1500, 4000];

    for (const engine of ENGINES) {
      if (circuitOpen[engine.name]) {
        results.push({ engine: engine.name, sitemapUrl, status: 'circuit_open', duration_ms: 0, error: 'Circuit breaker open (3 consecutive failures)', attempt: 0 });
        await supabase.from('sitemap_ping_log').insert({
          engine: engine.name, sitemap_url: sitemapUrl, status: 'circuit_open',
          duration_ms: 0, error_message: 'Circuit breaker open', reason: 'manual',
        });
        continue;
      }

      let lastResult: PingResult | null = null;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 1) {
          const jitter = Math.random() * 0.3 * BACKOFF[attempt - 2];
          await new Promise(r => setTimeout(r, BACKOFF[attempt - 2] + jitter));
        }

        const pingUrl = engine.template(sitemapUrl);
        const start = Date.now();
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
          const res = await fetch(pingUrl, { method: 'GET', signal: controller.signal });
          clearTimeout(timer);
          const dur = Date.now() - start;
          if (res.ok) {
            lastResult = { engine: engine.name, sitemapUrl, status: 'success', httpStatus: res.status, duration_ms: dur, attempt };
            break;
          }
          lastResult = { engine: engine.name, sitemapUrl, status: 'http_error', httpStatus: res.status, duration_ms: dur, attempt };
        } catch (e) {
          const dur = Date.now() - start;
          const msg = e instanceof Error ? e.message : String(e);
          const isTimeout = msg.includes('abort') || msg.includes('signal');
          lastResult = { engine: engine.name, sitemapUrl, status: isTimeout ? 'timeout' : 'http_error', duration_ms: dur, error: msg, attempt };
        }
      }

      if (lastResult) {
        results.push(lastResult);
        await supabase.from('sitemap_ping_log').insert({
          engine: engine.name, sitemap_url: sitemapUrl, status: lastResult.status,
          http_status: lastResult.httpStatus || null, duration_ms: lastResult.duration_ms,
          error_message: lastResult.error || null, reason: 'manual',
        });
      }
    }

    const succeeded = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status !== 'success' && r.status !== 'circuit_open').length;
    const blocked = results.filter(r => r.status === 'circuit_open').length;
    const overallStatus = succeeded === results.length ? 'ok' : succeeded > 0 ? 'warning' : 'error';

    return jsonResponse({
      ok: true,
      overallStatus,
      results,
      summary: { succeeded, failed, circuitBlocked: blocked, total: results.length },
    });
  } catch (err) {
    return jsonResponse({ ok: false, reason: err instanceof Error ? err.message : 'Internal error' });
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CANONICAL_HOST = 'https://getpawsy.pet';
const INDEXNOW_KEY = 'e8f4a2b1c9d7e6f5a3b2c1d0e9f8a7b6';
const PING_TIMEOUT_MS = 10_000;
const RATE_LIMIT_MAX_PER_HOUR = 6;
const IDEMPOTENCY_WINDOW_MS = 10 * 60 * 1000;

const INDEXNOW_ENDPOINTS = [
  { name: 'indexnow', url: 'https://api.indexnow.org/indexnow' },
  { name: 'bing', url: 'https://www.bing.com/indexnow' },
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
  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) {
    return jsonResponse({ ok: false, reason: 'Invalid session' }, 200);
  }

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (!roleData) {
    return jsonResponse({ ok: false, reason: 'Admin access required' }, 200);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'ping';
    const forceRun = body.force === true;
    const sitemapUrl = body.sitemapUrl || `${CANONICAL_HOST}/sitemap.xml`;

    if (!sitemapUrl.startsWith('https://getpawsy.pet/') || !sitemapUrl.endsWith('.xml')) {
      return jsonResponse({ ok: false, reason: 'Invalid sitemap URL' });
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

      return jsonResponse({
        ok: true,
        hourlyPingCount: hourlyCount || 0,
        maxPerHour: RATE_LIMIT_MAX_PER_HOUR * INDEXNOW_ENDPOINTS.length,
        recentPings: recent || [],
      });
    }

    // === PING ACTION — uses IndexNow only (Google/Bing sitemap pings are deprecated) ===

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await supabase
      .from('sitemap_ping_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', oneHourAgo);

    if ((recentCount || 0) >= RATE_LIMIT_MAX_PER_HOUR * INDEXNOW_ENDPOINTS.length && !forceRun) {
      return jsonResponse({ ok: false, reason: `Rate limit: ${recentCount} pings in last hour` });
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
        return jsonResponse({ ok: true, cached: true, reason: 'Already pinged within 10 min', lastPingAt: cached[0].created_at });
      }
    }

    // Extract sitemap URLs for IndexNow submission
    const urlsToNotify = [
      `${CANONICAL_HOST}/`,
      sitemapUrl.replace('.xml', '').replace('sitemap-', '/').replace('sitemap', '/'),
    ].filter(u => u.startsWith('https://'));

    interface PingResult {
      engine: string;
      sitemapUrl: string;
      status: 'success' | 'timeout' | 'http_error';
      httpStatus?: number;
      duration_ms: number;
      error?: string;
    }

    const results: PingResult[] = [];

    for (const endpoint of INDEXNOW_ENDPOINTS) {
      const start = Date.now();
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
        const res = await fetch(endpoint.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            host: 'getpawsy.pet',
            key: INDEXNOW_KEY,
            keyLocation: `${CANONICAL_HOST}/${INDEXNOW_KEY}.txt`,
            urlList: [sitemapUrl, `${CANONICAL_HOST}/`],
          }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        const dur = Date.now() - start;
        const ok = res.status >= 200 && res.status < 300;
        const result: PingResult = {
          engine: endpoint.name,
          sitemapUrl,
          status: ok ? 'success' : 'http_error',
          httpStatus: res.status,
          duration_ms: dur,
        };
        results.push(result);

        await supabase.from('sitemap_ping_log').insert({
          engine: endpoint.name, sitemap_url: sitemapUrl, status: result.status,
          http_status: res.status, duration_ms: dur, reason: 'manual',
        });
      } catch (e) {
        const dur = Date.now() - start;
        const msg = e instanceof Error ? e.message : String(e);
        const isTimeout = msg.includes('abort');
        const result: PingResult = {
          engine: endpoint.name, sitemapUrl,
          status: isTimeout ? 'timeout' : 'http_error',
          duration_ms: dur, error: msg,
        };
        results.push(result);

        await supabase.from('sitemap_ping_log').insert({
          engine: endpoint.name, sitemap_url: sitemapUrl, status: result.status,
          duration_ms: dur, error_message: msg, reason: 'manual',
        });
      }
    }

    const succeeded = results.filter(r => r.status === 'success').length;
    const overallStatus = succeeded === results.length ? 'ok' : succeeded > 0 ? 'warning' : 'error';

    return jsonResponse({
      ok: true,
      overallStatus,
      results,
      summary: { succeeded, failed: results.length - succeeded, total: results.length },
    });
  } catch (err) {
    return jsonResponse({ ok: false, reason: err instanceof Error ? err.message : 'Internal error' });
  }
});

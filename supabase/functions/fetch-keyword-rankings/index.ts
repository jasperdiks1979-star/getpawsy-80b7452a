import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface GSCResponse {
  rows?: SearchAnalyticsRow[];
}

// ============= JWT / AUTH =============

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const serviceAccount = JSON.parse(serviceAccountJson);

  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const signatureInput = `${headerB64}.${payloadB64}`;

  const privateKeyPem = serviceAccount.private_key;
  const pemContents = privateKeyPem
    .replace("-----BEGIN PRIVATE KEY-----", '')
    .replace("-----END PRIVATE KEY-----", '')
    .replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), (c: string) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey, encoder.encode(signatureInput)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${signatureInput}.${signatureB64}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok) {
    throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

// ============= GSC FETCH =============

async function fetchGSCData(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
  rowLimit = 5000,
): Promise<GSCResponse> {
  const body = {
    startDate,
    endDate,
    dimensions,
    rowLimit,
    startRow: 0,
  };
  console.log(`[GSC] API request: dims=${dimensions.join(',')}, range=${startDate}→${endDate}, limit=${rowLimit}`);

  const response = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GSC API error (${response.status}): ${error}`);
  }

  return await response.json();
}

// ============= PAGE TYPE & SLUG MAPPING =============

type PageType = 'homepage' | 'guide' | 'blog' | 'product' | 'collection' | 'category' | 'static' | 'bestseller';

interface PageMatch {
  slug: string;
  pageType: PageType;
}

// Known guide slugs — loaded once per run from guides index
let _knownSlugs: Set<string> | null = null;

async function loadKnownSlugs(): Promise<Set<string>> {
  if (_knownSlugs) return _knownSlugs;
  try {
    const res = await fetch('https://getpawsy.pet/data/guides/index.json');
    if (res.ok) {
      const guides = await res.json();
      _knownSlugs = new Set(guides.map((g: { slug: string }) => g.slug.toLowerCase()));
      console.log(`[GSC] Loaded ${_knownSlugs.size} known guide slugs from index.json`);
    } else {
      console.warn('[GSC] Failed to fetch guides index, using pattern matching only');
      _knownSlugs = new Set();
    }
  } catch (e) {
    console.warn('[GSC] Error loading guide slugs:', e);
    _knownSlugs = new Set();
  }
  return _knownSlugs;
}

// Paths that should never be indexed / tracked
const SKIP_PATHS = new Set([
  'auth', 'track', 'cart', 'cookies', 'login', 'sitemap', 'robots', 'favicon',
  'admin', 'checkout', 'order', 'dashboard', 'profile', 'orders', 'payment-success',
  'install', 'live-map', 'google-review', 'security', '__ops',
]);

function normalizeGscUrl(rawUrl: string): { pathname: string } | null {
  try {
    const url = new URL(rawUrl.startsWith('http') ? rawUrl : `https://getpawsy.pet${rawUrl}`);
    const pathname = url.pathname.replace(/\/+$/, '').toLowerCase() || '/';
    return { pathname };
  } catch {
    return null;
  }
}

function classifyPage(pathname: string, knownSlugs: Set<string>): PageMatch | null {
  if (pathname === '/' || pathname === '') {
    return { slug: '__homepage__', pageType: 'homepage' };
  }

  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return { slug: '__homepage__', pageType: 'homepage' };

  const first = parts[0];

  if (SKIP_PATHS.has(first)) return null;

  // /guides/slug
  if (first === 'guides' && parts[1]) {
    return { slug: parts[1], pageType: 'guide' };
  }

  // /blog or /blog/slug
  if (first === 'blog') {
    if (parts[1]) return { slug: parts[1], pageType: 'blog' };
    return { slug: '__blog_index__', pageType: 'blog' };
  }

  // /product/slug
  if (first === 'product' && parts[1]) {
    return { slug: parts[1], pageType: 'product' };
  }

  // /products (index page)
  if (first === 'products') {
    return { slug: '__products_index__', pageType: 'product' };
  }

  // /bestseller/slug or /bestsellers
  if (first === 'bestseller' || first === 'bestsellers') {
    if (parts[1]) return { slug: parts[1], pageType: 'bestseller' };
    return { slug: '__bestsellers__', pageType: 'bestseller' };
  }

  // /collections/slug or /c/slug
  if ((first === 'collections' || first === 'c') && parts[1]) {
    return { slug: parts[1], pageType: 'collection' };
  }
  if (first === 'collections' || first === 'c') {
    return { slug: '__collections_index__', pageType: 'collection' };
  }

  // /dogs/*, /cats/* (category sub-routes)
  if (first === 'dogs' || first === 'cats') {
    const subSlug = parts.slice(1).join('/') || first;
    return { slug: subSlug, pageType: 'category' };
  }

  // Static pages
  const staticPages = new Set(['about', 'contact', 'shipping', 'returns', 'privacy', 'terms', 'faq', 'search']);
  if (staticPages.has(first) && parts.length === 1) {
    return { slug: first, pageType: 'static' };
  }

  // Root-level SEO pages
  if (parts.length === 1) {
    const slug = parts[0];
    if (knownSlugs.has(slug)) return { slug, pageType: 'guide' };
    if (/^best-/.test(slug) || /-202[4-9]$/.test(slug) || /^how-to-/.test(slug) ||
        /^choosing-/.test(slug) || /-vs-/.test(slug) || /^guide-/.test(slug) ||
        /^top-/.test(slug) || /^safest-/.test(slug) || /-guide$/.test(slug)) {
      return { slug, pageType: 'guide' };
    }
    return { slug, pageType: 'collection' };
  }

  // Fallback: nested path with known slug
  const lastPart = parts[parts.length - 1];
  if (lastPart && knownSlugs.has(lastPart)) {
    return { slug: lastPart, pageType: 'guide' };
  }

  return null;
}

// Legacy wrapper for backward compatibility
function matchPageToSlug(pageUrl: string, knownSlugs: Set<string>): string | null {
  const norm = normalizeGscUrl(pageUrl);
  if (!norm) return null;
  const match = classifyPage(norm.pathname, knownSlugs);
  return match?.slug || null;
}

function matchPageFull(pageUrl: string, knownSlugs: Set<string>): PageMatch | null {
  const norm = normalizeGscUrl(pageUrl);
  if (!norm) return null;
  return classifyPage(norm.pathname, knownSlugs);
}

// ============= CONCURRENCY LOCK =============

// deno-lint-ignore no-explicit-any
async function acquireSyncLock(db: any, reason: string): Promise<{ lockId: string | null; error: string | null }> {
  // Check for running syncs (with 10-minute timeout safeguard)
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: running } = await db
    .from('gsc_sync_runs')
    .select('id, started_at')
    .eq('status', 'running')
    .gte('started_at', tenMinAgo)
    .limit(1);

  if (running && running.length > 0) {
    return { lockId: null, error: 'SYNC_IN_PROGRESS' };
  }

  // Mark any stale "running" entries as failed (older than 10 min)
  await db
    .from('gsc_sync_runs')
    .update({ status: 'error', error_message: 'Timed out (exceeded 10 min)', finished_at: new Date().toISOString() })
    .eq('status', 'running')
    .lt('started_at', tenMinAgo);

  // Create new run record
  const { data: run, error } = await db
    .from('gsc_sync_runs')
    .insert({ reason, status: 'running', days: 90 })
    .select('id')
    .single();

  if (error || !run) {
    return { lockId: null, error: `Failed to create sync run: ${error?.message || 'unknown'}` };
  }

  return { lockId: run.id, error: null };
}

async function releaseSyncLock(
  // deno-lint-ignore no-explicit-any
  db: any,
  lockId: string,
  result: {
    status: string;
    guideCount: number;
    rowsUpserted: number;
    pagesWithData: number;
    totalImpressions: number;
    totalClicks: number;
    totalRawRows: number;
    unmatchedRows: number;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
  }
) {
  const startedAt = await db.from('gsc_sync_runs').select('started_at').eq('id', lockId).single();
  const durationMs = startedAt.data ? Date.now() - new Date(startedAt.data.started_at).getTime() : 0;

  await db.from('gsc_sync_runs').update({
    status: result.status,
    finished_at: new Date().toISOString(),
    duration_ms: durationMs,
    guide_count: result.guideCount,
    rows_upserted: result.rowsUpserted,
    pages_with_data: result.pagesWithData,
    total_impressions: result.totalImpressions,
    total_clicks: result.totalClicks,
    total_raw_rows: result.totalRawRows,
    unmatched_rows: result.unmatchedRows,
    error_message: result.errorMessage || null,
    metadata: result.metadata || null,
  }).eq('id', lockId);
}

// ============= CORE SYNC SERVICE =============

async function runGSCSync(
  // deno-lint-ignore no-explicit-any
  adminSupabase: any,
  serviceAccountJson: string,
  reason: string,
): Promise<Response> {
  const SITE_URL = 'sc-domain:getpawsy.pet';
  console.log(`[GSC Sync] === START (reason: ${reason}) ===`);

  // 1. Acquire lock
  const { lockId, error: lockError } = await acquireSyncLock(adminSupabase, reason);
  if (!lockId) {
    console.log(`[GSC Sync] Lock denied: ${lockError}`);
    return new Response(
      JSON.stringify({ ok: false, error: lockError, stage: 'lock' }),
      { status: lockError === 'SYNC_IN_PROGRESS' ? 409 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log(`[GSC Sync] Lock acquired: ${lockId}`);

  try {
    // 2. Load known guide slugs
    _knownSlugs = null; // reset cache for fresh load
    const knownSlugs = await loadKnownSlugs();
    console.log(`[GSC Sync] Known guide slugs: ${knownSlugs.size}`);

    // 3. Date range
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() - 3);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 90);
    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    const startStr = formatDate(startDate);
    const endStr = formatDate(endDate);

    console.log(`[GSC Sync] Date range: ${startStr} → ${endStr}, property: ${SITE_URL}`);

    // 3. Get access token
    const accessToken = await getAccessToken(serviceAccountJson);
    console.log('[GSC Sync] Access token obtained');

    // 4. Fetch page-level data
    const pageData = await fetchGSCData(accessToken, SITE_URL, startStr, endStr, ['page'], 5000);
    const pageRows = pageData.rows || [];
    console.log(`[GSC Sync] Page-level rows: ${pageRows.length}`);

    // 5. Fetch page+query data
    const queryData = await fetchGSCData(accessToken, SITE_URL, startStr, endStr, ['page', 'query'], 5000);
    const queryRows = queryData.rows || [];
    console.log(`[GSC Sync] Page+query rows: ${queryRows.length}`);

    // Debug: detailed URL analysis
    if (pageRows.length > 0) {
      const matched = pageRows.filter(r => matchPageToSlug(r.keys[0], knownSlugs) !== null);
      const unmatched = pageRows.filter(r => matchPageToSlug(r.keys[0], knownSlugs) === null);
      
      // Path prefix analysis for unmatched URLs
      const prefixCounts: Record<string, number> = {};
      for (const r of unmatched) {
        try {
          const u = new URL(r.keys[0]);
          const prefix = '/' + (u.pathname.split('/').filter(Boolean)[0] || '(root)');
          prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
        } catch { /* skip */ }
      }
      const topPrefixes = Object.entries(prefixCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

      console.log(`[GSC Sync] DEBUG: ${matched.length} matched, ${unmatched.length} unmatched out of ${pageRows.length} page rows`);
      console.log(`[GSC Sync] Known slugs (${knownSlugs.size}): ${[...knownSlugs].slice(0, 5).join(', ')}...`);
      console.log(`[GSC Sync] First 10 MATCHED:\n  ${matched.length > 0 ? matched.slice(0, 10).map(r => `${r.keys[0]} → ${matchPageToSlug(r.keys[0], knownSlugs)}`).join('\n  ') : '(none)'}`);
      console.log(`[GSC Sync] First 20 UNMATCHED:\n  ${unmatched.slice(0, 20).map(r => r.keys[0]).join('\n  ')}`);
      console.log(`[GSC Sync] Unmatched path prefixes: ${topPrefixes.map(([p, c]) => `${p}(${c})`).join(', ')}`);
      
      if (matched.length === 0 && pageRows.length > 0) {
        console.warn(`[GSC Sync] ⚠️ WARNING: ${pageRows.length} GSC rows but 0 matched guides. Guide pages (/guides/*) may not be indexed by Google yet. Top URL patterns: ${topPrefixes.slice(0, 5).map(([p]) => p).join(', ')}`);
      }
    }

    if (pageRows.length === 0 && queryRows.length === 0) {
      console.log('[GSC Sync] No data returned from GSC API');
      await releaseSyncLock(adminSupabase, lockId, {
        status: 'no_data',
        guideCount: 0, rowsUpserted: 0, pagesWithData: 0,
        totalImpressions: 0, totalClicks: 0, totalRawRows: 0, unmatchedRows: 0,
        errorMessage: 'GSC API returned 0 rows',
        metadata: { siteUrl: SITE_URL, startDate: startStr, endDate: endStr },
      });
      return new Response(
        JSON.stringify({
          ok: true, success: true, count: 0, queryCount: 0, status: 'no_data',
          totalRawRows: 0, unmatchedRows: 0, runId: lockId,
          message: `No rows from GSC for ${SITE_URL} (${startStr}→${endStr}). Guides may not be indexed yet.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Aggregate per slug with page type
    const slugAggregates: Record<string, {
      impressions: number; clicks: number; positions: number[]; queries: string[];
      pageType: PageType;
    }> = {};
    let unmatchedCount = 0;

    // Breakdown counters per pageType
    const pageTypeStats: Record<string, { count: number; impressions: number; clicks: number }> = {};

    for (const row of queryRows) {
      const match = matchPageFull(row.keys[0], knownSlugs);
      if (!match) { unmatchedCount++; continue; }
      const { slug, pageType } = match;
      if (!slugAggregates[slug]) {
        slugAggregates[slug] = { impressions: 0, clicks: 0, positions: [], queries: [], pageType };
      }
      slugAggregates[slug].impressions += row.impressions;
      slugAggregates[slug].clicks += row.clicks;
      slugAggregates[slug].positions.push(row.position);
      const query = row.keys[1];
      if (query && !slugAggregates[slug].queries.includes(query)) {
        slugAggregates[slug].queries.push(query);
      }
    }

    // Override with page-level totals (more accurate)
    for (const row of pageRows) {
      const match = matchPageFull(row.keys[0], knownSlugs);
      if (!match) { unmatchedCount++; continue; }
      const { slug, pageType } = match;
      if (!slugAggregates[slug]) {
        slugAggregates[slug] = { impressions: 0, clicks: 0, positions: [], queries: [], pageType };
      }
      slugAggregates[slug].impressions = row.impressions;
      slugAggregates[slug].clicks = row.clicks;
      slugAggregates[slug].positions = [row.position];
    }

    // Build pageType stats
    for (const [, agg] of Object.entries(slugAggregates)) {
      const pt = agg.pageType;
      if (!pageTypeStats[pt]) pageTypeStats[pt] = { count: 0, impressions: 0, clicks: 0 };
      pageTypeStats[pt].count++;
      pageTypeStats[pt].impressions += agg.impressions;
      pageTypeStats[pt].clicks += agg.clicks;
    }

    const now = new Date().toISOString();
    const rankings = Object.entries(slugAggregates).map(([slug, agg]) => {
      const avgPos = agg.positions.reduce((s, p) => s + p, 0) / agg.positions.length;
      const ctr = agg.impressions > 0 ? agg.clicks / agg.impressions : 0;
      return {
        keyword: slug, slug,
        position: Math.round(avgPos * 10) / 10,
        clicks: agg.clicks, impressions: agg.impressions,
        ctr: Math.round(ctr * 10000) / 10000,
        country: 'all', device: 'all',
        tracked_date: endStr, last_synced_at: now,
      };
    });

    const totalImpressions = rankings.reduce((s, r) => s + r.impressions, 0);
    const totalClicks = rankings.reduce((s, r) => s + r.clicks, 0);

    console.log(`[GSC Sync] Matched ${rankings.length} pages (${Object.entries(pageTypeStats).map(([t,s]) => `${t}:${s.count}`).join(', ')}), ${totalImpressions} total impressions, ${totalClicks} total clicks`);

    // 7. Query-level rows
    const queryRankings = queryRows
      .filter(row => matchPageToSlug(row.keys[0], knownSlugs) !== null)
      .map(row => ({
        keyword: row.keys[1], slug: matchPageToSlug(row.keys[0], knownSlugs),
        position: Math.round(row.position * 10) / 10,
        clicks: row.clicks, impressions: row.impressions,
        ctr: Math.round(row.ctr * 10000) / 10000,
        country: 'all', device: 'all',
        tracked_date: endStr, last_synced_at: now,
      }));

    // 8. DB Upsert
    let rowsUpserted = 0;
    const { error: upsertError } = await adminSupabase
      .from('keyword_rankings')
      .upsert(rankings, { onConflict: 'keyword,country,device,tracked_date' });

    if (upsertError) {
      console.error('[GSC Sync] Slug upsert FAILED:', upsertError);
      throw new Error(`DB upsert failed: ${upsertError.message}`);
    }
    rowsUpserted += rankings.length;

    if (queryRankings.length > 0) {
      const { error: qErr } = await adminSupabase
        .from('keyword_rankings')
        .upsert(queryRankings, { onConflict: 'keyword,country,device,tracked_date' });
      if (qErr) {
        console.warn('[GSC Sync] Query upsert warning:', qErr.message);
      } else {
        rowsUpserted += queryRankings.length;
      }
    }

    console.log(`[GSC Sync] DB upserted ${rowsUpserted} rows`);

    // 9. Release lock with success
    const finalStatus = totalImpressions > 0 ? 'success' : 'no_data';
    await releaseSyncLock(adminSupabase, lockId, {
      status: finalStatus,
      guideCount: rankings.length,
      rowsUpserted,
      pagesWithData: rankings.filter(r => r.impressions > 0).length,
      totalImpressions, totalClicks,
      totalRawRows: pageRows.length + queryRows.length,
      unmatchedRows: unmatchedCount,
      metadata: {
        dateRange: { start: startStr, end: endStr },
        slugs: rankings.map(r => ({ slug: r.slug, impressions: r.impressions, clicks: r.clicks, position: r.position })),
      },
    });

    console.log(`[GSC Sync] === DONE (${finalStatus}) ===`);

    // Build debug info for frontend
    const unmatchedUrls = pageRows.filter(r => matchPageToSlug(r.keys[0], knownSlugs) === null);
    const prefixCounts: Record<string, number> = {};
    for (const r of unmatchedUrls) {
      try { const u = new URL(r.keys[0]); const p = '/' + (u.pathname.split('/').filter(Boolean)[0] || '(root)'); prefixCounts[p] = (prefixCounts[p] || 0) + 1; } catch { /* */ }
    }
    const topUnmatchedPrefixes = Object.entries(prefixCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([p, c]) => ({ prefix: p, count: c }));

    return new Response(
      JSON.stringify({
        ok: true, success: true, status: finalStatus,
        count: rankings.length, queryCount: queryRankings.length,
        rowsUpserted, unmatchedRows: unmatchedCount,
        totalRawRows: pageRows.length + queryRows.length,
        totalImpressions, totalClicks,
        syncedAt: now, runId: lockId,
        dateRange: { start: startStr, end: endStr },
        knownGuideCount: knownSlugs.size,
        pageTypeBreakdown: pageTypeStats,
        slugs: rankings.map(r => ({
          slug: r.slug, impressions: r.impressions, clicks: r.clicks, position: r.position,
        })),
        debug: {
          matchedPages: rankings.length,
          unmatchedPageRows: unmatchedUrls.length,
          topUnmatchedPrefixes,
          first20Unmatched: unmatchedUrls.slice(0, 20).map(r => r.keys[0]),
          warning: rankings.length === 0 && pageRows.length > 0
            ? `GSC returned ${pageRows.length} page rows but 0 matched any of ${knownSlugs.size} known guide slugs. Guide pages under /guides/ may not be indexed yet. Top URL patterns in GSC: ${topUnmatchedPrefixes.slice(0, 3).map(p => p.prefix).join(', ')}`
            : null,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[GSC Sync] === FAILED: ${errMsg} ===`);
    await releaseSyncLock(adminSupabase, lockId, {
      status: 'error',
      guideCount: 0, rowsUpserted: 0, pagesWithData: 0,
      totalImpressions: 0, totalClicks: 0, totalRawRows: 0, unmatchedRows: 0,
      errorMessage: errMsg,
    });
    return new Response(
      JSON.stringify({ ok: false, error: errMsg, stage: 'sync', runId: lockId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// ============= MAIN HANDLER =============

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    if (!serviceAccountJson) {
      return new Response(
        JSON.stringify({ ok: false, error: 'GOOGLE_SERVICE_ACCOUNT_JSON secret not configured' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    // ============= ACTION: CRON SYNC (no auth required — called by pg_cron) =============
    if (action === 'cron_sync') {
      // Verify auto-sync is enabled
      const { data: settings } = await adminSupabase
        .from('gsc_sync_settings')
        .select('auto_sync_enabled')
        .eq('id', 'default')
        .single();

      if (!settings?.auto_sync_enabled) {
        console.log('[GSC Cron] Auto-sync is disabled, skipping');
        return new Response(
          JSON.stringify({ ok: true, skipped: true, reason: 'auto_sync_disabled' }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return await runGSCSync(adminSupabase, serviceAccountJson, 'cron');
    }

    // ============= PIPELINE RUN (called by run-all with service role key — already authenticated) =============
    if (body.source === 'pipeline_run') {
      console.log('[GSC] Pipeline run — skipping user auth (service role authenticated)');
      return await runGSCSync(adminSupabase, serviceAccountJson, 'pipeline');
    }

    // ============= AUTH CHECK (for manual actions) =============
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await authSupabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: roleData } = await adminSupabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============= ACTION: SYNC (manual) =============
    if (action === 'sync') {
      return await runGSCSync(adminSupabase, serviceAccountJson, 'manual');
    }

    // ============= ACTION: GET SYNC RUNS =============
    if (action === 'get_sync_runs') {
      const { data: runs, error } = await adminSupabase
        .from('gsc_sync_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(body.limit || 10);

      if (error) throw error;
      return new Response(
        JSON.stringify({ runs: runs || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============= ACTION: GET/UPDATE SYNC SETTINGS =============
    if (action === 'get_sync_settings') {
      const { data: settings } = await adminSupabase
        .from('gsc_sync_settings')
        .select('*')
        .eq('id', 'default')
        .single();

      return new Response(
        JSON.stringify({ settings: settings || { auto_sync_enabled: true, sync_hour: 3, sync_minute: 30 } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === 'update_sync_settings') {
      const { auto_sync_enabled } = body;
      const { error } = await adminSupabase
        .from('gsc_sync_settings')
        .update({ auto_sync_enabled, updated_at: new Date().toISOString(), updated_by: user.id })
        .eq('id', 'default');

      if (error) throw error;
      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============= ACTION: GET GUIDE METRICS =============
    if (action === 'get_guide_metrics') {
      const { data: metrics, error } = await adminSupabase
        .from('keyword_rankings')
        .select('*')
        .not('slug', 'is', null)
        .order('tracked_date', { ascending: false })
        .limit(500);

      if (error) throw error;

      const { data: lastSync } = await adminSupabase
        .from('keyword_rankings')
        .select('last_synced_at')
        .not('last_synced_at', 'is', null)
        .order('last_synced_at', { ascending: false })
        .limit(1);

      return new Response(
        JSON.stringify({
          metrics: metrics || [],
          lastSyncedAt: lastSync?.[0]?.last_synced_at || null,
          count: metrics?.length || 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============= ACTION: ADD KEYWORD =============
    if (action === 'add_keyword') {
      const { keyword } = body;
      if (!keyword || typeof keyword !== 'string') {
        return new Response(
          JSON.stringify({ error: 'Keyword is required' }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: insertError } = await adminSupabase
        .from('keyword_watchlist')
        .insert({ keyword: keyword.toLowerCase().trim(), added_by: user.id });

      if (insertError) {
        if (insertError.code === '23505') {
          return new Response(
            JSON.stringify({ error: 'Keyword already exists' }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw insertError;
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============= ACTION: GSC DIAGNOSTIC =============
    if (action === 'gsc_diagnostic') {
      const SITE_URL = 'sc-domain:getpawsy.pet';
      const today = new Date();
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() - 3);
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 7);
      const formatDate = (d: Date) => d.toISOString().split('T')[0];
      const startStr = formatDate(startDate);
      const endStr = formatDate(endDate);

      let serviceAccountEmail = 'unknown';
      try {
        const sa = JSON.parse(serviceAccountJson);
        serviceAccountEmail = sa.client_email || 'unknown';
      } catch { /* ignore */ }

      try {
        const accessToken = await getAccessToken(serviceAccountJson);
        const gscData = await fetchGSCData(accessToken, SITE_URL, startStr, endStr, ['page'], 20);

        if (!gscData.rows || gscData.rows.length === 0) {
          return new Response(
            JSON.stringify({
              status: 'NO_DATA', property: SITE_URL, propertyType: 'DOMAIN',
              serviceAccountEmail, dateRange: { start: startStr, end: endStr },
              rowsFetched: 0, connected: true,
              possible_causes: [
                'New domain (insufficient crawl history)',
                'No indexed guide pages yet',
                'Service account may lack full access',
                'GSC data delay (up to 3–5 days)',
              ],
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            status: 'OK', property: SITE_URL, propertyType: 'DOMAIN',
            serviceAccountEmail, dateRange: { start: startStr, end: endStr },
            rowsFetched: gscData.rows.length, connected: true,
            sampleRows: gscData.rows.slice(0, 5).map(r => ({
              page: r.keys[0], impressions: r.impressions,
              clicks: r.clicks, position: Math.round(r.position * 10) / 10,
            })),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (diagError) {
        return new Response(
          JSON.stringify({
            status: 'ERROR', property: SITE_URL, propertyType: 'DOMAIN',
            serviceAccountEmail, connected: false,
            issue: diagError instanceof Error ? diagError.message : 'Unknown error',
            fix_recommendation: diagError instanceof Error && diagError.message.includes('Token exchange')
              ? 'Service account credentials may be invalid. Re-upload GOOGLE_SERVICE_ACCOUNT_JSON.'
              : diagError instanceof Error && diagError.message.includes('403')
              ? 'Service account lacks permission. Grant OWNER access in Google Search Console.'
              : 'Check that the Search Console API is enabled in Google Cloud Console.',
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Valid: sync, cron_sync, get_sync_runs, get_sync_settings, update_sync_settings, get_guide_metrics, add_keyword, gsc_diagnostic' }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[GSC] Unhandled error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

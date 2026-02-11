import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============= JWT / AUTH for GSC =============

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

  const pemContents = serviceAccount.private_key
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

// ============= GUIDE SLUG MATCHING =============

let _knownSlugs: Set<string> | null = null;

async function loadKnownSlugs(): Promise<Set<string>> {
  if (_knownSlugs) return _knownSlugs;
  try {
    const res = await fetch('https://getpawsy.pet/data/guides/index.json');
    if (res.ok) {
      const guides = await res.json();
      _knownSlugs = new Set(guides.map((g: { slug: string }) => g.slug.toLowerCase()));
    } else {
      _knownSlugs = new Set();
    }
  } catch {
    _knownSlugs = new Set();
  }
  return _knownSlugs;
}

function extractSlugFromUrl(pageUrl: string): string | null {
  try {
    const url = new URL(pageUrl.startsWith('http') ? pageUrl : `https://example.com${pageUrl}`);
    const pathname = url.pathname.replace(/\/+$/, '').replace(/^\/+/, '');
    if (!pathname) return null;
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] === 'guides' && parts[1]) return parts[1].toLowerCase().trim();
    if (parts.length === 1) return parts[0].toLowerCase().trim();
    return null;
  } catch {
    const match = pageUrl.match(/\/([a-z0-9-]+)\/?(?:\?.*)?$/i);
    return match ? match[1].toLowerCase().trim() : null;
  }
}

function matchPageToSlug(pageUrl: string, knownSlugs: Set<string>): string | null {
  const slug = extractSlugFromUrl(pageUrl);
  if (!slug || slug.length < 5) return null;

  const skipPaths = ['auth', 'track', 'cart', 'cookies', 'contact', 'about', 'shipping',
    'blog', 'products', 'admin', 'login', 'sitemap', 'robots', 'favicon',
    'bestseller', 'product', 'category', 'search', 'checkout', 'order',
    'privacy', 'terms', 'security', 'install', 'live-map', 'google-review'];
  if (skipPaths.includes(slug)) return null;

  if (knownSlugs.has(slug)) return slug;
  if (/^best-/.test(slug) || /-202[4-9]$/.test(slug) || /^how-to-/.test(slug) ||
      /^choosing-/.test(slug) || /-vs-/.test(slug) || /^guide-/.test(slug)) return slug;
  for (const known of knownSlugs) {
    if (slug.endsWith(known) || slug === known) return known;
  }
  return null;
}

// ============= MAIN HANDLER =============

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    if (!serviceAccountJson) {
      console.error('[rank-harvest-cron] Missing GOOGLE_SERVICE_ACCOUNT_JSON');
      return new Response(
        JSON.stringify({ error: 'Missing GSC credentials' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SITE_URL = 'sc-domain:getpawsy.pet';

    // Date range: last 7 days (with 3-day delay)
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() - 3);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7);

    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    const startStr = formatDate(startDate);
    const endStr = formatDate(endDate);

    console.log(`[rank-harvest-cron] Fetching ${startStr} to ${endStr}`);

    _knownSlugs = null;
    const knownSlugs = await loadKnownSlugs();
    console.log(`[rank-harvest-cron] Known guide slugs: ${knownSlugs.size}`);

    const accessToken = await getAccessToken(serviceAccountJson);

    // Fetch page + query level data
    const response = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: startStr,
          endDate: endStr,
          dimensions: ['page', 'query'],
          rowLimit: 2000,
          startRow: 0,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GSC API error (${response.status}): ${error}`);
    }

    const gscData = await response.json();
    const rows = gscData.rows || [];

    console.log(`[rank-harvest-cron] Got ${rows.length} raw rows`);

    if (rows.length === 0) {
      // Log empty harvest
      await adminSupabase.from('cron_job_logs').insert({
        job_name: 'rank-harvest-cron',
        status: 'completed',
        success: true,
        items_processed: 0,
        details: { reason: 'no_data', dateRange: { start: startStr, end: endStr } },
      });

      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No GSC data available' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Aggregate per slug
    const slugAggregates: Record<string, {
      impressions: number; clicks: number; positions: number[]; queries: string[];
    }> = {};

    let boostCandidateCount = 0;

    for (const row of rows) {
      const pageUrl = row.keys[0];
      const query = row.keys[1];
      const slug = matchPageToSlug(pageUrl, knownSlugs);
      if (!slug) continue;

      if (!slugAggregates[slug]) {
        slugAggregates[slug] = { impressions: 0, clicks: 0, positions: [], queries: [] };
      }

      slugAggregates[slug].impressions += row.impressions;
      slugAggregates[slug].clicks += row.clicks;
      slugAggregates[slug].positions.push(row.position);
      if (!slugAggregates[slug].queries.includes(query)) {
        slugAggregates[slug].queries.push(query);
      }
    }

    // Determine growth mode
    const totalImpressions = Object.values(slugAggregates).reduce((s, a) => s + a.impressions, 0);
    const isEarlyMode = totalImpressions < 100;

    // Detect boost candidates
    const boostCandidates: Array<{ slug: string; position: number; impressions: number; priority: number }> = [];

    const now = new Date().toISOString();
    const rankings = Object.entries(slugAggregates).map(([slug, agg]) => {
      const avgPos = agg.positions.reduce((s, p) => s + p, 0) / agg.positions.length;
      const ctr = agg.impressions > 0 ? agg.clicks / agg.impressions : 0;

      // Boost candidate detection
      const posMin = isEarlyMode ? 10 : 10;
      const posMax = isEarlyMode ? 80 : 60;
      const minImpr = isEarlyMode ? 10 : 20;

      if (avgPos >= posMin && avgPos <= posMax && agg.impressions >= minImpr) {
        const priority = ((60 - Math.min(avgPos, 60)) * 0.7) + (Math.log(agg.impressions + 1) * 10);
        boostCandidates.push({ slug, position: Math.round(avgPos * 10) / 10, impressions: agg.impressions, priority: Math.round(priority * 100) / 100 });
        boostCandidateCount++;
      }

      return {
        keyword: slug,
        slug,
        position: Math.round(avgPos * 10) / 10,
        clicks: agg.clicks,
        impressions: agg.impressions,
        ctr: Math.round(ctr * 10000) / 10000,
        country: 'all',
        device: 'all',
        tracked_date: endStr,
        last_synced_at: now,
      };
    });

    // Also store query-level data
    const queryRankings = rows
      .filter((row: any) => matchPageToSlug(row.keys[0], knownSlugs) !== null)
      .map((row: any) => ({
        keyword: row.keys[1],
        slug: matchPageToSlug(row.keys[0], knownSlugs),
        position: Math.round(row.position * 10) / 10,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: Math.round(row.ctr * 10000) / 10000,
        country: 'all',
        device: 'all',
        tracked_date: endStr,
        last_synced_at: now,
      }));

    // Upsert to keyword_rankings
    if (rankings.length > 0) {
      const { error: upsertError } = await adminSupabase
        .from('keyword_rankings')
        .upsert(rankings, { onConflict: 'keyword,country,device,tracked_date' });
      if (upsertError) console.error('[rank-harvest-cron] Slug upsert error:', upsertError);
    }

    if (queryRankings.length > 0) {
      const { error: queryError } = await adminSupabase
        .from('keyword_rankings')
        .upsert(queryRankings, { onConflict: 'keyword,country,device,tracked_date' });
      if (queryError) console.error('[rank-harvest-cron] Query upsert error:', queryError);
    }

    // Log the cron run
    await adminSupabase.from('cron_job_logs').insert({
      job_name: 'rank-harvest-cron',
      status: 'completed',
      success: true,
      items_processed: rankings.length,
      items_failed: 0,
      details: {
        mode: isEarlyMode ? 'early' : 'standard',
        totalImpressions,
        boostCandidates: boostCandidates.sort((a, b) => b.priority - a.priority).slice(0, 15),
        queryCount: queryRankings.length,
        dateRange: { start: startStr, end: endStr },
      },
    });

    const message = `✅ GSC sync complete – ${rankings.length} slugs, ${queryRankings.length} queries, ${boostCandidateCount} boost candidates (${isEarlyMode ? 'EARLY' : 'STANDARD'} mode)`;
    console.log(`[rank-harvest-cron] ${message}`);

    return new Response(
      JSON.stringify({
        success: true,
        message,
        processed: rankings.length,
        queryCount: queryRankings.length,
        boostCandidates: boostCandidates.sort((a, b) => b.priority - a.priority).slice(0, 15),
        mode: isEarlyMode ? 'early' : 'standard',
        totalImpressions,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[rank-harvest-cron] Error:", error);

    // Try to log failure
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);
      await adminSupabase.from('cron_job_logs').insert({
        job_name: 'rank-harvest-cron',
        status: 'failed',
        success: false,
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
    } catch {}

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

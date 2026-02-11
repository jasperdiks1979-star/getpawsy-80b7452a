import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  rowLimit = 1000,
): Promise<GSCResponse> {
  const response = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions,
        rowLimit,
        startRow: 0,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GSC API error (${response.status}): ${error}`);
  }

  return await response.json();
}

// ============= GUIDE SLUG MAPPING =============

const GUIDE_SLUG_PATTERNS = [
  'best-cat-litter-box-2026',
  'how-many-litter-boxes-per-cat',
  'best-cat-litter-box-furniture-enclosures-2026',
  'best-litter-boxes-multi-cat',
  'best-extra-large-litter-boxes',
  'best-cat-trees-small-apartments',
  'best-high-sided-litter-box',
  'best-litter-box-kittens',
  'best-litter-box-odor-bathroom',
  'best-litter-box-senior-cats',
  'best-litter-box-small-apartments',
  'best-litter-box-studio-apartment',
  'best-litter-box-under-100',
  'best-low-tracking-litter-box',
  'cat-condo-vs-cat-tower',
  'choosing-safe-cat-tree-indoor',
  'guinea-pig-cage-vs-playpen',
  'how-to-choose-guinea-pig-cage',
  'outdoor-dog-games-enrichment',
];

function matchPageToSlug(pageUrl: string): string | null {
  for (const slug of GUIDE_SLUG_PATTERNS) {
    if (pageUrl.includes(`/guides/${slug}`)) {
      return slug;
    }
  }
  return null;
}

// ============= MAIN HANDLER =============

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
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

    // Check admin role
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

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

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    if (!serviceAccountJson) {
      return new Response(
        JSON.stringify({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON secret not configured', reason: 'missing_credentials' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============= ACTION: SYNC =============
    if (action === 'sync') {
      const SITE_URL = 'sc-domain:getpawsy.pet';

      const today = new Date();
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() - 3); // GSC data delayed ~3 days
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 28); // Last 28 days

      const formatDate = (d: Date) => d.toISOString().split('T')[0];
      const startStr = formatDate(startDate);
      const endStr = formatDate(endDate);

      console.log(`[GSC Sync] Fetching ${startStr} to ${endStr} for ${SITE_URL}`);

      const accessToken = await getAccessToken(serviceAccountJson);

      // Fetch with page + query dimensions
      const gscData = await fetchGSCData(
        accessToken, SITE_URL, startStr, endStr,
        ['page', 'query'], 2000
      );

      if (!gscData.rows || gscData.rows.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            count: 0,
            reason: 'no_data',
            message: `No rows returned from GSC for ${SITE_URL} (${startStr} to ${endStr}). Possible causes: (1) domain property not verified, (2) service account lacks access, (3) no indexed guide pages yet.`,
            debug: { siteUrl: SITE_URL, startDate: startStr, endDate: endStr, dimensions: ['page', 'query'] },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[GSC Sync] Got ${gscData.rows.length} raw rows`);

      // Aggregate per guide slug
      const slugAggregates: Record<string, {
        impressions: number; clicks: number; positions: number[]; queries: string[];
      }> = {};

      let unmatchedCount = 0;

      for (const row of gscData.rows) {
        const pageUrl = row.keys[0];
        const query = row.keys[1];
        const slug = matchPageToSlug(pageUrl);

        if (!slug) {
          unmatchedCount++;
          continue;
        }

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

      const now = new Date().toISOString();
      const rankings = Object.entries(slugAggregates).map(([slug, agg]) => {
        const avgPos = agg.positions.reduce((s, p) => s + p, 0) / agg.positions.length;
        const ctr = agg.impressions > 0 ? agg.clicks / agg.impressions : 0;
        return {
          keyword: slug, // use slug as keyword identifier
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

      // Also store individual query-level data
      const queryRankings = gscData.rows
        .filter(row => matchPageToSlug(row.keys[0]) !== null)
        .map(row => ({
          keyword: row.keys[1],
          slug: matchPageToSlug(row.keys[0]),
          position: Math.round(row.position * 10) / 10,
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: Math.round(row.ctr * 10000) / 10000,
          country: 'all',
          device: 'all',
          tracked_date: endStr,
          last_synced_at: now,
        }));

      // Upsert slug-level aggregates
      const { error: upsertError } = await adminSupabase
        .from('keyword_rankings')
        .upsert(rankings, { onConflict: 'keyword,country,device,tracked_date' });

      if (upsertError) {
        console.error('[GSC Sync] Slug upsert error:', upsertError);
        throw upsertError;
      }

      // Upsert query-level data
      const { error: queryError } = await adminSupabase
        .from('keyword_rankings')
        .upsert(queryRankings, { onConflict: 'keyword,country,device,tracked_date' });

      if (queryError) {
        console.error('[GSC Sync] Query upsert error:', queryError);
        // Non-fatal, continue
      }

      return new Response(
        JSON.stringify({
          success: true,
          count: rankings.length,
          queryCount: queryRankings.length,
          unmatchedRows: unmatchedCount,
          totalRawRows: gscData.rows.length,
          syncedAt: now,
          dateRange: { start: startStr, end: endStr },
          slugs: rankings.map(r => ({
            slug: r.slug,
            impressions: r.impressions,
            clicks: r.clicks,
            position: r.position,
          })),
        }),
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

      // Get last sync timestamp
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
      } catch {}

      try {
        const accessToken = await getAccessToken(serviceAccountJson);

        const gscData = await fetchGSCData(
          accessToken, SITE_URL, startStr, endStr,
          ['page'], 20
        );

        if (!gscData.rows || gscData.rows.length === 0) {
          return new Response(
            JSON.stringify({
              status: 'NO_DATA',
              property: SITE_URL,
              propertyType: 'DOMAIN',
              serviceAccountEmail,
              dateRange: { start: startStr, end: endStr },
              rowsFetched: 0,
              connected: true,
              possible_causes: [
                'New domain (insufficient crawl history)',
                'No indexed guide pages yet',
                'Service account may lack full access',
                'Domain property not fully verified',
                'GSC data delay (up to 3–5 days)',
              ],
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            status: 'OK',
            property: SITE_URL,
            propertyType: 'DOMAIN',
            serviceAccountEmail,
            dateRange: { start: startStr, end: endStr },
            rowsFetched: gscData.rows.length,
            connected: true,
            sampleRows: gscData.rows.slice(0, 5).map(r => ({
              page: r.keys[0],
              impressions: r.impressions,
              clicks: r.clicks,
              position: Math.round(r.position * 10) / 10,
            })),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (diagError) {
        return new Response(
          JSON.stringify({
            status: 'ERROR',
            property: SITE_URL,
            propertyType: 'DOMAIN',
            serviceAccountEmail,
            connected: false,
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
      JSON.stringify({ error: 'Invalid action. Valid: sync, get_guide_metrics, add_keyword, gsc_diagnostic' }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

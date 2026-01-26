import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to get access token using service account credentials
async function getAccessToken(credentials: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;
  
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp,
    iat: now
  };
  
  const encoder = new TextEncoder();
  const base64url = (data: Uint8Array): string => {
    const base64 = btoa(String.fromCharCode(...data));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };
  
  const headerB64 = base64url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64url(encoder.encode(JSON.stringify(payload)));
  const signatureInput = `${headerB64}.${payloadB64}`;
  
  const pemContents = credentials.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\n/g, '');
  
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signatureInput)
  );
  
  const signatureB64 = base64url(new Uint8Array(signature));
  const jwt = `${signatureInput}.${signatureB64}`;
  
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  
  const tokenData = await tokenResponse.json();
  
  if (!tokenResponse.ok) {
    throw new Error(`Failed to get access token: ${tokenData.error_description || tokenData.error}`);
  }
  
  return tokenData.access_token;
}

// Run a GA4 report
async function runReport(accessToken: string, propertyId: string, request: {
  dateRanges?: { startDate: string; endDate: string }[];
  dimensions?: { name: string }[];
  metrics?: { name: string }[];
  orderBys?: { metric?: { metricName: string }; dimension?: { dimensionName: string }; desc?: boolean }[];
  limit?: number;
}) {
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    }
  );
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`GA4 API error: ${data.error?.message || 'Unknown error'}`);
  }
  
  return data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Create log entry
  const { data: logEntry, error: logError } = await supabase
    .from('cron_job_logs')
    .insert({
      job_name: 'daily-ga4-sync',
      status: 'running',
      started_at: new Date().toISOString(),
      details: { triggered_by: 'cron' }
    })
    .select()
    .single();

  if (logError) {
    console.error('Failed to create log entry:', logError);
  }

  const logId = logEntry?.id;

  try {
    console.log('[GA4-SYNC] Starting daily GA4 data sync');

    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    const propertyId = Deno.env.get('GA4_PROPERTY_ID');

    if (!serviceAccountJson || !propertyId) {
      throw new Error('GA4 not configured: Missing GOOGLE_SERVICE_ACCOUNT_JSON or GA4_PROPERTY_ID');
    }

    const credentials = JSON.parse(serviceAccountJson);
    const accessToken = await getAccessToken(credentials);

    // Get yesterday's date (GA4 data is delayed)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    console.log(`[GA4-SYNC] Fetching data for ${dateStr}`);

    // Fetch key metrics for the day
    const [trafficData, topPages, devices, countries, trafficSources] = await Promise.all([
      // Daily traffic metrics
      runReport(accessToken, propertyId, {
        dateRanges: [{ startDate: dateStr, endDate: dateStr }],
        metrics: [
          { name: 'activeUsers' },
          { name: 'screenPageViews' },
          { name: 'sessions' },
          { name: 'averageSessionDuration' },
          { name: 'bounceRate' },
          { name: 'newUsers' },
          { name: 'totalRevenue' },
          { name: 'ecommercePurchases' }
        ]
      }),
      // Top pages
      runReport(accessToken, propertyId, {
        dateRanges: [{ startDate: dateStr, endDate: dateStr }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }, { name: 'averageSessionDuration' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 20
      }),
      // Device breakdown
      runReport(accessToken, propertyId, {
        dateRanges: [{ startDate: dateStr, endDate: dateStr }],
        dimensions: [{ name: 'deviceCategory' }],
        metrics: [{ name: 'activeUsers' }, { name: 'sessions' }]
      }),
      // Country breakdown
      runReport(accessToken, propertyId, {
        dateRanges: [{ startDate: dateStr, endDate: dateStr }],
        dimensions: [{ name: 'country' }],
        metrics: [{ name: 'activeUsers' }],
        orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
        limit: 20
      }),
      // Traffic sources
      runReport(accessToken, propertyId, {
        dateRanges: [{ startDate: dateStr, endDate: dateStr }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'bounceRate' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 10
      })
    ]);

    // Parse metrics from response
    const metricsRow = trafficData?.rows?.[0];
    const metrics = {
      activeUsers: parseInt(metricsRow?.metricValues?.[0]?.value || '0'),
      pageViews: parseInt(metricsRow?.metricValues?.[1]?.value || '0'),
      sessions: parseInt(metricsRow?.metricValues?.[2]?.value || '0'),
      avgSessionDuration: parseFloat(metricsRow?.metricValues?.[3]?.value || '0'),
      bounceRate: parseFloat(metricsRow?.metricValues?.[4]?.value || '0'),
      newUsers: parseInt(metricsRow?.metricValues?.[5]?.value || '0'),
      revenue: parseFloat(metricsRow?.metricValues?.[6]?.value || '0'),
      purchases: parseInt(metricsRow?.metricValues?.[7]?.value || '0')
    };

    // Parse top pages
    // deno-lint-ignore no-explicit-any
    const parsedTopPages = topPages?.rows?.map((row: any) => ({
      path: row.dimensionValues?.[0]?.value,
      pageViews: parseInt(row.metricValues?.[0]?.value || '0'),
      avgDuration: parseFloat(row.metricValues?.[1]?.value || '0')
    })) || [];

    // Parse devices
    // deno-lint-ignore no-explicit-any
    const parsedDevices = devices?.rows?.map((row: any) => ({
      device: row.dimensionValues?.[0]?.value,
      users: parseInt(row.metricValues?.[0]?.value || '0'),
      sessions: parseInt(row.metricValues?.[1]?.value || '0')
    })) || [];

    // Parse countries
    // deno-lint-ignore no-explicit-any
    const parsedCountries = countries?.rows?.map((row: any) => ({
      country: row.dimensionValues?.[0]?.value,
      users: parseInt(row.metricValues?.[0]?.value || '0')
    })) || [];

    // Parse traffic sources
    // deno-lint-ignore no-explicit-any
    const parsedSources = trafficSources?.rows?.map((row: any) => ({
      channel: row.dimensionValues?.[0]?.value,
      sessions: parseInt(row.metricValues?.[0]?.value || '0'),
      users: parseInt(row.metricValues?.[1]?.value || '0'),
      bounceRate: parseFloat(row.metricValues?.[2]?.value || '0')
    })) || [];

    // Store the daily snapshot
    const snapshotData = {
      date: dateStr,
      metrics,
      topPages: parsedTopPages,
      devices: parsedDevices,
      countries: parsedCountries,
      trafficSources: parsedSources,
      synced_at: new Date().toISOString()
    };

    // Upsert to ga4_daily_snapshots table
    const { error: upsertError } = await supabase
      .from('ga4_daily_snapshots')
      .upsert(
        { 
          report_date: dateStr,
          active_users: metrics.activeUsers,
          page_views: metrics.pageViews,
          sessions: metrics.sessions,
          avg_session_duration: metrics.avgSessionDuration,
          bounce_rate: metrics.bounceRate,
          new_users: metrics.newUsers,
          revenue: metrics.revenue,
          purchases: metrics.purchases,
          top_pages: parsedTopPages,
          devices: parsedDevices,
          countries: parsedCountries,
          traffic_sources: parsedSources,
          synced_at: new Date().toISOString()
        },
        { onConflict: 'report_date' }
      );

    if (upsertError) {
      throw upsertError;
    }

    console.log(`[GA4-SYNC] Successfully synced GA4 data for ${dateStr}:`, {
      activeUsers: metrics.activeUsers,
      pageViews: metrics.pageViews,
      sessions: metrics.sessions,
      revenue: metrics.revenue
    });

    // Update log entry
    if (logId) {
      await supabase
        .from('cron_job_logs')
        .update({
          status: 'completed',
          success: true,
          completed_at: new Date().toISOString(),
          items_processed: 1,
          details: {
            date: dateStr,
            metrics,
            topPagesCount: parsedTopPages.length,
            countriesCount: parsedCountries.length
          }
        })
        .eq('id', logId);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      date: dateStr,
      metrics,
      message: 'GA4 daily sync completed successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[GA4-SYNC] Error:', errorMessage);

    // Update log entry with error
    if (logId) {
      await supabase
        .from('cron_job_logs')
        .update({
          status: 'failed',
          success: false,
          completed_at: new Date().toISOString(),
          error_message: errorMessage
        })
        .eq('id', logId);
    }

    return new Response(JSON.stringify({ 
      error: errorMessage,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

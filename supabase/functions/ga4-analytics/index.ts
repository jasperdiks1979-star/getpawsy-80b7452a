import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
  
  // Create JWT header and payload
  const header = {
    alg: "RS256",
    typ: "JWT"
  };
  
  const payload = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: exp,
    iat: now
  };
  
  // Base64url encode
  const encoder = new TextEncoder();
  const base64url = (data: Uint8Array): string => {
    const base64 = btoa(String.fromCharCode(...data));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };
  
  const headerB64 = base64url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64url(encoder.encode(JSON.stringify(payload)));
  const signatureInput = `${headerB64}.${payloadB64}`;
  
  // Import private key and sign
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
  
  // Exchange JWT for access token
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
    console.error('Token exchange failed:', tokenData);
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
    console.error('GA4 API error:', data);
    throw new Error(`GA4 API error: ${data.error?.message || 'Unknown error'}`);
  }
  
  return data;
}

// Run realtime report
async function runRealtimeReport(accessToken: string, propertyId: string, request: {
  dimensions?: { name: string }[];
  metrics?: { name: string }[];
  limit?: number;
}) {
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runRealtimeReport`,
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
    console.error('GA4 Realtime API error:', data);
    throw new Error(`GA4 Realtime API error: ${data.error?.message || 'Unknown error'}`);
  }
  
  return data;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin access
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Check if user is admin
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin');

    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get credentials from environment
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    const propertyId = Deno.env.get('GA4_PROPERTY_ID');

    if (!serviceAccountJson || !propertyId) {
      return new Response(JSON.stringify({ 
        error: 'GA4 not configured',
        details: 'Missing GOOGLE_SERVICE_ACCOUNT_JSON or GA4_PROPERTY_ID'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let credentials;
    try {
      credentials = JSON.parse(serviceAccountJson);
    } catch (e) {
      console.error('Failed to parse service account JSON:', e);
      return new Response(JSON.stringify({ 
        error: 'Invalid service account credentials',
        details: 'Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get access token
    console.log('Getting access token for:', credentials.client_email);
    const accessToken = await getAccessToken(credentials);

    // Parse request body
    const { reportType = 'overview', startDate, endDate } = await req.json();
    
    // Use provided dates or default to last 7 days
    const dateStart = startDate || '7daysAgo';
    const dateEnd = endDate || 'today';
    
    console.log(`Fetching ${reportType} report for property ${propertyId} from ${dateStart} to ${dateEnd}`);

    let result: Record<string, unknown> = {};

    if (reportType === 'overview') {
      // Fetch multiple reports in parallel for overview
      const [
        trafficReport,
        topPagesReport,
        deviceReport,
        countryReport,
        realtimeReport
      ] = await Promise.all([
        // Traffic data for date range
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          dimensions: [{ name: 'date' }],
          metrics: [
            { name: 'activeUsers' },
            { name: 'screenPageViews' },
            { name: 'sessions' },
            { name: 'averageSessionDuration' },
            { name: 'bounceRate' },
            { name: 'newUsers' }
          ],
          orderBys: [{ dimension: { dimensionName: 'date' } }]
        }),
        // Top pages for date range
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          dimensions: [{ name: 'pagePath' }],
          metrics: [
            { name: 'screenPageViews' },
            { name: 'averageSessionDuration' }
          ],
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit: 10
        }),
        // Device category for date range
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          dimensions: [{ name: 'deviceCategory' }],
          metrics: [{ name: 'activeUsers' }]
        }),
        // Countries for date range
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          dimensions: [{ name: 'country' }],
          metrics: [{ name: 'activeUsers' }],
          orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
          limit: 10
        }),
        // Realtime users (always current)
        runRealtimeReport(accessToken, propertyId, {
          metrics: [{ name: 'activeUsers' }]
        })
      ]);

      result = {
        traffic: trafficReport,
        topPages: topPagesReport,
        devices: deviceReport,
        countries: countryReport,
        realtime: realtimeReport
      };
    } else if (reportType === 'realtime') {
      // Realtime data
      const [activeUsers, activePages] = await Promise.all([
        runRealtimeReport(accessToken, propertyId, {
          metrics: [{ name: 'activeUsers' }]
        }),
        runRealtimeReport(accessToken, propertyId, {
          dimensions: [{ name: 'unifiedScreenName' }],
          metrics: [{ name: 'activeUsers' }],
          limit: 10
        })
      ]);

      result = {
        activeUsers,
        activePages
      };
    } else if (reportType === 'ecommerce') {
      // E-commerce data
      const [transactions, topProducts] = await Promise.all([
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          metrics: [
            { name: 'transactions' },
            { name: 'totalRevenue' },
            { name: 'averagePurchaseRevenue' },
            { name: 'ecommercePurchases' }
          ]
        }),
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          dimensions: [{ name: 'itemName' }],
          metrics: [
            { name: 'itemsViewed' },
            { name: 'itemsPurchased' },
            { name: 'itemRevenue' }
          ],
          orderBys: [{ metric: { metricName: 'itemRevenue' }, desc: true }],
          limit: 10
        })
      ]);

      result = {
        transactions,
        topProducts
      };
    } else if (reportType === 'demographics') {
      // Demographics and acquisition data
      const [browsers, operatingSystems, trafficSources, cities, ageGender, landingPages] = await Promise.all([
        // Browser breakdown
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          dimensions: [{ name: 'browser' }],
          metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
          orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
          limit: 10
        }),
        // Operating systems
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          dimensions: [{ name: 'operatingSystem' }],
          metrics: [{ name: 'activeUsers' }],
          orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
          limit: 10
        }),
        // Traffic sources/channels
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          dimensions: [{ name: 'sessionDefaultChannelGroup' }],
          metrics: [
            { name: 'sessions' },
            { name: 'activeUsers' },
            { name: 'bounceRate' },
            { name: 'averageSessionDuration' }
          ],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 10
        }),
        // Cities
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          dimensions: [{ name: 'city' }],
          metrics: [{ name: 'activeUsers' }],
          orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
          limit: 10
        }),
        // Age and gender (if available)
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          dimensions: [{ name: 'userAgeBracket' }],
          metrics: [{ name: 'activeUsers' }],
          orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }]
        }).catch(() => ({ rows: [] })), // May not be available
        // Top landing pages with engagement
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          dimensions: [{ name: 'landingPage' }],
          metrics: [
            { name: 'sessions' },
            { name: 'bounceRate' },
            { name: 'averageSessionDuration' },
            { name: 'conversions' }
          ],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 10
        }).catch(() => ({ rows: [] }))
      ]);

      result = {
        browsers,
        operatingSystems,
        trafficSources,
        cities,
        ageGender,
        landingPages
      };
    } else if (reportType === 'conversions') {
      // Conversion and funnel data
      const [conversionEvents, purchaseFunnel, revenueByDate, conversionsBySource] = await Promise.all([
        // All conversion events
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          dimensions: [{ name: 'eventName' }],
          metrics: [
            { name: 'eventCount' },
            { name: 'totalUsers' }
          ],
          orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
          limit: 15
        }),
        // Purchase funnel metrics
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          metrics: [
            { name: 'sessions' },
            { name: 'addToCarts' },
            { name: 'checkouts' },
            { name: 'ecommercePurchases' },
            { name: 'totalRevenue' }
          ]
        }).catch(() => ({ rows: [] })),
        // Revenue over time
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          dimensions: [{ name: 'date' }],
          metrics: [
            { name: 'totalRevenue' },
            { name: 'ecommercePurchases' },
            { name: 'transactions' }
          ],
          orderBys: [{ dimension: { dimensionName: 'date' } }]
        }),
        // Conversions by traffic source
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          dimensions: [{ name: 'sessionDefaultChannelGroup' }],
          metrics: [
            { name: 'sessions' },
            { name: 'ecommercePurchases' },
            { name: 'totalRevenue' }
          ],
          orderBys: [{ metric: { metricName: 'totalRevenue' }, desc: true }],
          limit: 10
        }).catch(() => ({ rows: [] }))
      ]);

      result = {
        conversionEvents,
        purchaseFunnel,
        revenueByDate,
        conversionsBySource
      };
    }

    console.log('Successfully fetched GA4 data');
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    const errorDetails = error instanceof Error ? error.toString() : String(error);
    console.error('Error in ga4-analytics function:', error);
    return new Response(JSON.stringify({ 
      error: errorMessage,
      details: errorDetails
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

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
    const { reportType = 'overview', startDate, endDate, includeComparison = false } = await req.json();
    
    // Use provided dates or default to last 7 days
    const dateStart = startDate || '7daysAgo';
    const dateEnd = endDate || 'today';
    
    // Calculate previous period dates for comparison
    let previousDateStart: string | null = null;
    let previousDateEnd: string | null = null;
    
    if (includeComparison && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      
      const prevEnd = new Date(start);
      prevEnd.setDate(prevEnd.getDate() - 1);
      const prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - diffDays + 1);
      
      previousDateStart = prevStart.toISOString().split('T')[0];
      previousDateEnd = prevEnd.toISOString().split('T')[0];
    }
    
    console.log(`Fetching ${reportType} report for property ${propertyId} from ${dateStart} to ${dateEnd}`);

    let result: Record<string, unknown> = {};

    if (reportType === 'overview') {
      // Fetch multiple reports in parallel for overview
      const reportPromises: Promise<unknown>[] = [
        // Traffic data for date range (index 0)
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
        // Top pages for date range (index 1)
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
        // Device category for date range (index 2)
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          dimensions: [{ name: 'deviceCategory' }],
          metrics: [{ name: 'activeUsers' }]
        }),
        // Countries for date range (index 3)
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          dimensions: [{ name: 'country' }],
          metrics: [{ name: 'activeUsers' }],
          orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
          limit: 10
        }),
        // Realtime users (index 4)
        runRealtimeReport(accessToken, propertyId, {
          metrics: [{ name: 'activeUsers' }]
        })
      ];
      
      // Add comparison period traffic if requested (will be index 5)
      if (includeComparison && previousDateStart && previousDateEnd) {
        console.log(`Including comparison data from ${previousDateStart} to ${previousDateEnd}`);
        reportPromises.push(
          runReport(accessToken, propertyId, {
            dateRanges: [{ startDate: previousDateStart, endDate: previousDateEnd }],
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
          })
        );
      }
      
      const reports = await Promise.all(reportPromises);

      result = {
        traffic: reports[0],
        topPages: reports[1],
        devices: reports[2],
        countries: reports[3],
        realtime: reports[4],
        previousTraffic: includeComparison && reports[5] ? reports[5] : undefined,
        comparisonPeriod: includeComparison && previousDateStart && previousDateEnd ? {
          startDate: previousDateStart,
          endDate: previousDateEnd
        } : undefined
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
    } else if (reportType === 'crosssell') {
      // Cross-sell analytics - fetch cross-sell specific events
      // deno-lint-ignore no-explicit-any
      type AnyRow = any;
      
      const [crossSellImpressions, crossSellClicks, crossSellAddToCarts, crossSellRevenue, crossSellByProduct, crossSellBySource] = await Promise.all([
        // Cross-sell impressions (view_item_list with cross-sell context)
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          dimensions: [{ name: 'eventName' }],
          metrics: [{ name: 'eventCount' }],
        }).then(data => {
          // Filter for view_item_list events
          const viewItemListRow = data.rows?.find((r: AnyRow) => 
            r.dimensionValues?.[0]?.value === 'view_item_list'
          );
          return parseInt(viewItemListRow?.metricValues?.[0]?.value || '0');
        }).catch(() => 0),
        // Cross-sell clicks (select_item events)
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          dimensions: [{ name: 'eventName' }],
          metrics: [{ name: 'eventCount' }],
        }).then(data => {
          const selectItemRow = data.rows?.find((r: AnyRow) => 
            r.dimensionValues?.[0]?.value === 'select_item'
          );
          return parseInt(selectItemRow?.metricValues?.[0]?.value || '0');
        }).catch(() => 0),
        // Cross-sell add to cart (add_to_cart events)
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          dimensions: [{ name: 'eventName' }],
          metrics: [{ name: 'eventCount' }],
        }).then(data => {
          const addToCartRow = data.rows?.find((r: AnyRow) => 
            r.dimensionValues?.[0]?.value === 'add_to_cart'
          );
          return parseInt(addToCartRow?.metricValues?.[0]?.value || '0');
        }).catch(() => 0),
        // Revenue from e-commerce
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          metrics: [
            { name: 'totalRevenue' },
            { name: 'ecommercePurchases' }
          ]
        }).catch(() => ({ rows: [] })),
        // Top products clicked/added via cross-sell
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          dimensions: [{ name: 'itemName' }],
          metrics: [
            { name: 'itemsViewed' },
            { name: 'itemsAddedToCart' },
            { name: 'itemsPurchased' },
            { name: 'itemRevenue' }
          ],
          orderBys: [{ metric: { metricName: 'itemsAddedToCart' }, desc: true }],
          limit: 10
        }).catch(() => ({ rows: [] })),
        // Cross-sell performance by item list (source location)
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          dimensions: [{ name: 'itemListName' }],
          metrics: [
            { name: 'itemsViewed' },
            { name: 'itemsClickedInList' },
            { name: 'itemsAddedToCart' }
          ],
          orderBys: [{ metric: { metricName: 'itemsViewed' }, desc: true }],
          limit: 10
        }).catch(() => ({ rows: [] }))
      ]);

      // Calculate metrics
      const revenueRow = crossSellRevenue?.rows?.[0];
      const totalRevenue = parseFloat(revenueRow?.metricValues?.[0]?.value || '0');
      const totalPurchases = parseInt(revenueRow?.metricValues?.[1]?.value || '0');

      result = {
        metrics: {
          impressions: crossSellImpressions,
          clicks: crossSellClicks,
          addToCarts: crossSellAddToCarts,
          clickRate: crossSellImpressions > 0 ? (crossSellClicks / crossSellImpressions) * 100 : 0,
          addToCartRate: crossSellClicks > 0 ? (crossSellAddToCarts / crossSellClicks) * 100 : 0,
          totalRevenue,
          totalPurchases,
          avgOrderValue: totalPurchases > 0 ? totalRevenue / totalPurchases : 0
        },
        topProducts: crossSellByProduct?.rows?.map((row: AnyRow) => ({
          name: row.dimensionValues?.[0]?.value || 'Unknown',
          views: parseInt(row.metricValues?.[0]?.value || '0'),
          addToCarts: parseInt(row.metricValues?.[1]?.value || '0'),
          purchases: parseInt(row.metricValues?.[2]?.value || '0'),
          revenue: parseFloat(row.metricValues?.[3]?.value || '0')
        })) || [],
        bySource: crossSellBySource?.rows?.map((row: AnyRow) => ({
          source: row.dimensionValues?.[0]?.value || 'Unknown',
          impressions: parseInt(row.metricValues?.[0]?.value || '0'),
          clicks: parseInt(row.metricValues?.[1]?.value || '0'),
          addToCarts: parseInt(row.metricValues?.[2]?.value || '0')
        })) || []
      };
    } else if (reportType === 'didyoumean') {
      // Did You Mean analytics - track search suggestion interactions with conversion funnel
      // deno-lint-ignore no-explicit-any
      type AnyRow = any;
      
      const [didYouMeanEvents, searchTerms, dailyData, ecommerceData] = await Promise.all([
        // Get all did_you_mean events
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          dimensions: [{ name: 'eventName' }],
          metrics: [{ name: 'eventCount' }],
        }).catch(() => ({ rows: [] })),
        // Get search terms that triggered suggestions (using customEvent:search_query or page path with search param)
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          dimensions: [{ name: 'searchTerm' }],
          metrics: [
            { name: 'eventCount' },
            { name: 'totalUsers' }
          ],
          orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
          limit: 20
        }).catch(() => ({ rows: [] })),
        // Daily trend data
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          dimensions: [{ name: 'date' }],
          metrics: [{ name: 'eventCount' }],
          orderBys: [{ dimension: { dimensionName: 'date' } }]
        }).catch(() => ({ rows: [] })),
        // E-commerce funnel data
        runReport(accessToken, propertyId, {
          dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
          metrics: [
            { name: 'addToCarts' },
            { name: 'ecommercePurchases' },
            { name: 'totalRevenue' }
          ]
        }).catch(() => ({ rows: [] }))
      ]);

      // Parse event counts for did_you_mean specific events
      const eventCounts: Record<string, number> = {};
      didYouMeanEvents?.rows?.forEach((row: AnyRow) => {
        const eventName = row.dimensionValues?.[0]?.value || '';
        const count = parseInt(row.metricValues?.[0]?.value || '0');
        eventCounts[eventName] = count;
      });

      // Calculate metrics based on custom event naming
      const impressions = eventCounts['did_you_mean_impression'] || 0;
      const categoryClicks = eventCounts['did_you_mean_category_click'] || 0;
      const productClicks = eventCounts['did_you_mean_product_click'] || 0;
      const viewAllClicks = eventCounts['did_you_mean_view_all_click'] || 0;
      const didYouMeanAddToCarts = eventCounts['did_you_mean_add_to_cart'] || 0;
      const totalClicks = categoryClicks + productClicks + viewAllClicks;

      // Parse ecommerce data for funnel
      const ecommerceRow = ecommerceData?.rows?.[0];
      const totalAddToCarts = parseInt(ecommerceRow?.metricValues?.[0]?.value || '0');
      const totalPurchases = parseInt(ecommerceRow?.metricValues?.[1]?.value || '0');
      const totalRevenue = parseFloat(ecommerceRow?.metricValues?.[2]?.value || '0');

      // Estimate Did You Mean contribution (based on click ratio)
      // If no specific add_to_cart events, estimate based on product clicks
      const estimatedAddToCarts = didYouMeanAddToCarts || Math.round(productClicks * 0.15);
      const estimatedPurchases = Math.round(estimatedAddToCarts * 0.25);
      const estimatedRevenue = estimatedPurchases * (totalPurchases > 0 ? totalRevenue / totalPurchases : 45);

      // Build conversion funnel data
      const conversionFunnel = [
        {
          stage: 'Impressions',
          count: impressions,
          percentage: 100,
          dropoff: 0
        },
        {
          stage: 'Clicks',
          count: totalClicks,
          percentage: impressions > 0 ? (totalClicks / impressions) * 100 : 0,
          dropoff: impressions > 0 ? ((impressions - totalClicks) / impressions) * 100 : 0
        },
        {
          stage: 'Add to Cart',
          count: estimatedAddToCarts,
          percentage: impressions > 0 ? (estimatedAddToCarts / impressions) * 100 : 0,
          dropoff: totalClicks > 0 ? ((totalClicks - estimatedAddToCarts) / totalClicks) * 100 : 0
        },
        {
          stage: 'Purchase',
          count: estimatedPurchases,
          percentage: impressions > 0 ? (estimatedPurchases / impressions) * 100 : 0,
          dropoff: estimatedAddToCarts > 0 ? ((estimatedAddToCarts - estimatedPurchases) / estimatedAddToCarts) * 100 : 0
        }
      ];

      // Parse search terms
      const topSearchTerms = searchTerms?.rows?.slice(0, 15).map((row: AnyRow) => {
        const term = row.dimensionValues?.[0]?.value || '';
        const count = parseInt(row.metricValues?.[0]?.value || '0');
        const users = parseInt(row.metricValues?.[1]?.value || '0');
        return {
          term,
          impressions: count,
          clicks: Math.round(count * 0.08), // Estimated click rate
          clickRate: 8 // Default estimate until we have real data
        };
      }).filter((t: { term: string }) => t.term && t.term !== '(not set)') || [];

      // Parse daily trends
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dailyTrends = dailyData?.rows?.map((row: AnyRow) => {
        const dateStr = row.dimensionValues?.[0]?.value || '';
        const date = new Date(
          parseInt(dateStr.substring(0, 4)),
          parseInt(dateStr.substring(4, 6)) - 1,
          parseInt(dateStr.substring(6, 8))
        );
        const events = parseInt(row.metricValues?.[0]?.value || '0');
        return {
          date: dayNames[date.getDay()],
          impressions: Math.round(events * 0.3), // Estimate suggestion impressions
          clicks: Math.round(events * 0.024), // Estimate clicks
          clickRate: 8
        };
      }) || [];

      result = {
        metrics: {
          impressions,
          categoryClicks,
          productClicks,
          viewAllClicks,
          addToCarts: estimatedAddToCarts,
          purchases: estimatedPurchases,
          revenue: estimatedRevenue,
          categoryClickRate: impressions > 0 ? (categoryClicks / impressions) * 100 : 0,
          productClickRate: impressions > 0 ? (productClicks / impressions) * 100 : 0,
          totalEngagementRate: impressions > 0 ? (totalClicks / impressions) * 100 : 0,
          conversionRate: totalClicks > 0 ? (estimatedPurchases / totalClicks) * 100 : 0
        },
        conversionFunnel,
        topSearchTerms,
        categorySuggestions: [], // Would need custom event parameters to track
        dailyTrends
      };
    } else if (reportType === 'hero_ctas') {
      // Hero CTA tracking summary — counts the two events the homepage hero
      // emits (`hero_cta_click`, `hero_anchor_result`) and computes the share
      // of anchor_result events where `anchor_reached=true`. The two pieces
      // together tell us (a) is the hero engaging at all, and (b) when it
      // does, does the in-page jump actually land on #how-it-works.
      // deno-lint-ignore no-explicit-any
      type AnyRow = any;

      const HERO_EVENTS = ['hero_cta_click', 'hero_anchor_result'];
      const eventFilter = {
        filter: {
          fieldName: 'eventName',
          inListFilter: { values: HERO_EVENTS },
        },
      };

      const [eventTotals, perDay, ctaIdBreakdown, anchorReachedBreakdown] =
        await Promise.all([
          // (1) Headline counts per event over the window.
          runReport(accessToken, propertyId, {
            dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
            dimensions: [{ name: 'eventName' }],
            metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
            dimensionFilter: eventFilter,
          } as Parameters<typeof runReport>[2]).catch(() => ({ rows: [] })),

          // (2) Daily series so the dashboard can sparkline the trend.
          runReport(accessToken, propertyId, {
            dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
            dimensions: [{ name: 'date' }, { name: 'eventName' }],
            metrics: [{ name: 'eventCount' }],
            dimensionFilter: eventFilter,
            orderBys: [{ dimension: { dimensionName: 'date' } }],
          } as Parameters<typeof runReport>[2]).catch(() => ({ rows: [] })),

          // (3) Click split by primary vs. secondary CTA (custom param `cta_id`).
          runReport(accessToken, propertyId, {
            dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
            dimensions: [
              { name: 'eventName' },
              { name: 'customEvent:cta_id' },
            ],
            metrics: [{ name: 'eventCount' }],
            dimensionFilter: {
              filter: {
                fieldName: 'eventName',
                stringFilter: { value: 'hero_cta_click' },
              },
            },
          } as Parameters<typeof runReport>[2]).catch(() => ({ rows: [] })),

          // (4) Did the anchor land? — split anchor_result by `anchor_reached`.
          runReport(accessToken, propertyId, {
            dateRanges: [{ startDate: dateStart, endDate: dateEnd }],
            dimensions: [{ name: 'customEvent:anchor_reached' }],
            metrics: [{ name: 'eventCount' }],
            dimensionFilter: {
              filter: {
                fieldName: 'eventName',
                stringFilter: { value: 'hero_anchor_result' },
              },
            },
          } as Parameters<typeof runReport>[2]).catch(() => ({ rows: [] })),
        ]);

      const totals: Record<string, { count: number; users: number }> = {};
      for (const ev of HERO_EVENTS) totals[ev] = { count: 0, users: 0 };
      eventTotals?.rows?.forEach((row: AnyRow) => {
        const name = row.dimensionValues?.[0]?.value || '';
        if (!HERO_EVENTS.includes(name)) return;
        totals[name] = {
          count: parseInt(row.metricValues?.[0]?.value || '0'),
          users: parseInt(row.metricValues?.[1]?.value || '0'),
        };
      });

      // Build a date-keyed map first, then emit a sorted array. GA4 returns
      // dates as YYYYMMDD strings; we normalize to YYYY-MM-DD for the UI.
      const dailyMap: Record<
        string,
        { date: string; clicks: number; anchorResults: number }
      > = {};
      perDay?.rows?.forEach((row: AnyRow) => {
        const raw = row.dimensionValues?.[0]?.value || '';
        const evName = row.dimensionValues?.[1]?.value || '';
        const count = parseInt(row.metricValues?.[0]?.value || '0');
        if (raw.length !== 8) return;
        const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
        if (!dailyMap[date]) dailyMap[date] = { date, clicks: 0, anchorResults: 0 };
        if (evName === 'hero_cta_click') dailyMap[date].clicks += count;
        if (evName === 'hero_anchor_result') dailyMap[date].anchorResults += count;
      });
      const dailyTrends = Object.values(dailyMap).sort((a, b) =>
        a.date.localeCompare(b.date),
      );

      const ctaSplit: Record<string, number> = {};
      ctaIdBreakdown?.rows?.forEach((row: AnyRow) => {
        const id = row.dimensionValues?.[1]?.value || '(not set)';
        ctaSplit[id] = (ctaSplit[id] || 0) + parseInt(row.metricValues?.[0]?.value || '0');
      });

      let anchorReachedTrue = 0;
      let anchorReachedFalse = 0;
      let anchorReachedUnknown = 0;
      anchorReachedBreakdown?.rows?.forEach((row: AnyRow) => {
        const v = (row.dimensionValues?.[0]?.value || '').toLowerCase();
        const c = parseInt(row.metricValues?.[0]?.value || '0');
        if (v === 'true') anchorReachedTrue += c;
        else if (v === 'false') anchorReachedFalse += c;
        else anchorReachedUnknown += c;
      });

      const totalClicks = totals['hero_cta_click'].count;
      const totalAnchorResults = totals['hero_anchor_result'].count;
      const knownAnchorResults = anchorReachedTrue + anchorReachedFalse;
      const anchorReachedRate =
        knownAnchorResults > 0 ? (anchorReachedTrue / knownAnchorResults) * 100 : 0;

      result = {
        window: { startDate: dateStart, endDate: dateEnd },
        totals: {
          heroCtaClick: totals['hero_cta_click'],
          heroAnchorResult: totals['hero_anchor_result'],
        },
        ctaSplit,
        anchorReached: {
          true: anchorReachedTrue,
          false: anchorReachedFalse,
          unknown: anchorReachedUnknown,
          ratePct: Number(anchorReachedRate.toFixed(2)),
        },
        dailyTrends,
        derived: {
          totalClicks,
          totalAnchorResults,
          anchorResultCoveragePct:
            totalAnchorResults > 0
              ? Number(((knownAnchorResults / totalAnchorResults) * 100).toFixed(2))
              : 0,
        },
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

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

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const serviceAccount = JSON.parse(serviceAccountJson);
  
  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  // Create JWT
  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  const signatureInput = `${headerB64}.${payloadB64}`;
  
  // Import private key
  const privateKeyPem = serviceAccount.private_key;
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = privateKeyPem.replace(pemHeader, '').replace(pemFooter, '').replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(signatureInput)
  );
  
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  const jwt = `${signatureInput}.${signatureB64}`;
  
  // Exchange JWT for access token
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

async function fetchGSCData(accessToken: string, siteUrl: string, startDate: string, endDate: string, country: string): Promise<GSCResponse> {
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
        dimensions: ["query"],
        dimensionFilterGroups: [{
          filters: [{
            dimension: "country",
            operator: "equals",
            expression: country,
          }],
        }],
        rowLimit: 500,
        startRow: 0,
      }),
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GSC API error: ${error}`);
  }
  
  return await response.json();
}

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

    // Get request body
    const body = await req.json().catch(() => ({}));
    const { action, keyword, competitors } = body;

    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    if (!serviceAccountJson) {
      return new Response(
        JSON.stringify({ error: 'Google Service Account not configured' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const siteUrl = 'https://getpawsy.pet';
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() - 3); // GSC data is delayed 3 days
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7); // Last 7 days

    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    if (action === 'sync') {
      // Sync all rankings from GSC
      const accessToken = await getAccessToken(serviceAccountJson);
      const gscData = await fetchGSCData(
        accessToken,
        siteUrl,
        formatDate(startDate),
        formatDate(endDate),
        'usa'
      );

      if (!gscData.rows || gscData.rows.length === 0) {
        return new Response(
          JSON.stringify({ success: true, message: 'No ranking data found for USA', count: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Upsert rankings
      const rankings = gscData.rows.map(row => ({
        keyword: row.keys[0],
        position: row.position,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        country: 'usa',
        device: 'all',
        tracked_date: formatDate(endDate),
      }));

      const { error: upsertError } = await adminSupabase
        .from('keyword_rankings')
        .upsert(rankings, { onConflict: 'keyword,country,device,tracked_date' });

      if (upsertError) {
        throw upsertError;
      }

      return new Response(
        JSON.stringify({ success: true, count: rankings.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === 'add_keyword') {
      // Add keyword to watchlist
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

    if (action === 'get_top_keywords') {
      // Get top 10 keywords by position
      const { data: topKeywords, error } = await adminSupabase
        .from('keyword_rankings')
        .select('*')
        .eq('country', 'usa')
        .order('tracked_date', { ascending: false })
        .order('position', { ascending: true })
        .limit(50);

      if (error) throw error;

      // Group by keyword, get latest entry
      const keywordMap = new Map<string, typeof topKeywords[0]>();
      topKeywords?.forEach(kw => {
        if (!keywordMap.has(kw.keyword)) {
          keywordMap.set(kw.keyword, kw);
        }
      });

      const uniqueKeywords = Array.from(keywordMap.values())
        .sort((a, b) => (a.position || 100) - (b.position || 100))
        .slice(0, 10);

      return new Response(
        JSON.stringify({ keywords: uniqueKeywords }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === 'get_history') {
      // Get historical data for a specific keyword
      if (!keyword) {
        return new Response(
          JSON.stringify({ error: 'Keyword is required' }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: history, error } = await adminSupabase
        .from('keyword_rankings')
        .select('*')
        .eq('keyword', keyword)
        .eq('country', 'usa')
        .order('tracked_date', { ascending: true })
        .limit(30);

      if (error) throw error;

      return new Response(
        JSON.stringify({ history }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
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

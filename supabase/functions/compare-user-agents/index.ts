import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'X-Robots-Tag': 'all',
  'X-Content-Served-Identically': 'true',
};

// User agents for testing
const NORMAL_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const GOOGLEBOT_USER_AGENT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

// Simple hash function for content comparison
async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

interface FetchResult {
  status: number;
  headers: Record<string, string>;
  contentLength: number;
  contentHash: string;
  loadTime: number;
}

async function fetchWithUserAgent(url: string, userAgent: string): Promise<FetchResult> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });

    const loadTime = Date.now() - startTime;
    const content = await response.text();
    const contentHash = await hashContent(content);

    // Extract relevant headers
    const headers: Record<string, string> = {};
    const relevantHeaders = [
      'content-type',
      'x-robots-tag',
      'cache-control',
      'x-frame-options',
      'content-security-policy',
      'x-content-served-identically',
    ];

    relevantHeaders.forEach(header => {
      const value = response.headers.get(header);
      if (value) {
        headers[header] = value;
      }
    });

    return {
      status: response.status,
      headers,
      contentLength: content.length,
      contentHash,
      loadTime,
    };
  } catch (error) {
    console.error(`Fetch error for ${url}:`, error);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid URL format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Only allow testing getpawsy.pet domains for security
    const allowedDomains = ['getpawsy.pet', 'www.getpawsy.pet'];
    if (!allowedDomains.some(domain => parsedUrl.hostname.includes(domain))) {
      return new Response(
        JSON.stringify({ error: 'Only GetPawsy domains can be tested' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Comparing User-Agent responses for: ${url}`);

    // Fetch with both user agents in parallel
    const [userResponse, googlebotResponse] = await Promise.all([
      fetchWithUserAgent(url, NORMAL_USER_AGENT),
      fetchWithUserAgent(url, GOOGLEBOT_USER_AGENT),
    ]);

    // Compare responses
    const differences: string[] = [];

    if (userResponse.status !== googlebotResponse.status) {
      differences.push(`Status code verschilt: User=${userResponse.status}, Googlebot=${googlebotResponse.status}`);
    }

    if (userResponse.contentHash !== googlebotResponse.contentHash) {
      differences.push('Content hash verschilt - mogelijk verschillende content geserveerd');
    }

    // Allow some tolerance in content length (dynamic elements like timestamps)
    const lengthDifference = Math.abs(userResponse.contentLength - googlebotResponse.contentLength);
    const lengthPercentage = (lengthDifference / Math.max(userResponse.contentLength, googlebotResponse.contentLength)) * 100;
    
    if (lengthPercentage > 5) {
      differences.push(`Significant verschil in content lengte: ${lengthDifference} bytes (${lengthPercentage.toFixed(1)}%)`);
    }

    const isIdentical = differences.length === 0;

    const result = {
      url,
      userResponse,
      googlebotResponse,
      isIdentical,
      differences,
      testedAt: new Date().toISOString(),
    };

    console.log(`Comparison result: ${isIdentical ? 'IDENTICAL' : 'DIFFERENT'}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in compare-user-agents:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

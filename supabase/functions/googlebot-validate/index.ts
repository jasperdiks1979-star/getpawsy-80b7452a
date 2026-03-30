import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const NORMAL_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface PriceExtraction {
  htmlPrices: string[];
  jsonLdPrice: string | null;
  jsonLdAvailability: string | null;
  jsonLdName: string | null;
  canonical: string | null;
  title: string | null;
  statusCode: number;
  contentLength: number;
  userAgent: string;
}

function extractPricesFromHtml(html: string): string[] {
  const prices: string[] = [];
  // Match $XXX.XX patterns in raw HTML
  const pricePattern = /\$\d{1,5}\.\d{2}/g;
  let match;
  while ((match = pricePattern.exec(html)) !== null) {
    if (!prices.includes(match[0])) {
      prices.push(match[0]);
    }
  }
  return prices;
}

function extractJsonLd(html: string): Record<string, unknown> | null {
  const scripts = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of scripts) {
    try {
      const data = JSON.parse(m[1]);
      // Handle @graph arrays
      if (data['@graph']) {
        const product = data['@graph'].find((item: Record<string, unknown>) => item['@type'] === 'Product');
        if (product) return product;
      }
      if (data['@type'] === 'Product') return data;
    } catch { /* skip malformed */ }
  }
  return null;
}

function extractCanonical(html: string): string | null {
  const match = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/i);
  return match ? match[1] : null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}

async function fetchAndExtract(url: string, userAgent: string): Promise<PriceExtraction> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
    },
    redirect: 'follow',
  });

  const html = await response.text();
  const jsonLd = extractJsonLd(html);

  return {
    htmlPrices: extractPricesFromHtml(html),
    jsonLdPrice: jsonLd?.offers
      ? String((jsonLd.offers as Record<string, unknown>).price || '')
      : null,
    jsonLdAvailability: jsonLd?.offers
      ? String((jsonLd.offers as Record<string, unknown>).availability || '')
      : null,
    jsonLdName: jsonLd?.name ? String(jsonLd.name) : null,
    canonical: extractCanonical(html),
    title: extractTitle(html),
    statusCode: response.status,
    contentLength: html.length,
    userAgent,
  };
}

interface ProductValidation {
  url: string;
  normal: PriceExtraction;
  googlebot: PriceExtraction;
  matches: {
    statusCodeMatch: boolean;
    contentLengthSimilar: boolean;
    jsonLdPriceMatch: boolean;
    jsonLdPresent: boolean;
    htmlContainsJsonLdPrice: boolean;
    googlebotSameAsNormal: boolean;
  };
  verdict: 'PASS' | 'FAIL' | 'WARN';
  issues: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { urls } = await req.json();

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return new Response(
        JSON.stringify({ error: 'urls array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Only allow getpawsy domains
    const allowedDomains = ['getpawsy.pet', 'www.getpawsy.pet', 'getpawsy.lovable.app'];
    const validUrls = urls.filter((u: string) => {
      try {
        const parsed = new URL(u);
        return allowedDomains.some(d => parsed.hostname.includes(d));
      } catch { return false; }
    });

    if (validUrls.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid GetPawsy URLs provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`Googlebot validation for ${validUrls.length} URLs`);

    const results: ProductValidation[] = [];

    for (const url of validUrls) {
      try {
        const [normal, googlebot] = await Promise.all([
          fetchAndExtract(url, NORMAL_UA),
          fetchAndExtract(url, GOOGLEBOT_UA),
        ]);

        const issues: string[] = [];

        // Check status codes match
        const statusCodeMatch = normal.statusCode === googlebot.statusCode;
        if (!statusCodeMatch) issues.push(`Status code differs: normal=${normal.statusCode}, googlebot=${googlebot.statusCode}`);

        // Check content length is similar (within 10%)
        const lengthDiff = Math.abs(normal.contentLength - googlebot.contentLength);
        const maxLength = Math.max(normal.contentLength, googlebot.contentLength);
        const contentLengthSimilar = maxLength > 0 ? (lengthDiff / maxLength) < 0.1 : true;
        if (!contentLengthSimilar) issues.push(`Content length differs by ${((lengthDiff / maxLength) * 100).toFixed(1)}%`);

        // Check JSON-LD presence
        const jsonLdPresent = !!normal.jsonLdPrice && !!googlebot.jsonLdPrice;
        if (!jsonLdPresent) {
          if (!normal.jsonLdPrice) issues.push('No JSON-LD Product price in normal response');
          if (!googlebot.jsonLdPrice) issues.push('No JSON-LD Product price in Googlebot response');
        }

        // Check JSON-LD price matches between normal and googlebot
        const jsonLdPriceMatch = normal.jsonLdPrice === googlebot.jsonLdPrice;
        if (!jsonLdPriceMatch && jsonLdPresent) {
          issues.push(`JSON-LD price mismatch: normal=$${normal.jsonLdPrice}, googlebot=$${googlebot.jsonLdPrice}`);
        }

        // Check HTML contains the JSON-LD price (SSR validation)
        const htmlContainsJsonLdPrice = googlebot.jsonLdPrice
          ? googlebot.htmlPrices.some(p => p.includes(googlebot.jsonLdPrice!))
          : false;

        // Overall Googlebot vs Normal comparison
        const googlebotSameAsNormal = statusCodeMatch && contentLengthSimilar && jsonLdPriceMatch;
        if (!googlebotSameAsNormal && issues.length === 0) {
          issues.push('Googlebot response differs from normal response');
        }

        // Determine verdict
        let verdict: 'PASS' | 'FAIL' | 'WARN' = 'PASS';
        if (!statusCodeMatch || (!jsonLdPriceMatch && jsonLdPresent)) {
          verdict = 'FAIL';
        } else if (!jsonLdPresent || !contentLengthSimilar) {
          verdict = 'WARN';
        }

        results.push({
          url,
          normal,
          googlebot,
          matches: {
            statusCodeMatch,
            contentLengthSimilar,
            jsonLdPriceMatch,
            jsonLdPresent,
            htmlContainsJsonLdPrice,
            googlebotSameAsNormal,
          },
          verdict,
          issues,
        });
      } catch (err) {
        results.push({
          url,
          normal: { htmlPrices: [], jsonLdPrice: null, jsonLdAvailability: null, jsonLdName: null, canonical: null, title: null, statusCode: 0, contentLength: 0, userAgent: NORMAL_UA },
          googlebot: { htmlPrices: [], jsonLdPrice: null, jsonLdAvailability: null, jsonLdName: null, canonical: null, title: null, statusCode: 0, contentLength: 0, userAgent: GOOGLEBOT_UA },
          matches: { statusCodeMatch: false, contentLengthSimilar: false, jsonLdPriceMatch: false, jsonLdPresent: false, htmlContainsJsonLdPrice: false, googlebotSameAsNormal: false },
          verdict: 'FAIL',
          issues: [`Fetch error: ${(err as Error).message}`],
        });
      }
    }

    const allPass = results.every(r => r.verdict === 'PASS');
    const failCount = results.filter(r => r.verdict === 'FAIL').length;

    const response = {
      testedAt: new Date().toISOString(),
      summary: {
        totalUrls: results.length,
        pass: results.filter(r => r.verdict === 'PASS').length,
        warn: results.filter(r => r.verdict === 'WARN').length,
        fail: failCount,
        overallVerdict: failCount > 0 ? 'FAIL' : allPass ? 'PASS' : 'WARN',
      },
      results,
    };

    console.log(`Googlebot validation complete: ${response.summary.overallVerdict}`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Error in googlebot-validate:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

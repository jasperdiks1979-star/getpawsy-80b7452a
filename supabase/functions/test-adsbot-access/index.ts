import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'X-Robots-Tag': 'all',
};

// AdsBot User-Agent (as per Google documentation)
const ADSBOT_USER_AGENT = 'AdsBot-Google (+http://www.google.com/adsbot.html)';
const ADSBOT_MOBILE_USER_AGENT = 'Mozilla/5.0 (Linux; Android 5.0; SM-G920A) AppleWebKit (KHTML, like Gecko) Chrome Mobile Safari (compatible; AdsBot-Google-Mobile; +http://www.google.com/mobile/adsbot.html)';
const STOREBOT_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64; Storebot-Google/1.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.88 Safari/537.36';

interface LandingPageTest {
  url: string;
  adsbot: {
    accessible: boolean;
    status: number;
    loadTime: number;
    hasContent: boolean;
  };
  adsbotMobile: {
    accessible: boolean;
    status: number;
    loadTime: number;
    hasContent: boolean;
  };
  storebot: {
    accessible: boolean;
    status: number;
    loadTime: number;
    hasContent: boolean;
  };
}

async function testBotAccess(url: string, userAgent: string): Promise<{
  accessible: boolean;
  status: number;
  loadTime: number;
  hasContent: boolean;
}> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    const loadTime = Date.now() - startTime;
    const content = await response.text();

    return {
      accessible: response.status === 200,
      status: response.status,
      loadTime,
      hasContent: content.length > 1000, // Minimum content threshold
    };
  } catch (error) {
    console.error(`Bot access test failed for ${url}:`, error);
    return {
      accessible: false,
      status: 0,
      loadTime: Date.now() - startTime,
      hasContent: false,
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { urls } = await req.json();

    // Default landing pages to test if none provided
    const landingPagesToTest: string[] = urls || [
      'https://getpawsy.pet/',
      'https://getpawsy.pet/products',
      'https://getpawsy.pet/about',
      'https://getpawsy.pet/contact',
      'https://getpawsy.pet/bestsellers',
    ];

    console.log(`Testing AdsBot access for ${landingPagesToTest.length} pages`);

    const results: LandingPageTest[] = [];

    for (const url of landingPagesToTest) {
      // Validate URL
      try {
        const parsedUrl = new URL(url);
        const allowedDomains = ['getpawsy.pet', 'www.getpawsy.pet', 'getpawsy.lovable.app'];
        if (!allowedDomains.some(domain => parsedUrl.hostname.includes(domain))) {
          console.log(`Skipping non-GetPawsy URL: ${url}`);
          continue;
        }
      } catch {
        console.log(`Invalid URL skipped: ${url}`);
        continue;
      }

      // Test all three bot types in parallel
      const [adsbot, adsbotMobile, storebot] = await Promise.all([
        testBotAccess(url, ADSBOT_USER_AGENT),
        testBotAccess(url, ADSBOT_MOBILE_USER_AGENT),
        testBotAccess(url, STOREBOT_USER_AGENT),
      ]);

      results.push({
        url,
        adsbot,
        adsbotMobile,
        storebot,
      });
    }

    // Calculate summary
    const allAccessible = results.every(r => 
      r.adsbot.accessible && 
      r.adsbotMobile.accessible && 
      r.storebot.accessible
    );

    const avgLoadTime = results.reduce((sum, r) => 
      sum + r.adsbot.loadTime + r.adsbotMobile.loadTime + r.storebot.loadTime, 0
    ) / (results.length * 3);

    const summary = {
      totalPagesTestad: results.length,
      allAccessible,
      averageLoadTime: Math.round(avgLoadTime),
      adsbotAccessRate: results.filter(r => r.adsbot.accessible).length / results.length * 100,
      adsbotMobileAccessRate: results.filter(r => r.adsbotMobile.accessible).length / results.length * 100,
      storebotAccessRate: results.filter(r => r.storebot.accessible).length / results.length * 100,
    };

    const response = {
      testedAt: new Date().toISOString(),
      summary,
      results,
      robotsTxtNote: 'All Google Ad bots are explicitly allowed in robots.txt',
    };

    console.log(`AdsBot test complete: ${allAccessible ? 'ALL ACCESSIBLE' : 'SOME BLOCKED'}`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in test-adsbot-access:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScrapeResult {
  success: boolean;
  title?: string;
  markdown?: string;
  html?: string;
  screenshot?: string;
  summary?: string;
  autoTags?: string[];
  metadata?: {
    description?: string;
    author?: string;
    publishedDate?: string;
    sourceURL?: string;
    statusCode?: number;
  };
  error?: string;
}

interface BatchResult {
  url: string;
  result: ScrapeResult;
}

async function scrapeUrl(url: string, options: { screenshot?: boolean; summary?: boolean; autoTags?: boolean }): Promise<ScrapeResult> {
  const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!firecrawlApiKey) {
    return { success: false, error: 'Firecrawl not configured' };
  }

  // Format URL
  let formattedUrl = url.trim();
  if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
    formattedUrl = `https://${formattedUrl}`;
  }

  console.log('[CONTENT-SCRAPER] Scraping URL:', formattedUrl);

  // Build formats array based on options
  const formats: string[] = ['markdown', 'html'];
  if (options.screenshot) {
    formats.push('screenshot');
  }

  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${firecrawlApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: formattedUrl,
      formats,
      onlyMainContent: true,
      waitFor: 3000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[CONTENT-SCRAPER] Firecrawl error:', errorText);
    return { success: false, error: `Scrape failed: ${response.status}` };
  }

  const data = await response.json();
  
  // Extract data from response (handle both nested and flat structures)
  const markdown = data.data?.markdown || data.markdown || '';
  const html = data.data?.html || data.html || '';
  const screenshot = data.data?.screenshot || data.screenshot || '';
  const metadata = data.data?.metadata || data.metadata || {};

  // Extract title from metadata or markdown
  let title = metadata.title || '';
  if (!title && markdown) {
    const titleMatch = markdown.match(/^#\s+(.+?)(?:\n|$)/m);
    if (titleMatch) {
      title = titleMatch[1].replace(/\*\*/g, '').trim();
    }
  }

  console.log('[CONTENT-SCRAPER] Successfully scraped:', title || formattedUrl);

  const result: ScrapeResult = {
    success: true,
    title,
    markdown,
    html,
    screenshot: options.screenshot ? screenshot : undefined,
    metadata: {
      description: metadata.description,
      author: metadata.author,
      publishedDate: metadata.publishedDate,
      sourceURL: metadata.sourceURL || formattedUrl,
      statusCode: metadata.statusCode,
    },
  };

  // Generate AI summary if requested
  if (options.summary && markdown) {
    const summaryResult = await generateSummary(markdown);
    if (summaryResult) {
      result.summary = summaryResult;
    }
  }

  // Generate auto-tags if requested
  if (options.autoTags && markdown) {
    const tagsResult = await generateAutoTags(markdown, title);
    if (tagsResult && tagsResult.length > 0) {
      result.autoTags = tagsResult;
    }
  }

  return result;
}

async function generateSummary(content: string): Promise<string | null> {
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!lovableApiKey) {
    console.error('[CONTENT-SCRAPER] LOVABLE_API_KEY not configured');
    return null;
  }

  try {
    // Limit content to avoid token limits
    const truncatedContent = content.slice(0, 8000);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          {
            role: 'system',
            content: 'Je bent een expert in het samenvatten van content. Maak een beknopte samenvatting in het Nederlands van de belangrijkste punten. Maximaal 150 woorden.'
          },
          {
            role: 'user',
            content: `Vat de volgende content samen:\n\n${truncatedContent}`
          }
        ],
      }),
    });

    if (!response.ok) {
      console.error('[CONTENT-SCRAPER] Summary generation failed:', response.status);
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (error) {
    console.error('[CONTENT-SCRAPER] Error generating summary:', error);
    return null;
  }
}

async function generateAutoTags(content: string, title: string): Promise<string[] | null> {
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!lovableApiKey) {
    console.error('[CONTENT-SCRAPER] LOVABLE_API_KEY not configured');
    return null;
  }

  try {
    // Limit content to avoid token limits
    const truncatedContent = content.slice(0, 4000);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          {
            role: 'system',
            content: 'Je genereert relevante tags voor content. Geef 3-5 korte, relevante tags in het Nederlands, gescheiden door komma\'s. Alleen de tags, geen uitleg.'
          },
          {
            role: 'user',
            content: `Genereer tags voor deze content:\n\nTitel: ${title}\n\nContent: ${truncatedContent}`
          }
        ],
      }),
    });

    if (!response.ok) {
      console.error('[CONTENT-SCRAPER] Tag generation failed:', response.status);
      return null;
    }

    const data = await response.json();
    const tagsText = data.choices?.[0]?.message?.content || '';
    
    // Parse comma-separated tags
    const tags = tagsText
      .split(',')
      .map((tag: string) => tag.trim().toLowerCase())
      .filter((tag: string) => tag.length > 0 && tag.length < 30);
    
    return tags.slice(0, 5);
  } catch (error) {
    console.error('[CONTENT-SCRAPER] Error generating tags:', error);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { url, urls, screenshot = false, summary = false, autoTags = false } = body;

    // Handle batch scraping
    if (urls && Array.isArray(urls) && urls.length > 0) {
      console.log('[CONTENT-SCRAPER] Batch scraping', urls.length, 'URLs');
      
      // Limit to 10 URLs max for batch
      const limitedUrls = urls.slice(0, 10);
      const results: BatchResult[] = [];

      for (const singleUrl of limitedUrls) {
        const result = await scrapeUrl(singleUrl, { screenshot, summary, autoTags });
        results.push({ url: singleUrl, result });
        
        // Small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      return new Response(
        JSON.stringify({ success: true, batch: true, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle single URL
    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await scrapeUrl(url, { screenshot, summary, autoTags });

    return new Response(
      JSON.stringify(result),
      { status: result.success ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[CONTENT-SCRAPER] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProductData {
  name: string | null;
  price: number | null;
  currency: string | null;
  description: string | null;
  images: string[];
  specifications: Record<string, string>;
  category: string | null;
  rating: number | null;
  reviewCount: number | null;
  availability: string | null;
  brand: string | null;
  sku: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[PRODUCT-RESEARCH] Scraping URL:', url);

    // First, try to scrape with markdown format
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });

    if (!scrapeResponse.ok) {
      const errorText = await scrapeResponse.text();
      console.error('[PRODUCT-RESEARCH] Firecrawl scrape error:', errorText);
      return new Response(
        JSON.stringify({ success: false, error: `Scrape failed: ${scrapeResponse.status}` }),
        { status: scrapeResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const scrapeData = await scrapeResponse.json();
    const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';
    const html = scrapeData.data?.html || scrapeData.html || '';

    console.log('[PRODUCT-RESEARCH] Scraped content length:', markdown.length);

    // Extract product data from the scraped content
    const productData = extractProductData(markdown, html, url);

    console.log('[PRODUCT-RESEARCH] Extracted product:', productData.name);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: productData,
        rawMarkdown: markdown.substring(0, 5000), // Include first 5000 chars for reference
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[PRODUCT-RESEARCH] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function extractProductData(markdown: string, html: string, url: string): ProductData {
  const data: ProductData = {
    name: null,
    price: null,
    currency: null,
    description: null,
    images: [],
    specifications: {},
    category: null,
    rating: null,
    reviewCount: null,
    availability: null,
    brand: null,
    sku: null,
  };

  // Extract product name from first heading or title
  const nameMatch = markdown.match(/^#\s+(.+?)(?:\n|$)/m) || 
                    markdown.match(/\*\*(.{10,100}?)\*\*/) ||
                    html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (nameMatch) {
    data.name = cleanText(nameMatch[1]);
  }

  // Extract prices - look for various currency patterns
  const pricePatterns = [
    /\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g,
    /€(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/g,
    /£(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g,
    /(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:USD|EUR|GBP)/gi,
  ];

  for (const pattern of pricePatterns) {
    const matches = [...markdown.matchAll(pattern)];
    if (matches.length > 0) {
      const priceStr = matches[0][1].replace(/,/g, '').replace(/\./g, '.');
      const price = parseFloat(priceStr);
      if (!isNaN(price) && price > 0 && price < 100000) {
        data.price = price;
        // Detect currency
        if (markdown.includes('$')) data.currency = 'USD';
        else if (markdown.includes('€')) data.currency = 'EUR';
        else if (markdown.includes('£')) data.currency = 'GBP';
        break;
      }
    }
  }

  // Extract rating
  const ratingPatterns = [
    /(\d(?:\.\d)?)\s*(?:out of|\/)\s*5\s*(?:stars?)?/i,
    /(\d(?:\.\d)?)\s*stars?/i,
    /rating[:\s]*(\d(?:\.\d)?)/i,
  ];
  for (const pattern of ratingPatterns) {
    const match = markdown.match(pattern);
    if (match) {
      const rating = parseFloat(match[1]);
      if (rating >= 0 && rating <= 5) {
        data.rating = rating;
        break;
      }
    }
  }

  // Extract review count
  const reviewMatch = markdown.match(/(\d{1,3}(?:,\d{3})*)\s*(?:reviews?|ratings?|beoordelingen)/i);
  if (reviewMatch) {
    data.reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''), 10);
  }

  // Extract description - look for description-like content
  const descPatterns = [
    /(?:description|about|overview)[:\s]*\n+(.{50,500}?)(?:\n\n|$)/is,
    /(?:^|\n)([A-Z][^.!?]*(?:[.!?][^.!?]*){1,5}[.!?])(?:\n|$)/m,
  ];
  for (const pattern of descPatterns) {
    const match = markdown.match(pattern);
    if (match && match[1].length > 50) {
      data.description = cleanText(match[1]).substring(0, 1000);
      break;
    }
  }

  // If no description found, use first substantial paragraph
  if (!data.description) {
    const paragraphs = markdown.split(/\n\n+/);
    for (const para of paragraphs) {
      const cleaned = cleanText(para);
      if (cleaned.length > 100 && cleaned.length < 1000 && !cleaned.startsWith('#')) {
        data.description = cleaned;
        break;
      }
    }
  }

  // Extract images from markdown
  const imageMatches = [...markdown.matchAll(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/g)];
  data.images = imageMatches
    .map(m => m[1])
    .filter(url => !url.includes('logo') && !url.includes('icon'))
    .slice(0, 10);

  // Also extract images from HTML
  const htmlImageMatches = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)];
  const htmlImages = htmlImageMatches
    .map(m => m[1])
    .filter(url => url.startsWith('http') && !url.includes('logo') && !url.includes('icon'))
    .slice(0, 10);
  data.images = [...new Set([...data.images, ...htmlImages])].slice(0, 10);

  // Extract brand
  const brandPatterns = [
    /(?:brand|merk)[:\s]*([A-Z][a-zA-Z0-9\s]{2,30})/i,
    /(?:by|van)\s+([A-Z][a-zA-Z0-9\s]{2,30})/i,
  ];
  for (const pattern of brandPatterns) {
    const match = markdown.match(pattern);
    if (match) {
      data.brand = cleanText(match[1]);
      break;
    }
  }

  // Extract availability
  const availPatterns = [
    /(in stock|out of stock|available|unavailable|op voorraad|niet op voorraad)/i,
  ];
  for (const pattern of availPatterns) {
    const match = markdown.match(pattern);
    if (match) {
      data.availability = match[1].toLowerCase().includes('out') || 
                          match[1].toLowerCase().includes('niet') ||
                          match[1].toLowerCase().includes('unavailable')
        ? 'Out of Stock' 
        : 'In Stock';
      break;
    }
  }

  // Extract specifications from bullet points or tables
  const specPatterns = [
    /^[-•*]\s*([^:]+):\s*(.+)$/gm,
    /\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/g,
  ];
  for (const pattern of specPatterns) {
    const matches = [...markdown.matchAll(pattern)];
    for (const match of matches.slice(0, 20)) {
      const key = cleanText(match[1]);
      const value = cleanText(match[2]);
      if (key.length > 2 && key.length < 50 && value.length > 0 && value.length < 200) {
        data.specifications[key] = value;
      }
    }
  }

  // Try to extract category from URL or breadcrumbs
  const urlParts = url.split('/').filter(p => p.length > 2 && !p.includes('.') && !p.includes('='));
  if (urlParts.length > 2) {
    data.category = urlParts.slice(1, 3).join(' > ');
  }

  return data;
}

function cleanText(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/\[|\]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[#*_`]/g, '')
    .trim();
}

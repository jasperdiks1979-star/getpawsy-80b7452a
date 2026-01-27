import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CompetitorConfig {
  name: string;
  url: string;
  selector?: string;
}

const COMPETITORS: CompetitorConfig[] = [
  {
    name: 'amazon',
    url: 'https://www.amazon.com/Best-Sellers-Pet-Supplies/zgbs/pet-supplies',
  },
  {
    name: 'chewy',
    url: 'https://www.chewy.com/b/best-sellers-9587',
  },
  {
    name: 'petco',
    url: 'https://www.petco.com/shop/en/petcostore/category/best-sellers',
  },
];

interface ScrapedProduct {
  name: string;
  rank: number;
  price?: number;
  url?: string;
  image?: string;
}

async function scrapeCompetitor(
  competitor: CompetitorConfig,
  firecrawlApiKey: string
): Promise<ScrapedProduct[]> {
  console.log(`Scraping ${competitor.name}...`);
  
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: competitor.url,
        formats: ['markdown', 'links'],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Firecrawl error for ${competitor.name}:`, errorText);
      throw new Error(`Failed to scrape ${competitor.name}: ${response.status}`);
    }

    const data = await response.json();
    const markdown = data.data?.markdown || data.markdown || '';
    const links = data.data?.links || data.links || [];
    
    // Parse the markdown to extract product information
    const products = parseProductsFromMarkdown(markdown, links, competitor.name);
    
    console.log(`Found ${products.length} products from ${competitor.name}`);
    return products;
  } catch (error) {
    console.error(`Error scraping ${competitor.name}:`, error);
    throw error;
  }
}

function parseProductsFromMarkdown(
  markdown: string,
  links: string[],
  competitor: string
): ScrapedProduct[] {
  const products: ScrapedProduct[] = [];
  const lines = markdown.split('\n').filter(line => line.trim());
  
  let currentRank = 0;
  
  for (const line of lines) {
    // Skip navigation and header lines
    if (line.startsWith('#') && line.length < 50) continue;
    if (line.includes('Sign in') || line.includes('Cart') || line.includes('Menu')) continue;
    
    // Look for product patterns
    // Pattern 1: Numbered lists like "1. Product Name"
    const numberedMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (numberedMatch) {
      currentRank = parseInt(numberedMatch[1]);
      const productName = numberedMatch[2].trim();
      if (productName.length > 10 && productName.length < 200) {
        products.push({
          name: cleanProductName(productName),
          rank: currentRank,
        });
        continue;
      }
    }
    
    // Pattern 2: Bold product names with prices
    const boldMatch = line.match(/\*\*(.+?)\*\*/);
    if (boldMatch && boldMatch[1].length > 10) {
      currentRank++;
      const priceMatch = line.match(/\$(\d+(?:\.\d{2})?)/);
      products.push({
        name: cleanProductName(boldMatch[1]),
        rank: currentRank,
        price: priceMatch ? parseFloat(priceMatch[1]) : undefined,
      });
      continue;
    }
    
    // Pattern 3: Lines that look like product names (capitalized, reasonable length)
    if (line.length > 20 && line.length < 150 && !line.startsWith('[') && !line.includes('http')) {
      const priceMatch = line.match(/\$(\d+(?:\.\d{2})?)/);
      const cleanedName = line.replace(/\$\d+(?:\.\d{2})?/g, '').trim();
      
      if (cleanedName.length > 15 && isLikelyProductName(cleanedName)) {
        currentRank++;
        products.push({
          name: cleanProductName(cleanedName),
          rank: currentRank,
          price: priceMatch ? parseFloat(priceMatch[1]) : undefined,
        });
      }
    }
  }
  
  // Limit to top 20 products and ensure unique names
  const seen = new Set<string>();
  const uniqueProducts: ScrapedProduct[] = [];
  
  for (const product of products) {
    const key = product.name.toLowerCase();
    if (!seen.has(key) && uniqueProducts.length < 20) {
      seen.add(key);
      uniqueProducts.push({
        ...product,
        rank: uniqueProducts.length + 1,
      });
    }
  }
  
  return uniqueProducts;
}

function cleanProductName(name: string): string {
  return name
    .replace(/\*\*/g, '')
    .replace(/\[|\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function isLikelyProductName(text: string): boolean {
  // Check if text looks like a product name
  const hasUppercase = /[A-Z]/.test(text);
  const hasPetKeywords = /dog|cat|pet|food|treat|toy|bed|collar|leash|bowl|crate|carrier/i.test(text);
  const notNavigation = !/shop|cart|sign|login|account|help|contact|about/i.test(text);
  
  return hasUppercase && hasPetKeywords && notNavigation;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Create cron job log entry
  const { data: cronLog } = await supabase
    .from('cron_job_logs')
    .insert({
      job_name: 'nightly-competitor-scrape',
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  const cronLogId = cronLog?.id;

  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      
      if (cronLogId) {
        await supabase
          .from('cron_job_logs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            success: false,
            error_message: 'Firecrawl not configured',
          })
          .eq('id', cronLogId);
      }
      
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const targetCompetitor = body.competitor; // Optional: scrape specific competitor
    
    const competitorsToScrape = targetCompetitor 
      ? COMPETITORS.filter(c => c.name === targetCompetitor)
      : COMPETITORS;

    const results: { competitor: string; success: boolean; products: number; error?: string }[] = [];

    for (const competitor of competitorsToScrape) {
      try {
        const products = await scrapeCompetitor(competitor, firecrawlApiKey);
        
        // Get existing products for this competitor
        const { data: existingProducts } = await supabase
          .from('competitor_products')
          .select('id, product_name, current_rank')
          .eq('competitor', competitor.name);

        const existingMap = new Map(
          (existingProducts || []).map(p => [p.product_name.toLowerCase(), p])
        );

        // Update or insert products
        for (const product of products) {
          const existing = existingMap.get(product.name.toLowerCase());
          
          if (existing) {
            // Update existing product
            const previousRank = existing.current_rank;
            const rankChange = previousRank - product.rank;
            let trend = 'stable';
            if (rankChange > 0) trend = 'up';
            else if (rankChange < 0) trend = 'down';

            await supabase
              .from('competitor_products')
              .update({
                current_rank: product.rank,
                previous_rank: previousRank,
                rank_change: rankChange,
                trend,
                price: product.price,
                last_seen_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id);
          } else {
            // Insert new product
            await supabase
              .from('competitor_products')
              .insert({
                competitor: competitor.name,
                product_name: product.name,
                product_url: product.url,
                product_image: product.image,
                current_rank: product.rank,
                price: product.price,
                trend: 'new',
              });
          }
        }

        // Log successful scrape
        await supabase.from('competitor_scrape_logs').insert({
          competitor: competitor.name,
          success: true,
          products_found: products.length,
        });

        results.push({ competitor: competitor.name, success: true, products: products.length });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // Log failed scrape
        await supabase.from('competitor_scrape_logs').insert({
          competitor: competitor.name,
          success: false,
          products_found: 0,
          error_message: errorMessage,
        });

        results.push({ competitor: competitor.name, success: false, products: 0, error: errorMessage });
      }
    }

    // Calculate totals for cron log
    const totalProducts = results.reduce((sum, r) => sum + r.products, 0);
    const failedCompetitors = results.filter(r => !r.success).length;

    if (cronLogId) {
      await supabase
        .from('cron_job_logs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          success: failedCompetitors === 0,
          items_processed: totalProducts,
          items_failed: failedCompetitors,
          details: { results },
        })
        .eq('id', cronLogId);
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in scrape-competitor-products:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (cronLogId) {
      await supabase
        .from('cron_job_logs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          success: false,
          error_message: errorMessage,
        })
        .eq('id', cronLogId);
    }

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

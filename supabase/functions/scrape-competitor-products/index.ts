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

interface TrendingProduct {
  name: string;
  competitor: string;
  rank: number;
  rankChange: number;
  trend: 'up' | 'new';
  price?: number;
}

async function sendTrendingAlert(trendingProducts: TrendingProduct[]): Promise<void> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey || trendingProducts.length === 0) {
    return;
  }

  const productRows = trendingProducts
    .map(p => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${p.name.slice(0, 60)}${p.name.length > 60 ? '...' : ''}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-transform: capitalize;">${p.competitor}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">#${p.rank}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
          ${p.trend === 'new' 
            ? '<span style="background: #10b981; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">NEW</span>' 
            : `<span style="color: #10b981; font-weight: 600;">↑ ${p.rankChange}</span>`}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${p.price ? `$${p.price.toFixed(2)}` : '-'}</td>
      </tr>
    `)
    .join('');

  const newCount = trendingProducts.filter(p => p.trend === 'new').length;
  const risingCount = trendingProducts.filter(p => p.trend === 'up').length;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Pawsy Alerts <alerts@getpawsy.pet>',
        to: ['info@getpawsy.pet'],
        subject: `🔥 ${trendingProducts.length} Trending Products Detected at Competitors`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; padding: 20px;">
            <div style="max-width: 700px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <div style="background: linear-gradient(135deg, #f97316, #ea580c); padding: 24px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">🔥 Trending Products Alert</h1>
              </div>
              
              <div style="padding: 24px;">
                <p style="color: #374151; font-size: 16px; margin-bottom: 20px;">
                  We detected <strong>${trendingProducts.length} trending products</strong> at competitor stores:
                </p>
                
                <div style="display: flex; gap: 16px; margin-bottom: 24px;">
                  ${newCount > 0 ? `
                    <div style="background: #ecfdf5; padding: 12px 20px; border-radius: 8px; flex: 1;">
                      <div style="font-size: 24px; font-weight: bold; color: #10b981;">${newCount}</div>
                      <div style="font-size: 14px; color: #059669;">New Products</div>
                    </div>
                  ` : ''}
                  ${risingCount > 0 ? `
                    <div style="background: #fef3c7; padding: 12px 20px; border-radius: 8px; flex: 1;">
                      <div style="font-size: 24px; font-weight: bold; color: #d97706;">${risingCount}</div>
                      <div style="font-size: 14px; color: #b45309;">Rising in Rank</div>
                    </div>
                  ` : ''}
                </div>
                
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                  <thead>
                    <tr style="background: #f3f4f6;">
                      <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">Product</th>
                      <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">Competitor</th>
                      <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151;">Rank</th>
                      <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151;">Trend</th>
                      <th style="padding: 12px; text-align: right; font-weight: 600; color: #374151;">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${productRows}
                  </tbody>
                </table>
                
                <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
                  <a href="https://getpawsy.lovable.app/admin" style="display: inline-block; background: #f97316; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                    View Full Analysis →
                  </a>
                </div>
              </div>
              
              <div style="background: #f9fafb; padding: 16px; text-align: center; font-size: 12px; color: #6b7280;">
                Automated alert from Pawsy Competitor Intelligence • ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
          </body>
          </html>
        `,
      }),
    });

    if (response.ok) {
      console.log(`Sent trending alert for ${trendingProducts.length} products`);
    } else {
      console.error('Failed to send trending alert:', await response.text());
    }
  } catch (error) {
    console.error('Failed to send trending alert:', error);
  }
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
  const trendingProducts: TrendingProduct[] = [];

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
            let trend: 'up' | 'down' | 'stable' = 'stable';
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

            // Track significant rank improvements (moved up 3+ positions)
            if (trend === 'up' && rankChange >= 3) {
              trendingProducts.push({
                name: product.name,
                competitor: competitor.name,
                rank: product.rank,
                rankChange,
                trend: 'up',
                price: product.price,
              });
            }
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

            // Track new products in top 10
            if (product.rank <= 10) {
              trendingProducts.push({
                name: product.name,
                competitor: competitor.name,
                rank: product.rank,
                rankChange: 0,
                trend: 'new',
                price: product.price,
              });
            }
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

    // Send trending alert if there are trending products
    if (trendingProducts.length > 0) {
      await sendTrendingAlert(trendingProducts);
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
          details: { results, trendingAlertSent: trendingProducts.length > 0 },
        })
        .eq('id', cronLogId);
    }

    return new Response(
      JSON.stringify({ success: true, results, trendingProducts: trendingProducts.length }),
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

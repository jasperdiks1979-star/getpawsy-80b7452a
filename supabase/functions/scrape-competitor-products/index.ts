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
    // Use the ref parameter to get product listings, not page chrome
    url: 'https://www.amazon.com/gp/bestsellers/pet-supplies/ref=zg_bs_nav_pet-supplies_0',
  },
  {
    name: 'chewy',
    url: 'https://www.chewy.com/b/best-sellers-9587',
  },
  {
    name: 'petco',
    url: 'https://www.petco.com/shop/en/petcostore/category/best-sellers',
  },
  {
    name: 'petsmart',
    // PetSmart bestsellers - tends to be lighter/easier to scrape
    url: 'https://www.petsmart.com/featured-shops/best-sellers/',
  },
  {
    name: 'walmart',
    // Walmart Pet section - simpler page structure
    url: 'https://www.walmart.com/browse/pets/best-selling-pet-supplies/5440_1087436_1646921',
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

interface SourcingOpportunity {
  competitorProductId: string;
  productName: string;
  competitor: string;
  rank: number;
  price?: number;
}

// Simple text matching for product names
function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateMatchScore(name1: string, name2: string): number {
  const normalized1 = normalizeProductName(name1);
  const normalized2 = normalizeProductName(name2);
  
  // Extract keywords (words longer than 2 chars)
  const words1 = new Set(normalized1.split(' ').filter(w => w.length > 2));
  const words2 = new Set(normalized2.split(' ').filter(w => w.length > 2));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  // Count matching words
  let matches = 0;
  for (const word of words1) {
    if (words2.has(word)) matches++;
  }
  
  // Calculate Jaccard similarity
  const union = new Set([...words1, ...words2]);
  return Math.round((matches / union.size) * 100);
}

async function updateBestsellersFromCompetitors(
  supabase: any,
  competitorProducts: { id: string; product_name: string; competitor: string; current_rank: number; price?: number }[]
): Promise<{ matched: number; sourcing: number }> {
  console.log('Updating bestsellers from competitor data...');
  
  // Get all our products
  const { data: ourProducts, error: productsError } = await supabase
    .from('products')
    .select('id, name, slug, is_active')
    .eq('is_active', true);
  
  if (productsError || !ourProducts) {
    console.error('Failed to fetch our products:', productsError);
    return { matched: 0, sourcing: 0 };
  }
  
  // Get existing bestsellers
  const { data: existingBestsellers } = await supabase
    .from('bestsellers')
    .select('id, product_id, rank, is_manual')
    .eq('is_active', true);
  
  const manualBestsellerProductIds = new Set(
    ((existingBestsellers || []) as any[]).filter((b: any) => b.is_manual).map((b: any) => b.product_id)
  );
  
  // Find best match for each competitor product using "highest rank wins"
  const productBestRank: Map<string, { rank: number; competitorProductId: string }> = new Map();
  const sourcingOpportunities: SourcingOpportunity[] = [];
  
  for (const compProduct of competitorProducts) {
    // Only consider top 25 products
    if (compProduct.current_rank > 25) continue;
    
    // Try to match to our products
    let bestMatch: { productId: string; score: number } | null = null;
    
    for (const ourProduct of (ourProducts as any[])) {
      const score = calculateMatchScore(compProduct.product_name, ourProduct.name);
      
      // Require at least 40% match
      if (score >= 40 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { productId: ourProduct.id, score };
      }
    }
    
    if (bestMatch) {
      // Check if this product should get a better rank
      const existing = productBestRank.get(bestMatch.productId);
      if (!existing || compProduct.current_rank < existing.rank) {
        productBestRank.set(bestMatch.productId, {
          rank: compProduct.current_rank,
          competitorProductId: compProduct.id
        });
      }
      
      // Also create/update product match
      await supabase
        .from('product_matches')
        .upsert({
          product_id: bestMatch.productId,
          competitor_product_id: compProduct.id,
          match_score: bestMatch.score,
          match_type: 'auto',
          is_verified: false,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'product_id,competitor_product_id'
        });
    } else {
      // No match found - this is a sourcing opportunity
      sourcingOpportunities.push({
        competitorProductId: compProduct.id,
        productName: compProduct.product_name,
        competitor: compProduct.competitor,
        rank: compProduct.current_rank,
        price: compProduct.price ?? undefined
      });
    }
  }
  
  // Update bestsellers (only for non-manual entries)
  let matchedCount = 0;
  
  for (const [productId, { rank }] of productBestRank) {
    // Skip if this is a manually managed bestseller
    if (manualBestsellerProductIds.has(productId)) {
      console.log(`Skipping manual bestseller: ${productId}`);
      continue;
    }
    
    const product = (ourProducts as any[]).find((p: any) => p.id === productId);
    if (!product) continue;
    
    // Upsert bestseller entry
    const { error: upsertError } = await supabase
      .from('bestsellers')
      .upsert({
        product_id: productId,
        slug: product.slug || productId,
        rank: rank,
        is_manual: false,
        is_active: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'product_id'
      });
    
    if (!upsertError) {
      matchedCount++;
      console.log(`Updated bestseller: ${product.name} (rank ${rank})`);
    }
  }
  
  // Log sourcing opportunities
  for (const opportunity of sourcingOpportunities) {
    await supabase
      .from('sourcing_opportunities')
      .upsert({
        competitor_product_id: opportunity.competitorProductId,
        product_name: opportunity.productName,
        competitor: opportunity.competitor,
        current_rank: opportunity.rank,
        price: opportunity.price,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'competitor_product_id'
      });
  }
  
  console.log(`Updated ${matchedCount} bestsellers, found ${sourcingOpportunities.length} sourcing opportunities`);
  return { matched: matchedCount, sourcing: sourcingOpportunities.length };
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
        to: ['support@getpawsy.pet'],
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
                  <a href="https://getpawsy.pet/admin" style="display: inline-block; background: #f97316; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
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

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 2000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

function calculateRetryDelay(attempt: number): number {
  const exponentialDelay = RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // Add up to 30% jitter
  return Math.min(exponentialDelay + jitter, RETRY_CONFIG.maxDelayMs);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeCompetitorWithRetry(
  competitor: CompetitorConfig,
  firecrawlApiKey: string
): Promise<ScrapedProduct[]> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delayMs = calculateRetryDelay(attempt - 1);
        console.log(`Retry ${attempt}/${RETRY_CONFIG.maxRetries} for ${competitor.name} after ${Math.round(delayMs)}ms`);
        await sleep(delayMs);
      }
      
      return await scrapeCompetitor(competitor, firecrawlApiKey);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Attempt ${attempt + 1} failed for ${competitor.name}:`, lastError.message);
      
      // Don't retry on certain errors
      if (lastError.message.includes('401') || lastError.message.includes('403')) {
        console.log(`Not retrying ${competitor.name} - authentication/authorization error`);
        throw lastError;
      }
    }
  }
  
  throw lastError || new Error(`Failed to scrape ${competitor.name} after ${RETRY_CONFIG.maxRetries} retries`);
}

async function scrapeCompetitor(
  competitor: CompetitorConfig,
  firecrawlApiKey: string
): Promise<ScrapedProduct[]> {
  console.log(`Scraping ${competitor.name}...`);
  
  // Configure wait times per retailer - lighter sites need less time
  const lightSites = ['amazon', 'petsmart', 'walmart'];
  const heavySites = ['chewy', 'petco'];
  
  // Lighter sites load faster, heavier sites need more time
  const waitTime = lightSites.includes(competitor.name) ? 3000 : 15000;
  // Increase timeout for sites with heavy JavaScript
  const timeout = heavySites.includes(competitor.name) ? 120000 : 60000;
  
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
      waitFor: waitTime,
      timeout: timeout, // Dynamic timeout based on site complexity
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
}

// Blocklist of Amazon services and navigation items that should never be products
const AMAZON_BLOCKLIST = new Set([
  'amazon web services', 'amazon music', 'amazon business', 'amazon fresh',
  'amazonglobal', 'home services', 'kindle direct publishing', 'amazon photos',
  'prime video direct', 'amazon resale', 'whole foods market', 'neighbors app',
  'amazon subscription boxes', 'amazon renewed', 'sell on amazon', 'box office mojo',
  'become an affiliate', 'advertise', 'self-publish', 'imdb', 'audible', 'goodreads',
  'zappos', 'abebooks', 'ring', 'blink', 'woot', 'eero', 'amazon basics',
  'pet supplies(current)', '- pet supplies', 'nestlé purina petcare', 'customer review:',
  '- dogs', '- cats', '- fish', '- birds', '- small animals', '- horses',
  '- reptiles', '- amphibians', 'fish & aquatic pets'
]);

function isBlocklisted(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  for (const blocked of AMAZON_BLOCKLIST) {
    if (normalized.includes(blocked) || blocked.includes(normalized)) {
      return true;
    }
  }
  // Also block if it starts with a category indicator
  if (normalized.startsWith('-') || normalized.includes('(current)')) {
    return true;
  }
  return false;
}

function parseProductsFromMarkdown(
  markdown: string,
  links: string[],
  competitor: string
): ScrapedProduct[] {
  const products: ScrapedProduct[] = [];
  const lines = markdown.split('\n').filter(line => line.trim());
  
  let currentRank = 0;
  
  // Extract product URLs from links to help identify real products
  const productUrls = links.filter(link => 
    link.includes('/dp/') || // Amazon product pattern
    link.includes('/product/') ||
    link.includes('/p/') ||
    link.includes('chewy.com/dp/')
  );
  
  for (const line of lines) {
    // Skip navigation and header lines
    if (line.startsWith('#') && line.length < 50) continue;
    if (line.includes('Sign in') || line.includes('Cart') || line.includes('Menu')) continue;
    
    // Look for product patterns
    // Pattern 1: Numbered lists like "1. Product Name"
    const numberedMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (numberedMatch) {
      const productName = numberedMatch[2].trim();
      if (productName.length > 10 && productName.length < 200 && !isBlocklisted(productName) && isLikelyProductName(productName)) {
        currentRank++;
        products.push({
          name: cleanProductName(productName),
          rank: currentRank,
        });
        continue;
      }
    }
    
    // Pattern 2: Bold product names with prices
    const boldMatch = line.match(/\*\*(.+?)\*\*/);
    if (boldMatch && boldMatch[1].length > 10 && !isBlocklisted(boldMatch[1]) && isLikelyProductName(boldMatch[1])) {
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
    if (line.length > 20 && line.length < 200 && !line.startsWith('[') && !line.includes('http')) {
      const priceMatch = line.match(/\$(\d+(?:\.\d{2})?)/);
      const cleanedName = line.replace(/\$\d+(?:\.\d{2})?/g, '').trim();
      
      if (cleanedName.length > 15 && !isBlocklisted(cleanedName) && isLikelyProductName(cleanedName)) {
        currentRank++;
        products.push({
          name: cleanProductName(cleanedName),
          rank: currentRank,
          price: priceMatch ? parseFloat(priceMatch[1]) : undefined,
        });
      }
    }
    
    // Pattern 4: Look for Amazon-style product links in the markdown
    const linkMatch = line.match(/\[(.+?)\]\((https:\/\/www\.amazon\.com\/[^\)]+\/dp\/[^\)]+)\)/);
    if (linkMatch && linkMatch[1].length > 10 && !isBlocklisted(linkMatch[1])) {
      currentRank++;
      const priceMatch = line.match(/\$(\d+(?:\.\d{2})?)/);
      products.push({
        name: cleanProductName(linkMatch[1]),
        rank: currentRank,
        price: priceMatch ? parseFloat(priceMatch[1]) : undefined,
        url: linkMatch[2],
      });
    }
  }
  
  // Limit to top 25 products and ensure unique names
  const seen = new Set<string>();
  const uniqueProducts: ScrapedProduct[] = [];
  
  for (const product of products) {
    // Clean and validate the product name
    const cleanedName = cleanProductName(product.name);
    if (!cleanedName || !isValidProductEntry(cleanedName)) continue;
    
    const key = cleanedName.toLowerCase();
    if (!seen.has(key) && uniqueProducts.length < 25 && !isBlocklisted(cleanedName)) {
      seen.add(key);
      uniqueProducts.push({
        ...product,
        name: cleanedName,
        rank: uniqueProducts.length + 1,
      });
    }
  }
  
  return uniqueProducts;
}

function cleanProductName(name: string): string {
  let cleaned = name
    // Remove markdown formatting
    .replace(/\*\*/g, '')
    .replace(/\[|\]/g, '')
    // Remove URLs in parentheses like (https://...)
    .replace(/\(https?:\/\/[^)]+\)/g, '')
    // Remove standalone URLs
    .replace(/https?:\/\/\S+/g, '')
    // Remove image references like _AC_UL600_SR...
    .replace(/_AC_[A-Z0-9_]+\.(?:jpg|png|gif|webp)/gi, '')
    // Remove leading special characters like "!" or "-"
    .replace(/^[!-]\s*/, '')
    // Remove Amazon ASIN patterns
    .replace(/\/dp\/[A-Z0-9]+/gi, '')
    // Clean up whitespace
    .replace(/\s+/g, ' ')
    .trim();
  
  // If the result is too short or starts with '(' it's corrupted
  if (cleaned.length < 10 || cleaned.startsWith('(') || cleaned.startsWith('http')) {
    return '';
  }
  
  return cleaned.slice(0, 200);
}

// Navigation and UI text patterns that should never be product names
const UI_BLOCKLIST = [
  // Geolocation and permissions
  'use my current location', 'allow location', 'enable location',
  'share location', 'location services', 'find stores near',
  // Captcha and verification
  'recaptcha', 'captcha', 'verify you', 'verification required',
  'not a robot', 'security check', 'human verification',
  // Generic UI elements
  'click here', 'learn more', 'read more', 'see more', 'view all',
  'sign in', 'sign up', 'log in', 'register', 'subscribe',
  'loading', 'please wait', 'error occurred', 'try again',
  'accept cookies', 'cookie policy', 'privacy policy', 'terms of service',
  'add to cart', 'buy now', 'checkout', 'continue shopping',
  'sort by', 'filter by', 'results for', 'showing results',
  'no results', 'out of stock', 'back in stock',
  // Navigation
  'go back', 'go to', 'return to', 'back to top', 'scroll to',
  'previous page', 'next page', 'page of',
];

function isValidProductEntry(name: string): boolean {
  if (!name || name.length < 10) return false;
  
  const lowerName = name.toLowerCase();
  
  // Check against UI blocklist
  for (const blocked of UI_BLOCKLIST) {
    if (lowerName.includes(blocked)) {
      return false;
    }
  }
  
  // Reject entries that are mostly URLs or corrupted
  if (name.startsWith('- ')) return false;
  if (name.startsWith('!')) return false;
  if (name.startsWith('(http')) return false;
  if (name.includes('zgbs/') || name.includes('/ref=')) return false;
  if (name.match(/^\(https?:\/\//)) return false;
  if (name.includes('Best-Sellers-Pet-Supplies')) return false;
  if (name.includes('/dp/') && !name.match(/^[A-Za-z]/)) return false;
  if (name.split(' ').length < 3) return false; // Need at least 3 words
  
  // Check if more than 30% of the name is a URL - it's corrupted
  const urlMatch = name.match(/https?:\/\/[^\s]+/);
  if (urlMatch && urlMatch[0].length > name.length * 0.3) return false;
  
  return true;
}

function isLikelyProductName(text: string): boolean {
  // First check if entry is valid (not corrupted)
  if (!isValidProductEntry(text)) return false;
  
  // Check if text looks like a product name
  const hasUppercase = /[A-Z]/.test(text);
  const hasPetKeywords = /dog|cat|pet|food|treat|toy|bed|collar|leash|bowl|crate|carrier|puppy|kitten|fish|bird|rabbit|hamster|guinea|aquarium|litter|grooming|shampoo|brush|chew|dental|vitamin|supplement|harness|training|pee|pad|feeder|waterer/i.test(text);
  
  // Exclude Amazon navigation/services and other non-product text
  const isNavigation = /shop|cart|sign|login|account|help|contact|about|amazon web services|kindle|prime video|amazon business|amazon fresh|whole foods|amazon photos|imdb|audible|goodreads|zappos|abebooks|ring|blink|woot|eero|neighbors app|amazon resale|amazon subscription|box office|home services|amazonglobal|sell on amazon|become an affiliate|advertise|self-publish/i.test(text);
  
  // Must have pet keywords and not be navigation
  return hasUppercase && hasPetKeywords && !isNavigation;
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
    
    // Check which retailers are enabled in site_settings
    const { data: retailerSettings } = await supabase
      .from('site_settings')
      .select('key, value')
      .like('key', 'scraper_retailer_%');
    
    const enabledRetailers = new Set<string>();
    if (retailerSettings && retailerSettings.length > 0) {
      for (const setting of retailerSettings) {
        const retailerName = setting.key.replace('scraper_retailer_', '');
        if (setting.value === 'true') {
          enabledRetailers.add(retailerName);
        }
      }
    } else {
      // If no settings exist, enable all by default
      COMPETITORS.forEach(c => enabledRetailers.add(c.name));
    }
    
    console.log('Enabled retailers:', Array.from(enabledRetailers));
    
    // Filter competitors based on settings and target
    let competitorsToScrape = COMPETITORS.filter(c => enabledRetailers.has(c.name));
    
    if (targetCompetitor) {
      competitorsToScrape = competitorsToScrape.filter(c => c.name === targetCompetitor);
    }
    
    if (competitorsToScrape.length === 0) {
      console.log('No retailers enabled for scraping');
      return new Response(
        JSON.stringify({ success: true, message: 'No retailers enabled', results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: { competitor: string; success: boolean; products: number; error?: string }[] = [];

    for (const competitor of competitorsToScrape) {
      try {
        const products = await scrapeCompetitorWithRetry(competitor, firecrawlApiKey);
        
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

    // Auto-update bestsellers from competitor data
    const { data: allCompetitorProducts } = await supabase
      .from('competitor_products')
      .select('id, product_name, competitor, current_rank, price')
      .lte('current_rank', 10)
      .order('current_rank', { ascending: true });
    
    let bestsellersResult = { matched: 0, sourcing: 0 };
    if (allCompetitorProducts && allCompetitorProducts.length > 0) {
      bestsellersResult = await updateBestsellersFromCompetitors(supabase, allCompetitorProducts);
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
          details: { 
            results, 
            trendingAlertSent: trendingProducts.length > 0,
            bestsellersMatched: bestsellersResult.matched,
            sourcingOpportunities: bestsellersResult.sourcing
          },
        })
        .eq('id', cronLogId);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        results, 
        trendingProducts: trendingProducts.length,
        bestsellersMatched: bestsellersResult.matched,
        sourcingOpportunities: bestsellersResult.sourcing
      }),
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

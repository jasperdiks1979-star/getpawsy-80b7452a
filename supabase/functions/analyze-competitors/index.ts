import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CJ_API_BASE = 'https://developers.cjdropshipping.com/api2.0/v1';

// Standard markup for auto-imported products
const IMPORT_MARKUP = 2.5; // 2.5x cost price
const MIN_PRICE = 9.99;
const MAX_PRICE = 149.99;

interface CompetitorProduct {
  id: string;
  competitor: string;
  product_name: string;
  price: number | null;
  current_rank: number;
  previous_rank: number | null;
  rank_change: number | null;
  trend: string;
  product_url: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

interface OwnProduct {
  id: string;
  name: string;
  slug: string | null;
  category: string | null;
  price: number;
}

// Calculate similarity between two strings (Jaccard similarity on words)
function calculateSimilarity(str1: string, str2: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  const words1 = new Set(normalize(str1));
  const words2 = new Set(normalize(str2));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

// Calculate bestseller score: popularity (appears at multiple competitors) + trending momentum
function calculateBestsellerScore(
  productName: string, 
  allProducts: CompetitorProduct[]
): { score: number; competitorCount: number; avgRank: number; trendBoost: number } {
  const matchingProducts = allProducts.filter(p => 
    calculateSimilarity(p.product_name, productName) > 0.4
  );
  
  // Count unique competitors
  const competitors = new Set(matchingProducts.map(p => p.competitor));
  const competitorCount = competitors.size;
  
  // Calculate average rank (lower is better)
  const avgRank = matchingProducts.length > 0 
    ? matchingProducts.reduce((sum, p) => sum + p.current_rank, 0) / matchingProducts.length 
    : 100;
  
  // Calculate trend boost (rising products get bonus)
  const trendBoost = matchingProducts.reduce((boost, p) => {
    if (p.trend === 'rising' || (p.rank_change && p.rank_change > 0)) {
      return boost + (p.rank_change || 3);
    }
    if (p.trend === 'new') {
      return boost + 5; // New entries get extra boost
    }
    return boost;
  }, 0);
  
  // Combined score: higher is better
  // - Popularity: competitorCount * 20 (max ~100 for 5 competitors)
  // - Rank: (26 - avgRank) * 2 (max 50 for rank 1)
  // - Trending: trendBoost * 3 (variable bonus)
  const score = (competitorCount * 20) + Math.max(0, (26 - avgRank) * 2) + (trendBoost * 3);
  
  return { score, competitorCount, avgRank, trendBoost };
}

// ============ CJ DROPSHIPPING INTEGRATION ============

// Get CJ access token (reuse cached token if valid)
async function getCJAccessToken(supabase: any): Promise<string> {
  const { data: cachedData } = await supabase
    .from('cj_token_cache')
    .select('access_token, token_expiry')
    .eq('id', 'singleton')
    .single();

  if (cachedData) {
    const tokenExpiry = new Date(cachedData.token_expiry).getTime();
    if (Date.now() < tokenExpiry) {
      return cachedData.access_token;
    }
  }

  // Request new token
  const apiKey = Deno.env.get('CJ_API_KEY');
  const email = Deno.env.get('CJ_EMAIL');

  if (!apiKey || !email) {
    throw new Error('CJ_API_KEY or CJ_EMAIL not configured');
  }

  const response = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: apiKey }),
  });

  const data = await response.json();
  
  if (!data.result) {
    throw new Error(`CJ Authentication failed: ${data.message || 'Unknown error'}`);
  }

  // Cache the token
  const expiryDate = new Date(data.data.accessTokenExpiryDate);
  const safeExpiry = new Date(expiryDate.getTime() - (5 * 60 * 1000));
  
  await supabase.from('cj_token_cache').upsert({
    id: 'singleton',
    access_token: data.data.accessToken,
    token_expiry: safeExpiry.toISOString(),
    updated_at: new Date().toISOString()
  });

  return data.data.accessToken;
}

// Search CJ for a product by keyword - pet-focused search
async function searchCJProduct(accessToken: string, keyword: string): Promise<any> {
  // Clean the keyword for better search results
  let cleanKeyword = keyword
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 5) // Take first 5 words max
    .join(' ');

  // Ensure the search includes a pet-related term for better results
  const petTerms = ['dog', 'cat', 'pet', 'puppy', 'kitten', 'canine', 'feline'];
  const hasPetTerm = petTerms.some(term => cleanKeyword.toLowerCase().includes(term));
  
  if (!hasPetTerm) {
    // Add "pet" prefix to force pet-related results
    cleanKeyword = `pet ${cleanKeyword}`;
  }
  
  console.log(`CJ search query: "${cleanKeyword}"`);

  const params = new URLSearchParams({
    pageNum: '1',
    pageSize: '10',
    productNameEn: cleanKeyword,
  });

  const response = await fetch(`${CJ_API_BASE}/product/list?${params}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'CJ-Access-Token': accessToken,
    },
  });

  return await response.json();
}

// Get full product details from CJ
async function getCJProductDetails(accessToken: string, pid: string): Promise<any> {
  const params = new URLSearchParams({
    pid,
    features: 'enable_inventory,enable_video',
    countryCode: 'US',
  });

  const response = await fetch(`${CJ_API_BASE}/product/query?${params}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'CJ-Access-Token': accessToken,
    },
  });

  return await response.json();
}

// Generate slug from product name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100);
}

// Parse price that might be a range (e.g., "22.89-24.54") and return the lower value
function parsePrice(priceValue: any): number {
  if (typeof priceValue === 'number') return priceValue;
  if (typeof priceValue === 'string') {
    // Handle price ranges like "22.89-24.54"
    if (priceValue.includes('-')) {
      const parts = priceValue.split('-');
      const firstPart = parseFloat(parts[0]);
      if (!isNaN(firstPart)) return firstPart;
    }
    const parsed = parseFloat(priceValue);
    if (!isNaN(parsed)) return parsed;
  }
  return 5; // Default fallback price
}

// Calculate price with markup
function calculatePrice(costPrice: number): { price: number; compareAtPrice: number } {
  // Ensure costPrice is a valid number
  const validCost = parsePrice(costPrice);
  let price = validCost * IMPORT_MARKUP;
  price = Math.max(MIN_PRICE, Math.min(MAX_PRICE, price));
  price = Math.round(price * 100) / 100; // Round to 2 decimals
  
  // Compare at price is 20-30% higher for perceived value
  const compareAtPrice = Math.round(price * 1.25 * 100) / 100;
  
  return { price, compareAtPrice };
}

// Check if a product name is likely pet-related (stricter matching)
function isPetProduct(productName: string): boolean {
  const nameLower = productName.toLowerCase();
  
  // Strong indicators - these always indicate pet products
  const strongPetKeywords = [
    'dog ', ' dog', 'dogs', 'puppy', 'puppies',
    'cat ', ' cat', 'cats', 'kitten', 'kittens', 'kitty',
    'pet ', ' pet', 'pets',
    'canine', 'feline',
    'litter box', 'cat litter', 'dog food', 'cat food', 'pet food',
    'dog treat', 'cat treat', 'pet treat',
    'dog toy', 'cat toy', 'pet toy',
    'dog bed', 'cat bed', 'pet bed',
    'dog collar', 'cat collar', 'pet collar',
    'dog harness', 'cat harness', 'pet harness',
    'dog leash', 'cat leash', 'pet leash',
    'dog carrier', 'cat carrier', 'pet carrier',
    'dog crate', 'cat crate', 'pet crate',
    'dog bowl', 'cat bowl', 'pet bowl',
    'dog grooming', 'cat grooming', 'pet grooming',
    'dog brush', 'cat brush', 'pet brush',
    'pee pad', 'puppy pad', 'potty pad',
    'poop bag', 'waste bag', 'dog bag',
    'flea', 'tick', 'dewormer',
    'scratching post', 'cat tree', 'cat tower', 'cat scratcher',
    'chew toy', 'squeaky toy', 'rope toy',
    'catnip', 'cat grass',
    'aquarium', 'fish tank', 'fish food',
    'bird cage', 'bird feeder', 'bird toy',
    'hamster cage', 'hamster wheel', 'hamster food',
    'rabbit cage', 'rabbit food', 'rabbit hay',
    'guinea pig', 'reptile', 'terrarium',
    'pet shampoo', 'dog shampoo', 'cat shampoo',
    'pet fountain', 'water fountain for',
    'pet dental', 'dog dental', 'cat dental',
  ];
  
  // Check for strong pet indicators
  if (strongPetKeywords.some(keyword => nameLower.includes(keyword))) {
    return true;
  }
  
  // Reject common non-pet product patterns
  const nonPetPatterns = [
    'women', 'mens', "men's", 'women\'s', 'ladies', 'girls', 'boys',
    'bracelet', 'necklace', 'pendant', 'earring', 'ring ',
    'faucet', 'cabinet', 'kitchen', 'bathroom', 'shower',
    'shoe', 'boot', 'sandal', 'mule', 'heel',
    'dress', 'shirt', 'pants', 'jacket', 'sweater',
    'beehive', 'bee hive', 'beekeeping',
    'phone case', 'laptop', 'computer', 'tablet',
    'car ', 'vehicle', 'motorcycle',
    'human', 'baby', 'toddler', 'infant',
  ];
  
  if (nonPetPatterns.some(pattern => nameLower.includes(pattern))) {
    return false;
  }
  
  // Weak indicators - need at least 2 to count
  const weakPetKeywords = [
    'collar', 'leash', 'harness', 'kennel', 'crate', 'cage',
    'treats', 'kibble', 'chew', 'squeaky',
    'grooming', 'brush', 'nail', 'fur',
    'feeder', 'dispenser', 'fountain',
    'bed', 'cushion', 'blanket', 'carrier',
    'toy', 'ball', 'plush',
    'training', 'potty',
    'scratching', 'perch',
    'paw', 'bone',
  ];
  
  const weakMatches = weakPetKeywords.filter(keyword => nameLower.includes(keyword)).length;
  return weakMatches >= 2;
}

// Auto-import products from CJ based on competitor bestsellers
async function autoImportFromCJ(
  supabase: any,
  competitorProducts: Array<{ name: string; score: number; rank: number }>,
  existingProductNames: Set<string>
): Promise<{ imported: number; errors: number; products: string[] }> {
  console.log("Starting CJ auto-import for", competitorProducts.length, "products...");
  
  let accessToken: string;
  try {
    accessToken = await getCJAccessToken(supabase);
  } catch (error) {
    console.error("Failed to get CJ access token:", error);
    return { imported: 0, errors: 1, products: [] };
  }

  const imported: string[] = [];
  let errors = 0;

  for (const compProduct of competitorProducts) {
    try {
      // Skip if we already have a similar product
      const normalizedName = compProduct.name.toLowerCase();
      const alreadyExists = [...existingProductNames].some(existing => 
        calculateSimilarity(existing, normalizedName) > 0.4
      );
      
      if (alreadyExists) {
        console.log(`Skipping "${compProduct.name}" - similar product already exists`);
        continue;
      }

      // Rate limit: 1 request per second
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Search for the product on CJ
      const searchResult = await searchCJProduct(accessToken, compProduct.name);
      
      if (!searchResult.result || !searchResult.data?.list?.length) {
        console.log(`No CJ match found for "${compProduct.name}"`);
        continue;
      }

      // Take the first (best) match
      const cjProduct = searchResult.data.list[0];
      
      // Rate limit before next call
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Get full product details
      const detailsResult = await getCJProductDetails(accessToken, cjProduct.pid);
      
      if (!detailsResult.result || !detailsResult.data) {
        console.log(`Failed to get details for CJ product ${cjProduct.pid}`);
        errors++;
        continue;
      }

      const details = detailsResult.data;
      const cjProductName = details.productNameEn || cjProduct.productNameEn || '';
      
      // STRICT: CJ product name MUST be pet-related (CJ search often returns unrelated results)
      if (!isPetProduct(cjProductName)) {
        console.log(`Skipping non-pet CJ product: "${cjProductName.substring(0, 60)}..."`);
        continue;
      }

      const costPrice = parsePrice(details.sellPrice || cjProduct.sellPrice || 5);
      const { price, compareAtPrice } = calculatePrice(costPrice);
      
      // Collect images
      const images: string[] = [];
      if (details.productImage && details.productImage.startsWith('http')) {
        images.push(details.productImage);
      }
      if (Array.isArray(details.productImageSet)) {
        images.push(...details.productImageSet.filter((img: string) => img?.startsWith('http')));
      }
      
      // Build variants array
      const variants = details.variants?.map((v: any) => {
        const variantCost = parsePrice(v.variantSellPrice || costPrice);
        return {
          vid: v.vid,
          name: v.variantNameEn,
          sku: v.variantSku,
          price: calculatePrice(variantCost).price,
          costPrice: variantCost,
          stock: v.inventories?.find((i: any) => i.countryCode === 'US')?.totalInventory || 0,
          image: v.variantImage,
        };
      }) || [];

      // Calculate total stock
      let totalStock = 0;
      if (details.variants) {
        for (const v of details.variants) {
          const usInv = v.inventories?.find((i: any) => i.countryCode === 'US');
          totalStock += usInv?.totalInventory || 0;
        }
      }

      // Generate unique slug
      let slug = generateSlug(details.productNameEn || compProduct.name);
      const { data: existingSlug } = await supabase
        .from('products')
        .select('slug')
        .eq('slug', slug)
        .maybeSingle();
      
      if (existingSlug) {
        slug = `${slug}-${Date.now().toString(36)}`;
      }

      // Insert the product
      const { data: newProduct, error: insertError } = await supabase
        .from('products')
        .insert({
          name: details.productNameEn || compProduct.name,
          slug,
          description: details.description || `Trending pet product - ${compProduct.name}`,
          price,
          compare_at_price: compareAtPrice,
          cost_price: costPrice,
          cj_product_id: cjProduct.pid,
          image_url: images[0] || null,
          images: images.slice(0, 10),
          variants: variants.length > 0 ? variants : null,
          stock: totalStock,
          is_active: true,
          category: 'pet-supplies',
          supplier_name: 'CJ Dropshipping',
        })
        .select()
        .single();

      if (insertError) {
        console.error(`Failed to insert product "${compProduct.name}":`, insertError);
        errors++;
        continue;
      }

      console.log(`✓ Imported: ${newProduct.name} (€${price}) from CJ`);
      imported.push(newProduct.name);
      existingProductNames.add(newProduct.name.toLowerCase());

      // Limit to 10 imports per run to avoid timeouts
      if (imported.length >= 10) {
        console.log("Reached import limit of 10 products per run");
        break;
      }

    } catch (error) {
      console.error(`Error importing "${compProduct.name}":`, error);
      errors++;
    }
  }

  console.log(`CJ auto-import completed: ${imported.length} imported, ${errors} errors`);
  return { imported: imported.length, errors, products: imported };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch competitor products from the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: products, error: productsError } = await supabase
      .from("competitor_products")
      .select("*")
      .gte("last_seen_at", sevenDaysAgo.toISOString())
      .order("competitor")
      .order("current_rank");

    if (productsError) throw productsError;

    // Fetch our own products for matching
    const { data: ownProducts, error: ownProductsError } = await supabase
      .from("products")
      .select("id, name, slug, category, price")
      .eq("is_active", true);

    if (ownProductsError) throw ownProductsError;

    // ============ AUTO-UPDATE BESTSELLERS ============
    console.log("Starting bestseller auto-sync...");
    
    // Filter function to exclude invalid product names (navigation, URLs, etc.)
    const isValidProductName = (name: string): boolean => {
      if (!name || name.length < 5) return false;
      if (name.startsWith('- ')) return false; // Navigation categories
      if (name.startsWith('!')) return false; // Corrupted entries
      if (name.startsWith('(http')) return false; // URL-only entries
      if (name.includes('zgbs/') || name.includes('/ref=')) return false; // Amazon nav URLs
      if (name.match(/^\(https?:\/\//)) return false; // Starts with URL
      if (name.includes('Best-Sellers-Pet-Supplies')) return false; // Category navigation
      if (name.includes('/dp/') && !name.match(/^[A-Za-z]/)) return false; // Product URLs without name
      if (name.split(' ').length < 2) return false; // Single word names
      // Remove entries that are mostly URL
      const urlMatch = name.match(/https?:\/\/[^\s]+/);
      if (urlMatch && urlMatch[0].length > name.length * 0.5) return false;
      return true;
    };

    // Clean product name by removing trailing URLs and special chars
    const cleanProductName = (name: string): string => {
      return name
        .replace(/\(https?:\/\/[^)]+\)/g, '') // Remove URLs in parentheses
        .replace(/https?:\/\/\S+/g, '') // Remove any remaining URLs
        .replace(/^[!-]\s*/, '') // Remove leading ! or -
        .replace(/\s+/g, ' ')
        .trim();
    };

    // Filter and clean valid competitor products
    const validProducts = (products || [])
      .filter(p => isValidProductName(p.product_name))
      .map(p => ({
        ...p,
        product_name: cleanProductName(p.product_name)
      }))
      .filter(p => p.product_name.length > 5);

    console.log(`Filtered ${(products || []).length} -> ${validProducts.length} valid competitor products`);

    // Calculate scores for all unique competitor products
    const uniqueProductNames = [...new Set(validProducts.map(p => p.product_name))];
    const scoredProducts = uniqueProductNames.map(name => {
      const scores = calculateBestsellerScore(name, validProducts);
      const representativeProduct = validProducts.find(p => p.product_name === name)!;
      return {
        name,
        ...scores,
        representativeProduct
      };
    });

    // Sort by score and take top 25
    const top25Competitors = scoredProducts
      .sort((a, b) => b.score - a.score)
      .slice(0, 25);

    console.log(`Top 25 competitor products identified:`, top25Competitors.slice(0, 5).map(p => ({
      name: p.name.substring(0, 50),
      score: p.score,
      competitors: p.competitorCount
    })));

    // Match to our own products
    const matchedBestsellers: Array<{
      ownProduct: OwnProduct;
      competitorName: string;
      score: number;
      rank: number;
    }> = [];

    for (let i = 0; i < top25Competitors.length; i++) {
      const compProduct = top25Competitors[i];
      let bestMatch: OwnProduct | null = null;
      let bestSimilarity = 0;

      for (const ownProduct of (ownProducts || [])) {
        const similarity = calculateSimilarity(compProduct.name, ownProduct.name);
        if (similarity > bestSimilarity && similarity > 0.3) {
          bestSimilarity = similarity;
          bestMatch = ownProduct;
        }
      }

      if (bestMatch && !matchedBestsellers.find(m => m.ownProduct.id === bestMatch!.id)) {
        matchedBestsellers.push({
          ownProduct: bestMatch,
          competitorName: compProduct.name,
          score: compProduct.score,
          rank: matchedBestsellers.length + 1
        });
      }
    }

    console.log(`Matched ${matchedBestsellers.length} products to own catalog`);

    // Update bestsellers table if we have matches
    if (matchedBestsellers.length > 0) {
      // First, deactivate auto-generated bestsellers (keep manual ones)
      await supabase
        .from("bestsellers")
        .update({ is_active: false })
        .eq("is_manual", false);

      // Upsert matched products as bestsellers
      for (const match of matchedBestsellers) {
        const slug = match.ownProduct.slug || match.ownProduct.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        
        const { error: upsertError } = await supabase
          .from("bestsellers")
          .upsert({
            product_id: match.ownProduct.id,
            rank: match.rank,
            slug: slug,
            is_active: true,
            is_manual: false,
            hero_headline: `Trending: ${match.ownProduct.name}`,
            hero_subheadline: `Popular across ${Math.min(5, Math.ceil(match.score / 20))} major retailers`,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'product_id',
            ignoreDuplicates: false
          });

        if (upsertError) {
          console.error(`Error upserting bestseller for ${match.ownProduct.name}:`, upsertError);
        }
      }

      console.log(`Updated ${matchedBestsellers.length} bestsellers in database`);
    }

    // ============ CJ AUTO-IMPORT ============
    // Import top competitor products from CJ Dropshipping
    let cjImportResult = { imported: 0, errors: 0, products: [] as string[] };
    
    try {
      // Get existing product names for duplicate checking
      const existingNames = new Set((ownProducts || []).map((p: OwnProduct) => p.name.toLowerCase()));
      
      // Prepare competitor products for CJ search (prioritize unmatched ones)
      const productsToSearch = top25Competitors
        .filter(p => !matchedBestsellers.find(m => 
          calculateSimilarity(m.competitorName, p.name) > 0.4
        ))
        .map(p => ({
          name: p.name,
          score: p.score,
          rank: top25Competitors.indexOf(p) + 1
        }));

      console.log(`Searching CJ for ${productsToSearch.length} unmatched competitor products...`);
      
      if (productsToSearch.length > 0) {
        cjImportResult = await autoImportFromCJ(supabase, productsToSearch, existingNames);
      }
    } catch (cjError) {
      console.error("CJ auto-import error:", cjError);
      cjImportResult.errors = 1;
    }

    // ============ AI ANALYSIS ============
    // Group products by competitor
    const byCompetitor: Record<string, CompetitorProduct[]> = {};
    (products || []).forEach((p: CompetitorProduct) => {
      if (!byCompetitor[p.competitor]) {
        byCompetitor[p.competitor] = [];
      }
      byCompetitor[p.competitor].push(p);
    });

    // Calculate statistics
    const competitorStats = Object.entries(byCompetitor).map(([competitor, prods]) => {
      const withPrice = prods.filter(p => p.price !== null);
      const avgPrice = withPrice.length > 0 
        ? withPrice.reduce((sum, p) => sum + (p.price || 0), 0) / withPrice.length 
        : null;
      const minPrice = withPrice.length > 0 ? Math.min(...withPrice.map(p => p.price!)) : null;
      const maxPrice = withPrice.length > 0 ? Math.max(...withPrice.map(p => p.price!)) : null;
      
      const risingProducts = prods.filter(p => p.trend === "rising" || (p.rank_change && p.rank_change > 0));
      const newProducts = prods.filter(p => p.trend === "new");
      const topProducts = prods.filter(p => p.current_rank <= 10);

      return {
        competitor,
        totalProducts: prods.length,
        avgPrice: avgPrice ? `$${avgPrice.toFixed(2)}` : "Unknown",
        priceRange: minPrice && maxPrice ? `$${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}` : "Unknown",
        risingCount: risingProducts.length,
        newCount: newProducts.length,
        topProducts: topProducts.slice(0, 5).map(p => ({
          name: p.product_name.substring(0, 80),
          rank: p.current_rank,
          price: p.price ? `$${p.price.toFixed(2)}` : "N/A",
          trend: p.trend
        }))
      };
    });

    // Find trending products across all competitors
    const allRising = (products || [])
      .filter((p: CompetitorProduct) => p.trend === "rising" || (p.rank_change && p.rank_change >= 3))
      .slice(0, 10);

    // Find new entries in top 10
    const newTopEntries = (products || [])
      .filter((p: CompetitorProduct) => p.trend === "new" && p.current_rank <= 10)
      .slice(0, 5);

    // Build the prompt for AI analysis
    const analysisPrompt = `
Je bent een e-commerce strategist die competitor bestsellers analyseert voor een pet supplies webshop.

Analyseer de volgende data en geef actionable insights in het Nederlands:

## Competitor Statistieken:
${JSON.stringify(competitorStats, null, 2)}

## Stijgende Producten (trending):
${JSON.stringify(allRising.map((p: CompetitorProduct) => ({
  name: p.product_name.substring(0, 80),
  competitor: p.competitor,
  rank: p.current_rank,
  change: p.rank_change,
  price: p.price
})), null, 2)}

## Nieuwe Top 10 Entries:
${JSON.stringify(newTopEntries.map((p: CompetitorProduct) => ({
  name: p.product_name.substring(0, 80),
  competitor: p.competitor,
  rank: p.current_rank
})), null, 2)}

## Auto-Matched Bestsellers (${matchedBestsellers.length} products matched to our catalog):
${JSON.stringify(matchedBestsellers.slice(0, 10).map(m => ({
  ourProduct: m.ownProduct.name.substring(0, 50),
  matchedTo: m.competitorName.substring(0, 50),
  score: m.score,
  rank: m.rank
})), null, 2)}

Geef je analyse in het volgende JSON format:
{
  "title": "Wekelijkse Competitor Analyse - [Datum]",
  "summary": "Korte samenvatting van 2-3 zinnen over de belangrijkste bevindingen",
  "insights": [
    {
      "category": "pricing|trends|opportunities|threats",
      "title": "Korte insight titel",
      "description": "Gedetailleerde beschrijving van de insight",
      "priority": "high|medium|low"
    }
  ],
  "pricing_analysis": {
    "summary": "Analyse van prijsstrategieën per competitor",
    "recommendations": ["Aanbeveling 1", "Aanbeveling 2"]
  },
  "product_trends": {
    "rising_categories": ["Categorie 1", "Categorie 2"],
    "declining_categories": [],
    "opportunities": ["Kans 1", "Kans 2"]
  },
  "recommendations": [
    {
      "action": "Concrete actie om te ondernemen",
      "impact": "high|medium|low",
      "effort": "high|medium|low",
      "reasoning": "Waarom deze actie belangrijk is"
    }
  ],
  "alerts": [
    {
      "type": "price_drop|new_bestseller|rising_product|competitor_trend",
      "competitor": "competitor name",
      "product_name": "product name if applicable",
      "title": "Alert titel",
      "description": "Beschrijving van de alert",
      "severity": "info|warning|urgent"
    }
  ]
}

Focus op:
1. Prijsverschillen tussen competitors en wat we daarvan kunnen leren
2. Welke productcategorieën trending zijn
3. Nieuwe bestsellers die we mogelijk zelf kunnen sourcen
4. Tactische aanbevelingen om onze eigen verkoop te verbeteren
`;

    // Call Lovable AI with max_tokens to prevent truncation
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Je bent een data analyst voor e-commerce. Geef ALTIJD complete, valid JSON terug zonder markdown codeblocks. Houd je response beknopt maar compleet." },
          { role: "user", content: analysisPrompt }
        ],
        temperature: 0.3,
        max_tokens: 3000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || "";
    const finishReason = aiData.choices?.[0]?.finish_reason;

    console.log("AI finish reason:", finishReason);
    console.log("AI content length:", aiContent.length);

    // Parse the JSON response with robust error handling
    let analysis;
    try {
      let cleanedContent = aiContent.replace(/```json\n?|\n?```/g, "").trim();
      
      if (finishReason === "length" || !cleanedContent.endsWith("}")) {
        console.warn("AI response may be truncated, attempting to fix JSON...");
        const lastBrace = cleanedContent.lastIndexOf("}");
        if (lastBrace > 0) {
          let braceCount = 0;
          let lastValidIndex = 0;
          for (let i = 0; i < cleanedContent.length; i++) {
            if (cleanedContent[i] === "{") braceCount++;
            if (cleanedContent[i] === "}") {
              braceCount--;
              if (braceCount === 0) lastValidIndex = i + 1;
            }
          }
          if (lastValidIndex > 0) {
            cleanedContent = cleanedContent.substring(0, lastValidIndex);
          }
        }
      }
      
      analysis = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", aiContent.substring(0, 500) + "...");
      analysis = {
        title: `Competitor Analyse - ${new Date().toLocaleDateString("nl-NL")}`,
        summary: "AI-analyse kon niet volledig worden geparsed. Controleer de data handmatig.",
        insights: [{
          category: "trends",
          title: "Analyse Error",
          description: "De AI-response kon niet worden geparsed. Dit kan komen door een tijdelijke API-fout.",
          priority: "medium"
        }],
        pricing_analysis: null,
        product_trends: { rising_categories: [], declining_categories: [], opportunities: [] },
        recommendations: [],
        alerts: []
      };
      console.warn("Using fallback analysis structure");
    }

    // Store the report in the database
    const { data: report, error: reportError } = await supabase
      .from("competitor_analysis_reports")
      .insert({
        report_type: "weekly",
        title: analysis.title || `Wekelijkse Competitor Analyse - ${new Date().toLocaleDateString("nl-NL")}`,
        summary: analysis.summary || "Analyse van competitor bestsellers",
        insights: analysis.insights || [],
        pricing_analysis: analysis.pricing_analysis || null,
        product_trends: analysis.product_trends || null,
        recommendations: analysis.recommendations || [],
        competitors_analyzed: Object.keys(byCompetitor),
        products_analyzed: products?.length || 0,
      })
      .select()
      .single();

    if (reportError) {
      console.error("Error storing report:", reportError);
    }

    // Store alerts if any
    if (analysis.alerts && analysis.alerts.length > 0) {
      const alertsToInsert = analysis.alerts.map((alert: any) => ({
        alert_type: alert.type,
        competitor: alert.competitor,
        product_name: alert.product_name || null,
        title: alert.title,
        description: alert.description,
        severity: alert.severity || "info",
        data: { source: "ai_analysis", report_id: report?.id }
      }));

      const { error: alertsError } = await supabase
        .from("competitor_alerts")
        .insert(alertsToInsert);

      if (alertsError) {
        console.error("Error storing alerts:", alertsError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        report: report,
        analysis: analysis,
        stats: {
          competitorsAnalyzed: Object.keys(byCompetitor).length,
          productsAnalyzed: products?.length || 0,
          alertsGenerated: analysis.alerts?.length || 0,
          bestsellersUpdated: matchedBestsellers.length,
          cjProductsImported: cjImportResult.imported
        },
        bestsellersSync: {
          matched: matchedBestsellers.length,
          top5: matchedBestsellers.slice(0, 5).map(m => ({
            product: m.ownProduct.name,
            rank: m.rank,
            score: m.score
          }))
        },
        cjAutoImport: {
          imported: cjImportResult.imported,
          errors: cjImportResult.errors,
          products: cjImportResult.products
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in analyze-competitors:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CJ_API_BASE = 'https://developers.cjdropshipping.com/api2.0/v1';

interface CJAuthResponse {
  result: boolean;
  code: number;
  message?: string;
  data: {
    accessToken: string;
    accessTokenExpiryDate: string;
    refreshToken: string;
    refreshTokenExpiryDate: string;
  };
}

interface CJProductListRequest {
  pageNum?: number;
  pageSize?: number;
  categoryId?: string;
  productNameEn?: string;
  countryCode?: string;
}

interface CJVariant {
  vid: string;
  pid: string;
  variantNameEn: string;
  variantSku: string;
  variantImage?: string;
  variantKey: string;
  variantWeight: number;
  variantSellPrice: number;
  inventories?: Array<{
    countryCode: string;
    totalInventory: number;
    cjInventory: number;
    factoryInventory: number;
  }>;
}

interface CJProductDetail {
  pid: string;
  productNameEn: string;
  productSku: string;
  productImage: string;
  productImageSet?: string[]; // Array of all product images
  productWeight: number;
  categoryName: string;
  sellPrice: number;
  description?: string;
  productVideo?: string[];
  variants?: CJVariant[];
}

// Pet Supplies category ID from CJ Dropshipping website
const PET_CATEGORY_ID = '2409110611570657700';

// Extended pet subcategory keywords for comprehensive filtering
const PET_SUBCATEGORIES: Record<string, string[]> = {
  'Pet Toys': ['toy', 'toys', 'ball', 'chew', 'squeaky', 'plush', 'rope', 'frisbee', 'fetch', 'puzzle', 'interactive', 'teaser', 'wand', 'kong', 'play', 'squeak', 'tug', 'throwing', 'catch'],
  'Pet Food & Treats': ['food', 'treat', 'treats', 'snack', 'bowl', 'feeder', 'feeding', 'water', 'fountain', 'dispenser', 'automatic', 'slow', 'portion', 'kibble', 'wet food', 'dry food'],
  'Pet Beds & Furniture': ['bed', 'beds', 'sofa', 'couch', 'mat', 'blanket', 'cushion', 'pillow', 'house', 'cave', 'nest', 'sleeping', 'orthopedic', 'donut', 'calming', 'elevated', 'hammock', 'window perch'],
  'Pet Clothing': ['clothes', 'clothing', 'sweater', 'jacket', 'coat', 'costume', 'dress', 'shirt', 'hoodie', 'raincoat', 'vest', 'pajamas', 'boots', 'shoes', 'socks', 'bandana', 'bow tie', 'hat', 'winter', 'summer'],
  'Pet Collars & Leashes': ['collar', 'leash', 'harness', 'lead', 'chain', 'tag', 'name', 'id', 'retractable', 'reflective', 'glow', 'led', 'nylon', 'leather', 'adjustable', 'breakaway', 'martingale'],
  'Pet Grooming': ['brush', 'comb', 'grooming', 'shampoo', 'nail', 'clipper', 'trimmer', 'bath', 'towel', 'dryer', 'deshedding', 'fur', 'hair', 'shedding', 'dematting', 'slicker', 'rake', 'scissors', 'ear', 'teeth', 'dental'],
  'Pet Carriers': ['carrier', 'bag', 'backpack', 'transport', 'travel', 'cage', 'crate', 'kennel', 'stroller', 'sling', 'airline', 'car seat', 'booster', 'pet seat', 'portable'],
  'Cat Supplies': ['cat', 'kitten', 'scratching', 'scratcher', 'litter', 'catnip', 'climbing', 'tree', 'tower', 'perch', 'tunnel', 'laser', 'feather', 'mouse', 'mice', 'sisal', 'cardboard', 'window', 'condo', 'activity'],
  'Dog Supplies': ['dog', 'puppy', 'canine', 'paw', 'muzzle', 'training', 'potty', 'pad', 'pee', 'waste', 'poop', 'bag', 'clicker', 'whistle', 'fence', 'gate', 'door', 'flap', 'ramp', 'stairs', 'step'],
  'Small Pet Supplies': ['hamster', 'rabbit', 'bunny', 'guinea pig', 'bird', 'parrot', 'fish', 'aquarium', 'turtle', 'reptile', 'wheel', 'hideout', 'cage', 'tank', 'terrarium', 'bedding', 'hay', 'seed', 'pellet'],
  'Pet Health': ['medicine', 'supplement', 'vitamin', 'flea', 'tick', 'worm', 'dewormer', 'spray', 'cream', 'bandage', 'first aid', 'cone', 'recovery', 'calming', 'anxiety', 'joint', 'hip', 'senior'],
  'Pet Training': ['training', 'clicker', 'whistle', 'treat pouch', 'target', 'agility', 'tunnel', 'jump', 'weave', 'hurdle', 'course', 'obedience', 'puppy pad', 'potty training'],
  'Pet Accessories': ['id tag', 'charm', 'pendant', 'bell', 'camera', 'gps', 'tracker', 'monitor', 'pet cam', 'automatic', 'smart', 'wifi', 'app', 'remote'],
};

// Common search term mappings for better results
const SEARCH_TERM_EXPANSIONS: Record<string, string[]> = {
  'krabpaal': ['scratching', 'cat tree', 'scratcher', 'sisal'],
  'halsband': ['collar', 'necklace', 'band'],
  'riem': ['leash', 'lead', 'strap'],
  'mand': ['bed', 'basket', 'nest'],
  'speeltje': ['toy', 'play', 'interactive'],
  'voerbak': ['bowl', 'feeder', 'dish'],
  'drinkbak': ['water', 'fountain', 'bowl'],
  'kam': ['brush', 'comb', 'grooming'],
  'bench': ['crate', 'cage', 'kennel'],
  'kattenluik': ['cat door', 'flap', 'pet door'],
  'hondenluik': ['dog door', 'flap', 'pet door'],
};

// Helper function to check if product matches subcategory keywords
function productMatchesKeywords(productName: string, keywords: string[]): boolean {
  const lowerName = productName.toLowerCase();
  return keywords.some(keyword => lowerName.includes(keyword.toLowerCase()));
}

// Filter products by subcategory keywords
function filterProductsBySubcategory(products: CJProductDetail[], subcategory: string): CJProductDetail[] {
  const keywords = PET_SUBCATEGORIES[subcategory];
  if (!keywords) return products;
  
  return products.filter(p => productMatchesKeywords(p.productNameEn, keywords));
}

// Expand search terms with related keywords (including Dutch to English)
function expandSearchTerms(keyword: string): string[] {
  const lowerKeyword = keyword.toLowerCase();
  const expanded: string[] = [keyword];
  
  // Check if it's a Dutch term that needs expansion
  for (const [dutch, english] of Object.entries(SEARCH_TERM_EXPANSIONS)) {
    if (lowerKeyword.includes(dutch)) {
      expanded.push(...english);
    }
  }
  
  // Add common variations
  if (!lowerKeyword.endsWith('s')) {
    expanded.push(keyword + 's'); // Add plural
  }
  if (lowerKeyword.endsWith('s') && lowerKeyword.length > 2) {
    expanded.push(keyword.slice(0, -1)); // Add singular
  }
  
  return [...new Set(expanded)]; // Remove duplicates
}

// Search for pet products from US warehouse using the correct category endpoint
// Uses CJ API's productNameEn parameter for server-side filtering when searching
// Now supports advanced search with multiple strategies
async function searchPetProductsFromUS(accessToken: string, pageNum = 1, pageSize = 50, keyword?: string, searchMode: 'category' | 'global' | 'advanced' = 'category') {
  const params: Record<string, string> = {
    pageNum: pageNum.toString(),
    pageSize: pageSize.toString(),
    countryCode: 'US',
  };
  
  // Only add category filter for category mode
  if (searchMode === 'category') {
    params.categoryId = PET_CATEGORY_ID;
  }
  
  // Determine the search keyword to send to CJ API
  let apiSearchKeyword: string | null = null;
  let clientSideFilter: string[] | null = null;
  
  if (keyword && keyword !== 'pet' && keyword !== 'all') {
    // If it's a predefined subcategory, use the first few keywords for API search
    if (PET_SUBCATEGORIES[keyword]) {
      // Use the main identifying keywords for the category in API
      const categoryKeywords = PET_SUBCATEGORIES[keyword];
      // Pick the most specific keyword for API search
      apiSearchKeyword = categoryKeywords[0]; // e.g., 'toy' for Pet Toys
      clientSideFilter = categoryKeywords; // Use full list for client-side refinement
    } else {
      // Expand search terms for better matching
      const expandedTerms = expandSearchTerms(keyword);
      apiSearchKeyword = expandedTerms[0]; // Use first term for API
      clientSideFilter = expandedTerms; // Use all terms for client-side filtering
    }
  }
  
  // Add productNameEn for server-side filtering if we have a search term
  if (apiSearchKeyword) {
    params.productNameEn = apiSearchKeyword;
  }

  const queryString = new URLSearchParams(params).toString();
  console.log(`Fetching pet products: page=${pageNum}, size=${pageSize}, mode=${searchMode}, apiKeyword=${apiSearchKeyword}, clientFilter=${clientSideFilter?.join(',')}`);

  const response = await fetch(`${CJ_API_BASE}/product/list?${queryString}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'CJ-Access-Token': accessToken,
    },
  });

  const data = await response.json();
  console.log('CJ Pet products response:', JSON.stringify(data).substring(0, 500));
  
  // Apply additional client-side filtering if we have subcategory keywords
  // This ensures products match the full subcategory criteria, not just the API keyword
  if (data.result && data.data?.list && clientSideFilter && PET_SUBCATEGORIES[keyword || '']) {
    const originalList = data.data.list;
    const originalTotal = data.data.total || originalList.length;
    
    // Filter to products that match ANY of the subcategory keywords
    data.data.list = originalList.filter((p: CJProductDetail) => 
      productMatchesKeywords(p.productNameEn, clientSideFilter!)
    );
    
    data.data.total = data.data.list.length;
    data.data.originalTotal = originalTotal;
    
    console.log(`Client-side filtered from ${originalList.length} to ${data.data.list.length} products`);
  }
  
  return data;
}

// Advanced search that combines multiple search strategies for better results
async function advancedPetSearch(accessToken: string, keyword: string, pageNum = 1, pageSize = 50) {
  console.log(`Advanced search for: ${keyword}`);
  
  // Strategy 1: Try category-limited search first (most relevant)
  const categoryResult = await searchPetProductsFromUS(accessToken, pageNum, pageSize, keyword, 'category');
  
  if (categoryResult.result && categoryResult.data?.list?.length >= 10) {
    console.log(`Found ${categoryResult.data.list.length} products in pet category`);
    categoryResult.data.searchStrategy = 'category';
    return categoryResult;
  }
  
  // Strategy 2: Try global search with pet-related filtering
  console.log('Category search returned few results, trying global search with pet filter...');
  const globalResult = await searchPetProductsFromUS(accessToken, pageNum, Math.min(pageSize * 2, 100), keyword, 'global');
  
  if (globalResult.result && globalResult.data?.list) {
    // Filter global results to only pet-related products
    const petKeywords = ['pet', 'dog', 'cat', 'puppy', 'kitten', 'animal', 'bird', 'fish', 'hamster', 'rabbit', 'parrot'];
    const allSubcategoryKeywords = Object.values(PET_SUBCATEGORIES).flat();
    const combinedPetKeywords = [...new Set([...petKeywords, ...allSubcategoryKeywords])];
    
    const petRelatedProducts = globalResult.data.list.filter((p: CJProductDetail) => {
      const lowerName = p.productNameEn.toLowerCase();
      const lowerCategory = (p.categoryName || '').toLowerCase();
      
      // Check if product name or category contains pet-related keywords
      return combinedPetKeywords.some(kw => 
        lowerName.includes(kw.toLowerCase()) || lowerCategory.includes(kw.toLowerCase())
      );
    });
    
    console.log(`Filtered global results: ${petRelatedProducts.length} pet-related products from ${globalResult.data.list.length} total`);
    
    // Combine with category results if any
    const categoryProducts = categoryResult.result && categoryResult.data?.list ? categoryResult.data.list : [];
    const seenPids = new Set(categoryProducts.map((p: CJProductDetail) => p.pid));
    
    // Add unique products from global search
    for (const product of petRelatedProducts) {
      if (!seenPids.has(product.pid)) {
        categoryProducts.push(product);
        seenPids.add(product.pid);
      }
    }
    
    categoryResult.data = {
      list: categoryProducts.slice(0, pageSize),
      total: categoryProducts.length,
      originalTotal: globalResult.data.total,
    };
    categoryResult.data.searchStrategy = 'combined';
    categoryResult.result = true;
  }
  
  return categoryResult;
}

// Get product shipping info to verify US warehouse availability
async function getProductShipping(accessToken: string, productId: string, countryCode = 'US') {
  const response = await fetch(`${CJ_API_BASE}/product/shippingV2?pid=${productId}&country=${countryCode}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'CJ-Access-Token': accessToken,
    },
  });

  const data = await response.json();
  console.log('CJ Shipping info:', JSON.stringify(data).substring(0, 500));
  return data;
}

// Fetch pet catalog directly using category ID
async function fetchPetCatalog(accessToken: string, pageNum = 1, pageSize = 50) {
  console.log(`Fetching pet catalog page ${pageNum} with ${pageSize} items per page`);
  return await searchPetProductsFromUS(accessToken, pageNum, pageSize);
}

interface CJOrderRequest {
  orderNumber: string;
  shippingZip: string;
  shippingCountryCode: string;
  shippingCountry: string;
  shippingProvince: string;
  shippingCity: string;
  shippingAddress: string;
  shippingCustomerName: string;
  shippingPhone: string;
  products: Array<{
    vid: string;
    quantity: number;
  }>;
  remark?: string;
  logisticName?: string;
  fromCountryCode?: string;
}

// Get access token from CJ API with database-backed caching
async function getAccessToken(): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: cachedData, error: cacheError } = await supabase
    .from('cj_token_cache')
    .select('access_token, token_expiry')
    .eq('id', 'singleton')
    .single();

  if (!cacheError && cachedData) {
    const tokenExpiry = new Date(cachedData.token_expiry).getTime();
    if (Date.now() < tokenExpiry) {
      console.log('Using cached CJ access token from database');
      return cachedData.access_token;
    }
    console.log('Cached token expired, requesting new one...');
  }

  const apiKey = Deno.env.get('CJ_API_KEY');
  const email = Deno.env.get('CJ_EMAIL');

  if (!apiKey || !email) {
    throw new Error('CJ_API_KEY or CJ_EMAIL not configured');
  }

  console.log('Requesting new CJ access token...');
  
  const response = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: email,
      password: apiKey,
    }),
  });

  const data: CJAuthResponse = await response.json();
  
  if (!data.result) {
    console.error('CJ Auth failed:', data);
    if (data.code === 1600200) {
      throw new Error('CJ API rate limited - please wait 5 minutes before trying again');
    }
    throw new Error(`CJ Authentication failed: ${data.code} - ${data.message || 'Unknown error'}`);
  }

  const expiryDate = new Date(data.data.accessTokenExpiryDate);
  const safeExpiry = new Date(expiryDate.getTime() - (5 * 60 * 1000));
  
  const { error: upsertError } = await supabase
    .from('cj_token_cache')
    .upsert({
      id: 'singleton',
      access_token: data.data.accessToken,
      token_expiry: safeExpiry.toISOString(),
      updated_at: new Date().toISOString()
    });

  if (upsertError) {
    console.error('Failed to cache token:', upsertError);
  } else {
    console.log('New CJ access token cached, expires:', safeExpiry.toISOString());
  }

  return data.data.accessToken;
}

// Fetch products from CJ Dropshipping
async function fetchProducts(accessToken: string, params: CJProductListRequest) {
  const response = await fetch(`${CJ_API_BASE}/product/list`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'CJ-Access-Token': accessToken,
    },
  });

  const data = await response.json();
  console.log('CJ Products response:', JSON.stringify(data).substring(0, 500));
  return data;
}

// Get FULL product details by ID - includes all images, variants, and inventory
async function getProductDetails(accessToken: string, productId: string, countryCode = 'US') {
  // Use features to get full details including inventory and videos
  const params = new URLSearchParams({
    pid: productId,
    features: 'enable_inventory,enable_video',
    countryCode: countryCode,
  });

  const response = await fetch(`${CJ_API_BASE}/product/query?${params}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'CJ-Access-Token': accessToken,
    },
  });

  const data = await response.json();
  console.log('CJ Product full details response:', JSON.stringify(data).substring(0, 800));
  return data;
}

// Get product details by ID (legacy - simpler version)
async function getProductById(accessToken: string, productId: string) {
  const response = await fetch(`${CJ_API_BASE}/product/query?pid=${productId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'CJ-Access-Token': accessToken,
    },
  });

  const data = await response.json();
  console.log('CJ Product detail response:', JSON.stringify(data).substring(0, 500));
  return data;
}

// Get inventory for a product by product ID
async function getProductInventory(accessToken: string, productId: string) {
  const response = await fetch(`${CJ_API_BASE}/product/stock/getInventoryByPid?pid=${productId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'CJ-Access-Token': accessToken,
    },
  });

  const data = await response.json();
  console.log('CJ Inventory response:', JSON.stringify(data).substring(0, 500));
  return data;
}

// Get inventory by SKU
async function getInventoryBySku(accessToken: string, sku: string) {
  const response = await fetch(`${CJ_API_BASE}/product/stock/queryBySku?sku=${sku}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'CJ-Access-Token': accessToken,
    },
  });

  const data = await response.json();
  console.log('CJ Inventory by SKU response:', JSON.stringify(data).substring(0, 500));
  return data;
}

// Search products by keyword
async function searchProducts(accessToken: string, keyword: string, pageNum = 1, pageSize = 20) {
  const params = new URLSearchParams({
    productNameEn: keyword,
    pageNum: pageNum.toString(),
    pageSize: pageSize.toString(),
  });

  const response = await fetch(`${CJ_API_BASE}/product/list?${params}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'CJ-Access-Token': accessToken,
    },
  });

  const data = await response.json();
  console.log('CJ Search response:', JSON.stringify(data).substring(0, 500));
  return data;
}

// Create order in CJ Dropshipping
async function createOrder(accessToken: string, orderData: CJOrderRequest) {
  const response = await fetch(`${CJ_API_BASE}/shopping/order/createOrder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CJ-Access-Token': accessToken,
    },
    body: JSON.stringify(orderData),
  });

  const data = await response.json();
  console.log('CJ Create order response:', JSON.stringify(data));
  return data;
}

// Get order status from CJ
async function getOrderStatus(accessToken: string, orderId: string) {
  const response = await fetch(`${CJ_API_BASE}/shopping/order/getOrderDetail?orderId=${orderId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'CJ-Access-Token': accessToken,
    },
  });

  const data = await response.json();
  console.log('CJ Order status response:', JSON.stringify(data));
  return data;
}

// Get shipping info
async function getShippingInfo(accessToken: string, orderId: string) {
  const response = await fetch(`${CJ_API_BASE}/logistic/getTrackInfo?orderId=${orderId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'CJ-Access-Token': accessToken,
    },
  });

  const data = await response.json();
  console.log('CJ Shipping info response:', JSON.stringify(data));
  return data;
}

// Sync stock for all products with CJ product IDs
async function syncAllProductStock(accessToken: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log('Starting stock sync for all products...');

  // Get all products that have CJ product IDs
  const { data: products, error: fetchError } = await supabase
    .from('products')
    .select('id, cj_product_id, sku, name')
    .not('cj_product_id', 'is', null);

  if (fetchError) {
    console.error('Error fetching products:', fetchError);
    throw new Error(`Failed to fetch products: ${fetchError.message}`);
  }

  if (!products || products.length === 0) {
    console.log('No products with CJ product IDs found');
    return { synced: 0, errors: 0 };
  }

  console.log(`Found ${products.length} products to sync`);

  let synced = 0;
  let errors = 0;
  const results: Array<{ id: string; name: string; stock: number | null; error?: string }> = [];

  for (const product of products) {
    try {
      // Get inventory by product ID
      const inventoryResponse = await getProductInventory(accessToken, product.cj_product_id);
      
      if (!inventoryResponse.result) {
        console.error(`Failed to get inventory for ${product.name}:`, inventoryResponse);
        errors++;
        results.push({ id: product.id, name: product.name, stock: null, error: inventoryResponse.message });
        continue;
      }

      // Calculate total US warehouse stock (we're targeting US customers)
      let totalStock = 0;
      const inventoryData = inventoryResponse.data;
      
      if (Array.isArray(inventoryData)) {
        for (const inv of inventoryData) {
          // Prefer US warehouse, but also count China warehouse as backup
          if (inv.countryCode === 'US') {
            totalStock += inv.totalInventoryNum || 0;
          } else if (inv.countryCode === 'CN' && totalStock === 0) {
            // Use China warehouse stock if no US stock
            totalStock = inv.totalInventoryNum || 0;
          }
        }
      }

      // Update product stock in database
      const { error: updateError } = await supabase
        .from('products')
        .update({ 
          stock: totalStock,
          updated_at: new Date().toISOString()
        })
        .eq('id', product.id);

      if (updateError) {
        console.error(`Failed to update stock for ${product.name}:`, updateError);
        errors++;
        results.push({ id: product.id, name: product.name, stock: null, error: updateError.message });
      } else {
        console.log(`Updated stock for ${product.name}: ${totalStock}`);
        synced++;
        results.push({ id: product.id, name: product.name, stock: totalStock });
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (err) {
      console.error(`Error syncing ${product.name}:`, err);
      errors++;
      results.push({ id: product.id, name: product.name, stock: null, error: String(err) });
    }
  }

  console.log(`Stock sync completed. Synced: ${synced}, Errors: ${errors}`);
  return { synced, errors, results };
}

// Get full product details for import (all images, variants, stock)
// Respects CJ API rate limit of 1 request per second with retry logic
async function getProductsForImport(accessToken: string, productIds: string[]) {
  const results: Array<{
    pid: string;
    success: boolean;
    data?: CJProductDetail;
    images?: string[];
    variants?: CJVariant[];
    totalStock?: number;
    error?: string;
  }> = [];

  // Helper function with retry logic for rate limiting
  const fetchWithRetry = async (pid: string, retries = 3): Promise<{ result: boolean; data?: CJProductDetail; message?: string }> => {
    for (let attempt = 0; attempt < retries; attempt++) {
      const response = await getProductDetails(accessToken, pid, 'US');
      
      // Check for rate limit error
      if (response.code === 1600200 || response.message?.includes('Too Many Requests')) {
        console.log(`Rate limited on ${pid}, waiting 1.5s before retry ${attempt + 1}/${retries}...`);
        await new Promise(resolve => setTimeout(resolve, 1500));
        continue;
      }
      
      return response;
    }
    return { result: false, message: 'Rate limit exceeded after retries' };
  };

  for (const pid of productIds) {
    try {
      console.log(`Fetching full details for product ${pid}...`);
      
      // Wait BEFORE making request to respect rate limit (1 req/sec)
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Get full product details with retry logic
      const detailResponse = await fetchWithRetry(pid);
      
      if (!detailResponse.result) {
        console.log(`Failed to get details for ${pid}: ${detailResponse.message}`);
        results.push({ pid, success: false, error: detailResponse.message });
        continue;
      }

      const product = detailResponse.data as CJProductDetail;
      
      // Collect all images - handle both array and JSON string formats
      const images: string[] = [];
      
      // Parse productImageSet - can be array or JSON string
      let imageSet: string[] = [];
      if (product.productImageSet) {
        if (Array.isArray(product.productImageSet)) {
          imageSet = product.productImageSet;
        } else if (typeof product.productImageSet === 'string') {
          try {
            imageSet = JSON.parse(product.productImageSet);
          } catch {
            imageSet = [product.productImageSet];
          }
        }
      }
      
      for (const img of imageSet) {
        if (img && typeof img === 'string' && img.startsWith('http') && !images.includes(img)) {
          images.push(img);
        }
      }
      if (imageSet.length > 0) {
        console.log(`Found ${imageSet.length} images in productImageSet for ${pid}`);
      }
      
      // Parse main productImage - can also be JSON string
      let mainImage = product.productImage;
      if (mainImage && typeof mainImage === 'string') {
        if (mainImage.startsWith('[')) {
          try {
            const parsed = JSON.parse(mainImage);
            if (Array.isArray(parsed)) {
              for (const img of parsed) {
                if (img && typeof img === 'string' && img.startsWith('http') && !images.includes(img)) {
                  images.unshift(img);
                }
              }
            }
          } catch {
            if (mainImage.startsWith('http') && !images.includes(mainImage)) {
              images.unshift(mainImage);
            }
          }
        } else if (mainImage.startsWith('http') && !images.includes(mainImage)) {
          images.unshift(mainImage);
        }
      }
      
      // Add variant images
      if (product.variants) {
        for (const variant of product.variants) {
          if (variant.variantImage && typeof variant.variantImage === 'string' && 
              variant.variantImage.startsWith('http') && !images.includes(variant.variantImage)) {
            images.push(variant.variantImage);
          }
        }
      }
      
      console.log(`Total ${images.length} unique images collected for product ${pid}`);

      // Calculate total stock from variants
      let totalStock = 0;
      if (product.variants) {
        for (const variant of product.variants) {
          if (variant.inventories) {
            for (const inv of variant.inventories) {
              if (inv.countryCode === 'US') {
                totalStock += inv.totalInventory || 0;
              } else if (inv.countryCode === 'CN' && totalStock === 0) {
                totalStock = inv.totalInventory || 0;
              }
            }
          }
        }
      }

      results.push({
        pid,
        success: true,
        data: product,
        images,
        variants: product.variants,
        totalStock,
      });

    } catch (err) {
      console.error(`Error fetching product ${pid}:`, err);
      results.push({ pid, success: false, error: String(err) });
    }
  }

  console.log(`Completed fetching ${results.length} products, ${results.filter(r => r.success).length} successful`);
  return results;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user - require admin role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - no authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Extract the token and validate it using getClaims for reliable JWT validation
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authSupabase.auth.getClaims(token);
    
    let userId: string;
    
    if (claimsError || !claimsData?.claims?.sub) {
      console.error('Token validation via getClaims failed:', claimsError || 'Missing sub claim');
      
      // Try getUser as fallback
      const { data: userData, error: userError } = await authSupabase.auth.getUser();
      
      if (userError || !userData?.user) {
        console.error('User verification also failed:', userError);
        return new Response(
          JSON.stringify({ error: 'Unauthorized - invalid or expired session. Please log out and log back in.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      userId = userData.user.id;
      console.log(`Authenticated user via getUser fallback: ${userId}`);
    } else {
      userId = claimsData.claims.sub as string;
      console.log(`Authenticated user via getClaims: ${userId}`);
    }
    console.log(`Authenticated user: ${userId}`);

    // Check if user is admin
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: roleData, error: roleError } = await adminSupabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError || !roleData) {
      console.error('Admin check failed:', roleError || 'User is not admin');
      return new Response(
        JSON.stringify({ error: 'Forbidden - admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Admin verified for user: ${userId}`);

    // Check rate limit (100 requests per hour for CJ API)
    const { data: rateLimitData, error: rateLimitError } = await adminSupabase
      .rpc('check_rate_limit', {
        p_user_id: userId,
        p_function_name: 'cj-dropshipping',
        p_max_requests: 100,
        p_window_minutes: 60
      });

    if (rateLimitError) {
      console.error('Rate limit check failed:', rateLimitError);
    } else if (rateLimitData && rateLimitData.length > 0 && !rateLimitData[0].allowed) {
      console.log(`Rate limit exceeded for user: ${userId}`);
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again later.',
          reset_at: rateLimitData[0].reset_at
        }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitData[0].reset_at
          } 
        }
      );
    }

    const { action, ...params } = await req.json();
    console.log(`CJ Dropshipping action: ${action}`, params);

    // Get access token first
    const accessToken = await getAccessToken();

    let result;

    switch (action) {
      case 'list-products':
        result = await fetchProducts(accessToken, params);
        break;

      case 'get-product':
        if (!params.productId) {
          throw new Error('productId is required');
        }
        result = await getProductById(accessToken, params.productId);
        break;

      case 'get-product-details':
        if (!params.productId) {
          throw new Error('productId is required');
        }
        result = await getProductDetails(accessToken, params.productId, params.countryCode || 'US');
        break;

      case 'get-products-for-import':
        if (!params.productIds || !Array.isArray(params.productIds)) {
          throw new Error('productIds array is required');
        }
        result = await getProductsForImport(accessToken, params.productIds);
        break;

      case 'get-product-inventory':
        if (!params.productId) {
          throw new Error('productId is required');
        }
        result = await getProductInventory(accessToken, params.productId);
        break;

      case 'get-inventory-by-sku':
        if (!params.sku) {
          throw new Error('sku is required');
        }
        result = await getInventoryBySku(accessToken, params.sku);
        break;

      case 'search-products':
        if (!params.keyword) {
          throw new Error('keyword is required');
        }
        result = await searchProducts(
          accessToken, 
          params.keyword, 
          params.pageNum || 1, 
          params.pageSize || 20
        );
        break;

      case 'create-order':
        if (!params.orderData) {
          throw new Error('orderData is required');
        }
        result = await createOrder(accessToken, params.orderData);
        break;

      case 'get-order-status':
        if (!params.orderId) {
          throw new Error('orderId is required');
        }
        result = await getOrderStatus(accessToken, params.orderId);
        break;

      case 'get-shipping':
        if (!params.orderId) {
          throw new Error('orderId is required');
        }
        result = await getShippingInfo(accessToken, params.orderId);
        break;

      case 'pet-catalog':
        result = await fetchPetCatalog(
          accessToken,
          params.pageNum || 1,
          params.pageSize || 50
        );
        break;

      case 'pet-search':
        // Use advanced search for custom keywords, basic search for subcategories
        const searchKeyword = params.keyword || 'pet';
        const isSubcategory = PET_SUBCATEGORIES[searchKeyword] || searchKeyword === 'all' || searchKeyword === 'pet';
        
        if (isSubcategory) {
          result = await searchPetProductsFromUS(
            accessToken,
            params.pageNum || 1,
            params.pageSize || 50,
            searchKeyword,
            'category'
          );
        } else {
          // Use advanced search for custom keywords
          result = await advancedPetSearch(
            accessToken,
            searchKeyword,
            params.pageNum || 1,
            params.pageSize || 50
          );
        }
        break;
      
      case 'advanced-search':
        // New action for advanced search with all strategies
        if (!params.keyword) {
          throw new Error('keyword is required');
        }
        result = await advancedPetSearch(
          accessToken,
          params.keyword,
          params.pageNum || 1,
          params.pageSize || 50
        );
        break;

      case 'get-product-shipping':
        if (!params.productId) {
          throw new Error('productId is required');
        }
        result = await getProductShipping(accessToken, params.productId, params.countryCode || 'US');
        break;

      case 'sync-stock':
        result = await syncAllProductStock(accessToken);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('CJ Dropshipping error:', errorMessage);
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

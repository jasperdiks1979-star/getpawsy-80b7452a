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

// Pet subcategory keywords for better filtering
const PET_SUBCATEGORIES: Record<string, string[]> = {
  'Pet Toys': ['toy', 'toys', 'ball', 'chew', 'squeaky', 'plush', 'rope', 'frisbee', 'fetch', 'puzzle', 'interactive', 'teaser', 'wand'],
  'Pet Food & Treats': ['food', 'treat', 'treats', 'snack', 'bowl', 'feeder', 'feeding', 'water', 'fountain', 'dispenser'],
  'Pet Beds & Furniture': ['bed', 'beds', 'sofa', 'couch', 'mat', 'blanket', 'cushion', 'pillow', 'house', 'cave', 'nest', 'sleeping'],
  'Pet Clothing': ['clothes', 'clothing', 'sweater', 'jacket', 'coat', 'costume', 'dress', 'shirt', 'hoodie', 'raincoat', 'vest'],
  'Pet Collars & Leashes': ['collar', 'leash', 'harness', 'lead', 'chain', 'tag', 'name', 'id'],
  'Pet Grooming': ['brush', 'comb', 'grooming', 'shampoo', 'nail', 'clipper', 'trimmer', 'bath', 'towel', 'dryer', 'deshedding'],
  'Pet Carriers': ['carrier', 'bag', 'backpack', 'transport', 'travel', 'cage', 'crate', 'kennel', 'stroller'],
  'Cat Supplies': ['cat', 'kitten', 'scratching', 'scratcher', 'litter', 'catnip', 'climbing', 'tree', 'tower', 'perch'],
  'Dog Supplies': ['dog', 'puppy', 'canine', 'paw', 'muzzle', 'training', 'potty', 'pad'],
  'Small Pet Supplies': ['hamster', 'rabbit', 'guinea', 'bird', 'fish', 'aquarium', 'turtle', 'reptile', 'wheel', 'hideout'],
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

// Search for pet products from US warehouse using the correct category endpoint
async function searchPetProductsFromUS(accessToken: string, pageNum = 1, pageSize = 50, keyword?: string) {
  // Fetch more products to allow for filtering
  const fetchSize = pageSize * 4; // Fetch 4x to ensure enough after filtering
  
  const params: Record<string, string> = {
    pageNum: '1', // Always fetch from page 1 for client-side pagination
    pageSize: fetchSize.toString(),
    categoryId: PET_CATEGORY_ID,
    countryCode: 'US',
  };

  const queryString = new URLSearchParams(params).toString();
  console.log(`Fetching pet products from US warehouse, size ${fetchSize}, category: ${PET_CATEGORY_ID}, filter keyword: ${keyword}`);

  const response = await fetch(`${CJ_API_BASE}/product/list?${queryString}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'CJ-Access-Token': accessToken,
    },
  });

  const data = await response.json();
  console.log('CJ Pet products response:', JSON.stringify(data).substring(0, 500));
  
  // If we have a keyword filter, apply client-side filtering
  if (data.result && data.data?.list && keyword && keyword !== 'pet' && keyword !== 'all') {
    const originalList = data.data.list;
    const originalTotal = data.data.total || originalList.length;
    
    // Check if keyword is a subcategory name
    if (PET_SUBCATEGORIES[keyword]) {
      data.data.list = filterProductsBySubcategory(originalList, keyword);
    } else {
      // General keyword search - match against product name
      const lowerKeyword = keyword.toLowerCase();
      const searchTerms = lowerKeyword.split(/\s+/).filter(t => t.length > 2);
      
      data.data.list = originalList.filter((p: CJProductDetail) => {
        const name = p.productNameEn.toLowerCase();
        // Match if ALL search terms are found in the name
        return searchTerms.every(term => name.includes(term));
      });
    }
    
    // Apply pagination to filtered results
    const startIndex = (pageNum - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const filteredTotal = data.data.list.length;
    data.data.list = data.data.list.slice(startIndex, endIndex);
    data.data.total = filteredTotal;
    data.data.originalTotal = originalTotal;
    
    console.log(`Filtered from ${originalTotal} to ${filteredTotal} products for keyword: ${keyword}`);
  }
  
  return data;
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

  for (const pid of productIds) {
    try {
      console.log(`Fetching full details for product ${pid}...`);
      
      // Get full product details with inventory
      const detailResponse = await getProductDetails(accessToken, pid, 'US');
      
      if (!detailResponse.result) {
        results.push({ pid, success: false, error: detailResponse.message });
        continue;
      }

      const product = detailResponse.data as CJProductDetail;
      
      // Collect all images - prioritize productImageSet (full image array from CJ)
      const images: string[] = [];
      
      // First, add all images from productImageSet (this is the main image array from CJ)
      if (product.productImageSet && Array.isArray(product.productImageSet)) {
        for (const img of product.productImageSet) {
          if (img && !images.includes(img)) {
            images.push(img);
          }
        }
        console.log(`Found ${product.productImageSet.length} images in productImageSet for ${pid}`);
      }
      
      // Fallback: add main productImage if not already in list
      if (product.productImage && !images.includes(product.productImage)) {
        images.unshift(product.productImage); // Add to front as main image
      }
      
      // Add variant images (these are often different color/style variants)
      if (product.variants) {
        for (const variant of product.variants) {
          if (variant.variantImage && !images.includes(variant.variantImage)) {
            images.push(variant.variantImage);
          }
        }
      }
      
      console.log(`Total ${images.length} images collected for product ${pid}`);

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

      // If no stock from variants, try getting inventory separately
      if (totalStock === 0) {
        try {
          const inventoryResponse = await getProductInventory(accessToken, pid);
          if (inventoryResponse.result && Array.isArray(inventoryResponse.data)) {
            for (const inv of inventoryResponse.data) {
              if (inv.countryCode === 'US') {
                totalStock += inv.totalInventoryNum || 0;
              } else if (inv.countryCode === 'CN' && totalStock === 0) {
                totalStock = inv.totalInventoryNum || 0;
              }
            }
          }
        } catch (invErr) {
          console.log(`Could not fetch separate inventory for ${pid}:`, invErr);
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

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (err) {
      console.error(`Error fetching product ${pid}:`, err);
      results.push({ pid, success: false, error: String(err) });
    }
  }

  return results;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
        result = await searchPetProductsFromUS(
          accessToken,
          params.pageNum || 1,
          params.pageSize || 50,
          params.keyword || 'pet'
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

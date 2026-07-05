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
  // General categories
  'Pet Toys': ['toy', 'toys', 'ball', 'chew', 'squeaky', 'plush', 'rope', 'frisbee', 'fetch', 'puzzle', 'interactive', 'teaser', 'wand', 'kong', 'play', 'squeak', 'tug', 'throwing', 'catch'],
  'Pet Food & Treats': ['food', 'treat', 'treats', 'snack', 'bowl', 'feeder', 'feeding', 'water', 'fountain', 'dispenser', 'automatic', 'slow', 'portion', 'kibble', 'wet food', 'dry food'],
  'Pet Beds & Furniture': ['bed', 'beds', 'sofa', 'couch', 'mat', 'blanket', 'cushion', 'pillow', 'house', 'cave', 'nest', 'sleeping', 'orthopedic', 'donut', 'calming', 'elevated', 'hammock', 'window perch'],
  'Pet Clothing': ['clothes', 'clothing', 'sweater', 'jacket', 'coat', 'costume', 'dress', 'shirt', 'hoodie', 'raincoat', 'vest', 'pajamas', 'boots', 'shoes', 'socks', 'bandana', 'bow tie', 'hat', 'winter', 'summer'],
  'Pet Collars & Leashes': ['collar', 'leash', 'harness', 'lead', 'chain', 'tag', 'name', 'id', 'retractable', 'reflective', 'glow', 'led', 'nylon', 'leather', 'adjustable', 'breakaway', 'martingale'],
  'Pet Grooming': ['brush', 'comb', 'grooming', 'shampoo', 'nail', 'clipper', 'trimmer', 'bath', 'towel', 'dryer', 'deshedding', 'fur', 'hair', 'shedding', 'dematting', 'slicker', 'rake', 'scissors', 'ear', 'teeth', 'dental'],
  'Pet Carriers': ['carrier', 'bag', 'backpack', 'transport', 'travel', 'cage', 'crate', 'kennel', 'stroller', 'sling', 'airline', 'car seat', 'booster', 'pet seat', 'portable'],
  'Pet Health': ['medicine', 'supplement', 'vitamin', 'flea', 'tick', 'worm', 'dewormer', 'spray', 'cream', 'bandage', 'first aid', 'cone', 'recovery', 'calming', 'anxiety', 'joint', 'hip', 'senior'],
  'Pet Training': ['training', 'clicker', 'whistle', 'treat pouch', 'target', 'agility', 'tunnel', 'jump', 'weave', 'hurdle', 'course', 'obedience', 'puppy pad', 'potty training'],
  'Pet Accessories': ['id tag', 'charm', 'pendant', 'bell', 'camera', 'gps', 'tracker', 'monitor', 'pet cam', 'automatic', 'smart', 'wifi', 'app', 'remote'],
  
  // Dog specific
  'Dog Supplies': ['dog', 'puppy', 'canine', 'paw', 'muzzle', 'training', 'potty', 'pad', 'pee', 'waste', 'poop', 'bag', 'clicker', 'whistle', 'fence', 'gate', 'door', 'flap', 'ramp', 'stairs', 'step'],
  'Dog Toys': ['dog toy', 'chew toy', 'fetch', 'tennis ball', 'rope toy', 'squeaky dog', 'tug toy', 'dog ball', 'plush dog', 'interactive dog'],
  'Dog Beds': ['dog bed', 'dog sofa', 'dog mat', 'dog cushion', 'dog blanket', 'orthopedic dog', 'elevated dog bed', 'cooling dog'],
  'Dog Collars': ['dog collar', 'dog leash', 'dog harness', 'training collar', 'martingale', 'chain collar', 'prong collar', 'head collar'],
  
  // Cat specific
  'Cat Supplies': ['cat', 'kitten', 'scratching', 'scratcher', 'litter', 'catnip', 'climbing', 'tree', 'tower', 'perch', 'tunnel', 'laser', 'feather', 'mouse', 'mice', 'sisal', 'cardboard', 'window', 'condo', 'activity'],
  'Cat Trees': ['cat tree', 'scratching post', 'climbing tower', 'cat tower', 'cat condo', 'sisal', 'cat perch', 'cat furniture', 'multi-level', 'cat activity'],
  'Cat Litter': ['litter', 'litter box', 'cat toilet', 'litter scoop', 'litter mat', 'self-cleaning', 'automatic litter', 'litter tray', 'covered litter'],
  'Cat Toys': ['cat toy', 'feather toy', 'laser pointer', 'catnip toy', 'mouse toy', 'cat wand', 'interactive cat', 'cat ball', 'cat tunnel'],
  
  // Bird specific
  'Bird Supplies': ['bird', 'parrot', 'parakeet', 'budgie', 'cockatiel', 'canary', 'finch', 'lovebird', 'conure', 'macaw', 'cockatoo', 'aviary', 'birdcage', 'perch', 'swing', 'ladder'],
  'Bird Cages': ['bird cage', 'parrot cage', 'aviary', 'flight cage', 'breeding cage', 'travel cage bird', 'bird house', 'cage cover'],
  'Bird Toys': ['bird toy', 'parrot toy', 'bird swing', 'bird ladder', 'bird perch', 'chewing toy bird', 'foraging toy', 'bird bell', 'bird mirror', 'climbing toy bird'],
  'Bird Feeders': ['bird feeder', 'seed feeder', 'bird water', 'bird bath', 'bird bowl', 'automatic bird', 'nectar feeder', 'suet feeder'],
  'Bird Accessories': ['cuttlebone', 'mineral block', 'bird vitamin', 'bird treat', 'bird harness', 'bird diaper', 'nesting box', 'bird nesting'],
  
  // Fish & Aquarium
  'Fish Supplies': ['fish', 'aquarium', 'tank', 'goldfish', 'tropical fish', 'betta', 'guppy', 'tetra', 'cichlid', 'koi', 'pond'],
  'Aquarium Equipment': ['aquarium filter', 'fish tank', 'aquarium pump', 'air pump', 'water pump', 'aquarium heater', 'aquarium light', 'led aquarium', 'co2', 'aquarium co2'],
  'Aquarium Decor': ['aquarium decoration', 'fish tank decor', 'aquarium plant', 'artificial plant', 'aquarium rock', 'aquarium wood', 'driftwood', 'aquarium cave', 'aquarium background'],
  'Fish Food': ['fish food', 'fish flakes', 'fish pellets', 'betta food', 'goldfish food', 'tropical fish food', 'freeze dried', 'bloodworm', 'brine shrimp'],
  
  // Reptile specific
  'Reptile Supplies': ['reptile', 'lizard', 'gecko', 'bearded dragon', 'chameleon', 'iguana', 'snake', 'python', 'boa', 'turtle', 'tortoise', 'frog', 'terrarium', 'vivarium'],
  'Reptile Terrariums': ['terrarium', 'vivarium', 'reptile tank', 'reptile cage', 'snake tank', 'gecko tank', 'turtle tank', 'reptile enclosure', 'glass tank'],
  'Reptile Heating': ['heat lamp', 'heat mat', 'heating pad', 'basking lamp', 'ceramic heater', 'thermostat reptile', 'uvb lamp', 'uva lamp', 'reptile light'],
  'Reptile Decor': ['reptile hide', 'reptile cave', 'basking rock', 'reptile branch', 'reptile plant', 'moss', 'substrate', 'coconut fiber', 'reptile bark'],
  'Reptile Food': ['reptile food', 'cricket', 'mealworm', 'dubia roach', 'reptile calcium', 'vitamin d3', 'turtle food', 'tortoise food'],
  
  // Small pets (rabbits, hamsters, guinea pigs)
  'Small Pet Supplies': ['hamster', 'rabbit', 'bunny', 'guinea pig', 'chinchilla', 'gerbil', 'ferret', 'hedgehog', 'mouse', 'rat', 'degu'],
  'Small Pet Cages': ['hamster cage', 'rabbit cage', 'guinea pig cage', 'chinchilla cage', 'ferret cage', 'small animal cage', 'wire cage', 'modular cage'],
  'Small Pet Toys': ['hamster wheel', 'exercise wheel', 'hamster ball', 'tunnel tube', 'chew toy wood', 'gnawing toy', 'hideaway', 'hammock small pet'],
  'Small Pet Bedding': ['bedding', 'wood shavings', 'paper bedding', 'hay', 'timothy hay', 'alfalfa', 'nesting material', 'fleece liner'],
  'Small Pet Food': ['rabbit food', 'guinea pig food', 'hamster food', 'chinchilla food', 'pellets', 'hay cubes', 'vegetable treats', 'fruit treats'],
  
  // Horse & Equestrian
  'Horse Supplies': ['horse', 'pony', 'equestrian', 'stable', 'barn', 'paddock', 'riding', 'tack', 'equine', 'foal', 'mare', 'stallion'],
  'Horse Tack': ['saddle', 'bridle', 'halter', 'reins', 'bit', 'girth', 'stirrup', 'saddle pad', 'numnah', 'martingale'],
  'Horse Grooming': ['horse brush', 'curry comb', 'mane comb', 'hoof pick', 'horse shampoo', 'coat shine', 'fly spray', 'horse clipper'],
  'Horse Blankets': ['horse blanket', 'fly sheet', 'turnout rug', 'stable blanket', 'cooler rug', 'exercise sheet', 'neck cover'],
  'Horse Boots': ['horse boots', 'leg wraps', 'bandages', 'bell boots', 'splint boots', 'polo wraps', 'shipping boots'],
  'Horse Treats': ['horse treat', 'horse snack', 'apple treat', 'carrot treat', 'sugar cube', 'horse cookie', 'lick block'],
  
  // Outdoor & Wildlife
  'Wildlife & Garden': ['wildlife', 'garden', 'outdoor', 'wild bird', 'squirrel', 'hedgehog house', 'bat box', 'insect hotel', 'bee house'],
  'Wild Bird Feeding': ['wild bird feeder', 'bird table', 'peanut feeder', 'fat ball', 'suet cake', 'nyjer seed', 'sunflower seed', 'bird seed mix'],
};

// Common search term mappings for better results (Dutch to English)
const SEARCH_TERM_EXPANSIONS: Record<string, string[]> = {
  // Dutch pet terms
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
  // Bird terms
  'vogelkooi': ['bird cage', 'aviary', 'birdcage'],
  'papegaai': ['parrot', 'parakeet', 'cockatoo'],
  'parkiet': ['parakeet', 'budgie', 'budgerigar'],
  'kanarie': ['canary', 'finch', 'songbird'],
  // Fish terms
  'aquarium': ['aquarium', 'fish tank', 'tank'],
  'filter': ['filter', 'aquarium filter', 'pump'],
  'verwarming': ['heater', 'aquarium heater', 'heating'],
  'goudvis': ['goldfish', 'gold fish', 'fancy goldfish'],
  // Reptile terms
  'terrarium': ['terrarium', 'vivarium', 'reptile tank'],
  'slang': ['snake', 'python', 'boa'],
  'hagedis': ['lizard', 'gecko', 'bearded dragon'],
  'schildpad': ['turtle', 'tortoise', 'terrapin'],
  // Small pet terms
  'konijn': ['rabbit', 'bunny', 'hare'],
  'hamster': ['hamster', 'dwarf hamster', 'syrian'],
  'cavia': ['guinea pig', 'cavy', 'guinea'],
  'chinchilla': ['chinchilla', 'chin'],
  'fret': ['ferret', 'polecat'],
  // Horse terms
  'paard': ['horse', 'pony', 'equine'],
  'zadel': ['saddle', 'riding saddle', 'dressage'],
  'hoofdstel': ['bridle', 'halter', 'headstall'],
  'hoefijzer': ['horseshoe', 'hoof', 'farrier'],
  'paardendeken': ['horse blanket', 'rug', 'turnout'],
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
    
    // Non-pet exclusion patterns — reject before checking pet keywords
    const nonPetPatterns = [
      'nail art', 'nail polish', 'manicure', 'pedicure',
      'sunglasses', 'cat-eye', 'cat eye', 'eyewear',
      'airtag case', 'anti-loss device', 'tracker case',
      'handbag', 'crossbody bag', 'tote bag', 'clutch', 'purse',
      'makeup', 'cosmetic', 'lipstick', 'mascara',
      'hair extension', 'hair wig',
      't-shirt', 'tshirt', 'hoodie', 'cardigan', 'sweater',
      'dress', 'skirt', 'blouse', 'pumps', 'stiletto', 'high-heel',
      'candle holder', 'candelabrum', 'teacup', 'glass cup', 'wine glass',
      'yoga', 'gym', 'fitness', 'tattoo',
      'plus-size', 'plus size', 'long-sleeve',
    ];

    const petRelatedProducts = globalResult.data.list.filter((p: CJProductDetail) => {
      const lowerName = p.productNameEn.toLowerCase();
      const lowerCategory = (p.categoryName || '').toLowerCase();
      
      // First reject non-pet items
      if (nonPetPatterns.some(pattern => lowerName.includes(pattern))) {
        return false;
      }
      
      // Then check if product name or category contains pet-related keywords
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

  // CJ API 2.0 uses apiKey only (not email+password)
  const apiKey = Deno.env.get('CJ_API_KEY');

  if (!apiKey) {
    throw new Error('CJ_API_KEY not configured');
  }

  console.log('Requesting new CJ access token with apiKey...');
  
  const response = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ apiKey }),
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
// Tries /product/query first, then falls back to /product/list if that fails
async function getProductDetails(accessToken: string, productId: string, countryCode = 'US') {
  // First try /product/query endpoint
  const params = new URLSearchParams({
    pid: productId,
    features: 'enable_inventory,enable_video',
    countryCode: countryCode,
  });

  console.log(`Trying /product/query for pid: ${productId}`);
  const response = await fetch(`${CJ_API_BASE}/product/query?${params}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'CJ-Access-Token': accessToken,
    },
  });

  const data = await response.json();
  console.log('CJ Product query response:', JSON.stringify(data).substring(0, 800));
  
  // If query succeeded, return it
  if (data.result && data.data) {
    return data;
  }
  
  // If query failed, try /product/list with pid filter as fallback
  console.log(`Query failed for ${productId}, trying /product/list fallback...`);
  const listParams = new URLSearchParams({
    pid: productId,
    pageNum: '1',
    pageSize: '1',
  });
  
  const listResponse = await fetch(`${CJ_API_BASE}/product/list?${listParams}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'CJ-Access-Token': accessToken,
    },
  });
  
  const listData = await listResponse.json();
  console.log('CJ Product list fallback response:', JSON.stringify(listData).substring(0, 800));
  
  // If list found the product, convert to query format
  if (listData.result && listData.data?.list?.length > 0) {
    const product = listData.data.list[0];
    // Fetch full details using the product we found
    console.log(`Found product in list, fetching full details...`);
    
    // Wait to avoid rate limit
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    // Try query again with the confirmed pid
    const retryParams = new URLSearchParams({
      pid: product.pid,
      features: 'enable_inventory,enable_video',
      countryCode: countryCode,
    });
    
    const retryResponse = await fetch(`${CJ_API_BASE}/product/query?${retryParams}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'CJ-Access-Token': accessToken,
      },
    });
    
    const retryData = await retryResponse.json();
    console.log('CJ Product query retry response:', JSON.stringify(retryData).substring(0, 500));
    
    if (retryData.result && retryData.data) {
      return retryData;
    }
    
    // If still failing, construct a minimal response from list data
    return {
      result: true,
      data: {
        pid: product.pid,
        productNameEn: product.productNameEn,
        productSku: product.productSku,
        productImage: product.productImage,
        productWeight: product.productWeight,
        sellPrice: product.sellPrice,
        categoryName: product.categoryName,
        variants: product.variants || [],
      }
    };
  }
  
  // Return original failed response
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
    // Internal-secret bypass for server-to-server orchestration (admin still required for browser).
    const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '';
    const internalHeader = req.headers.get('x-internal-secret') ?? '';
    const isInternal = !!INTERNAL_SECRET && internalHeader === INTERNAL_SECRET;
    let userId: string = 'internal';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate user - require admin role (skipped when internal secret matches)
    const authHeader = req.headers.get('Authorization');
    if (isInternal) {
      console.log('cj-dropshipping: authenticated via INTERNAL_FUNCTION_SECRET');
    } else {
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - no authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Extract the token and validate it using getClaims for reliable JWT validation
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authSupabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims?.sub) {
      console.error('Token validation via getClaims failed:', claimsError || 'Missing sub claim');
      
      // Fallback 1: validate the token with the service-role client (bypasses anon JWKS issues)
      const { data: userData, error: userError } = await adminSupabase.auth.getUser(token);

      if (userError || !userData?.user) {
        console.error('adminSupabase.getUser(token) also failed:', userError);

        // Fallback 2: decode JWT payload to extract sub (last resort, still verified above by Supabase gateway if verify_jwt=true)
        try {
          const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
          if (payload?.sub && typeof payload.exp === 'number' && payload.exp * 1000 > Date.now()) {
            userId = payload.sub as string;
            console.log(`Authenticated user via JWT payload decode: ${userId}`);
          } else {
            throw new Error('sub missing or token expired');
          }
        } catch (decodeErr) {
          console.error('JWT payload decode failed:', decodeErr);
          return new Response(
            JSON.stringify({ error: 'Unauthorized - invalid or expired session. Please log out and log back in.' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        userId = userData.user.id;
        console.log(`Authenticated user via adminSupabase.getUser(token): ${userId}`);
      }
    } else {
      userId = claimsData.claims.sub as string;
      console.log(`Authenticated user via getClaims: ${userId}`);
    }
    console.log(`Authenticated user: ${userId}`);

    // Check if user is admin
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
    } // end !isInternal auth block

    // Check rate limit (100 requests per hour for CJ API) — skipped for internal calls
    if (!isInternal) {
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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  image_url: string | null;
  images: string[] | null;
  stock: number | null;
  category: string | null;
  sku: string | null;
  slug: string | null;
  shipping_time: string | null;
  weight: number | null;
  is_active: boolean;
}

const BASE_URL = 'https://getpawsy.pet';
const FREE_SHIPPING_THRESHOLD = 35;
const FLAT_SHIPPING_RATE = 5.99;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatPrice(price: number): string {
  return `${price.toFixed(2)} USD`;
}

function getAvailability(stock: number | null): string {
  if (stock === null || stock <= 0) {
    return 'out of stock';
  }
  return 'in stock';
}

// Determine pet type from category for optimized titles
function getPetType(category: string | null): string {
  if (!category) return 'Pets';
  const cat = category.toLowerCase();
  if (cat.includes('dog')) return 'Dogs';
  if (cat.includes('cat')) return 'Cats';
  if (cat.includes('bird')) return 'Birds';
  if (cat.includes('hamster') || cat.includes('guinea') || cat.includes('rabbit') || cat.includes('small pet')) return 'Small Pets';
  if (cat.includes('fish') || cat.includes('aqua')) return 'Fish';
  return 'Pets';
}

// Get main benefit from product name/description for optimized titles
function extractBenefit(name: string, description: string | null): string {
  const nameLower = name.toLowerCase();
  const descLower = (description || '').toLowerCase();
  
  // Common benefit keywords
  if (nameLower.includes('comfort') || descLower.includes('comfort')) return 'Comfort & Support';
  if (nameLower.includes('interactive') || descLower.includes('interactive')) return 'Interactive Play';
  if (nameLower.includes('durable') || descLower.includes('durable')) return 'Long-Lasting Durability';
  if (nameLower.includes('training') || descLower.includes('training')) return 'Easy Training';
  if (nameLower.includes('calming') || descLower.includes('calming') || descLower.includes('anxiety')) return 'Stress Relief';
  if (nameLower.includes('orthopedic') || descLower.includes('orthopedic') || descLower.includes('joint')) return 'Joint Support';
  if (nameLower.includes('slow') && nameLower.includes('feed')) return 'Healthy Eating';
  if (nameLower.includes('grooming') || descLower.includes('grooming')) return 'Easy Grooming';
  if (nameLower.includes('travel') || descLower.includes('travel') || descLower.includes('portable')) return 'Travel-Friendly';
  if (nameLower.includes('waterproof') || descLower.includes('waterproof')) return 'Waterproof Design';
  if (nameLower.includes('adjustable') || descLower.includes('adjustable')) return 'Perfect Fit';
  if (nameLower.includes('chew') || descLower.includes('chew')) return 'Safe Chewing';
  if (nameLower.includes('scratch') || descLower.includes('scratch')) return 'Scratch-Friendly';
  
  return 'Premium Quality';
}

// Generate optimized title: Primary keyword + pet type + benefit (max 150 chars)
function generateOptimizedTitle(product: Product): string {
  const petType = getPetType(product.category);
  const benefit = extractBenefit(product.name, product.description);
  
  // Clean the product name (remove brand mentions, excessive adjectives)
  let cleanName = product.name
    .replace(/\bGetPawsy\b/gi, '')
    .replace(/\bPawsy\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Build optimized title: "Product Name for [Pet Type] - [Benefit]"
  const title = `${cleanName} for ${petType} - ${benefit}`;
  
  return truncateText(title, 150);
}

// Generate benefit-first US-English description with shipping clarity
function generateOptimizedDescription(product: Product): string {
  const petType = getPetType(product.category);
  const benefit = extractBenefit(product.name, product.description);
  
  // Extract clean description from product
  let baseDesc = product.description 
    ? stripHtml(product.description)
    : '';
  
  // Truncate base description to leave room for shipping info
  if (baseDesc.length > 4500) {
    baseDesc = baseDesc.substring(0, 4500);
  }
  
  // Build benefit-first description with shipping clarity
  let description = '';
  
  // Opening benefit statement
  description += `${benefit} for your ${petType.toLowerCase()}. `;
  
  // Add base description if available
  if (baseDesc && baseDesc.length > 20) {
    description += baseDesc + ' ';
  } else {
    description += `Premium quality ${product.name} designed for comfort and durability. `;
  }
  
  // Add shipping clarity (US market focus)
  description += `Free US shipping on orders over $${FREE_SHIPPING_THRESHOLD}. Fast delivery in 3-7 business days. 30-day hassle-free returns. Shop with confidence at GetPawsy.`;
  
  return truncateText(description, 5000);
}

// Map to specific Google Product Category ID based on category
function getGoogleProductCategory(category: string | null): string {
  if (!category) return 'Animals & Pet Supplies';
  
  const cat = category.toLowerCase();
  
  // Dog categories
  if (cat.includes('dog') && cat.includes('bed')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Beds';
  if (cat.includes('dog') && cat.includes('toy')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Toys';
  if (cat.includes('dog') && cat.includes('collar')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Collars & Leads';
  if (cat.includes('dog') && cat.includes('leash')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Collars & Leads';
  if (cat.includes('dog') && cat.includes('food')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Food';
  if (cat.includes('dog') && cat.includes('treat')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Treats';
  if (cat.includes('dog') && cat.includes('bowl')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Bowls & Feeders';
  if (cat.includes('dog') && cat.includes('crate')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Crates & Kennels';
  if (cat.includes('dog') && cat.includes('groom')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Grooming Supplies';
  if (cat.includes('dog')) return 'Animals & Pet Supplies > Pet Supplies > Dog Supplies';
  
  // Cat categories
  if (cat.includes('cat') && cat.includes('tree')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture';
  if (cat.includes('cat') && cat.includes('tower')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture';
  if (cat.includes('cat') && cat.includes('bed')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Beds';
  if (cat.includes('cat') && cat.includes('toy')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Toys';
  if (cat.includes('cat') && cat.includes('litter')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Litter & Accessories';
  if (cat.includes('cat') && cat.includes('food')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Food';
  if (cat.includes('cat') && cat.includes('treat')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Treats';
  if (cat.includes('cat') && cat.includes('bowl')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Bowls & Feeders';
  if (cat.includes('cat') && cat.includes('scratch')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Scratching Posts';
  if (cat.includes('cat')) return 'Animals & Pet Supplies > Pet Supplies > Cat Supplies';
  
  // Bird categories
  if (cat.includes('bird') && cat.includes('cage')) return 'Animals & Pet Supplies > Pet Supplies > Bird Supplies > Bird Cages';
  if (cat.includes('bird') && cat.includes('toy')) return 'Animals & Pet Supplies > Pet Supplies > Bird Supplies > Bird Toys';
  if (cat.includes('bird') && cat.includes('food')) return 'Animals & Pet Supplies > Pet Supplies > Bird Supplies > Bird Food';
  if (cat.includes('bird')) return 'Animals & Pet Supplies > Pet Supplies > Bird Supplies';
  
  // Small pet categories
  if (cat.includes('hamster') || cat.includes('guinea') || cat.includes('rabbit') || cat.includes('small pet')) {
    if (cat.includes('cage')) return 'Animals & Pet Supplies > Pet Supplies > Small Animal Supplies > Small Animal Cages & Habitats';
    if (cat.includes('toy')) return 'Animals & Pet Supplies > Pet Supplies > Small Animal Supplies > Small Animal Toys';
    if (cat.includes('food')) return 'Animals & Pet Supplies > Pet Supplies > Small Animal Supplies > Small Animal Food';
    return 'Animals & Pet Supplies > Pet Supplies > Small Animal Supplies';
  }
  
  // Fish/Aquarium categories
  if (cat.includes('fish') || cat.includes('aqua')) {
    if (cat.includes('tank')) return 'Animals & Pet Supplies > Pet Supplies > Fish Supplies > Aquariums';
    if (cat.includes('food')) return 'Animals & Pet Supplies > Pet Supplies > Fish Supplies > Fish Food';
    return 'Animals & Pet Supplies > Pet Supplies > Fish Supplies';
  }
  
  // Generic accessories
  if (cat.includes('accessor')) return 'Animals & Pet Supplies > Pet Supplies';
  if (cat.includes('toy')) return 'Animals & Pet Supplies > Pet Supplies > Pet Toys';
  if (cat.includes('bowl') || cat.includes('feeder')) return 'Animals & Pet Supplies > Pet Supplies > Pet Bowls, Feeders & Waterers';
  if (cat.includes('bed')) return 'Animals & Pet Supplies > Pet Supplies > Pet Beds';
  if (cat.includes('carrier') || cat.includes('travel')) return 'Animals & Pet Supplies > Pet Supplies > Pet Carriers & Crates';
  if (cat.includes('groom')) return 'Animals & Pet Supplies > Pet Supplies > Pet Grooming Supplies';
  if (cat.includes('health') || cat.includes('wellness')) return 'Animals & Pet Supplies > Pet Supplies > Pet Health Care';
  if (cat.includes('food') || cat.includes('treat')) return 'Animals & Pet Supplies > Pet Supplies > Pet Food & Treats';
  
  return 'Animals & Pet Supplies > Pet Supplies';
}

// Generate product_type taxonomy path (Dogs / Cats / Accessories)
function getProductTypeTaxonomy(category: string | null): string {
  if (!category) return 'Pet Supplies';
  
  const cat = category.toLowerCase();
  
  // Build taxonomy path
  let taxonomy = 'Pet Supplies';
  
  // Pet type level
  if (cat.includes('dog')) {
    taxonomy += ' > Dogs';
  } else if (cat.includes('cat')) {
    taxonomy += ' > Cats';
  } else if (cat.includes('bird')) {
    taxonomy += ' > Birds';
  } else if (cat.includes('hamster') || cat.includes('guinea') || cat.includes('rabbit') || cat.includes('small pet')) {
    taxonomy += ' > Small Pets';
  } else if (cat.includes('fish') || cat.includes('aqua')) {
    taxonomy += ' > Fish';
  } else {
    taxonomy += ' > Accessories';
  }
  
  // Product type level
  if (cat.includes('bed')) taxonomy += ' > Beds';
  else if (cat.includes('toy')) taxonomy += ' > Toys';
  else if (cat.includes('collar') || cat.includes('leash')) taxonomy += ' > Collars & Leashes';
  else if (cat.includes('food')) taxonomy += ' > Food';
  else if (cat.includes('treat')) taxonomy += ' > Treats';
  else if (cat.includes('bowl') || cat.includes('feeder')) taxonomy += ' > Bowls & Feeders';
  else if (cat.includes('tree') || cat.includes('tower') || cat.includes('furniture')) taxonomy += ' > Furniture';
  else if (cat.includes('litter')) taxonomy += ' > Litter & Accessories';
  else if (cat.includes('cage') || cat.includes('crate')) taxonomy += ' > Cages & Crates';
  else if (cat.includes('groom')) taxonomy += ' > Grooming';
  else if (cat.includes('health') || cat.includes('wellness')) taxonomy += ' > Health & Wellness';
  else if (cat.includes('carrier') || cat.includes('travel')) taxonomy += ' > Travel';
  else if (cat.includes('scratch')) taxonomy += ' > Scratchers';
  
  return taxonomy;
}

// Determine shipping cost based on price (matches Merchant Center settings)
function getShippingPrice(productPrice: number): string {
  if (productPrice >= FREE_SHIPPING_THRESHOLD) {
    return '0.00 USD';
  }
  return `${FLAT_SHIPPING_RATE.toFixed(2)} USD`;
}

function generateProductXml(product: Product): string {
  const productUrl = product.slug 
    ? `${BASE_URL}/product/${product.slug}`
    : `${BASE_URL}/product/${product.id}`;
  
  const imageUrl = product.image_url || (product.images && product.images[0]) || '';
  
  // Use optimized title and description
  const optimizedTitle = generateOptimizedTitle(product);
  const optimizedDescription = generateOptimizedDescription(product);
  const googleCategory = getGoogleProductCategory(product.category);
  const productTypeTaxonomy = getProductTypeTaxonomy(product.category);
  const shippingPrice = getShippingPrice(product.price);
  
  let xml = `    <item>
      <g:id>${escapeXml(product.id)}</g:id>
      <g:title>${escapeXml(optimizedTitle)}</g:title>
      <g:description>${escapeXml(optimizedDescription)}</g:description>
      <g:link>${escapeXml(productUrl)}</g:link>
      <g:image_link>${escapeXml(imageUrl)}</g:image_link>
      <g:availability>${getAvailability(product.stock)}</g:availability>
      <g:price>${formatPrice(product.price)}</g:price>`;

  // Add sale price if compare_at_price exists and is higher than price
  if (product.compare_at_price && product.compare_at_price > product.price) {
    xml += `
      <g:sale_price>${formatPrice(product.price)}</g:sale_price>`;
  }

  xml += `
      <g:condition>new</g:condition>
      <g:brand>GetPawsy</g:brand>`;

  // Add SKU as MPN if available
  if (product.sku) {
    xml += `
      <g:mpn>${escapeXml(product.sku)}</g:mpn>`;
  } else {
    xml += `
      <g:identifier_exists>no</g:identifier_exists>`;
  }

  // Add product type taxonomy (custom for Performance Max)
  xml += `
      <g:product_type>${escapeXml(productTypeTaxonomy)}</g:product_type>`;

  // Add Google product category (official taxonomy)
  xml += `
      <g:google_product_category>${escapeXml(googleCategory)}</g:google_product_category>`;

  // Add additional images
  if (product.images && product.images.length > 1) {
    const additionalImages = product.images.slice(1, 11); // Max 10 additional images
    for (const img of additionalImages) {
      if (img && img !== product.image_url) {
        xml += `
      <g:additional_image_link>${escapeXml(img)}</g:additional_image_link>`;
      }
    }
  }

  // Add shipping info (matches Merchant Center: free over $35, $5.99 under)
  xml += `
      <g:shipping>
        <g:country>US</g:country>
        <g:service>Standard</g:service>
        <g:price>${shippingPrice}</g:price>
      </g:shipping>`;

  // Add shipping weight if available (in lb for US market)
  if (product.weight) {
    const weightInLb = (product.weight * 2.20462).toFixed(2);
    xml += `
      <g:shipping_weight>${weightInLb} lb</g:shipping_weight>`;
  }

  // Add custom labels for Performance Max segmentation
  const petType = getPetType(product.category);
  xml += `
      <g:custom_label_0>${escapeXml(petType)}</g:custom_label_0>`;
  
  // Price tier for bidding strategies
  if (product.price >= 50) {
    xml += `
      <g:custom_label_1>Premium</g:custom_label_1>`;
  } else if (product.price >= 25) {
    xml += `
      <g:custom_label_1>Mid-Range</g:custom_label_1>`;
  } else {
    xml += `
      <g:custom_label_1>Value</g:custom_label_1>`;
  }

  // Availability for inventory filtering
  xml += `
      <g:custom_label_2>${getAvailability(product.stock) === 'in stock' ? 'Available' : 'Out-of-Stock'}</g:custom_label_2>`;

  xml += `
    </item>`;

  return xml;
}

function generateFeed(products: Product[]): string {
  const now = new Date().toISOString();
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>GetPawsy - Premium Pet Products for Dogs, Cats &amp; Small Pets</title>
    <link>${BASE_URL}</link>
    <description>Shop premium pet products at GetPawsy. Quality dog beds, cat toys, pet accessories with free US shipping on orders over $35. Fast 3-7 day delivery, 30-day returns.</description>
    <lastBuildDate>${now}</lastBuildDate>
`;

  for (const product of products) {
    xml += generateProductXml(product) + '\n';
  }

  xml += `  </channel>
</rss>`;

  return xml;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all active products
    const { data: products, error } = await supabase
      .from('products')
      .select('id, name, description, price, compare_at_price, image_url, images, stock, category, sku, slug, shipping_time, weight, is_active')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching products:', error);
      throw new Error(`Failed to fetch products: ${error.message}`);
    }

    if (!products || products.length === 0) {
      console.log('No active products found');
    }

    console.log(`Generating optimized feed for ${products?.length || 0} products (Performance Max ready)`);

    const feed = generateFeed(products || []);

    return new Response(feed, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error: unknown) {
    console.error('Error generating merchant feed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});

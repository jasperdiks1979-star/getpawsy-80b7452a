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

function getCondition(): string {
  return 'new';
}

function getCategorySlug(category: string | null): string {
  if (!category) return 'pets';
  return category.toLowerCase().replace(/\s+/g, '-');
}

function generateProductXml(product: Product): string {
  const productUrl = product.slug 
    ? `${BASE_URL}/product/${product.slug}`
    : `${BASE_URL}/product/${product.id}`;
  
  const imageUrl = product.image_url || (product.images && product.images[0]) || '';
  const description = product.description 
    ? truncateText(stripHtml(product.description), 5000)
    : product.name;
  
  const categoryUrl = `${BASE_URL}/products?category=${getCategorySlug(product.category)}`;
  
  let xml = `    <item>
      <g:id>${escapeXml(product.id)}</g:id>
      <g:title>${escapeXml(truncateText(product.name, 150))}</g:title>
      <g:description>${escapeXml(description)}</g:description>
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
      <g:condition>${getCondition()}</g:condition>
      <g:brand>Pawsy</g:brand>`;

  // Add SKU as MPN if available
  if (product.sku) {
    xml += `
      <g:mpn>${escapeXml(product.sku)}</g:mpn>`;
  } else {
    xml += `
      <g:identifier_exists>no</g:identifier_exists>`;
  }

  // Add product type (category path)
  if (product.category) {
    xml += `
      <g:product_type>${escapeXml(product.category)}</g:product_type>`;
  }

  // Add Google product category for pet supplies
  xml += `
      <g:google_product_category>Animals &amp; Pet Supplies</g:google_product_category>`;

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

  // Add shipping info
  xml += `
      <g:shipping>
        <g:country>US</g:country>
        <g:service>Standard</g:service>
        <g:price>0.00 USD</g:price>
      </g:shipping>`;

  // Add shipping weight if available
  if (product.weight) {
    xml += `
      <g:shipping_weight>${product.weight} kg</g:shipping_weight>`;
  }

  xml += `
    </item>`;

  return xml;
}

function generateFeed(products: Product[]): string {
  const now = new Date().toISOString();
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Pawsy Pet Products</title>
    <link>${BASE_URL}</link>
    <description>Premium pet products for dogs, cats, and small animals. Quality supplies, toys, food, and accessories for your furry friends.</description>
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

    console.log(`Generating feed for ${products?.length || 0} products`);

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

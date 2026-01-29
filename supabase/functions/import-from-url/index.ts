import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProductData {
  name: string | null;
  price: number | null;
  sku: string | null;
  brand: string | null;
  category: string | null;
  description: string | null;
  images: string[];
  availability: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, addToShop, priceMultiplier } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate it's a PetDropshipper URL
    const urlObj = new URL(url);
    if (!urlObj.hostname.includes('petdropshipper')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Only PetDropshipper URLs are supported' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Scraping service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[IMPORT-URL] Scraping PetDropshipper URL:', url);

    // Scrape the product page with longer wait time for dynamic content
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
        onlyMainContent: false, // Get full page to find product details
        waitFor: 5000, // Wait longer for dynamic content to load
      }),
    });

    if (!scrapeResponse.ok) {
      const errorText = await scrapeResponse.text();
      console.error('[IMPORT-URL] Firecrawl scrape error:', errorText);
      return new Response(
        JSON.stringify({ success: false, error: `Failed to scrape page: ${scrapeResponse.status}` }),
        { status: scrapeResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const scrapeData = await scrapeResponse.json();
    const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';
    const html = scrapeData.data?.html || scrapeData.html || '';

    console.log('[IMPORT-URL] Scraped content length:', markdown.length);

    // Extract product data specifically for PetDropshipper format
    // Check if the page requires login (wholesale/B2B site)
    const requiresLogin = markdown.toLowerCase().includes('wholesale content only') ||
                         markdown.toLowerCase().includes('please login to show') ||
                         html.toLowerCase().includes('wholesale content only') ||
                         html.toLowerCase().includes('bss-fl-message');

    const productData = extractPetDropshipperProduct(markdown, html, url);

    if (requiresLogin) {
      console.log('[IMPORT-URL] Page requires login - returning partial data from URL');
      // For B2B/wholesale sites, we can still extract the name from the URL
      // and return partial data that can be completed manually
      return new Response(
        JSON.stringify({
          success: false,
          error: 'PetDropshipper verbergt productgegevens achter login. De productnaam is uit de URL gehaald. Voer het product handmatig toe met de prijs van je PetDropshipper account.',
          requiresLogin: true,
          partialData: {
            name: productData.name,
            sku: productData.sku,
            images: productData.images,
          },
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!productData.name || !productData.price) {
      console.error('[IMPORT-URL] Could not extract product data');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Could not extract product name or price from page',
          debug: { 
            foundName: productData.name,
            foundPrice: productData.price,
            markdownPreview: markdown.substring(0, 1000)
          }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[IMPORT-URL] Extracted product:', productData.name, 'Price:', productData.price);

    // Get auth token and create Supabase client
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Check if product already exists by SKU
    if (productData.sku) {
      const { data: existing } = await supabase
        .from('supplier_products')
        .select('id')
        .eq('sku', productData.sku)
        .eq('supplier', 'petdropshipper')
        .single();

      if (existing) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Product with SKU ${productData.sku} already exists in database`
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Insert into supplier_products
    const { data: supplierProduct, error: insertError } = await supabase
      .from('supplier_products')
      .insert({
        supplier: 'petdropshipper',
        supplier_product_id: productData.sku || `petdrop-${Date.now()}`,
        product_name: productData.name,
        description: productData.description,
        category: productData.category,
        brand: productData.brand,
        cost_price: productData.price,
        msrp: null,
        weight: null,
        image_url: productData.images[0] || null,
        sku: productData.sku,
        stock_status: productData.availability === 'In Stock' ? 'in_stock' : 'out_of_stock',
        shipping_time: '2-5 business days',
      })
      .select()
      .single();

    if (insertError) {
      console.error('[IMPORT-URL] Insert error:', insertError);
      return new Response(
        JSON.stringify({ success: false, error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let shopProduct = null;

    // Optionally add to shop
    if (addToShop && supplierProduct) {
      const multiplier = priceMultiplier || 2.5;
      const shopPrice = productData.price * multiplier;

      const { data: newShopProduct, error: shopError } = await supabase
        .from('products')
        .insert({
          name: productData.name,
          description: productData.description,
          price: parseFloat(shopPrice.toFixed(2)),
          cost_price: productData.price,
          image_url: productData.images[0] || null,
          images: productData.images,
          category: productData.category,
          sku: productData.sku,
          is_active: true,
          stock: 100,
          shipping_time: '2-5 business days',
          supplier_name: 'petdropshipper',
        })
        .select()
        .single();

      if (shopError) {
        console.error('[IMPORT-URL] Shop insert error:', shopError);
        // Don't fail completely, supplier product was already added
      } else {
        shopProduct = newShopProduct;

        // Create mapping
        if (newShopProduct) {
          await supabase.from('product_supplier_mappings').insert({
            product_id: newShopProduct.id,
            supplier_product_id: supplierProduct.id,
            is_active: true,
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: addToShop && shopProduct 
          ? `Product "${productData.name}" added to supplier database and shop`
          : `Product "${productData.name}" added to supplier database`,
        supplierProduct,
        shopProduct,
        extractedData: productData,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[IMPORT-URL] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function extractPetDropshipperProduct(markdown: string, html: string, url: string): ProductData {
  const data: ProductData = {
    name: null,
    price: null,
    sku: null,
    brand: null,
    category: null,
    description: null,
    images: [],
    availability: null,
  };

  // Blocklist for false positive product names (banners, notifications, etc.)
  const nameBlocklist = [
    'shipping delays',
    'weather',
    'continue shopping',
    'your order',
    'skip to content',
    'close navigation',
    'open navigation',
    'add to cart',
    'out of stock',
    'sold out',
    'sign in',
    'create account',
    'my account',
    'search',
    'menu',
    'cart',
    'checkout',
  ];

  // Extract from HTML meta tags first (most reliable)
  const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
                       html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (ogTitleMatch) {
    const title = ogTitleMatch[1].trim();
    if (!nameBlocklist.some(blocked => title.toLowerCase().includes(blocked))) {
      data.name = title;
    }
  }

  // Try to get product title from Shopify-specific patterns in HTML
  if (!data.name) {
    const productTitlePatterns = [
      /<h1[^>]*class=["'][^"']*product[^"']*title[^"']*["'][^>]*>([^<]+)<\/h1>/i,
      /<h1[^>]*class=["'][^"']*product-title[^"']*["'][^>]*>([^<]+)<\/h1>/i,
      /<h1[^>]*>([^<]{10,100})<\/h1>/i,
      /<title>([^<]+?)(?:\s*[-–|]\s*(?:PetDropshipper|Pet Dropshipper)[^<]*)?<\/title>/i,
    ];

    for (const pattern of productTitlePatterns) {
      const match = html.match(pattern);
      if (match) {
        const title = match[1].trim().replace(/&amp;/g, '&').replace(/&#39;/g, "'");
        if (title.length > 5 && title.length < 200 && 
            !nameBlocklist.some(blocked => title.toLowerCase().includes(blocked))) {
          data.name = title;
          break;
        }
      }
    }
  }

  // Extract from URL as fallback (product slug often contains the name)
  if (!data.name) {
    const urlMatch = url.match(/\/products\/([^?#]+)/);
    if (urlMatch) {
      const slug = urlMatch[1];
      // Convert slug to title case: "messy-mutts-dog-wastebag-holder-green" -> "Messy Mutts Dog Wastebag Holder Green"
      data.name = slug
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
  }

  // Extract SKU from HTML (Shopify pattern)
  const skuPatterns = [
    /SKU[:\s]*([A-Z0-9-]+)/i,
    /"sku"\s*:\s*"([^"]+)"/i,
    /data-sku=["']([^"']+)["']/i,
    /<span[^>]*class=["'][^"']*sku[^"']*["'][^>]*>([A-Z0-9-]+)<\/span>/i,
  ];

  for (const pattern of skuPatterns) {
    const match = html.match(pattern) || markdown.match(pattern);
    if (match) {
      data.sku = match[1].trim();
      break;
    }
  }

  // Extract price from HTML (Shopify patterns)
  const pricePatterns = [
    /"price"\s*:\s*(\d+(?:\.\d{2})?)/i,
    /data-product-price=["'](\d+(?:\.\d{2})?)["']/i,
    /<span[^>]*class=["'][^"']*price[^"']*["'][^>]*>\s*\$?(\d+(?:\.\d{2})?)/i,
    /\$(\d+(?:\.\d{2})?)\s*USD/i,
    /\$(\d+(?:\.\d{2})?)/,
    /"amount"\s*:\s*"?(\d+(?:\.\d{2})?)(?:00)?"?/i,
  ];

  for (const pattern of pricePatterns) {
    const match = html.match(pattern) || markdown.match(pattern);
    if (match) {
      // Shopify sometimes stores price in cents
      let price = parseFloat(match[1]);
      if (price > 1000 && !match[0].includes('$')) {
        price = price / 100; // Convert from cents
      }
      if (!isNaN(price) && price > 0 && price < 10000) {
        data.price = price;
        break;
      }
    }
  }

  // Extract brand from structured data or page content
  const brandPatterns = [
    /"brand"\s*:\s*(?:\{[^}]*"name"\s*:\s*)?["']([^"']+)["']/i,
    /Brand[:\s]*([A-Z][a-zA-Z\s&]+?)(?:\s*[|\/]|\s*<)/i,
    /<span[^>]*class=["'][^"']*vendor[^"']*["'][^>]*>([^<]+)<\/span>/i,
  ];

  for (const pattern of brandPatterns) {
    const match = html.match(pattern) || markdown.match(pattern);
    if (match) {
      const brand = match[1].trim();
      if (brand.length > 1 && brand.length < 50) {
        data.brand = brand;
        break;
      }
    }
  }

  // Extract category from breadcrumbs or structured data
  const categoryPatterns = [
    /<a[^>]*class=["'][^"']*breadcrumb[^"']*["'][^>]*>([^<]+)<\/a>/gi,
    /"category"\s*:\s*"([^"]+)"/i,
    /collection\/([^"'/?]+)/i,
  ];

  for (const pattern of categoryPatterns) {
    const match = html.match(pattern);
    if (match) {
      const category = (match[1] || match[0]).replace(/-/g, ' ').trim();
      if (category.length > 2 && category.length < 100) {
        data.category = category.charAt(0).toUpperCase() + category.slice(1);
        break;
      }
    }
  }

  // Extract images from Shopify-specific patterns
  const imagePatterns = [
    /data-src=["'](https:\/\/cdn\.shopify\.com\/[^"']+)["']/gi,
    /src=["'](https:\/\/cdn\.shopify\.com\/s\/files\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
    /"featured_image"\s*:\s*"(https:\/\/[^"]+)"/gi,
  ];

  const allImages: string[] = [];
  for (const pattern of imagePatterns) {
    const matches = html.matchAll(pattern);
    for (const match of matches) {
      const imgUrl = match[1].replace(/\\u002F/g, '/').replace(/\\/g, '');
      if (!imgUrl.includes('logo') && !imgUrl.includes('icon') && !imgUrl.includes('badge')) {
        allImages.push(imgUrl);
      }
    }
  }
  data.images = [...new Set(allImages)].slice(0, 5);

  // Check availability
  if (html.toLowerCase().includes('add to cart') && !html.toLowerCase().includes('out of stock')) {
    data.availability = 'In Stock';
  } else if (html.toLowerCase().includes('out of stock') || html.toLowerCase().includes('sold out')) {
    data.availability = 'Out of Stock';
  }

  // Extract description from meta or product description
  const descPatterns = [
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<div[^>]*class=["'][^"']*product[^"']*description[^"']*["'][^>]*>([^<]{50,500})/i,
  ];

  for (const pattern of descPatterns) {
    const match = html.match(pattern);
    if (match) {
      data.description = match[1].trim().replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/<[^>]+>/g, '');
      break;
    }
  }

  console.log('[IMPORT-URL] Extracted data:', JSON.stringify({
    name: data.name,
    price: data.price,
    sku: data.sku,
    brand: data.brand,
    imagesCount: data.images.length,
  }));

  return data;
}

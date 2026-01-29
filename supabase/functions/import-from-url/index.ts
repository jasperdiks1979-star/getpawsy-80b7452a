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

    // Scrape the product page
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        waitFor: 3000,
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
    const productData = extractPetDropshipperProduct(markdown, html, url);

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

  // Extract SKU - PetDropshipper shows "SKU: XXXXXXXX"
  const skuMatch = markdown.match(/SKU[:\s]+([A-Z0-9]+)/i) ||
                   html.match(/SKU[:\s]*<[^>]*>([A-Z0-9]+)/i);
  if (skuMatch) {
    data.sku = skuMatch[1].trim();
  }

  // Extract product name - usually the main heading after SKU
  // Look for the pattern: SKU line, then Brand / Category, then Product Name
  const lines = markdown.split('\n').filter(l => l.trim());
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for the product title - usually a heading or bold text with the product name
    // In PetDropshipper format: "Brand / Category" followed by product name
    if (line.startsWith('#') && !line.includes('SKU')) {
      const titleMatch = line.replace(/^#+\s*/, '').trim();
      if (titleMatch.length > 10 && titleMatch.length < 200 && !titleMatch.includes('$')) {
        data.name = titleMatch;
        break;
      }
    }
  }

  // Try alternative name extraction from bold text or specific patterns
  if (!data.name) {
    // Look for pattern like "**Product Name**" or just a clean product line
    const namePatterns = [
      /^##?\s*(.{10,100}?)\s*$/m,
      /\*\*(.{15,100}?)\*\*/,
      /(?:Holder|Toy|Bowl|Leash|Collar|Bed|Feeder|Treat|Food|Shampoo)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/i,
    ];

    for (const pattern of namePatterns) {
      const match = markdown.match(pattern);
      if (match && match[1] && !match[1].includes('$') && !match[1].toLowerCase().includes('sku')) {
        data.name = match[1].trim().replace(/\*\*/g, '');
        if (data.name.length > 10) break;
      }
    }
  }

  // Extract from HTML title or h1
  if (!data.name) {
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                    html.match(/<title>([^<]+)<\/title>/i);
    if (h1Match) {
      let title = h1Match[1].trim();
      // Clean up common suffixes
      title = title.replace(/\s*[-–|]\s*PetDropshipper.*$/i, '').trim();
      if (title.length > 5) {
        data.name = title;
      }
    }
  }

  // Extract price - look for USD format "$X.XX USD"
  const pricePatterns = [
    /\$(\d+(?:\.\d{2})?)\s*USD/i,
    /\$(\d+(?:\.\d{2})?)/,
    /(\d+(?:\.\d{2})?)\s*USD/i,
  ];

  for (const pattern of pricePatterns) {
    const match = markdown.match(pattern);
    if (match) {
      const price = parseFloat(match[1]);
      if (!isNaN(price) && price > 0 && price < 10000) {
        data.price = price;
        break;
      }
    }
  }

  // Extract brand - look for "Brand / Category" pattern  
  const brandMatch = markdown.match(/\[([A-Z][a-zA-Z\s]+)\]\s*\/\s*\[/);
  if (brandMatch) {
    data.brand = brandMatch[1].trim();
  } else {
    // Try simpler brand extraction
    const simpleBrandMatch = markdown.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*\//m);
    if (simpleBrandMatch) {
      data.brand = simpleBrandMatch[1].trim();
    }
  }

  // Extract category from URL or markdown
  const categoryMatch = markdown.match(/\/\s*\[([^\]]+)\]/);
  if (categoryMatch) {
    data.category = categoryMatch[1].trim();
  } else {
    // Extract from URL path
    const urlParts = url.split('/').filter(p => p.length > 2);
    if (urlParts.length > 1) {
      const categoryPart = urlParts.find(p => 
        p.toLowerCase().includes('dog') || 
        p.toLowerCase().includes('cat') || 
        p.toLowerCase().includes('pet')
      );
      if (categoryPart) {
        data.category = categoryPart.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      }
    }
  }

  // Extract images from markdown and HTML
  const mdImageMatches = [...markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)];
  const htmlImageMatches = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)];

  const allImages = [
    ...mdImageMatches.map(m => m[1]),
    ...htmlImageMatches.map(m => m[1]),
  ].filter(img => 
    img.startsWith('http') && 
    !img.includes('logo') && 
    !img.includes('icon') &&
    !img.includes('badge') &&
    (img.includes('cdn.shopify') || img.includes('product'))
  );

  data.images = [...new Set(allImages)].slice(0, 5);

  // Check availability
  if (markdown.toLowerCase().includes('in stock') || markdown.toLowerCase().includes('add to cart')) {
    data.availability = 'In Stock';
  } else if (markdown.toLowerCase().includes('out of stock') || markdown.toLowerCase().includes('sold out')) {
    data.availability = 'Out of Stock';
  }

  // Extract description - look for text after the price section
  const descMatch = markdown.match(/USD\s*\n\n(.{50,500}?)(?:\n\n|$)/s);
  if (descMatch) {
    data.description = descMatch[1].trim().replace(/\*\*/g, '');
  }

  return data;
}

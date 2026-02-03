import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GenerateRequest {
  contentType: 'new_products' | 'bestsellers' | 'tips' | 'mixed' | 'custom';
  customPrompt?: string;
  includeProducts?: boolean;
  maxProducts?: number;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("Generate newsletter content function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { contentType, customPrompt, includeProducts = true, maxProducts = 4 }: GenerateRequest = await req.json();
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    
    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Fetch relevant data based on content type
    let products: any[] = [];
    let blogPosts: any[] = [];
    
    if (includeProducts) {
      if (contentType === 'new_products') {
        // Get newest products
        const { data } = await supabase
          .from('products')
          .select('id, name, description, price, compare_at_price, image_url, slug')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(maxProducts);
        products = data || [];
      } else if (contentType === 'bestsellers') {
        // Get bestsellers
        const { data } = await supabase
          .from('bestsellers')
          .select(`
            id, rank, hero_headline,
            products:product_id (id, name, description, price, compare_at_price, image_url, slug)
          `)
          .eq('is_active', true)
          .order('rank', { ascending: true })
          .limit(maxProducts);
        products = (data || []).map(b => b.products).filter(Boolean);
      } else {
        // Mixed - get a variety
        const { data } = await supabase
          .from('products')
          .select('id, name, description, price, compare_at_price, image_url, slug')
          .eq('is_active', true)
          .order('updated_at', { ascending: false })
          .limit(maxProducts);
        products = data || [];
      }
    }
    
    if (contentType === 'tips' || contentType === 'mixed') {
      // Get recent blog posts for tips
      const { data } = await supabase
        .from('blog_posts')
        .select('id, title, excerpt, slug, category')
        .eq('is_published', true)
        .order('published_at', { ascending: false })
        .limit(3);
      blogPosts = data || [];
    }
    
    // Build AI prompt
    let systemPrompt = `You are an expert marketing copywriter for GetPawsy, an online pet supplies store. 
You write warm, friendly newsletters in English that resonate with pet parents.

Guidelines:
- Use a warm, personal tone
- Address the reader as "you"
- Add emojis where appropriate (don't overdo it)
- Focus on the benefits for the pet
- Keep it concise but informative
- No hard sales language, but include subtle call-to-actions
- All prices are in USD ($)`;

    let userPrompt = "";
    
    if (customPrompt) {
      userPrompt = customPrompt + "\n\nIMPORTANT: Write all content in English.";
    } else {
      switch (contentType) {
        case 'new_products':
          userPrompt = `Write a newsletter about our newest products. Focus on what's new and exciting.

Products to highlight:
${products.map(p => `- ${p.name}: ${p.description?.slice(0, 100) || 'No description'} ($${p.price})`).join('\n')}`;
          break;
          
        case 'bestsellers':
          userPrompt = `Write a newsletter about our bestsellers - products that other pet parents love.

Bestsellers:
${products.map(p => `- ${p.name}: ${p.description?.slice(0, 100) || 'No description'} ($${p.price})`).join('\n')}`;
          break;
          
        case 'tips':
          userPrompt = `Write a newsletter with helpful pet care tips. Make it educational and practical.

Recent blog posts to reference:
${blogPosts.map(b => `- ${b.title}: ${b.excerpt?.slice(0, 100) || ''}`).join('\n')}`;
          break;
          
        case 'mixed':
          userPrompt = `Write a varied newsletter with a mix of products and tips.

Products:
${products.map(p => `- ${p.name}: ${p.description?.slice(0, 100) || 'No description'} ($${p.price})`).join('\n')}

Tips/Blogs:
${blogPosts.map(b => `- ${b.title}: ${b.excerpt?.slice(0, 100) || ''}`).join('\n')}`;
          break;
      }
    }
    
    userPrompt += `

Generate the following parts (in JSON format):
{
  "subject": "Catchy subject line (max 60 characters)",
  "preheader": "Short preview text (max 100 characters)",
  "greeting": "Short greeting",
  "intro": "Introduction paragraph (2-3 sentences)",
  "mainContent": "Main content (can contain HTML with <h2>, <p>, <ul> tags)",
  "ctaText": "Call-to-action button text",
  "ctaUrl": "https://getpawsy.pet/shop",
  "closing": "Closing sentence"
}`;

    // Call Lovable AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Te veel verzoeken. Probeer het over een minuut opnieuw." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits zijn op. Voeg credits toe aan je workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errorText);
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const generatedContent = JSON.parse(aiData.choices[0].message.content);
    
    // Build HTML content
    const htmlContent = buildEmailHtml(generatedContent, products);
    
    return new Response(
      JSON.stringify({
        success: true,
        subject: generatedContent.subject,
        content: htmlContent,
        rawContent: generatedContent,
        products: products.map(p => ({ id: p.id, name: p.name, slug: p.slug })),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in generate-newsletter-content:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

function buildEmailHtml(content: any, products: any[]): string {
  const logoUrl = "https://getpawsy.pet/ads/google-ads-logo.png"; // Square paw icon
  const primaryColor = "#B45309"; // Terracotta
  const backgroundColor = "#FEFAF6"; // Cream
  const textColor = "#1f2937";
  
  let productHtml = "";
  
  if (products.length > 0) {
    productHtml = `
      <tr>
        <td style="padding: 30px 40px;">
          <h2 style="color: ${primaryColor}; font-size: 22px; margin: 0 0 20px 0; font-weight: 600;">Featured Products 🛒</h2>
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              ${products.map(product => {
                const discount = product.compare_at_price && product.compare_at_price > product.price
                  ? Math.round((1 - product.price / product.compare_at_price) * 100)
                  : 0;
                const imageUrl = product.image_url || "https://getpawsy.pet/placeholder.svg";
                
                return `
                  <td width="${100 / Math.min(products.length, 2)}%" style="padding: 10px; vertical-align: top;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                      <tr>
                        <td style="padding: 0;">
                          <a href="https://getpawsy.pet/product/${product.slug}" style="text-decoration: none;">
                            <img src="${imageUrl}" alt="${product.name}" width="100%" style="display: block; max-height: 180px; object-fit: cover; border-radius: 12px 12px 0 0;" />
                          </a>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 16px;">
                          <h3 style="margin: 0 0 8px 0; font-size: 16px; color: ${textColor}; font-weight: 600;">
                            <a href="https://getpawsy.pet/product/${product.slug}" style="color: ${textColor}; text-decoration: none;">${product.name}</a>
                          </h3>
                          <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: 700; color: ${primaryColor};">
                            ${discount > 0 
                              ? `<span style="text-decoration: line-through; color: #9ca3af; font-weight: 400; font-size: 14px;">$${product.compare_at_price}</span> $${product.price} <span style="background: #dc2626; color: white; padding: 2px 6px; border-radius: 4px; font-size: 12px;">-${discount}%</span>`
                              : `$${product.price}`
                            }
                          </p>
                          <a href="https://getpawsy.pet/product/${product.slug}" style="display: inline-block; background: ${primaryColor}; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">View Product</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                `;
              }).join('')}
            </tr>
          </table>
        </td>
      </tr>
    `;
  }
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${content.subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background-color: ${backgroundColor}; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          
          <!-- Header with Logo -->
          <tr>
            <td align="center" style="padding: 30px 40px; background: linear-gradient(135deg, ${primaryColor} 0%, #d97706 100%);">
              <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
                <tr>
                  <td style="vertical-align: middle; padding-right: 10px;">
                    <a href="https://getpawsy.pet" style="text-decoration: none;">
                      <img src="${logoUrl}" alt="GetPawsy Paw" width="44" height="44" style="display: block; width: 44px; height: 44px;" />
                    </a>
                  </td>
                  <td style="vertical-align: middle;">
                    <a href="https://getpawsy.pet" style="text-decoration: none; font-size: 28px; font-weight: 700; color: white; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Get<span style="color: #FED7AA;">Pawsy</span></a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Greeting & Intro -->
          <tr>
            <td style="padding: 40px 40px 20px 40px;">
              <h1 style="color: ${textColor}; font-size: 26px; margin: 0 0 16px 0; font-weight: 700;">${content.greeting}</h1>
              <p style="color: ${textColor}; font-size: 16px; line-height: 1.6; margin: 0;">${content.intro}</p>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 0 40px 30px 40px;">
              <div style="color: ${textColor}; font-size: 16px; line-height: 1.7;">${content.mainContent}</div>
            </td>
          </tr>
          
          <!-- Products Grid -->
          ${productHtml}
          
          <!-- CTA Button -->
          <tr>
            <td align="center" style="padding: 20px 40px 40px 40px;">
              <a href="${content.ctaUrl}" style="display: inline-block; background: ${primaryColor}; color: white; padding: 16px 40px; border-radius: 10px; text-decoration: none; font-size: 18px; font-weight: 600; box-shadow: 0 4px 12px rgba(180, 83, 9, 0.3);">${content.ctaText}</a>
            </td>
          </tr>
          
          <!-- Closing -->
          <tr>
            <td style="padding: 0 40px 40px 40px;">
              <p style="color: ${textColor}; font-size: 16px; line-height: 1.6; margin: 0; text-align: center;">${content.closing}</p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background: #1f2937; padding: 30px 40px; text-align: center;">
              <a href="https://getpawsy.pet" style="text-decoration: none;">
                <img src="${logoUrl}" alt="GetPawsy" width="120" style="display: inline-block; max-width: 120px; height: auto; margin-bottom: 16px; filter: brightness(0) invert(1);" />
              </a>
              <p style="color: #9ca3af; font-size: 14px; margin: 0 0 8px 0;">Premium Pet Supplies for Happy Pets 🐾</p>
              <p style="color: #6b7280; font-size: 12px; margin: 0;">
                <a href="https://getpawsy.pet" style="color: #9ca3af; text-decoration: none;">getpawsy.pet</a>
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
  
  return html;
}

serve(handler);

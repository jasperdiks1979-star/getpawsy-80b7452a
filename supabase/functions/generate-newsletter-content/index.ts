import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

// Version marker for deployment verification
const VERSION = "v2.4.0";

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
  console.log(`[${VERSION}] Generate newsletter content function called`);

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
- All prices are in USD ($)
- IMPORTANT: Do NOT include the brand name "GetPawsy", logos, or any branding in your content - the email template already has proper branding in the header
- Do NOT add any links with the brand name - all branding is handled by the template`;

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
        _version: VERSION,
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
  const primaryColor = "#B45309"; // Terracotta/Orange
  const backgroundColor = "#FEFAF6"; // Cream
  const textColor = "#1f2937";
  
  let productHtml = "";
  
  if (products.length > 0) {
    // Single column layout - one product per row, full width
    const productItems = products.map(product => {
      const imageUrl = product.image_url || "https://getpawsy.pet/placeholder.svg";
      const discount = product.compare_at_price && product.compare_at_price > product.price
        ? Math.round((1 - product.price / product.compare_at_price) * 100)
        : 0;
      
      return `
        <tr>
          <td style="padding: 0 0 24px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
              <tr>
                <td style="padding: 0;">
                  <a href="https://getpawsy.pet/product/${product.slug}" style="text-decoration: none; display: block;">
                    <img src="${imageUrl}" alt="${product.name}" width="536" style="display: block; width: 100%; height: auto; max-height: 300px; object-fit: cover; border-radius: 12px 12px 0 0;" />
                  </a>
                </td>
              </tr>
              <tr>
                <td style="padding: 20px;">
                  <h3 style="margin: 0 0 8px 0; font-size: 18px; color: ${textColor}; font-weight: 600; line-height: 1.4;">
                    <a href="https://getpawsy.pet/product/${product.slug}" style="color: ${textColor}; text-decoration: none;">${product.name}</a>
                  </h3>
                  <p style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: ${primaryColor};">
                    ${discount > 0 
                      ? `<span style="text-decoration: line-through; color: #9ca3af; font-weight: 400; font-size: 14px;">$${product.compare_at_price}</span> $${product.price} <span style="background: #dc2626; color: white; padding: 3px 8px; border-radius: 4px; font-size: 12px; margin-left: 8px;">-${discount}%</span>`
                      : `$${product.price}`
                    }
                  </p>
                  <a href="https://getpawsy.pet/product/${product.slug}" style="display: inline-block; background: ${primaryColor}; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">View Product</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `;
    }).join('');
    
    productHtml = `
      <tr>
        <td style="padding: 20px 32px;">
          <h2 style="color: ${primaryColor}; font-size: 22px; margin: 0 0 20px 0; font-weight: 700;">Featured Products 🛒</h2>
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            ${productItems}
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
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${content.subject}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background-color: ${backgroundColor}; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          
          <!-- Orange Header with centered logo -->
          <tr>
            <td align="center" style="padding: 32px 40px; background-color: ${primaryColor};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom: 12px;">
                    <img src="${logoUrl}" alt="GetPawsy" width="56" height="56" style="display: block; width: 56px; height: 56px; border: 0; border-radius: 12px;" />
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <span style="font-size: 28px; font-weight: 700; color: white; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">GetPawsy</span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 6px;">
                    <span style="font-size: 14px; color: rgba(255,255,255,0.9); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Premium Pet Products & Care</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Small logo + brand before greeting -->
          <tr>
            <td style="padding: 28px 32px 8px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" style="padding-right: 8px;">
                    <img src="${logoUrl}" alt="" width="24" height="24" style="display: block; width: 24px; height: 24px; border: 0; border-radius: 6px;" />
                  </td>
                  <td valign="middle">
                    <span style="font-size: 14px; font-weight: 600; color: ${primaryColor};">GetPawsy</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Greeting & Intro -->
          <tr>
            <td style="padding: 8px 32px 16px 32px;">
              <h1 style="color: ${textColor}; font-size: 26px; margin: 0 0 14px 0; font-weight: 700; line-height: 1.3;">${content.greeting}</h1>
              <p style="color: ${textColor}; font-size: 16px; line-height: 1.7; margin: 0;">${content.intro}</p>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <div style="color: ${textColor}; font-size: 16px; line-height: 1.7;">${content.mainContent}</div>
            </td>
          </tr>
          
          <!-- Products - Single Column -->
          ${productHtml}
          
          <!-- CTA Button -->
          <tr>
            <td align="center" style="padding: 16px 32px 32px 32px;">
              <a href="${content.ctaUrl}" style="display: inline-block; background: ${primaryColor}; color: white; padding: 16px 36px; border-radius: 10px; text-decoration: none; font-size: 16px; font-weight: 600; box-shadow: 0 4px 12px rgba(180, 83, 9, 0.3);">${content.ctaText}</a>
            </td>
          </tr>
          
          <!-- Closing -->
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <p style="color: ${textColor}; font-size: 15px; line-height: 1.6; margin: 0; text-align: center;">${content.closing}</p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background: #1f2937; padding: 28px 32px; text-align: center;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin-bottom: 14px;">
                <tr>
                  <td valign="middle" style="padding-right: 10px;">
                    <img src="${logoUrl}" alt="GetPawsy" width="36" height="36" style="display: block; width: 36px; height: 36px; border: 0; border-radius: 8px;" />
                  </td>
                  <td valign="middle">
                    <span style="font-size: 20px; font-weight: 700; color: white;">GetPawsy</span>
                  </td>
                </tr>
              </table>
              <p style="color: #9ca3af; font-size: 13px; margin: 0 0 8px 0;">Premium Pet Supplies for Happy Pets 🐾</p>
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

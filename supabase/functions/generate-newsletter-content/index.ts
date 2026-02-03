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
  const heroImageUrl = "https://getpawsy.pet/lovable-uploads/ce16f6c9-27a9-44e9-8f20-3b1c36fa1586.png"; // Dog hero image
  const primaryColor = "#B45309"; // Terracotta/Orange
  const backgroundColor = "#FEFAF6"; // Cream
  const textColor = "#1f2937";
  const darkFooterBg = "#1f2937";
  
  // Category images for "Featured This Week"
  const categoryImages = {
    food: "https://images.unsplash.com/photo-1589924691995-400dc9ecc119?w=200&h=200&fit=crop",
    toys: "https://images.unsplash.com/photo-1535591273668-578e31182c4f?w=200&h=200&fit=crop",
    beds: "https://images.unsplash.com/photo-1574158622682-e40e69881006?w=200&h=200&fit=crop"
  };
  
  // Build product cards - full width single column
  let productCardsHtml = "";
  if (products.length > 0) {
    const productCards = products.map(product => {
      const imageUrl = product.image_url || "https://getpawsy.pet/placeholder.svg";
      const discount = product.compare_at_price && product.compare_at_price > product.price
        ? Math.round((1 - product.price / product.compare_at_price) * 100)
        : 0;
      
      return `
        <tr>
          <td style="padding: 0 0 24px 0;">
            <!-- Product Image -->
            <a href="https://getpawsy.pet/product/${product.slug}" style="text-decoration: none; display: block;">
              <img src="${imageUrl}" alt="${product.name}" width="536" style="display: block; width: 100%; height: auto; border-radius: 0;" />
            </a>
            <!-- Product Info -->
            <h3 style="margin: 16px 0 12px 0; font-size: 18px; line-height: 1.4;">
              <a href="https://getpawsy.pet/product/${product.slug}" style="color: ${primaryColor}; text-decoration: none; font-weight: 600;">${product.name}</a>
            </h3>
            <p style="margin: 0 0 12px 0; font-size: 16px; color: ${textColor};">
              ${discount > 0 
                ? `<span style="text-decoration: line-through; color: #9ca3af;">$${product.compare_at_price}</span> <strong>$${product.price}</strong> <span style="color: ${textColor}; font-weight: 600;">-${discount}%</span>`
                : `<strong>$${product.price}</strong>`
              }
            </p>
            <a href="https://getpawsy.pet/product/${product.slug}" style="color: ${primaryColor}; text-decoration: none; font-size: 14px; font-weight: 600;">View Product</a>
          </td>
        </tr>
      `;
    }).join('');
    
    productCardsHtml = `
      <tr>
        <td style="padding: 24px 32px;">
          <h2 style="color: ${textColor}; font-size: 22px; margin: 0 0 20px 0; font-weight: 700;">Featured Products 🛒</h2>
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            ${productCards}
          </table>
          <p style="margin: 16px 0 0 0;">
            <a href="https://getpawsy.pet/shop" style="color: ${primaryColor}; text-decoration: none; font-size: 14px; font-weight: 600;">Explore the Collection</a>
          </p>
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
            <td align="center" style="padding: 24px 40px; background-color: ${primaryColor};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom: 8px;">
                    <img src="${logoUrl}" alt="GetPawsy" width="48" height="48" style="display: block; width: 48px; height: 48px; border: 0; border-radius: 10px;" />
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <span style="font-size: 26px; font-weight: 700; color: white; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">GetPawsy</span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 4px;">
                    <span style="font-size: 13px; color: rgba(255,255,255,0.9); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Premium Pet Products & Care</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Hero Image -->
          <tr>
            <td style="padding: 0;">
              <img src="${heroImageUrl}" alt="Happy pet" width="600" style="display: block; width: 100%; height: auto;" />
            </td>
          </tr>
          
          <!-- Subject line as hero text -->
          <tr>
            <td style="padding: 24px 32px 12px 32px;">
              <h1 style="color: ${textColor}; font-size: 22px; margin: 0; font-weight: 700; line-height: 1.3;">${content.subject} 🐾</h1>
            </td>
          </tr>
          
          <!-- Small logo + brand -->
          <tr>
            <td style="padding: 12px 32px 8px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" style="padding-right: 6px;">
                    <img src="${logoUrl}" alt="" width="20" height="20" style="display: block; width: 20px; height: 20px; border: 0; border-radius: 5px;" />
                  </td>
                  <td valign="middle">
                    <span style="font-size: 13px; font-weight: 600; color: ${primaryColor};">GetPawsy</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Greeting & Intro -->
          <tr>
            <td style="padding: 8px 32px 20px 32px;">
              <h2 style="color: ${textColor}; font-size: 24px; margin: 0 0 14px 0; font-weight: 700; line-height: 1.3;">${content.greeting}</h2>
              <p style="color: ${textColor}; font-size: 15px; line-height: 1.7; margin: 0;">${content.intro}</p>
            </td>
          </tr>
          
          <!-- Main Content (Product text mentions & tips) -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <div style="color: ${textColor}; font-size: 15px; line-height: 1.7;">${content.mainContent}</div>
            </td>
          </tr>
          
          <!-- Featured Products with images -->
          ${productCardsHtml}
          
          <!-- Closing -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <p style="color: ${textColor}; font-size: 15px; line-height: 1.6; margin: 0;">${content.closing}</p>
            </td>
          </tr>
          
          <!-- Signature with paw -->
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="top" style="padding-right: 0;">
                    <img src="${logoUrl}" alt="" width="28" height="28" style="display: block; width: 28px; height: 28px; border: 0; border-radius: 6px;" />
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 4px;">
                    <span style="font-size: 13px; color: ${primaryColor}; font-weight: 500;">Pawsy</span>
                  </td>
                </tr>
              </table>
              <p style="color: ${textColor}; font-size: 14px; margin: 16px 0 0 0;">Premium Pet Supplies for Happy Pets 🐾</p>
              <a href="https://getpawsy.pet" style="color: ${primaryColor}; font-size: 14px; text-decoration: none;">getpawsy.pet</a>
            </td>
          </tr>
          
          <!-- Featured This Week Section -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background: #FEF9E7; border-radius: 12px; padding: 20px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: ${primaryColor};">🏆 Featured This Week</p>
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td width="33%" align="center" style="padding: 0 8px;">
                          <a href="https://getpawsy.pet/category/dog-food-treats" style="text-decoration: none;">
                            <img src="${categoryImages.food}" alt="Premium Food" width="120" height="120" style="display: block; width: 120px; height: 120px; border-radius: 8px; object-fit: cover;" />
                            <p style="margin: 8px 0 0 0; font-size: 12px; color: ${primaryColor}; font-weight: 500;">Premium Food</p>
                          </a>
                        </td>
                        <td width="33%" align="center" style="padding: 0 8px;">
                          <a href="https://getpawsy.pet/category/dog-toys" style="text-decoration: none;">
                            <img src="${categoryImages.toys}" alt="Fun Toys" width="120" height="120" style="display: block; width: 120px; height: 120px; border-radius: 8px; object-fit: cover;" />
                            <p style="margin: 8px 0 0 0; font-size: 12px; color: ${primaryColor}; font-weight: 500;">Fun Toys</p>
                          </a>
                        </td>
                        <td width="33%" align="center" style="padding: 0 8px;">
                          <a href="https://getpawsy.pet/category/beds-furniture" style="text-decoration: none;">
                            <img src="${categoryImages.beds}" alt="Cozy Beds" width="120" height="120" style="display: block; width: 120px; height: 120px; border-radius: 8px; object-fit: cover;" />
                            <p style="margin: 8px 0 0 0; font-size: 12px; color: ${primaryColor}; font-weight: 500;">Cozy Beds</p>
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Main CTA Button -->
          <tr>
            <td align="center" style="padding: 0 32px 24px 32px;">
              <a href="${content.ctaUrl}" style="display: inline-block; background: ${primaryColor}; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 600;">🛒 Shop Now at GetPawsy</a>
            </td>
          </tr>
          
          <!-- Trust Badges -->
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background: #f9fafb; border-radius: 12px;">
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td width="25%" align="center" style="padding: 8px;">
                          <span style="font-size: 24px;">🚚</span>
                          <p style="margin: 4px 0 0 0; font-size: 11px; color: ${textColor}; font-weight: 500;">Free<br/>Shipping</p>
                        </td>
                        <td width="25%" align="center" style="padding: 8px;">
                          <span style="font-size: 24px;">⭐</span>
                          <p style="margin: 4px 0 0 0; font-size: 11px; color: ${textColor}; font-weight: 500;">5-Star<br/>Reviews</p>
                        </td>
                        <td width="25%" align="center" style="padding: 8px;">
                          <span style="font-size: 24px;">🔒</span>
                          <p style="margin: 4px 0 0 0; font-size: 11px; color: ${textColor}; font-weight: 500;">Secure<br/>Payment</p>
                        </td>
                        <td width="25%" align="center" style="padding: 8px;">
                          <span style="font-size: 24px;">💝</span>
                          <p style="margin: 4px 0 0 0; font-size: 11px; color: ${textColor}; font-weight: 500;">Pet<br/>Happiness</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Dark Footer -->
          <tr>
            <td style="background: ${darkFooterBg}; padding: 32px;">
              <!-- Logo + tagline -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin-bottom: 16px;">
                <tr>
                  <td valign="middle" style="padding-right: 8px;">
                    <img src="${logoUrl}" alt="GetPawsy" width="28" height="28" style="display: block; width: 28px; height: 28px; border: 0; border-radius: 6px;" />
                  </td>
                  <td valign="middle">
                    <span style="font-size: 18px; font-weight: 700; color: white;">GetPawsy</span>
                  </td>
                </tr>
              </table>
              <p style="color: #9ca3af; font-size: 13px; margin: 0 0 16px 0; text-align: center;">Making pets happy, one product at a time</p>
              
              <!-- Navigation links -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin-bottom: 20px;">
                <tr>
                  <td style="padding: 0 12px;">
                    <a href="https://getpawsy.pet/shop" style="color: ${primaryColor}; text-decoration: none; font-size: 13px; font-weight: 500;">Shop</a>
                  </td>
                  <td style="padding: 0 12px;">
                    <a href="https://getpawsy.pet/blog" style="color: ${primaryColor}; text-decoration: none; font-size: 13px; font-weight: 500;">Blog</a>
                  </td>
                  <td style="padding: 0 12px;">
                    <a href="https://getpawsy.pet/about" style="color: ${primaryColor}; text-decoration: none; font-size: 13px; font-weight: 500;">About</a>
                  </td>
                  <td style="padding: 0 12px;">
                    <a href="https://getpawsy.pet/contact" style="color: ${primaryColor}; text-decoration: none; font-size: 13px; font-weight: 500;">Contact</a>
                  </td>
                </tr>
              </table>
              
              <!-- Divider -->
              <table width="80%" cellpadding="0" cellspacing="0" role="presentation" align="center" style="margin-bottom: 20px;">
                <tr>
                  <td style="border-top: 1px solid #374151;"></td>
                </tr>
              </table>
              
              <!-- Subscription notice -->
              <p style="color: #6b7280; font-size: 11px; margin: 0 0 12px 0; text-align: center;">
                You're receiving this email because you subscribed to our newsletter at getpawsy.pet
              </p>
              
              <!-- Manage/Unsubscribe -->
              <p style="text-align: center; margin: 0 0 16px 0;">
                <a href="{{MANAGE_PREFERENCES_URL}}" style="color: #9ca3af; text-decoration: underline; font-size: 11px;">Manage Preferences</a>
                <span style="color: #6b7280; margin: 0 8px;">•</span>
                <a href="{{UNSUBSCRIBE_URL}}" style="color: #9ca3af; text-decoration: underline; font-size: 11px;">Unsubscribe</a>
              </p>
              
              <!-- Copyright -->
              <p style="color: #6b7280; font-size: 11px; margin: 0; text-align: center;">
                © 2026 GetPawsy. All rights reserved.<br/>
                The Netherlands 🇳🇱 | <a href="mailto:support@getpawsy.pet" style="color: ${primaryColor}; text-decoration: none;">support@getpawsy.pet</a>
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

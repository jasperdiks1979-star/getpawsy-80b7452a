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
  let html = `${content.greeting}\n\n${content.intro}\n\n${content.mainContent}`;
  
  // Add product grid if products exist
  if (products.length > 0) {
    html += `\n\n## Uitgelichte producten\n\n`;
    products.forEach(product => {
      const discount = product.compare_at_price && product.compare_at_price > product.price
        ? Math.round((1 - product.price / product.compare_at_price) * 100)
        : 0;
      
      html += `**${product.name}**\n`;
      if (discount > 0) {
        html += `~~€${product.compare_at_price}~~ **€${product.price}** (-${discount}%)\n`;
      } else {
        html += `€${product.price}\n`;
      }
      html += `[Bekijk product](https://getpawsy.pet/product/${product.slug})\n\n`;
    });
  }
  
  html += `\n\n${content.closing}`;
  
  return html;
}

serve(handler);

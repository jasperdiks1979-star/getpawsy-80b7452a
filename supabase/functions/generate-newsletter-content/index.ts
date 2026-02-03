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
    let systemPrompt = `Je bent een expert marketing copywriter voor GetPawsy, een webshop voor huisdierproducten. 
Je schrijft warme, vriendelijke nieuwsbrieven in het Nederlands die pet parents aanspreken.

Richtlijnen:
- Gebruik een warme, persoonlijke toon
- Spreek de lezer aan als "je" of "jij"
- Voeg emoji's toe waar passend (niet overdrijven)
- Focus op de voordelen voor het huisdier
- Houd het beknopt maar informatief
- Geen harde sales-taal, wel subtiele call-to-actions`;

    let userPrompt = "";
    
    if (customPrompt) {
      userPrompt = customPrompt;
    } else {
      switch (contentType) {
        case 'new_products':
          userPrompt = `Schrijf een nieuwsbrief over onze nieuwste producten. Focus op wat nieuw en spannend is.

Producten om te highlighten:
${products.map(p => `- ${p.name}: ${p.description?.slice(0, 100) || 'Geen beschrijving'} (€${p.price})`).join('\n')}`;
          break;
          
        case 'bestsellers':
          userPrompt = `Schrijf een nieuwsbrief over onze bestsellers - producten die andere pet parents geweldig vinden.

Bestsellers:
${products.map(p => `- ${p.name}: ${p.description?.slice(0, 100) || 'Geen beschrijving'} (€${p.price})`).join('\n')}`;
          break;
          
        case 'tips':
          userPrompt = `Schrijf een nieuwsbrief met nuttige verzorgingstips voor huisdieren. Maak het educatief en praktisch.

Recente blogartikelen om te refereren:
${blogPosts.map(b => `- ${b.title}: ${b.excerpt?.slice(0, 100) || ''}`).join('\n')}`;
          break;
          
        case 'mixed':
          userPrompt = `Schrijf een gevarieerde nieuwsbrief met een mix van producten en tips.

Producten:
${products.map(p => `- ${p.name}: ${p.description?.slice(0, 100) || 'Geen beschrijving'} (€${p.price})`).join('\n')}

Tips/Blogs:
${blogPosts.map(b => `- ${b.title}: ${b.excerpt?.slice(0, 100) || ''}`).join('\n')}`;
          break;
      }
    }
    
    userPrompt += `

Genereer de volgende onderdelen (in JSON formaat):
{
  "subject": "Pakkende onderwerpregel (max 60 karakters)",
  "preheader": "Korte preview tekst (max 100 karakters)",
  "greeting": "Korte begroeting",
  "intro": "Introductie paragraaf (2-3 zinnen)",
  "mainContent": "Hoofdinhoud (kan HTML bevatten met <h2>, <p>, <ul> tags)",
  "ctaText": "Call-to-action knop tekst",
  "ctaUrl": "https://getpawsy.pet/shop",
  "closing": "Afsluitende zin"
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

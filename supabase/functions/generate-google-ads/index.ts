import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user - require admin role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authSupabase.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      console.error('JWT verification failed:', claimsError);
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;
    console.log(`Authenticated user: ${userId}`);

    // Check if user is admin
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: roleData, error: roleError } = await adminSupabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError || !roleData) {
      console.error('Admin check failed:', roleError || 'User is not admin');
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Admin verified for user: ${userId}`);

    // Check rate limit (30 requests per hour)
    const { data: rateLimitData, error: rateLimitError } = await adminSupabase
      .rpc('check_rate_limit', {
        p_user_id: userId,
        p_function_name: 'generate-google-ads',
        p_max_requests: 30,
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
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { productName, productDescription, targetAudience, language = 'nl', variantCount = 1 } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`Generating ${variantCount} Google Ads variant(s) for product: ${productName}`);

    const systemPrompt = `You are an expert Google Ads copywriter. Generate compelling, high-converting Google Ads copy in ${language === 'nl' ? 'Dutch' : 'English'}.

You need to generate ${variantCount} unique ad variant(s). Each variant should have a different angle/approach.

For each ad variant, provide:
1. Headlines (max 30 characters each, provide 3 variations)
2. Descriptions (max 90 characters each, provide 2 variations)
3. Display path suggestions (2 path segments, max 15 chars each)
4. Keywords (5 relevant keywords)

Focus on different angles for each variant:
- Variant 1: Focus on benefits/value proposition
- Variant 2: Focus on urgency/scarcity (if applicable)
- Variant 3: Focus on social proof/trust (if applicable)

Return the response as valid JSON with this structure:
{
  "variants": [
    {
      "headlines": ["headline1", "headline2", "headline3"],
      "descriptions": ["description1", "description2"],
      "displayPaths": ["path1", "path2"],
      "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
      "angle": "Brief description of the angle used"
    }
  ]
}`;

    const userPrompt = `Generate ${variantCount} unique Google Ads variant(s) for:
Product: ${productName}
Description: ${productDescription || 'Not provided'}
Target Audience: ${targetAudience || 'General consumers'}

Create compelling ad copy with different angles for each variant.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error("No content in AI response");
    }

    console.log("Raw AI response:", content);

    // Parse the JSON from the response
    let adData;
    try {
      // Try to extract JSON from the response (might be wrapped in markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        adData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      // Return raw content if JSON parsing fails
      return new Response(JSON.stringify({ 
        error: "Failed to parse ad content",
        rawContent: content 
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle backward compatibility: if response has old format, wrap in variants array
    if (!adData.variants && adData.headlines) {
      adData = { variants: [adData] };
    }

    console.log("Successfully generated ads:", adData);

    return new Response(JSON.stringify(adData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in generate-google-ads:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

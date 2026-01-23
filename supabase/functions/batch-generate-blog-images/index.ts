import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BlogPost {
  id: string;
  title: string;
  category: string;
  excerpt: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user - require admin role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Admin verified for user: ${userId}`);

    // Check rate limit (10 requests per hour for batch image generation)
    const { data: rateLimitData, error: rateLimitError } = await adminSupabase
      .rpc('check_rate_limit', {
        p_user_id: userId,
        p_function_name: 'batch-generate-blog-images',
        p_max_requests: 10,
        p_window_minutes: 60
      });

    if (rateLimitError) {
      console.error('Rate limit check failed:', rateLimitError);
    } else if (rateLimitData && rateLimitData.length > 0 && !rateLimitData[0].allowed) {
      console.log(`Rate limit exceeded for user: ${userId}`);
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded',
          reset_at: rateLimitData[0].reset_at
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Parse request body for optional limit parameter
    let limit = 3; // Default to 3 images per batch to avoid timeout
    try {
      const body = await req.json();
      if (body.limit && typeof body.limit === 'number') {
        limit = Math.min(body.limit, 10); // Max 10 per batch
      }
    } catch {
      // No body or invalid JSON, use default limit
    }

    console.log(`Starting batch blog image generation (limit: ${limit})...`);

    // Get blog posts without featured images, limited to avoid timeout
    const { data: posts, error: fetchError } = await adminSupabase
      .from("blog_posts")
      .select("id, title, category, excerpt")
      .or("featured_image.is.null,featured_image.eq.")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (fetchError) {
      throw new Error(`Failed to fetch posts: ${fetchError.message}`);
    }

    // Count total remaining
    const { count: totalRemaining } = await adminSupabase
      .from("blog_posts")
      .select("id", { count: 'exact', head: true })
      .or("featured_image.is.null,featured_image.eq.");

    if (!posts || posts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No posts without images found", generated: 0, remaining: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${posts.length} posts (${totalRemaining} total without images)`);

    const results: { postId: string; title: string; success: boolean; imageUrl?: string; error?: string }[] = [];

    for (const post of posts as BlogPost[]) {
      console.log(`Generating image for: ${post.title}`);

      try {
        // Generate image using AI
        const categoryThemes: Record<string, string> = {
          Dogs: "happy dog, pet care, warm lighting, professional pet photography style",
          Cats: "cute cat, feline care, cozy atmosphere, professional pet photography style",
          Fish: "beautiful aquarium, tropical fish, underwater photography, vibrant colors",
          General: "various pets, pet supplies, warm home environment, lifestyle photography",
        };

        const theme = categoryThemes[post.category] || categoryThemes.General;
        
        const imagePrompt = `Create a professional, high-quality blog header image for a pet care article titled "${post.title}". 
Style: ${theme}. 
Context: ${post.excerpt?.substring(0, 150) || post.title}. 
Requirements: 16:9 aspect ratio, clean composition, vibrant but natural colors, no text overlays, suitable for a professional pet store blog. Ultra high resolution, sharp, realistic photography style.`;

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-image-preview",
            messages: [{ role: "user", content: imagePrompt }],
            modalities: ["image", "text"],
          }),
        });

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          console.error(`AI error for ${post.id}:`, aiResponse.status, errorText);
          
          if (aiResponse.status === 429) {
            results.push({ postId: post.id, title: post.title, success: false, error: "Rate limit - waiting" });
            // Wait 10 seconds before continuing
            await new Promise(resolve => setTimeout(resolve, 10000));
            continue;
          }
          
          results.push({ postId: post.id, title: post.title, success: false, error: `AI error: ${aiResponse.status}` });
          continue;
        }

        const aiData = await aiResponse.json();
        const imageData = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        
        if (!imageData) {
          results.push({ postId: post.id, title: post.title, success: false, error: "No image in response" });
          continue;
        }

        // Parse and upload image
        const base64Match = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!base64Match) {
          results.push({ postId: post.id, title: post.title, success: false, error: "Invalid image format" });
          continue;
        }

        const imageType = base64Match[1];
        const base64Content = base64Match[2];
        
        const binaryString = atob(base64Content);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const fileName = `blog-${post.id}-${Date.now()}.${imageType}`;

        const { error: uploadError } = await adminSupabase.storage
          .from("blog-images")
          .upload(fileName, bytes, {
            contentType: `image/${imageType}`,
            upsert: true,
          });

        if (uploadError) {
          results.push({ postId: post.id, title: post.title, success: false, error: uploadError.message });
          continue;
        }

        const { data: urlData } = adminSupabase.storage.from("blog-images").getPublicUrl(fileName);
        const publicUrl = urlData.publicUrl;

        const { error: updateError } = await adminSupabase
          .from("blog_posts")
          .update({ featured_image: publicUrl })
          .eq("id", post.id);

        if (updateError) {
          results.push({ postId: post.id, title: post.title, success: false, error: updateError.message });
          continue;
        }

        console.log(`Generated image for ${post.title}: ${publicUrl}`);
        results.push({ postId: post.id, title: post.title, success: true, imageUrl: publicUrl });

        // Add delay between requests to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 3000));

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        console.error(`Error generating image for ${post.id}:`, errorMessage);
        results.push({ postId: post.id, title: post.title, success: false, error: errorMessage });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const remaining = (totalRemaining || 0) - successCount;
    
    return new Response(
      JSON.stringify({
        success: true,
        message: `Generated ${successCount} of ${posts.length} images`,
        generated: successCount,
        processed: posts.length,
        remaining: remaining > 0 ? remaining : 0,
        results
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Batch generation error:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

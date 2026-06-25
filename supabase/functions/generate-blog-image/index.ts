import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-service-key",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth is mandatory. Accept either an internal service secret or a valid admin JWT.
    const SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    const internalOk = !!SECRET && req.headers.get("x-internal-secret") === SECRET;
    if (!internalOk) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      if (!token || token === Deno.env.get("SUPABASE_ANON_KEY")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!roleData) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { postId, title, category, excerpt } = await req.json();

    if (!postId || !title) {
      return new Response(JSON.stringify({ error: "postId and title are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate image prompt based on blog post content
    const categoryThemes: Record<string, string> = {
      Dogs: "happy dog, pet care, warm lighting, professional pet photography style",
      Cats: "cute cat, feline care, cozy atmosphere, professional pet photography style",
      Fish: "beautiful aquarium, tropical fish, underwater photography, vibrant colors",
      General: "various pets, pet supplies, warm home environment, lifestyle photography",
      // Legacy Dutch categories for backwards compatibility
      honden: "happy dog, pet care, warm lighting, professional pet photography style",
      katten: "cute cat, feline care, cozy atmosphere, professional pet photography style",
      vissen: "beautiful aquarium, tropical fish, underwater photography, vibrant colors",
      algemeen: "various pets, pet supplies, warm home environment, lifestyle photography",
    };

    const theme = categoryThemes[category] || categoryThemes.General;
    
    const imagePrompt = `Create a professional, high-quality blog header image for a pet care article titled "${title}". 
Style: ${theme}. 
Context: ${excerpt?.substring(0, 150) || title}. 
Requirements: 16:9 aspect ratio, clean composition, vibrant but natural colors, no text overlays, suitable for a professional pet store blog. Ultra high resolution, sharp, realistic photography style.`;

    console.log("Generating image with prompt:", imagePrompt);

    // Call Lovable AI image generation
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image-preview",
        messages: [
          {
            role: "user",
            content: imagePrompt,
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    console.log("AI response received");

    // Extract base64 image from response
    const imageData = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    if (!imageData) {
      console.error("No image in response:", JSON.stringify(aiData));
      throw new Error("No image generated");
    }

    // Parse base64 data
    const base64Match = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) {
      throw new Error("Invalid image data format");
    }

    const imageType = base64Match[1];
    const base64Content = base64Match[2];
    
    // Convert base64 to Uint8Array
    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Generate unique filename
    const timestamp = Date.now();
    const fileName = `blog-${postId}-${timestamp}.${imageType}`;

    // Upload to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("blog-images")
      .upload(fileName, bytes, {
        contentType: `image/${imageType}`,
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error(`Failed to upload image: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("blog-images")
      .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;

    // Update blog post with new image
    const { error: updateError } = await supabase
      .from("blog_posts")
      .update({ featured_image: publicUrl })
      .eq("id", postId);

    if (updateError) {
      console.error("Update error:", updateError);
      throw new Error(`Failed to update blog post: ${updateError.message}`);
    }

    console.log("Image generated and saved:", publicUrl);

    return new Response(
      JSON.stringify({ 
        success: true, 
        imageUrl: publicUrl,
        message: "Blog image generated successfully" 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error generating blog image:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});

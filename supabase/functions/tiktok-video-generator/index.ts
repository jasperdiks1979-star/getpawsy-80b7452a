import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const ALLOWED_ORIGINS = [
  "https://getpawsy.pet",
  "https://www.getpawsy.pet",
  "https://getpawsy.lovable.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, cache-control",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

/**
 * Generates promotional slideshow images for a TikTok post using AI.
 * Creates 3-5 eye-catching product frames with text overlays.
 * Stores them in the tiktok-media bucket and updates the post record.
 */
Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const postId = body.postId as string | undefined;
    const batchMode = body.batch === true;

    // In batch mode, process all draft posts without media
    let postsToProcess: any[] = [];

    if (batchMode) {
      const { data, error } = await sb
        .from("tiktok_post_queue")
        .select("*")
        .in("status", ["draft", "queued"])
        .or("media_urls.is.null,media_urls.eq.{}")
        .limit(10);
      if (error) throw error;
      postsToProcess = data || [];
    } else if (postId) {
      const { data, error } = await sb
        .from("tiktok_post_queue")
        .select("*")
        .eq("id", postId)
        .single();
      if (error) throw error;
      postsToProcess = [data];
    } else {
      throw new Error("Provide postId or batch:true");
    }

    if (postsToProcess.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: "No posts need media" }),
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    let processed = 0;
    let failed = 0;

    for (const post of postsToProcess) {
      try {
        // Fetch product image if available
        let productImageUrl = post.thumbnail_url;
        
        // If we have a product_id, get additional images
        let productImages: string[] = [];
        if (post.product_id) {
          const { data: product } = await sb
            .from("products")
            .select("image_url, additional_images, name, price, description")
            .eq("id", post.product_id)
            .single();
          
          if (product) {
            if (product.image_url) productImages.push(product.image_url);
            if (product.additional_images && Array.isArray(product.additional_images)) {
              productImages.push(...product.additional_images.slice(0, 4));
            }
            if (!productImageUrl) productImageUrl = product.image_url;
          }
        }

        // Generate 3 promotional slideshow frames using AI
        const slidePrompts = [
          `Create a TikTok-style promotional image (9:16 vertical, 1080x1920) for a pet product called "${post.product_name}". Style: bold modern, vibrant colors, large text saying "${post.product_name.slice(0, 30)}" at the top. Include a paw print icon and "GetPawsy.pet" watermark at bottom. Background: gradient with pet-themed pattern. Make it eye-catching and scroll-stopping. If a product photo is provided, feature it prominently.`,
          `Create a TikTok-style benefit slide (9:16 vertical, 1080x1920) for "${post.product_name}". Show 3 key benefits with checkmark icons in a clean modern layout. Text: "Why Pet Parents Love This ❤️". Include playful pet-themed decorations. Brand: "GetPawsy.pet" at bottom. Vibrant, energetic style.`,
          `Create a TikTok-style CTA slide (9:16 vertical, 1080x1920). Large text: "Shop Now at GetPawsy.pet 🐾". Include an arrow pointing down, paw prints, and a "Free US Shipping" badge. Modern vibrant design with urgency. Pet-themed background.`,
        ];

        const generatedUrls: string[] = [];

        for (let i = 0; i < slidePrompts.length; i++) {
          const prompt = slidePrompts[i];
          
          // Build messages with product image context if available
          const messages: any[] = [];
          
          if (productImageUrl && i === 0) {
            messages.push({
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: productImageUrl } },
              ],
            });
          } else {
            messages.push({ role: "user", content: prompt });
          }

          const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3.1-flash-image-preview",
              messages,
              modalities: ["image", "text"],
            }),
          });

          if (!aiResponse.ok) {
            console.error(`AI image generation failed for slide ${i}:`, aiResponse.status);
            // If AI image gen fails, use product images as fallback
            if (productImages[i]) {
              generatedUrls.push(productImages[i]);
            }
            continue;
          }

          const aiData = await aiResponse.json();
          const imageData = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

          if (imageData && imageData.startsWith("data:image")) {
            // Upload base64 image to storage
            const base64 = imageData.split(",")[1];
            const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
            const filePath = `${post.id}/slide-${i + 1}.png`;

            const { error: uploadError } = await sb.storage
              .from("tiktok-media")
              .upload(filePath, bytes, {
                contentType: "image/png",
                upsert: true,
              });

            if (uploadError) {
              console.error(`Upload failed for slide ${i}:`, uploadError);
              if (productImages[i]) generatedUrls.push(productImages[i]);
              continue;
            }

            const { data: urlData } = sb.storage.from("tiktok-media").getPublicUrl(filePath);
            generatedUrls.push(urlData.publicUrl);
          } else if (productImages[i]) {
            generatedUrls.push(productImages[i]);
          }
        }

        // Also include original product images in the media set
        const allMedia = [...generatedUrls];
        for (const img of productImages) {
          if (!allMedia.includes(img) && allMedia.length < 6) {
            allMedia.push(img);
          }
        }

        // Update the post with generated media
        const { error: updateError } = await sb
          .from("tiktok_post_queue")
          .update({
            media_urls: allMedia,
            thumbnail_url: allMedia[0] || post.thumbnail_url,
          })
          .eq("id", post.id);

        if (updateError) {
          console.error(`Update failed for post ${post.id}:`, updateError);
          failed++;
        } else {
          processed++;
        }
      } catch (postError) {
        console.error(`Failed to process post ${post.id}:`, postError);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed, failed, total: postsToProcess.length }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("tiktok-video-generator error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});

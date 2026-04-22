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
 * TikTok Publisher — publishes queued posts to TikTok via Content Posting API.
 * 
 * Prerequisites (to be configured after TikTok Business verification):
 * - TIKTOK_ACCESS_TOKEN: OAuth access token
 * - TIKTOK_OPEN_ID: TikTok user open ID
 * 
 * TikTok Content Posting API v2:
 * 1. POST /v2/post/publish/content/init/ — Initialize photo/video post
 * 2. Upload media to the provided upload URL
 * 3. POST /v2/post/publish/status/fetch/ — Check publish status
 * 
 * Supports: Photo posts (slideshow), Video posts
 */
Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Pull connected TikTok account tokens from DB (set via OAuth flow)
    const { data: tokenRow } = await sb
      .from("tiktok_oauth_tokens")
      .select("access_token, expires_at, open_id, display_name")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!tokenRow) {
      return new Response(
        JSON.stringify({
          ok: false,
          reason: "TIKTOK_NOT_CONNECTED",
          message: "No TikTok account connected. Click 'Connect TikTok Account' in the admin panel first.",
        }),
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      return new Response(
        JSON.stringify({
          ok: false,
          reason: "TIKTOK_TOKEN_EXPIRED",
          message: "TikTok access token expired. Please reconnect the account in the admin panel.",
        }),
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const TIKTOK_ACCESS_TOKEN = tokenRow.access_token;

    const body = await req.json().catch(() => ({}));
    const postId = body.postId as string | undefined;
    const publishAll = body.publishAll === true;

    let postsToPublish: any[] = [];

    if (publishAll) {
      const { data, error } = await sb
        .from("tiktok_post_queue")
        .select("*")
        .eq("status", "queued")
        .not("media_urls", "is", null)
        .order("scheduled_at", { ascending: true })
        .limit(5); // TikTok rate limits: max ~5 posts per session
      if (error) throw error;
      postsToPublish = data || [];
    } else if (postId) {
      const { data, error } = await sb
        .from("tiktok_post_queue")
        .select("*")
        .eq("id", postId)
        .eq("status", "queued")
        .single();
      if (error) throw error;
      postsToPublish = [data];
    }

    if (postsToPublish.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, published: 0, message: "No queued posts with media ready to publish" }),
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    let published = 0;
    let failed = 0;

    for (const post of postsToPublish) {
      try {
        const mediaUrls = post.media_urls || [];
        if (mediaUrls.length === 0) {
          throw new Error("No media URLs available");
        }

        // TikTok Content Posting API v2 — Photo Post
        // Reference: https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
        const tiktokResponse = await fetch(
          "https://open.tiktokapis.com/v2/post/publish/content/init/",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${TIKTOK_ACCESS_TOKEN}`,
              "Content-Type": "application/json; charset=UTF-8",
            },
            body: JSON.stringify({
              post_info: {
                title: post.caption.slice(0, 150), // TikTok title limit
                description: post.caption,
                disable_comment: false,
                privacy_level: "PUBLIC_TO_EVERYONE",
                auto_add_music: true,
              },
              source_info: {
                source: "PULL_FROM_URL",
                photo_cover_index: 0,
                photo_images: mediaUrls.map((url: string) => url),
              },
              post_mode: "DIRECT_POST",
              media_type: "PHOTO",
            }),
          },
        );

        const tiktokData = await tiktokResponse.json();

        if (tiktokData.error?.code !== "ok" && tiktokResponse.status !== 200) {
          throw new Error(
            tiktokData.error?.message || `TikTok API error: ${tiktokResponse.status}`,
          );
        }

        // Mark as posted
        await sb
          .from("tiktok_post_queue")
          .update({
            status: "posted",
            posted_at: new Date().toISOString(),
            tiktok_post_id: tiktokData.data?.publish_id || null,
          })
          .eq("id", post.id);

        published++;
      } catch (postError) {
        console.error(`Failed to publish post ${post.id}:`, postError);

        await sb
          .from("tiktok_post_queue")
          .update({
            status: "failed",
            error_message: postError instanceof Error ? postError.message : String(postError),
          })
          .eq("id", post.id);

        failed++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, published, failed, total: postsToPublish.length }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("tiktok-publisher error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 1x1 transparent GIF for tracking pixel
const TRACKING_PIXEL = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (c) => c.charCodeAt(0)
);

const handler = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const remarketingId = url.searchParams.get("r"); // remarketing_email id
  const eventType = url.searchParams.get("t") || "open"; // "open" or "click"
  const linkUrl = url.searchParams.get("url"); // Original link for click tracking

  // Always return something to not break email
  if (!remarketingId) {
    if (eventType === "open") {
      return new Response(TRACKING_PIXEL, {
        headers: {
          "Content-Type": "image/gif",
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      });
    }
    return new Response("Missing parameters", { status: 400 });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const now = new Date().toISOString();

    if (eventType === "open") {
      // Update opened_at if not already set (first open)
      const { data: existing } = await supabaseAdmin
        .from("remarketing_emails")
        .select("opened_at")
        .eq("id", remarketingId)
        .single();

      if (existing && !existing.opened_at) {
        await supabaseAdmin
          .from("remarketing_emails")
          .update({ opened_at: now })
          .eq("id", remarketingId);
        
        console.log(`Tracked open for remarketing email ${remarketingId}`);
      }

      return new Response(TRACKING_PIXEL, {
        headers: {
          "Content-Type": "image/gif",
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      });
    } 
    
    if (eventType === "click") {
      // Update clicked_at if not already set (first click)
      const { data: existing } = await supabaseAdmin
        .from("remarketing_emails")
        .select("clicked_at, opened_at")
        .eq("id", remarketingId)
        .single();

      if (existing) {
        const updates: { clicked_at?: string; opened_at?: string } = {};
        
        // If they clicked, they also opened (update both if needed)
        if (!existing.opened_at) {
          updates.opened_at = now;
        }
        if (!existing.clicked_at) {
          updates.clicked_at = now;
        }

        if (Object.keys(updates).length > 0) {
          await supabaseAdmin
            .from("remarketing_emails")
            .update(updates)
            .eq("id", remarketingId);
          
          console.log(`Tracked click for remarketing email ${remarketingId}`);
        }
      }

      // Redirect to the actual URL
      if (linkUrl) {
        const decodedUrl = decodeURIComponent(linkUrl);
        return new Response(null, {
          status: 302,
          headers: {
            Location: decodedUrl,
          },
        });
      }

      // Fallback to homepage if no URL
      return new Response(null, {
        status: 302,
        headers: {
          Location: "https://getpawsy.pet",
        },
      });
    }

    // Unknown event type - return pixel anyway
    return new Response(TRACKING_PIXEL, {
      headers: { "Content-Type": "image/gif" },
    });

  } catch (error) {
    console.error("Error tracking remarketing event:", error);

    // Still return pixel/redirect to not break user experience
    if (eventType === "click" && linkUrl) {
      return new Response(null, {
        status: 302,
        headers: { Location: decodeURIComponent(linkUrl) },
      });
    }

    return new Response(TRACKING_PIXEL, {
      headers: { "Content-Type": "image/gif" },
    });
  }
};

serve(handler);

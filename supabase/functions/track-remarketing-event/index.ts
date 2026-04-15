import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 1x1 transparent GIF for tracking pixel
const TRACKING_PIXEL = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (c) => c.charCodeAt(0)
);

// Allowed redirect domains
const ALLOWED_REDIRECT_DOMAINS = [
  "getpawsy.pet",
  "www.getpawsy.pet",
  "getpawsy.lovable.app",
];

function isAllowedRedirectUrl(rawUrl: string): boolean {
  try {
    const decoded = decodeURIComponent(rawUrl);
    const parsed = new URL(decoded);
    return ALLOWED_REDIRECT_DOMAINS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

function safeRedirectOrFallback(linkUrl: string | null): Response {
  if (linkUrl && isAllowedRedirectUrl(linkUrl)) {
    return new Response(null, {
      status: 302,
      headers: { Location: decodeURIComponent(linkUrl) },
    });
  }
  return new Response(null, {
    status: 302,
    headers: { Location: "https://getpawsy.pet" },
  });
}

const PIXEL_HEADERS = {
  "Content-Type": "image/gif",
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

const handler = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const remarketingId = url.searchParams.get("r");
  const eventType = url.searchParams.get("t") || "open";
  const linkUrl = url.searchParams.get("url");

  if (!remarketingId) {
    if (eventType === "open") {
      return new Response(TRACKING_PIXEL, { headers: PIXEL_HEADERS });
    }
    return new Response("Missing parameters", { status: 400 });
  }

  // Validate redirect URL early
  if (eventType === "click" && linkUrl && !isAllowedRedirectUrl(linkUrl)) {
    console.log(`Blocked disallowed redirect URL: ${linkUrl}`);
    return new Response(null, {
      status: 302,
      headers: { Location: "https://getpawsy.pet" },
    });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const now = new Date().toISOString();

    if (eventType === "open") {
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

      return new Response(TRACKING_PIXEL, { headers: PIXEL_HEADERS });
    }

    if (eventType === "click") {
      const { data: existing } = await supabaseAdmin
        .from("remarketing_emails")
        .select("clicked_at, opened_at")
        .eq("id", remarketingId)
        .single();

      if (existing) {
        const updates: { clicked_at?: string; opened_at?: string } = {};
        if (!existing.opened_at) updates.opened_at = now;
        if (!existing.clicked_at) updates.clicked_at = now;

        if (Object.keys(updates).length > 0) {
          await supabaseAdmin
            .from("remarketing_emails")
            .update(updates)
            .eq("id", remarketingId);
          console.log(`Tracked click for remarketing email ${remarketingId}`);
        }
      }

      return safeRedirectOrFallback(linkUrl);
    }

    return new Response(TRACKING_PIXEL, { headers: PIXEL_HEADERS });
  } catch (error) {
    console.error("Error tracking remarketing event:", error);
    if (eventType === "click") {
      return safeRedirectOrFallback(linkUrl);
    }
    return new Response(TRACKING_PIXEL, { headers: PIXEL_HEADERS });
  }
};

serve(handler);

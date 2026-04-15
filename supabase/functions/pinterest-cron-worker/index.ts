import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { resolvePinterestBoardId } from "../_shared/pinterest.ts";
import { PINTEREST_API_BASE } from "../_shared/pinterest-config.ts";

const MAX_RETRIES = 3;
const BATCH_SIZE = 5; // max pins per cron run
const MIN_DELAY_MS = 2000; // minimum 2s between posts
const MAX_DELAY_MS = 5000; // maximum 5s between posts
const MAX_PINS_PER_HOUR = 50; // Pinterest safe rate limit

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Human-like random delay between posts */
function randomDelay(): number {
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
}

/** Exponential backoff delay for retries */
function backoffDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 30000) + Math.floor(Math.random() * 1000);
}

/** Validate pin payload before sending to Pinterest */
function validatePinPayload(pin: any): string | null {
  if (!pin.pin_title || pin.pin_title.length < 3 || pin.pin_title.length > 100) {
    return `Invalid title length: ${pin.pin_title?.length || 0} (must be 3-100)`;
  }
  if (!pin.pin_description || pin.pin_description.length < 10) {
    return `Description too short: ${pin.pin_description?.length || 0}`;
  }
  if (!pin.destination_link || !pin.destination_link.startsWith("https://getpawsy.pet/")) {
    return `Invalid destination link: ${pin.destination_link}`;
  }
  if (!pin.pin_image_url || !pin.pin_image_url.startsWith("https://")) {
    return `Invalid image URL: ${pin.pin_image_url}`;
  }
  // Check for test/placeholder content
  const lowerTitle = pin.pin_title.toLowerCase();
  if (["test", "demo", "placeholder", "lorem", "example"].some(w => lowerTitle.includes(w))) {
    return `Title contains test/placeholder content: ${pin.pin_title}`;
  }
  return null;
}

/**
 * Refresh Pinterest OAuth token using the stored refresh_token.
 * Returns the new access_token or null on failure.
 */
async function refreshPinterestToken(
  sb: any,
  conn: any,
): Promise<string | null> {
  const clientId = Deno.env.get("PINTEREST_CLIENT_ID");
  const clientSecret = Deno.env.get("PINTEREST_CLIENT_SECRET");

  if (!conn.refresh_token || !clientId || !clientSecret) {
    console.warn("[token-refresh] Missing refresh_token or client credentials");
    return null;
  }

  try {
    const res = await fetch(`${PINTEREST_API_BASE}/v5/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: conn.refresh_token,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[token-refresh] Failed ${res.status}: ${errText}`);
      await sb.from("pinterest_post_logs").insert({
        action: "token_refresh",
        status: "failed",
        error_message: `${res.status}: ${errText}`,
      });
      return null;
    }

    const data = await res.json();
    const expiresAt = new Date(
      Date.now() + (data.expires_in || 3600) * 1000,
    ).toISOString();

    // Persist new tokens
    await sb
      .from("pinterest_connection")
      .update({
        access_token: data.access_token,
        refresh_token: data.refresh_token || conn.refresh_token,
        token_expires_at: expiresAt,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conn.id);

    await sb.from("pinterest_post_logs").insert({
      action: "token_refresh",
      status: "success",
      response_data: { expires_at: expiresAt },
    });

    console.log("[token-refresh] ✅ Token refreshed, expires:", expiresAt);
    return data.access_token;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[token-refresh] Exception:", msg);
    await sb.from("pinterest_post_logs").insert({
      action: "token_refresh",
      status: "failed",
      error_message: msg,
    });
    return null;
  }
}

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const results: Array<{
    pinId: string;
    status: string;
    error?: string;
    externalId?: string;
  }> = [];
  const boardIdCache = new Map<string, string>();

  try {
    // ── 1. Fetch due pins ──
    const { data: pins, error } = await sb
      .from("pinterest_pin_queue")
      .select("*")
      .eq("status", "queued")
      .lte("scheduled_at", new Date().toISOString())
      .lt("retries", MAX_RETRIES)
      .order("priority", { ascending: true })
      .order("scheduled_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) throw error;
    if (!pins || pins.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No pins due", results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 2. Resolve access token (with refresh if needed) ──
    const { data: conn } = await sb
      .from("pinterest_connection")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!conn || conn.status !== "connected" || !conn.access_token) {
      await sb.from("pinterest_post_logs").insert({
        action: "cron_tick",
        status: "skipped",
        error_message: "Pinterest not connected",
      });
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Pinterest not connected. Connect Pinterest first.",
          reauthRequired: true,
          results: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let accessToken = conn.access_token;

    // Check expiry — refresh if within 5 minutes of expiration
    if (conn && conn.token_expires_at) {
      const expiresAt = new Date(conn.token_expires_at).getTime();
      const bufferMs = 5 * 60 * 1000; // 5 min buffer
      if (Date.now() > expiresAt - bufferMs) {
        console.log("[cron] Token expired or expiring soon, refreshing…");
        const newToken = await refreshPinterestToken(sb, conn);
        if (newToken) {
          accessToken = newToken;
        } else {
          // Token refresh failed — log and bail
          await sb.from("pinterest_post_logs").insert({
            action: "cron_tick",
            status: "skipped",
            error_message:
              "Token expired and refresh failed — skipping this run",
          });
          return new Response(
            JSON.stringify({
              ok: false,
              error: "Token refresh failed",
              results: [],
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }
    }

    // ── 3. Check hourly rate limit ──
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { count: recentPostCount } = await sb
      .from("pinterest_pin_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "posted")
      .gte("posted_at", oneHourAgo);
    
    if ((recentPostCount || 0) >= MAX_PINS_PER_HOUR) {
      console.log(`[cron] Rate limit: ${recentPostCount} pins posted in last hour, skipping`);
      return new Response(
        JSON.stringify({ ok: true, message: "Hourly rate limit reached", results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 4. Publish each pin with human-like delay ──
    for (let i = 0; i < pins.length; i++) {
      const pin = pins[i];

      // Human-like random delay between posts (skip before first)
      if (i > 0) {
        await sleep(randomDelay());
      }

      // Validate payload before sending
      const validationError = validatePinPayload(pin);
      if (validationError) {
        console.warn(`[cron] Pin ${pin.id} failed validation: ${validationError}`);
        await sb.from("pinterest_pin_queue").update({
          status: "failed",
          error_message: `Validation: ${validationError}`,
        }).eq("id", pin.id);
        await sb.from("pinterest_post_logs").insert({
          pin_queue_id: pin.id,
          action: "publish",
          status: "failed",
          error_message: `Validation: ${validationError}`,
        });
        results.push({ pinId: pin.id, status: "failed", error: validationError });
        continue;
      }

      // Check for duplicate (same product + variant posted in last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { count: dupeCount } = await sb
        .from("pinterest_pin_queue")
        .select("*", { count: "exact", head: true })
        .eq("product_id", pin.product_id)
        .eq("pin_variant", pin.pin_variant)
        .eq("status", "posted")
        .gte("posted_at", sevenDaysAgo);
      
      if ((dupeCount || 0) > 0) {
        console.warn(`[cron] Pin ${pin.id} is a duplicate (same product+variant posted within 7 days), skipping`);
        await sb.from("pinterest_pin_queue").update({
          status: "failed",
          error_message: "Duplicate: same product+variant posted within 7 days",
        }).eq("id", pin.id);
        results.push({ pinId: pin.id, status: "failed", error: "Duplicate pin" });
        continue;
      }

      try {
        const boardRef = pin.board_name || "";
        const boardId = boardIdCache.has(boardRef)
          ? boardIdCache.get(boardRef)!
          : await resolvePinterestBoardId(accessToken, boardRef);

        if (!boardIdCache.has(boardRef)) {
          boardIdCache.set(boardRef, boardId);
        }

        const pinRes = await fetch(`${PINTEREST_API_BASE}/v5/pins`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: pin.pin_title,
            description: pin.pin_description,
            board_id: boardId,
            media_source: {
              source_type: "image_url",
              url: pin.pin_image_url,
            },
            link: pin.destination_link,
          }),
        });

        if (!pinRes.ok) {
          const errBody = await pinRes.text();

          // If 401, try one token refresh mid-batch
          if (pinRes.status === 401 && conn) {
            console.log("[cron] Got 401, attempting token refresh…");
            const newToken = await refreshPinterestToken(sb, conn);
            if (newToken) {
              accessToken = newToken;
              // Retry this pin once
              const retryRes = await fetch(
                `${PINTEREST_API_BASE}/v5/pins`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    title: pin.pin_title,
                    description: pin.pin_description,
                    board_id: boardId,
                    media_source: {
                      source_type: "image_url",
                      url: pin.pin_image_url,
                    },
                    link: pin.destination_link,
                  }),
                },
              );
              if (retryRes.ok) {
                const retryData = await retryRes.json();
                await markPosted(sb, pin, retryData.id);
                results.push({
                  pinId: pin.id,
                  status: "posted",
                  externalId: retryData.id,
                });
                console.log(
                  `✅ Pin ${pin.id} posted (after refresh) as ${retryData.id}`,
                );
                continue;
              }
              const retryErr = await retryRes.text();
              throw new Error(
                `Pinterest API ${retryRes.status} (after refresh): ${retryErr}`,
              );
            }
          }

          throw new Error(`Pinterest API ${pinRes.status}: ${errBody}`);
        }

        const pinData = await pinRes.json();
        await markPosted(sb, pin, pinData.id);
        results.push({
          pinId: pin.id,
          status: "posted",
          externalId: pinData.id,
        });
        console.log(`✅ Pin ${pin.id} posted as ${pinData.id}`);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "Unknown error";
        const newRetries = (pin.retries || 0) + 1;
        const newStatus = newRetries >= MAX_RETRIES ? "failed" : "queued";

        await sb
          .from("pinterest_pin_queue")
          .update({
            retries: newRetries,
            status: newStatus,
            error_message: errMsg,
          })
          .eq("id", pin.id);

        await sb.from("pinterest_post_logs").insert({
          pin_queue_id: pin.id,
          action: "publish",
          status: "failed",
          error_message: errMsg,
          response_data: {
            retries: newRetries,
            finalFail: newStatus === "failed",
          },
        });

        results.push({ pinId: pin.id, status: newStatus, error: errMsg });
        console.error(
          `❌ Pin ${pin.id} failed (retry ${newRetries}/${MAX_RETRIES}): ${errMsg}`,
        );
      }
    }

    // Update connection last publish time if any succeeded
    if (results.some((r) => r.status === "posted") && conn) {
      await sb
        .from("pinterest_connection")
        .update({ last_publish_at: new Date().toISOString(), last_error: null })
        .eq("id", conn.id);
    }

    return new Response(
      JSON.stringify({ ok: true, processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("pinterest-cron-worker error:", e);
    const errMsg = e instanceof Error ? e.message : "Unknown error";

    try {
      await sb
        .from("pinterest_post_logs")
        .insert({ action: "cron_tick", status: "error", error_message: errMsg });
    } catch {
      // Ignore logging failures so the function can still return a structured error.
    }

    return new Response(JSON.stringify({ ok: false, error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/** Helper: mark a pin as posted and update product status */
async function markPosted(sb: any, pin: any, externalId: string) {
  const now = new Date().toISOString();
  await sb
    .from("pinterest_pin_queue")
    .update({
      status: "posted",
      posted_at: now,
      pin_external_id: externalId,
      error_message: null,
    })
    .eq("id", pin.id);

  await sb
    .from("products")
    .update({ pinterest_last_posted_at: now, pinterest_status: "posted" })
    .eq("id", pin.product_id);

  await sb.from("pinterest_post_logs").insert({
    pin_queue_id: pin.id,
    action: "publish",
    status: "success",
    response_data: { external_id: externalId },
  });
}

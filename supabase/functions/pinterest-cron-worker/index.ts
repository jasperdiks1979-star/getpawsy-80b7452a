import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const MAX_RETRIES = 3;
const BATCH_SIZE = 3; // max pins per cron tick

Deno.serve(async (req) => {
  // Allow cron (no origin) and known origins
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const results: Array<{ pinId: string; status: string; error?: string; externalId?: string }> = [];

  try {
    // Fetch due pins
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
      return new Response(JSON.stringify({ ok: true, message: "No pins due", results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get Pinterest connection
    const { data: conn } = await sb
      .from("pinterest_connection")
      .select("*")
      .limit(1)
      .maybeSingle();

    // Also check env var fallback
    const accessToken = conn?.access_token || Deno.env.get("PINTEREST_ACCESS_TOKEN");

    if (!accessToken) {
      // Log and bail — no token available
      await sb.from("pinterest_post_logs").insert({
        action: "cron_tick",
        status: "skipped",
        error_message: "No Pinterest access token configured",
      });
      return new Response(JSON.stringify({ ok: false, error: "No Pinterest access token" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Publish each pin
    for (const pin of pins) {
      try {
        const pinRes = await fetch("https://api.pinterest.com/v5/pins", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: pin.pin_title,
            description: pin.pin_description,
            board_id: pin.board_name,
            media_source: {
              source_type: "image_url",
              url: pin.pin_image_url,
            },
            link: pin.destination_link,
          }),
        });

        if (!pinRes.ok) {
          const errBody = await pinRes.text();
          throw new Error(`Pinterest API ${pinRes.status}: ${errBody}`);
        }

        const pinData = await pinRes.json();

        // Mark as posted
        await sb.from("pinterest_pin_queue").update({
          status: "posted",
          posted_at: new Date().toISOString(),
          pin_external_id: pinData.id,
          error_message: null,
        }).eq("id", pin.id);

        // Update product
        await sb.from("products").update({
          pinterest_last_posted_at: new Date().toISOString(),
          pinterest_status: "posted",
        }).eq("id", pin.product_id);

        // Log success
        await sb.from("pinterest_post_logs").insert({
          pin_queue_id: pin.id,
          action: "publish",
          status: "success",
          response_data: { external_id: pinData.id },
        });

        results.push({ pinId: pin.id, status: "posted", externalId: pinData.id });
        console.log(`✅ Pin ${pin.id} posted as ${pinData.id}`);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "Unknown error";
        const newRetries = (pin.retries || 0) + 1;
        const newStatus = newRetries >= MAX_RETRIES ? "failed" : "queued";

        await sb.from("pinterest_pin_queue").update({
          retries: newRetries,
          status: newStatus,
          error_message: errMsg,
        }).eq("id", pin.id);

        // Log failure
        await sb.from("pinterest_post_logs").insert({
          pin_queue_id: pin.id,
          action: "publish",
          status: "failed",
          error_message: errMsg,
          response_data: { retries: newRetries, finalFail: newStatus === "failed" },
        });

        results.push({ pinId: pin.id, status: newStatus, error: errMsg });
        console.error(`❌ Pin ${pin.id} failed (retry ${newRetries}/${MAX_RETRIES}): ${errMsg}`);
      }
    }

    // Update connection last publish time if any succeeded
    if (results.some(r => r.status === "posted") && conn) {
      await sb.from("pinterest_connection").update({
        last_publish_at: new Date().toISOString(),
        last_error: null,
      }).eq("id", conn.id);
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("pinterest-cron-worker error:", e);
    const errMsg = e instanceof Error ? e.message : "Unknown error";

    await sb.from("pinterest_post_logs").insert({
      action: "cron_tick",
      status: "error",
      error_message: errMsg,
    }).catch(() => {});

    return new Response(JSON.stringify({ ok: false, error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

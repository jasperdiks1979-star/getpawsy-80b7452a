import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const ALLOWED_ORIGINS = [
  "https://getpawsy.pet",
  "https://www.getpawsy.pet",
  "https://getpawsy.lovable.app",
  "https://hooks.zapier.com",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, cache-control",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  };
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // GET = fetch next queued pin; POST with { count } = fetch multiple
    let count = 1;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      count = Math.min(body.count || 1, 15);
    }

    // Fetch next queued pins (oldest first, high priority first)
    const priorityOrder = { high: 1, medium: 2, low: 3 };
    const { data: pins, error } = await sb
      .from("pinterest_pin_queue")
      .select("*")
      .eq("status", "queued")
      .lte("scheduled_at", new Date().toISOString())
      .order("priority", { ascending: true })
      .order("scheduled_at", { ascending: true })
      .limit(count);

    if (error) throw error;
    if (!pins || pins.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No pins queued", pins: [] }),
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // Mark as posted
    const ids = pins.map((p) => p.id);
    await sb
      .from("pinterest_pin_queue")
      .update({ status: "posted", posted_at: new Date().toISOString() })
      .in("id", ids);

    // Format for Zapier
    const output = pins.map((p) => ({
      pin_title: p.pin_title,
      pin_description: p.pin_description,
      pin_image_url: p.pin_image_url || "",
      destination_link: p.destination_link,
      board: p.board_name,
      hashtags: (p.hashtags || []).join(" "),
      variant: p.pin_variant,
      priority: p.priority,
    }));

    return new Response(
      JSON.stringify({ ok: true, pins: output, count: output.length }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("pinterest-zap error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});

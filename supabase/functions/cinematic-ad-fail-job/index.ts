import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);
  try {
    if (req.method !== "POST") return json({ ok: false, traceId, message: "POST required" }, 405);
    if (!SUPABASE_URL) return json({ ok: false, traceId, message: "backend URL missing" }, 500);

    const body = await req.json().catch(() => ({}));
    console.log(`[fail-job] ${traceId} forwarding`, {
      job_id: body.job_id ?? null,
      has_error: Boolean(body.error_message),
    });

    const res = await fetch(`${SUPABASE_URL}/functions/v1/cinematic-ad-render-webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-render-secret": req.headers.get("x-render-secret") ?? "",
      },
      body: JSON.stringify({ ...body, status: "failed" }),
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": res.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (e) {
    return json({ ok: false, traceId, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});

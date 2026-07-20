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
    const forwarded = {
      ...body,
      action: body.action ?? "trigger_github_workflow",
      claim_next: body.claim_next ?? !body.job_id,
    };
    console.log(`[cinematic-ad-dispatch] ${traceId} forwarding`, {
      action: forwarded.action,
      has_job_id: Boolean(forwarded.job_id),
      claim_next: Boolean(forwarded.claim_next),
    });

    const res = await fetch(`${SUPABASE_URL}/functions/v1/cinematic-ad-worker-control`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": req.headers.get("Authorization") ?? "",
      },
      body: JSON.stringify(forwarded),
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

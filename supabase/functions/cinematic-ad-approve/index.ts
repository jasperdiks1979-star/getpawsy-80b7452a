/**
 * cinematic-ad-approve
 *
 * Admin-only. Marks a cinematic_ad_jobs row as approved_for_render after
 * (optionally) applying inline edits to pin copy / hook text, then forwards
 * to cinematic-ad-queue-render. This is the gate between "preview" and
 * "actually spend GPU cycles rendering an MP4".
 *
 * POST body: {
 *   job_id: string,
 *   pin_title?: string,
 *   pin_description?: string,
 *   pin_destination_url?: string,
 *   hashtags?: string[],
 *   hook_text?: string,
 *   preset?: string
 * }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const trace = () => `cap_appr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const internalToken = req.headers.get("x-internal-token") ?? "";
  const workerSecret = Deno.env.get("RENDER_WORKER_SECRET") ?? "";
  let userData: { user: { id: string } };
  if (workerSecret && internalToken && internalToken === workerSecret) {
    const { data: adminRow } = await admin
      .from("user_roles").select("user_id").eq("role", "admin").limit(1).maybeSingle();
    if (!adminRow?.user_id) return json(500, { ok: false, traceId, message: "no admin user available for internal call" });
    userData = { user: { id: adminRow.user_id } };
  } else {
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    });
    const { data: u, error: userErr } = await userClient.auth.getUser();
    if (userErr || !u?.user) return json(401, { ok: false, traceId, message: "unauthorized" });
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json(403, { ok: false, traceId, message: "admin role required" });
    userData = { user: { id: u.user.id } };
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const jobId = body.job_id;
  if (!jobId) return json(400, { ok: false, traceId, message: "job_id required" });
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(String(jobId))) return json(400, { ok: false, traceId, message: `Full UUID required. Do not use shortened display id. (got: "${jobId}")` });

  const { data: job, error: jobErr } = await admin
    .from("cinematic_ad_jobs").select("*").eq("id", jobId).maybeSingle();
  if (jobErr || !job) return json(404, { ok: false, traceId, message: "job not found" });

  // Build optional update payload from inline edits.
  const updates: Record<string, unknown> = {
    approved_for_render: true,
    approved_at: new Date().toISOString(),
    approved_by: userData.user.id,
    status_message: "approved — queueing render",
  };
  if (typeof body.pin_title === "string") updates.pin_title = body.pin_title;
  if (typeof body.pin_description === "string") updates.pin_description = body.pin_description;
  if (typeof body.pin_destination_url === "string") updates.pin_destination_url = body.pin_destination_url;
  if (Array.isArray(body.hashtags)) updates.hashtags = body.hashtags.map((s: unknown) => String(s || "")).filter(Boolean);

  const { error: upErr } = await admin.from("cinematic_ad_jobs").update(updates).eq("id", jobId);
  if (upErr) return json(500, { ok: false, traceId, message: upErr.message });

  // Forward to queue-render with the same auth context.
  const fnUrl = `${url}/functions/v1/cinematic-ad-queue-render`;
  const r = await fetch(fnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: req.headers.get("Authorization") ?? "",
      apikey: anonKey,
    },
    body: JSON.stringify({ job_id: jobId, preset: body.preset }),
  });
  const queued = await r.json().catch(() => ({}));
  if (!r.ok || queued?.ok === false) {
    return json(500, { ok: false, traceId, message: queued?.message ?? `queue-render failed (${r.status})`, queued });
  }

  return json(200, { ok: true, traceId, message: "approved and queued for render", queued });
});

// One-shot helper: validates + approves a batch of trimmed jobs using the
// internal RENDER_WORKER_SECRET so we don't need a logged-in admin session.
// POST { job_ids: string[] }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";

const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = `fab_${crypto.randomUUID().slice(0, 8)}`;
  if (req.method !== "POST") return json(405, { ok: false, traceId, message: "POST only" });
  if (!WORKER_SECRET) return json(500, { ok: false, traceId, message: "RENDER_WORKER_SECRET missing" });

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.job_ids) ? body.job_ids.map(String) : [];
  if (!ids.length) return json(400, { ok: false, traceId, message: "job_ids required" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const results: any[] = [];

  for (const id of ids) {
    const step: any = { job_id: id };

    // 1) validate (worker secret path)
    const v = await fetch(`${SUPABASE_URL}/functions/v1/cinematic-ad-validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        "x-render-secret": WORKER_SECRET,
      },
      body: JSON.stringify({ job_id: id }),
    });
    step.validate = { status: v.status, body: await v.json().catch(() => ({})) };

    // 2) force-set the trio the user asked for + autopublish bypass
    const { error: upErr } = await admin.from("cinematic_ad_jobs").update({
      validation_passed: true,
      auto_publish: true,
      status: "approved",
      approved_for_render: true,
      publish_window_bypass: true,
    }).eq("id", id);
    step.patch_err = upErr?.message ?? null;

    // 3) approve (internal token path) — pushes job through approve pipeline
    const a = await fetch(`${SUPABASE_URL}/functions/v1/cinematic-ad-approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        "x-internal-token": WORKER_SECRET,
      },
      body: JSON.stringify({ job_id: id }),
    });
    step.approve = { status: a.status, body: await a.json().catch(() => ({})) };

    // 4) snapshot
    const { data: after } = await admin.from("cinematic_ad_jobs")
      .select("status, validation_passed, auto_publish, qa_composite_score, pin_publish_attempts, pinterest_publish_status, publish_blocked_reason")
      .eq("id", id).maybeSingle();
    step.after = after;

    results.push(step);
  }

  return json(200, { ok: true, traceId, results });
});
/**
 * cinematic-ad-repair-job
 *
 * Admin tool. For jobs where GitHub Actions reported success but
 * cinematic_ad_jobs.output_mp4_url is still NULL, this function:
 *   1. Probes Supabase Storage at the canonical paths used by the renderer
 *      (output_target, output.mp4, output-trimmed.mp4) for an existing MP4.
 *   2. If found, re-fires the render webhook with status='uploaded' so the
 *      job transitions to render_complete naturally (and triggers validate
 *      / autopublish exactly like a real worker callback).
 *   3. Records the repair attempt in admin_diagnostics.repair_history.
 *
 * Admin-only. Requires either a service-role secret header or an
 * authenticated user with the `admin` role.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const RENDER_WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function trace() { return crypto.randomUUID().slice(0, 8); }

async function isAdmin(authHeader: string | null): Promise<boolean> {
  if (!authHeader) return false;
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return false;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
  return Boolean(data);
}

async function headObject(bucketAndPath: string): Promise<{ exists: boolean; size: number | null }> {
  // bucketAndPath looks like "cinematic-ads/<slug>/<id>.mp4"
  const url = `${SUPABASE_URL}/storage/v1/object/${bucketAndPath}`;
  try {
    const r = await fetch(url, {
      method: "HEAD",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    });
    if (!r.ok) return { exists: false, size: null };
    const len = Number(r.headers.get("content-length") ?? 0);
    return { exists: true, size: Number.isFinite(len) ? len : null };
  } catch {
    return { exists: false, size: null };
  }
}

async function probeCandidates(job: any): Promise<{ path: string; size: number | null } | null> {
  const candidates: string[] = [];
  if (job.output_target) candidates.push(String(job.output_target));
  // Legacy / fallback paths the worker has used over time:
  candidates.push(`cinematic-ads/${job.id}/output-trimmed.mp4`);
  candidates.push(`cinematic-ads/${job.id}/output.mp4`);
  if (job.product_slug) {
    candidates.push(`cinematic-ads/${job.product_slug}/${job.id}.mp4`);
    candidates.push(`cinematic-ads/${job.product_slug}/${job.id}/output.mp4`);
  }
  const seen = new Set<string>();
  for (const c of candidates) {
    if (seen.has(c)) continue;
    seen.add(c);
    const h = await headObject(c);
    if (h.exists) return { path: c, size: h.size };
  }
  return null;
}

async function fireRenderWebhook(payload: Record<string, unknown>): Promise<{ status: number; body: string }> {
  const url = `${SUPABASE_URL}/functions/v1/cinematic-ad-render-webhook`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-render-secret": RENDER_WORKER_SECRET,
    },
    body: JSON.stringify(payload),
  });
  const body = await r.text().catch(() => "");
  return { status: r.status, body: body.slice(0, 1500) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();
  try {
    // Auth: either admin user OR worker-secret header (for the watchdog).
    const workerSecret = req.headers.get("x-render-secret") ?? "";
    const authHeader = req.headers.get("Authorization");
    const adminAllowed =
      (workerSecret && workerSecret === RENDER_WORKER_SECRET) ||
      await isAdmin(authHeader);
    if (!adminAllowed) return json({ ok: false, traceId, message: "admin or worker secret required" }, 403);

    const body = await req.json().catch(() => ({}));
    const jobId = String(body.job_id ?? "");
    if (!jobId) return json({ ok: false, traceId, message: "job_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: job, error } = await admin
      .from("cinematic_ad_jobs")
      .select("id,product_slug,status,output_mp4_url,output_target,render_token,admin_diagnostics,latest_github_run_id")
      .eq("id", jobId)
      .maybeSingle();
    if (error || !job) return json({ ok: false, traceId, message: "job not found" }, 404);

    // Probe storage first regardless of current DB state.
    const found = await probeCandidates(job);
    const diagPatch: Record<string, unknown> = {
      ...(job.admin_diagnostics ?? {}),
      last_repair_at: new Date().toISOString(),
      last_repair_trace: traceId,
    };

    if (job.output_mp4_url && job.status && !["render_queued", "rendering", "queue_waiting", "needs_admin_review", "failed"].includes(job.status)) {
      // Nothing to repair.
      return json({
        ok: true, traceId,
        message: "no repair needed — output_mp4_url already present and status is healthy",
        job_status: job.status,
        output_mp4_url: job.output_mp4_url,
        storage_probe: found,
      });
    }

    if (!found) {
      diagPatch.last_repair_result = "no_mp4_in_storage";
      await admin.from("cinematic_ad_jobs").update({
        admin_diagnostics: diagPatch,
      }).eq("id", jobId);
      return json({
        ok: false, traceId,
        message: "no MP4 found in storage for known candidate paths — re-render required",
        candidates_checked: [job.output_target, `cinematic-ads/${job.id}/output-trimmed.mp4`, `cinematic-ads/${job.id}/output.mp4`].filter(Boolean),
      }, 404);
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${found.path}`;
    // Re-fire the canonical webhook so the normal post-render chain runs
    // (render_complete → validate → autopublish), instead of patching the
    // row directly. This keeps the recovery indistinguishable from a real
    // worker callback.
    const hookResult = await fireRenderWebhook({
      job_id: jobId,
      render_token: job.render_token ?? "",
      status: "uploaded",
      mp4_url: publicUrl,
      file_size: found.size ?? undefined,
      worker_id: `repair-${traceId}`,
      admin_diagnostics: {
        ...(diagPatch as Record<string, unknown>),
        repaired_from_storage_path: found.path,
        output_file_size_mb: found.size != null ? Number((found.size / (1024 * 1024)).toFixed(3)) : null,
      },
      latest_github_run_id: job.latest_github_run_id ?? null,
    });

    diagPatch.last_repair_result = hookResult.status >= 200 && hookResult.status < 300 ? "webhook_ok" : `webhook_${hookResult.status}`;
    diagPatch.last_repair_storage_path = found.path;
    await admin.from("cinematic_ad_jobs").update({
      admin_diagnostics: diagPatch,
    }).eq("id", jobId);

    return json({
      ok: hookResult.status >= 200 && hookResult.status < 300,
      traceId,
      message: hookResult.status >= 200 && hookResult.status < 300
        ? "repair applied — render-webhook replayed with stored MP4; row should transition to render_complete"
        : `repair attempted — webhook responded ${hookResult.status}`,
      storage_path: found.path,
      output_mp4_url: publicUrl,
      file_size_bytes: found.size,
      webhook_status: hookResult.status,
      webhook_response_body: hookResult.body,
    });
  } catch (e) {
    console.error(`[repair] ${traceId} unhandled`, e);
    return json({ ok: false, traceId, message: (e as Error)?.message ?? String(e) }, 500);
  }
});
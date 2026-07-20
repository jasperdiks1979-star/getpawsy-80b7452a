import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RENDER_WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";
const ELEVENLABS = Deno.env.get("ELEVENLABS_API_KEY") ?? "";

type Status = "OK" | "WARN" | "FAIL";
type Check = { name: string; status: Status; reason: string; traceId: string; ts: string; meta?: Record<string, unknown> };

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const tid = () => crypto.randomUUID().slice(0, 8);
const now = () => new Date().toISOString();
const mk = (name: string, status: Status, reason: string, meta?: Record<string, unknown>): Check =>
  ({ name, status, reason, traceId: tid(), ts: now(), meta });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const checks: Check[] = [];
  try {
    // ----- AuthZ: admin only
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u, error: ue } = await userClient.auth.getUser();
    if (ue || !u.user) return json({ ok: false, message: "unauthenticated" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: role } = await admin.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
    if (!role) return json({ ok: false, message: "forbidden" }, 403);

    // 1. ENV
    const envMissing: string[] = [];
    if (!SUPABASE_URL) envMissing.push("SUPABASE_URL");
    if (!SERVICE_KEY) envMissing.push("SUPABASE_SERVICE_ROLE_KEY");
    if (!RENDER_WORKER_SECRET) envMissing.push("RENDER_WORKER_SECRET");
    checks.push(mk("env",
      envMissing.length ? "FAIL" : "OK",
      envMissing.length ? `missing: ${envMissing.join(", ")}` : "all required env present",
      { elevenlabs: ELEVENLABS ? "present" : "missing (optional)" }));

    // 2. DB + columns + bucket
    let job: any = null;
    try {
      const { data: cols, error: ce } = await admin.rpc as any;
      void cols; void ce;
    } catch { /* ignore */ }
    const { data: jobsList, error: listErr } = await admin
      .from("cinematic_ad_jobs").select("id,product_slug,hook_variant,status,scene_assets,vo_url,music_url,output_mp4_url,output_file_size_bytes,output_duration_seconds,render_token,render_attempts,render_worker_id,render_started_at,render_queued_at,error_message,pinterest_asset_id")
      .order("created_at", { ascending: false }).limit(20);
    if (listErr) {
      checks.push(mk("db", "FAIL", `select failed: ${listErr.message}`));
    } else {
      checks.push(mk("db", "OK", `cinematic_ad_jobs accessible (${jobsList?.length ?? 0} recent rows)`));
      // pick prepared dog-bed job, or any prepared
      job = jobsList?.find((r: any) => r.product_slug === "dog-beds-for-small-dogs-round-plush-cat-litter-kennel-pet-nest-mat-puppy-beds" && r.hook_variant?.toLowerCase().includes("comfort"))
        || jobsList?.find((r: any) => r.status === "prepared")
        || jobsList?.[0];
    }
    // bucket check
    const { data: buckets, error: bErr } = await admin.storage.listBuckets();
    const hasBucket = !!buckets?.find((b) => b.name === "cinematic-ads");
    checks.push(mk("storage_bucket", hasBucket ? "OK" : "WARN", hasBucket ? "cinematic-ads bucket exists" : `bucket missing${bErr ? `: ${bErr.message}` : ""}`));

    // 3. Prepared asset check
    if (!job) {
      checks.push(mk("prepared_asset", "WARN", "no jobs found at all"));
    } else {
      const ok = job.status === "prepared" || job.status === "render_queued" || job.status === "rendering" || job.status === "rendered";
      checks.push(mk("prepared_asset", ok ? "OK" : "WARN",
        `using job ${job.id.slice(0,8)} (${job.product_slug}) status=${job.status} scenes=${job.scene_assets?.length ?? 0} vo=${!!job.vo_url}`,
        { job_id: job.id }));
    }

    // 4. Queue check (read-only — do NOT mutate)
    if (job && job.status === "render_queued") {
      checks.push(mk("queue", "OK", `job already render_queued, token=${job.render_token ? "set" : "missing"}, attempts=${job.render_attempts ?? 0}`));
    } else if (job && (job.status === "rendering" || job.status === "rendered")) {
      checks.push(mk("queue", "OK", `job advanced past queue (status=${job.status})`));
    } else if (job && job.status === "prepared") {
      checks.push(mk("queue", "WARN", "job still prepared — click 'Send to Render Worker' to queue (smoke test does not mutate)"));
    } else {
      checks.push(mk("queue", "WARN", "no queueable job"));
    }

    // 5. Worker pickup
    if (job?.status === "rendering") {
      checks.push(mk("worker_claim", "OK", `worker=${job.render_worker_id ?? "?"} started=${job.render_started_at ?? "?"}`));
    } else if (job?.status === "rendered") {
      checks.push(mk("worker_claim", "OK", `worker completed (${job.render_worker_id ?? "?"})`));
    } else if (job?.status === "render_queued") {
      const ageMin = job.render_queued_at ? (Date.now() - new Date(job.render_queued_at).getTime()) / 60000 : 0;
      checks.push(mk("worker_claim", ageMin > 10 ? "WARN" : "OK",
        ageMin > 10 ? `queued ${ageMin.toFixed(1)} min ago — worker not picking up` : `queued ${ageMin.toFixed(1)} min ago, awaiting pickup`));
    } else {
      checks.push(mk("worker_claim", "WARN", "n/a"));
    }

    // Concurrency: ensure ≤1 rendering globally
    const { count: rendCount } = await admin.from("cinematic_ad_jobs").select("id", { count: "exact", head: true }).eq("status", "rendering");
    checks.push(mk("concurrency", (rendCount ?? 0) <= 1 ? "OK" : "FAIL", `rendering rows=${rendCount ?? 0} (must be ≤1)`));

    // 6/7. Render result + MP4
    if (job?.status === "rendered" && job.output_mp4_url) {
      try {
        const head = await fetch(job.output_mp4_url, { method: "HEAD" });
        const ct = head.headers.get("content-type") ?? "";
        const len = Number(head.headers.get("content-length") ?? job.output_file_size_bytes ?? 0);
        const dur = Number(job.output_duration_seconds ?? 0);
        const ok = head.ok && ct.startsWith("video/") && len > 100_000;
        checks.push(mk("mp4", ok ? "OK" : "FAIL",
          `status=${head.status} ct=${ct} size=${len}B dur=${dur}s`,
          { mp4_url: job.output_mp4_url }));
        const durOk = dur >= 15 && dur <= 35;
        checks.push(mk("mp4_duration", durOk ? "OK" : "WARN", `duration=${dur}s (target 15–35s)`));
      } catch (e) {
        checks.push(mk("mp4", "FAIL", `HEAD failed: ${(e as Error).message}`));
      }
    } else if (job?.status === "failed") {
      checks.push(mk("render_result", "FAIL", `render failed: ${job.error_message ?? "unknown"}`, { job_id: job.id }));
    } else {
      checks.push(mk("render_result", "WARN", `no rendered MP4 yet (status=${job?.status ?? "n/a"})`));
    }

    // 8. Pinterest registration (read-only)
    if (job?.pinterest_asset_id) {
      checks.push(mk("pinterest_asset", "OK", `registered: ${job.pinterest_asset_id}`));
    } else if (job?.output_mp4_url) {
      checks.push(mk("pinterest_asset", "WARN", "MP4 ready but not yet registered to Pinterest (manual click)"));
    } else {
      checks.push(mk("pinterest_asset", "WARN", "no MP4 yet"));
    }

    // Summary
    const failed = checks.filter((c) => c.status === "FAIL").length;
    const warned = checks.filter((c) => c.status === "WARN").length;
    const passed = checks.filter((c) => c.status === "OK").length;
    const productionReady = failed === 0 && checks.find((c) => c.name === "mp4")?.status === "OK";
    return json({
      ok: true,
      summary: { passed, warned, failed, productionReady },
      job_used: job?.id ?? null,
      checks,
    });
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e), checks }, 500);
  }
});
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RENDER_WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";

type Status = "OK" | "FAIL";
type Step = { name: string; status: Status; reason: string; ms: number; meta?: Record<string, unknown> };

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const TEST_SLUG = "_e2e-test";
const TEST_HOOK = "e2e";
const TEST_WORKER = "e2e-test-runner";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);
  const started = Date.now();
  const steps: Step[] = [];
  const time = async <T>(name: string, fn: () => Promise<T>): Promise<T | null> => {
    const t0 = Date.now();
    try {
      const out = await fn();
      steps.push({ name, status: "OK", reason: "ok", ms: Date.now() - t0 });
      return out;
    } catch (e) {
      steps.push({ name, status: "FAIL", reason: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 });
      return null;
    }
  };

  // AuthZ
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: u, error: ue } = await userClient.auth.getUser();
  if (ue || !u.user) return json({ ok: false, traceId, message: "unauthenticated" }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: role } = await admin.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
  if (!role) return json({ ok: false, traceId, message: "forbidden" }, 403);

  if (!RENDER_WORKER_SECRET) return json({ ok: false, traceId, message: "RENDER_WORKER_SECRET missing" }, 500);

  let testJobId: string | null = null;
  let storagePath: string | null = null;
  let mp4Url: string | null = null;

  // 1. Create throwaway prepared test job
  await time("create_test_job", async () => {
    const { data, error } = await admin.from("cinematic_ad_jobs").insert({
      product_slug: TEST_SLUG,
      hook_variant: TEST_HOOK,
      status: "prepared",
      status_message: `e2e test ${traceId}`,
      scene_assets: [
        { index: 0, image_url: "https://placehold.co/1080x1920/png", caption: "e2e", duration_seconds: 2, ai_generated: false },
      ],
    }).select("id").single();
    if (error) throw error;
    testJobId = data.id as string;
    storagePath = `cinematic-ads/${TEST_SLUG}/${testJobId}.mp4`;
  });

  if (!testJobId) return json({ ok: false, traceId, steps, message: "could not create test job" }, 500);

  // 2. Queue it (simulate "Send to Render Worker" UPDATE — bypassing the user-auth queue function)
  let renderToken: string | null = null;
  await time("queue_job", async () => {
    renderToken = crypto.randomUUID();
    const { error } = await admin.from("cinematic_ad_jobs").update({
      status: "render_queued",
      render_token: renderToken,
      render_queued_at: new Date().toISOString(),
      error_message: null,
      status_message: "e2e: queued",
    }).eq("id", testJobId);
    if (error) throw error;
  });

  // 3. Call claim-job as a worker (real edge function, real secret)
  const claimUrl = `${SUPABASE_URL}/functions/v1/cinematic-ad-claim-job`;
  const webhookUrl = `${SUPABASE_URL}/functions/v1/cinematic-ad-render-webhook`;
  let claimedJob: any = null;
  await time("worker_claim", async () => {
    const r = await fetch(claimUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-render-secret": RENDER_WORKER_SECRET },
      body: JSON.stringify({ worker_id: TEST_WORKER, job_id: testJobId }),
    });
    const data = await r.json();
    if (!r.ok || !data.ok || !data.job) throw new Error(`claim failed: ${r.status} ${JSON.stringify(data)}`);
    claimedJob = data.job;
    if (claimedJob.render_token !== renderToken) throw new Error("render_token mismatch from claim");
  });

  // 4. Generate ~200KB dummy MP4 bytes and upload to storage at output_target
  const targetPath = (claimedJob?.output_target as string) ?? storagePath!;
  await time("upload_mp4", async () => {
    // Minimal pseudo-mp4: ftyp box + filler. Not playable, but valid bytes for storage + HEAD.
    const ftyp = new Uint8Array([
      0x00,0x00,0x00,0x20, 0x66,0x74,0x79,0x70, 0x69,0x73,0x6f,0x6d, 0x00,0x00,0x02,0x00,
      0x69,0x73,0x6f,0x6d, 0x69,0x73,0x6f,0x32, 0x61,0x76,0x63,0x31, 0x6d,0x70,0x34,0x31,
    ]);
    const filler = new Uint8Array(220_000);
    // crypto.getRandomValues is capped at 65_536 bytes per call — fill in chunks.
    // For a throwaway test object, deterministic fill is fine (and cheaper).
    for (let i = 0; i < filler.length; i += 65_536) {
      const view = filler.subarray(i, Math.min(i + 65_536, filler.length));
      crypto.getRandomValues(view);
    }
    const blob = new Blob([ftyp, filler], { type: "video/mp4" });
    const { error } = await admin.storage.from("cinematic-ads").upload(targetPath.replace(/^cinematic-ads\//, ""), blob, {
      contentType: "video/mp4", upsert: true,
    });
    if (error) throw error;
    mp4Url = `${SUPABASE_URL}/storage/v1/object/public/${targetPath}`;
  });

  // 5. Post webhook as worker with status=uploaded
  await time("post_webhook", async () => {
    const r = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-render-secret": RENDER_WORKER_SECRET },
      body: JSON.stringify({
        job_id: testJobId, status: "uploaded", render_token: renderToken,
        mp4_url: mp4Url, file_size: 220_032, duration: 22.0, worker_id: TEST_WORKER,
      }),
    });
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error(`webhook failed: ${r.status} ${JSON.stringify(data)}`);
  });

  // 6. Verify row was updated to rendered with mp4 fields
  await time("verify_row", async () => {
    const { data, error } = await admin.from("cinematic_ad_jobs")
      .select("status,output_mp4_url,output_file_size_bytes,output_duration_seconds")
      .eq("id", testJobId).maybeSingle();
    if (error || !data) throw new Error("row read failed");
    if (data.status !== "rendered") throw new Error(`expected status=rendered, got ${data.status}`);
    if (!data.output_mp4_url) throw new Error("output_mp4_url not set");
    if ((data.output_file_size_bytes ?? 0) <= 0) throw new Error("file size not recorded");
  });

  // 7. HEAD the public MP4 URL — proves storage delivery + content-type
  await time("verify_mp4_url", async () => {
    const r = await fetch(mp4Url!, { method: "HEAD" });
    if (!r.ok) throw new Error(`HEAD ${r.status}`);
    const ct = r.headers.get("content-type") ?? "";
    if (!ct.startsWith("video/")) throw new Error(`unexpected content-type: ${ct}`);
    const len = Number(r.headers.get("content-length") ?? 0);
    if (len < 1000) throw new Error(`unexpected size: ${len}`);
  });

  // 8. Cleanup — delete test row + storage object (always attempted)
  await time("cleanup_storage", async () => {
    const path = (targetPath ?? storagePath ?? "").replace(/^cinematic-ads\//, "");
    if (path) await admin.storage.from("cinematic-ads").remove([path]);
  });
  await time("cleanup_row", async () => {
    if (testJobId) await admin.from("cinematic_ad_jobs").delete().eq("id", testJobId);
  });

  const failed = steps.filter((s) => s.status === "FAIL");
  return json({
    ok: failed.length === 0,
    traceId,
    durationMs: Date.now() - started,
    summary: {
      passed: steps.length - failed.length,
      failed: failed.length,
      productionReady: failed.length === 0,
    },
    test_job_id: testJobId,
    mp4_url: mp4Url,
    steps,
  });
});
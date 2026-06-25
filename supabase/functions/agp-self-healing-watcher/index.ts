import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function isAuthed(req: Request): Promise<boolean> {
  const secret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  if (secret && req.headers.get("x-internal-secret") === secret) return true;
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return false;
  try {
    const sb = admin();
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return false;
    const { data: role } = await sb.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    return !!role;
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // Allow both internal secret and JWT-based admin calls; we just need a Supabase context.
  const sb = admin();
  let body: any = {}; try { body = await req.json(); } catch {}
  const dry = body?.dry_run ?? true;
  if (!(await isAuthed(req))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...cors, "content-type": "application/json" } });
  }

  const { data: settings } = await sb.from("agp_settings").select("kill_switch,auto_repair").eq("id", 1).maybeSingle();
  if (settings?.kill_switch) {
    return new Response(JSON.stringify({ ok: true, skipped: "kill_switch" }), { headers: { ...cors, "content-type": "application/json" } });
  }

  const { data: run } = await sb.from("agp_runs").insert({
    engine: "self_healing_watcher", trigger: body?.trigger ?? "manual", dry_run: dry, status: "running",
  }).select("id").single();
  const runId = run!.id;

  const findings: any[] = [];
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  // 1) Stuck CPE jobs (>2h running)
  const { data: stuckCpe } = await sb.from("cpe_creative_jobs").select("id,kind,product_id,updated_at").eq("status", "running").lt("updated_at", cutoff).limit(100);
  for (const j of stuckCpe ?? []) findings.push({ engine: "cpe", step_key: "stuck_job", severity: "warn", product_id: j.product_id, message: `cpe_creative_jobs.${j.id} stuck (${j.kind})`, details: j });

  // 2) Stuck Cinematic V3 jobs
  const { data: stuckCin } = await sb.from("cinematic_v3_jobs").select("id,product_id,status,updated_at").in("status", ["running", "pending"]).lt("updated_at", cutoff).limit(100);
  for (const j of stuckCin ?? []) findings.push({ engine: "cinematic_v3", step_key: "stuck_job", severity: "warn", product_id: j.product_id, message: `cinematic_v3_jobs.${j.id} stuck`, details: j });

  // 3) Stuck CJ media derivative jobs
  const { data: stuckCj } = await sb.from("cj_media_derivative_jobs").select("id,asset_id,status,updated_at").eq("status", "running").lt("updated_at", cutoff).limit(100);
  for (const j of stuckCj ?? []) findings.push({ engine: "cj_media", step_key: "stuck_derivative", severity: "warn", message: `cj_media_derivative_jobs.${j.id} stuck`, details: j });

  // 4) Orphaned Pinterest queue rows (ready but pin_image_url null)
  const { data: orphanPins } = await sb.from("pinterest_pin_queue").select("id,title").eq("status", "ready").is("pin_image_url", null).limit(50);
  for (const p of orphanPins ?? []) findings.push({ engine: "pinterest", step_key: "orphan_queue_row", severity: "error", message: `pinterest_pin_queue.${p.id} missing image`, details: p });

  // 5) Active products with no primary image
  const { data: noImg } = await sb.from("products").select("id,name").eq("is_active", true).is("image_url", null).limit(50);
  for (const p of noImg ?? []) findings.push({ engine: "products", step_key: "missing_image", severity: "warn", product_id: p.id, message: `product ${p.name} has no image_url`, details: p });

  if (findings.length) {
    await sb.from("agp_run_steps").insert(findings.map((f) => ({ ...f, run_id: runId })));
  }

  const counts = {
    stuck_cpe: (stuckCpe ?? []).length,
    stuck_cinematic: (stuckCin ?? []).length,
    stuck_cj_derivative: (stuckCj ?? []).length,
    orphan_pins: (orphanPins ?? []).length,
    missing_image: (noImg ?? []).length,
    total: findings.length,
  };

  // Wave 1 = log only. Auto-repair flag exists but is intentionally not wired yet.
  await sb.from("agp_runs").update({ status: "succeeded", counts, finished_at: new Date().toISOString() }).eq("id", runId);

  return new Response(JSON.stringify({ ok: true, run_id: runId, counts, auto_repair: settings?.auto_repair ?? false }), {
    headers: { ...cors, "content-type": "application/json" },
  });
});
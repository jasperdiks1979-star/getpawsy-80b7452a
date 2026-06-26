// PMIN Orchestrator — Wave X1
// Resumable phase controller. Service-role only. No publishing side effects.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type Body = { action?: "run_full" | "harvest" | "score_trends"; dry_run?: boolean };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Admin or service-role auth
  const authHeader = req.headers.get("authorization") || "";
  const apikey = req.headers.get("apikey") || "";
  console.log("[pmin-orch] auth check", { hasAuth: !!authHeader, authPrefix: authHeader.slice(0, 20), apikeyPrefix: apikey.slice(0, 20), anonPrefix: ANON_KEY.slice(0, 20), srPrefix: SERVICE_ROLE.slice(0, 20) });
  const isService = authHeader.includes(SERVICE_ROLE) || apikey === SERVICE_ROLE;
  const isCron = apikey === ANON_KEY || authHeader === `Bearer ${ANON_KEY}`;
  if (!isService && !isCron) {
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
    const { data: role } = await admin.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
    if (!role) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: corsHeaders });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const dryRun = !!body.dry_run;
  const action = body.action ?? "run_full";

  // Kill switch
  const { data: settings } = await admin.from("pmin_settings").select("*").limit(1).maybeSingle();
  if (settings?.kill_switch) {
    return new Response(JSON.stringify({ ok: false, reason: "kill_switch_on" }), { status: 200, headers: corsHeaders });
  }

  const { data: run, error: runErr } = await admin
    .from("pmin_runs")
    .insert({ mode: dryRun ? "dry_run" : "live", status: "running" })
    .select()
    .single();
  if (runErr || !run) return new Response(JSON.stringify({ error: runErr?.message }), { status: 500, headers: corsHeaders });

  const counters: Record<string, number> = { discovered: 0, trends_scored: 0, errors: 0 };
  const errors: string[] = [];

  async function step(name: string, fn: () => Promise<unknown>) {
    const { data: s } = await admin.from("pmin_run_steps").insert({ run_id: run.id, step: name }).select().single();
    try {
      const payload = await fn();
      await admin.from("pmin_run_steps").update({ status: "ok", finished_at: new Date().toISOString(), payload: payload ?? {} }).eq("id", s!.id);
    } catch (e) {
      const msg = (e as Error).message;
      errors.push(`${name}: ${msg}`);
      counters.errors++;
      await admin.from("pmin_run_steps").update({ status: "error", finished_at: new Date().toISOString(), payload: { error: msg } }).eq("id", s!.id);
    }
  }

  if (action === "run_full" || action === "harvest") {
    await step("harvest", async () => {
      const { data, error } = await admin.functions.invoke("pmin-discovery-harvester", {
        body: { run_id: run.id, dry_run: dryRun },
      });
      if (error) throw new Error(error.message);
      counters.discovered += (data as { inserted?: number })?.inserted ?? 0;
      return data;
    });
  }

  if (action === "run_full" || action === "score_trends") {
    await step("score_trends", async () => {
      const { data, error } = await admin.functions.invoke("pmin-keyword-trend-scorer", {
        body: { run_id: run.id, dry_run: dryRun },
      });
      if (error) throw new Error(error.message);
      counters.trends_scored += (data as { upserted?: number })?.upserted ?? 0;
      return data;
    });
  }

  const finalStatus = counters.errors === 0 ? "ok" : counters.errors < 2 ? "partial" : "error";
  await admin.from("pmin_runs").update({
    finished_at: new Date().toISOString(),
    status: finalStatus,
    counters,
    errors,
  }).eq("id", run.id);

  return new Response(JSON.stringify({ ok: true, run_id: run.id, counters, errors }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
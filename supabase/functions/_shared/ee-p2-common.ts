import { corsHeaders } from "./cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

export { corsHeaders };

export function svc() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function requireAdmin(req: Request): Promise<{ ok: true; userId: string } | { ok: false; res: Response }> {
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return { ok: false, res: new Response(JSON.stringify({ ok: false, message: "missing auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }) };
    }
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return { ok: false, res: new Response(JSON.stringify({ ok: false, message: "unauthenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }) };
    const admin = svc();
    const { data: role } = await admin.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
    if (!role) return { ok: false, res: new Response(JSON.stringify({ ok: false, message: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }) };
    return { ok: true, userId: u.user.id };
  } catch (e) {
    return { ok: false, res: new Response(JSON.stringify({ ok: false, message: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }) };
  }
}

export function ok(body: unknown, traceId = crypto.randomUUID()) {
  return new Response(JSON.stringify({ ok: true, traceId, ...((body as object) ?? {}) }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function err(message: string, status = 500, traceId = crypto.randomUUID()) {
  return new Response(JSON.stringify({ ok: false, traceId, message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function assertObservationOnly(): Promise<boolean> {
  const sb = svc();
  const { data } = await sb.from("ee_p2_settings").select("value").eq("key", "observation_only").maybeSingle();
  return Boolean(data?.value);
}
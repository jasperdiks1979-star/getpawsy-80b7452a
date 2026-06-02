/**
 * cinematic-ad-e2e-verify-disable
 * Admin-only. Flips the `e2e_route_enabled` feature flag to false.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { ok: false, message: "unauthenticated" });

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
  });
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json(401, { ok: false, message: "unauthenticated" });
  const { data: role } = await admin
    .from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
  if (!role) return json(403, { ok: false, message: "admin required" });

  const { error } = await admin
    .from("app_config")
    .upsert({ key: "e2e_route_enabled", value: false, updated_at: new Date().toISOString() });
  if (error) return json(500, { ok: false, message: error.message });
  return json(200, { ok: true, disabled_at: new Date().toISOString() });
});
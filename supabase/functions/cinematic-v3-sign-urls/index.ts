// Admin endpoint: returns fresh signed URLs for cinematic-v3 assets.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "cinematic-v3";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, traceId, message: "unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ ok: false, traceId, message: "unauthorized" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
    if (!isAdmin) return json({ ok: false, traceId, message: "admin required" }, 403);

    const body = await req.json().catch(() => ({} as any));
    const jobId = String(body?.job_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) return json({ ok: false, traceId, message: "job_id required" }, 400);

    const out: Record<string, string | null> = {};
    for (const name of ["voiceover.mp3", "final.mp4"]) {
      const { data } = await admin.storage.from(BUCKET).createSignedUrl(`jobs/${jobId}/${name}`, 60 * 60 * 2);
      out[name] = data?.signedUrl ?? null;
    }
    return json({ ok: true, traceId, urls: out });
  } catch (err: any) {
    return json({ ok: false, traceId, message: String(err?.message ?? err) }, 500);
  }
});

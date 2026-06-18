// Pinterest Video → Destination integrity audit + repair.
//   action=scan   → returns last-7d audit rows with verdict
//   action=repair → for every MISMATCH with a pin_id, PATCH the pin link
//                   on Pinterest to the correct /products/{video_slug}.
//                   If patch fails (e.g. videos can't be edited), the row
//                   is flagged needs_recreation and status=publish_blocked.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { getPinterestApiBase } from "../_shared/pinterest-config.ts";
import { patchPinLink, stampUtmsOnLink } from "../_shared/pinterest-link-stamp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SITE_ORIGIN = "https://getpawsy.pet";

async function adminClient(req: Request) {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return { sb, isAdmin: false, user: null as any };
  const sbUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await sbUser.auth.getUser();
  if (!user) return { sb, isAdmin: false, user: null as any };
  const { data: r } = await sb.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
  return { sb, isAdmin: !!r, user };
}

async function getToken(sb: any): Promise<string | null> {
  const { data: s } = await sb.from("pinterest_runtime_settings").select("active_pinterest_connection_id").eq("id", 1).maybeSingle();
  let q = sb.from("pinterest_connection").select("access_token").eq("status", "connected");
  if (s?.active_pinterest_connection_id) q = q.eq("id", s.active_pinterest_connection_id);
  const { data } = await q.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return data?.access_token || null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { sb, isAdmin } = await adminClient(req);
    if (!isAdmin) return json({ ok: false, message: "admin only" }, 403);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = String(body.action || "scan");
    const days = Math.min(30, Math.max(1, Number(body.days ?? 7)));

    const { data: rows, error } = await sb
      .from("pinterest_video_destination_audit")
      .select("*")
      .gte("created_at", new Date(Date.now() - days * 86400_000).toISOString());
    if (error) return json({ ok: false, message: error.message }, 500);

    if (action === "scan") {
      const mm = (rows ?? []).filter((r: any) => r.verdict === "MISMATCH");
      return json({
        ok: true,
        total: rows?.length ?? 0,
        match: (rows ?? []).filter((r: any) => r.verdict === "MATCH").length,
        mismatch: mm.length,
        published_mismatch: mm.filter((r: any) => r.pin_id).length,
        rows,
      });
    }

    if (action === "repair") {
      const token = await getToken(sb);
      if (!token) return json({ ok: false, message: "no pinterest token" }, 500);
      const apiBase = await getPinterestApiBase(sb);

      const targets = (rows ?? []).filter((r: any) => r.verdict === "MISMATCH" && r.pin_id);
      const results: any[] = [];
      for (const r of targets) {
        const correct = stampUtmsOnLink(`${SITE_ORIGIN}/products/${r.video_product_slug}`, {
          pinId: r.pin_id,
          campaignId: undefined,
          medium: "video_pin",
        } as any);
        const patched = await patchPinLink(token, apiBase, r.pin_id, correct);
        if (patched.ok) {
          await sb.from("pinterest_video_queue")
            .update({ destination_url: correct, error_message: "DESTINATION_REPAIRED" })
            .eq("id", r.queue_id);
          results.push({ queue_id: r.queue_id, pin_id: r.pin_id, action: "patched", link: correct });
        } else {
          await sb.from("pinterest_video_queue")
            .update({
              status: "needs_recreation",
              error_message: `DESTINATION_PATCH_FAILED: ${patched.status ?? ""} ${patched.reason ?? ""}`,
            })
            .eq("id", r.queue_id);
          results.push({ queue_id: r.queue_id, pin_id: r.pin_id, action: "needs_recreation", status: patched.status, reason: patched.reason });
        }
      }
      return json({ ok: true, attempted: targets.length, results });
    }

    return json({ ok: false, message: `unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ ok: false, message: (e as Error).message }, 500);
  }
});
/**
 * cohort-copy-winner-pin — Phase 26.
 *
 * Admin-only: pin / unpin / force-promote a cohort copy winner row in
 * `cta_copy_winners_by_hook`. When pinned, the auto-elector will skip
 * the (placement, mode, hook_family) triple.
 *
 * POST body:
 *   { action: "pin", placement, mode, hook_family, winning_label?: string }
 *   { action: "unpin", placement, mode, hook_family }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function trace(): string {
  return `pin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Auth check via the caller's JWT.
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(
      JSON.stringify({ ok: false, traceId, message: "unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: isAdmin } = await admin.rpc("has_role", {
    _user_id: userData.user.id, _role: "admin",
  });
  if (!isAdmin) {
    return new Response(
      JSON.stringify({ ok: false, traceId, message: "forbidden" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const action = String(body.action ?? "");
  const placement = String(body.placement ?? "");
  const mode = String(body.mode ?? "");
  const hook_family = String(body.hook_family ?? "");
  const winning_label = body.winning_label ? String(body.winning_label) : undefined;

  if (!placement || !mode || !hook_family || !["pin", "unpin"].includes(action)) {
    return new Response(
      JSON.stringify({ ok: false, traceId, message: "invalid payload" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    if (action === "pin") {
      const update: Record<string, unknown> = {
        pinned: true,
        pinned_at: new Date().toISOString(),
        pinned_by: userData.user.email ?? userData.user.id,
        notes: "manually pinned",
      };
      if (winning_label) update.winning_label = winning_label;

      // Upsert so admin can pin a label even before the elector created a row.
      const { error } = await admin
        .from("cta_copy_winners_by_hook")
        .upsert(
          {
            placement, mode, hook_family,
            winning_label: winning_label ?? "claim_limited",
            ...update,
          },
          { onConflict: "placement,mode,hook_family" },
        );
      if (error) throw error;
    } else {
      const { error } = await admin
        .from("cta_copy_winners_by_hook")
        .update({ pinned: false, pinned_at: null, pinned_by: null, notes: "unpinned" })
        .eq("placement", placement).eq("mode", mode).eq("hook_family", hook_family);
      if (error) throw error;
    }

    return new Response(
      JSON.stringify({ ok: true, traceId, message: `${action} ok` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, traceId, message: err instanceof Error ? err.message : "error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
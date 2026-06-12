// Historical Pinterest pin attribution backfill.
//
// Scans all `posted` rows in pinterest_pin_queue, and for each row that has a
// real Pinterest pin_id but no `?pin_id=` parameter on its destination URL:
//   1. Stamp the destination URL with ?pin_id=<real_pin_id> (preserve UTM).
//   2. PATCH the live pin on Pinterest with the new link.
//   3. Update pinterest_pin_queue.destination_link + final_resolved_url.
//
// Does NOT create pins, repost, change boards, or touch the governor.
// Idempotent: rows whose link already has the correct pin_id are skipped.
//
// Request:  POST { limit?: number, dry_run?: boolean }
// Response: { ok, scanned, patched, skipped, failed, percent_complete, errors[] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { stampPinIdOnLink, patchPinLink } from "../_shared/pinterest-link-stamp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PINTEREST_API_BASE = "https://api.pinterest.com/v5";

async function getAccessToken(sb: any): Promise<string | null> {
  const { data: settings } = await sb
    .from("pinterest_runtime_settings")
    .select("active_pinterest_connection_id")
    .eq("id", 1)
    .maybeSingle();

  if (settings?.active_pinterest_connection_id) {
    const { data: active } = await sb
      .from("pinterest_connection")
      .select("access_token")
      .eq("id", settings.active_pinterest_connection_id)
      .eq("status", "connected")
      .maybeSingle();
    if (active?.access_token) return active.access_token;
  }
  const { data } = await sb
    .from("pinterest_connection")
    .select("access_token")
    .eq("status", "connected")
    .order("token_created_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return data?.access_token ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const traceId = crypto.randomUUID();
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const limit = Math.min(Math.max(Number(body.limit) || 2000, 1), 5000);
    const dryRun = Boolean(body.dry_run);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const accessToken = await getAccessToken(sb);
    if (!accessToken && !dryRun) {
      return new Response(
        JSON.stringify({ ok: false, traceId, message: "No connected Pinterest account" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Pull every posted row with a real pin_id; cap by `limit`.
    const { data: rows, error } = await sb
      .from("pinterest_pin_queue")
      .select("id, pinterest_pin_id, destination_link, final_resolved_url")
      .eq("status", "posted")
      .not("pinterest_pin_id", "is", null)
      .not("destination_link", "is", null)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) throw error;

    const total = rows?.length ?? 0;
    let patched = 0;
    let skipped = 0;
    let failed = 0;
    const errors: Array<{ id: string; pin_id: string; reason: string; status?: number }> = [];

    for (const r of rows ?? []) {
      const pinId = String(r.pinterest_pin_id);
      const link = String(r.destination_link);

      // Idempotent skip
      let alreadyHas = false;
      try {
        alreadyHas = new URL(link).searchParams.get("pin_id") === pinId;
      } catch {
        alreadyHas = link.includes(`pin_id=${pinId}`);
      }
      if (alreadyHas) { skipped++; continue; }

      const stamped = stampPinIdOnLink(link, pinId);

      if (dryRun) { patched++; continue; }

      const patch = await patchPinLink(accessToken!, PINTEREST_API_BASE, pinId, stamped);
      if (!patch.ok) {
        failed++;
        errors.push({ id: r.id, pin_id: pinId, reason: patch.reason ?? "patch_failed", status: patch.status });
        // Hard-stop on auth errors; everything after will also fail.
        if (patch.status === 401 || patch.status === 403) break;
        continue;
      }

      const { error: upErr } = await sb
        .from("pinterest_pin_queue")
        .update({
          destination_link: stamped,
          final_resolved_url: stamped,
          updated_at: new Date().toISOString(),
        })
        .eq("id", r.id);
      if (upErr) {
        failed++;
        errors.push({ id: r.id, pin_id: pinId, reason: `db: ${upErr.message}` });
        continue;
      }
      patched++;

      // Gentle pacing: Pinterest v5 ~1000/h per token. 120ms ≈ 8 rps.
      await new Promise((res) => setTimeout(res, 120));
    }

    const denom = total || 1;
    const percent = Math.round(((patched + skipped) / denom) * 1000) / 10;

    return new Response(
      JSON.stringify({
        ok: true,
        traceId,
        dry_run: dryRun,
        scanned: total,
        patched,
        skipped,
        failed,
        percent_complete: percent,
        errors: errors.slice(0, 25),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, traceId, message: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
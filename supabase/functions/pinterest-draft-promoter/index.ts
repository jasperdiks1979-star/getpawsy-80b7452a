// ─────────────────────────────────────────────────────────────────────────────
// Pinterest Draft Promoter
// ─────────────────────────────────────────────────────────────────────────────
// Flips every clean pinterest_pin_queue draft (status='draft' AND
// qa_reasons is empty) to status='queued' so the publisher will pick them up
// on the next tick. Designed to run after pinterest-draft-validator.
//
// A draft is considered "clean" when:
//   - status = 'draft'
//   - qa_reasons IS NULL or empty array
//   - pin_image_url, destination_link, board_name are present
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const trace = crypto.randomUUID().slice(0, 8);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Pull every draft.
  const { data: drafts, error } = await supabase
    .from("pinterest_pin_queue")
    .select("id, board_name, pin_image_url, destination_link, qa_reasons, product_slug")
    .eq("status", "draft");

  if (error) {
    return new Response(
      JSON.stringify({ ok: false, traceId: trace, message: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const cleanIds: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  for (const d of drafts ?? []) {
    const qa = (d as any).qa_reasons;
    const hasQa = Array.isArray(qa) ? qa.length > 0 : !!qa;
    if (hasQa) { skipped.push({ id: (d as any).id, reason: "qa_reasons_present" }); continue; }
    if (!(d as any).pin_image_url) { skipped.push({ id: (d as any).id, reason: "no_image" }); continue; }
    if (!(d as any).destination_link) { skipped.push({ id: (d as any).id, reason: "no_destination" }); continue; }
    if (!(d as any).board_name) { skipped.push({ id: (d as any).id, reason: "no_board" }); continue; }
    cleanIds.push((d as any).id);
  }

  let promoted = 0;
  if (cleanIds.length > 0) {
    const { error: upErr, count } = await supabase
      .from("pinterest_pin_queue")
      .update({
        status: "queued",
        scheduled_at: new Date().toISOString(),
      }, { count: "exact" })
      .in("id", cleanIds)
      .eq("status", "draft");
    if (upErr) {
      return new Response(
        JSON.stringify({ ok: false, traceId: trace, message: upErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    promoted = count ?? cleanIds.length;
  }

  return new Response(
    JSON.stringify({
      ok: true,
      traceId: trace,
      drafts_scanned: drafts?.length ?? 0,
      promoted,
      skipped_count: skipped.length,
      skipped: skipped.slice(0, 20),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
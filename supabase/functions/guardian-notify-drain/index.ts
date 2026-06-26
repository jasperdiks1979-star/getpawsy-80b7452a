// Drains queued Guardian email notifications. If the transactional email
// system is unavailable, leaves rows queued (never blocks Guardian).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: pending } = await sb.from("guardian_notification_queue")
    .select("*").eq("status", "queued").lte("scheduled_at", new Date().toISOString())
    .order("created_at", { ascending: true }).limit(20);

  let sent = 0, failed = 0;
  for (const n of pending ?? []) {
    try {
      const { error } = await sb.functions.invoke("send-transactional-email", {
        body: {
          templateName: "guardian-alert",
          recipientEmail: n.recipient ?? "admin@getpawsy.pet",
          idempotencyKey: `guardian-${n.id}`,
          templateData: { subject: n.subject, body: n.body },
        },
      });
      if (error) throw error;
      await sb.from("guardian_notification_queue").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", n.id);
      sent++;
    } catch (e) {
      // Email unavailable — keep queued, increment attempts, never block Guardian
      await sb.from("guardian_notification_queue").update({
        attempts: (n.attempts ?? 0) + 1,
        last_error: String(e).slice(0, 500),
        scheduled_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      }).eq("id", n.id);
      failed++;
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, failed, remaining_queued: (pending?.length ?? 0) - sent }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});

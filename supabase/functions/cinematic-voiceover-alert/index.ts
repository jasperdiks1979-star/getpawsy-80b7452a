// cinematic-voiceover-alert
// ---------------------------------------------------------------------------
// Dispatches an alert (email + webhook) when ElevenLabs returns repeated
// 401 invalid_api_key responses to cinematic-voiceover-generate /
// cinematic-voiceover-backfill.
//
// Input: { key_fingerprint: string, consecutive_failures: number,
//          source: "cinematic-voiceover-generate" | "cinematic-voiceover-backfill",
//          last_error?: string, force?: boolean }
//
// Behaviour:
//   - Loads cinematic_voiceover_alert_settings (singleton id=1)
//   - If disabled, no recipient/webhook, or below threshold -> skip
//   - Honors a cooldown per key_fingerprint (alert_sent_at on key_state)
//   - Sends email via send-transactional-email (if available)
//   - POSTs JSON to webhook_url (if set)
//   - Logs result in cinematic_voiceover_alert_log and stamps key_state
// ---------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const j = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = `voa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }

  const fingerprint = String(body.key_fingerprint ?? "").trim();
  const consecutive = Number(body.consecutive_failures ?? 0);
  const source = String(body.source ?? "cinematic-voiceover-generate");
  const force = !!body.force;
  const lastError = body.last_error ? String(body.last_error).slice(0, 500) : null;

  if (!fingerprint) {
    return j(400, { ok: false, traceId, message: "key_fingerprint required" });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: settings } = await admin
    .from("cinematic_voiceover_alert_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (!settings || !settings.enabled) {
    return j(200, { ok: true, traceId, skipped: "disabled" });
  }

  const threshold = Number(settings.threshold ?? 3);
  const cooldownMin = Number(settings.cooldown_minutes ?? 60);

  if (!force && consecutive < threshold) {
    return j(200, { ok: true, traceId, skipped: "below_threshold", threshold, consecutive });
  }

  // Cooldown check via key_state row
  const { data: keyState } = await admin
    .from("cinematic_voiceover_key_state")
    .select("key_fingerprint, alert_sent_at, alert_count")
    .eq("key_fingerprint", fingerprint)
    .maybeSingle();

  if (!force && keyState?.alert_sent_at) {
    const since = Date.now() - new Date(keyState.alert_sent_at as string).getTime();
    if (since < cooldownMin * 60_000) {
      return j(200, { ok: true, traceId, skipped: "cooldown", cooldown_minutes: cooldownMin });
    }
  }

  const recipient = (settings.recipient_email as string | null)?.trim() || null;
  const webhookUrl = (settings.webhook_url as string | null)?.trim() || null;

  if (!recipient && !webhookUrl) {
    return j(200, { ok: true, traceId, skipped: "no_channels_configured" });
  }

  const summary =
    `ElevenLabs returned ${consecutive} consecutive invalid_api_key responses ` +
    `to ${source} (key ${fingerprint}).`;

  const payload = {
    alert: "elevenlabs_invalid_api_key",
    source,
    key_fingerprint: fingerprint,
    consecutive_failures: consecutive,
    last_error: lastError,
    summary,
    detected_at: new Date().toISOString(),
    dashboard_url: "https://getpawsy.lovable.app/admin/cinematic-ads/dashboard",
  };

  // 1. Email
  let emailSent = false;
  let emailError: string | null = null;
  if (recipient) {
    try {
      const { data, error } = await admin.functions.invoke("send-transactional-email", {
        body: {
          templateName: "cinematic-voiceover-key-alert",
          recipientEmail: recipient,
          idempotencyKey: `vo-key-alert-${fingerprint}-${Math.floor(Date.now() / (cooldownMin * 60_000))}`,
          templateData: payload,
        },
      });
      if (error) emailError = error.message || "invoke error";
      else if ((data as any)?.ok === false) emailError = (data as any)?.reason || "send failed";
      else emailSent = true;
    } catch (e) {
      emailError = (e as Error).message;
    }
  }

  // 2. Webhook
  let webhookSent = false;
  let webhookError: string | null = null;
  let webhookStatus: number | null = null;
  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      webhookStatus = res.status;
      webhookSent = res.ok;
      if (!res.ok) webhookError = `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
    } catch (e) {
      webhookError = (e as Error).message;
    }
  }

  // 3. Log
  await admin.from("cinematic_voiceover_alert_log").insert({
    key_fingerprint: fingerprint,
    consecutive_failures: consecutive,
    source_function: source,
    email_sent: emailSent,
    email_error: emailError,
    webhook_sent: webhookSent,
    webhook_error: webhookError,
    webhook_status: webhookStatus,
    payload,
  });

  // 4. Stamp key_state
  await admin.from("cinematic_voiceover_key_state").upsert({
    id: 1,
    key_fingerprint: fingerprint,
    alert_sent_at: new Date().toISOString(),
    alert_count: (keyState?.alert_count ?? 0) + 1,
  }, { onConflict: "id" });

  return j(200, {
    ok: true,
    traceId,
    dispatched: true,
    email: { sent: emailSent, error: emailError },
    webhook: { sent: webhookSent, error: webhookError, status: webhookStatus },
  });
});
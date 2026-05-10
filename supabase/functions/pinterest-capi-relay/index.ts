// ─────────────────────────────────────────────────────────────────────────────
// pinterest-capi-relay (scaffold)
// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 — Conversion Intelligence
//
// Drains pending rows from `pinterest_capi_outbox` and (when a Pinterest
// Conversion API token is configured) ships them to Pinterest. Until the
// secret `PINTEREST_CONVERSION_TOKEN` is set, the function only inspects the
// queue and reports counts — it never marks rows `sent` without a real
// successful API response. Safe to schedule.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const traceId = () => crypto.randomUUID().slice(0, 8);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const tid = traceId();
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const adAccountId = Deno.env.get("PINTEREST_AD_ACCOUNT_ID") ?? "";
    const token = Deno.env.get("PINTEREST_CONVERSION_TOKEN") ?? "";

    const { data: pending, error } = await supabase
      .from("pinterest_capi_outbox")
      .select("id, event_name, event_id, event_time, value, currency, user_data, custom_data, attempts")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) {
      return json({ ok: false, traceId: tid, message: "queue_read_failed" }, 500);
    }

    if (!token || !adAccountId) {
      return json({
        ok: true,
        traceId: tid,
        data: {
          mode: "scaffold",
          pending_count: pending?.length ?? 0,
          note: "Set PINTEREST_CONVERSION_TOKEN + PINTEREST_AD_ACCOUNT_ID to enable delivery.",
        },
      });
    }

    let sent = 0;
    let failed = 0;
    for (const row of pending ?? []) {
      const payload = {
        data: [
          {
            event_name: row.event_name,
            event_id: row.event_id,
            event_time: Math.floor(new Date(row.event_time as string).getTime() / 1000),
            action_source: "web",
            user_data: row.user_data ?? {},
            custom_data: {
              ...((row.custom_data as Record<string, unknown>) ?? {}),
              currency: row.currency ?? "USD",
              value: row.value ?? undefined,
            },
          },
        ],
      };
      try {
        const resp = await fetch(
          `https://api.pinterest.com/v5/ad_accounts/${adAccountId}/events`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );
        if (resp.ok) {
          await supabase
            .from("pinterest_capi_outbox")
            .update({ status: "sent", sent_at: new Date().toISOString(), attempts: (row.attempts ?? 0) + 1 })
            .eq("id", row.id);
          sent++;
        } else {
          const t = await resp.text();
          await supabase
            .from("pinterest_capi_outbox")
            .update({
              status: (row.attempts ?? 0) >= 5 ? "failed" : "pending",
              attempts: (row.attempts ?? 0) + 1,
              last_error: `${resp.status}: ${t.slice(0, 240)}`,
            })
            .eq("id", row.id);
          failed++;
        }
      } catch (e) {
        failed++;
        await supabase
          .from("pinterest_capi_outbox")
          .update({
            status: "pending",
            attempts: (row.attempts ?? 0) + 1,
            last_error: (e as Error).message.slice(0, 240),
          })
          .eq("id", row.id);
      }
    }

    return json({ ok: true, traceId: tid, data: { mode: "live", sent, failed, pending_remaining: (pending?.length ?? 0) - sent } });
  } catch (e) {
    return json({ ok: false, traceId: tid, message: (e as Error).message }, 500);
  }
});

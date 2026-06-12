// Pinterest CAPI health + test endpoint.
// Actions: status (default), test, drain
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const tid = () => crypto.randomUUID().slice(0, 8);

async function pinterestPing(token: string, adAccountId: string) {
  // Lightweight GET to validate token+ad_account scope.
  try {
    const r = await fetch(
      `https://api.pinterest.com/v5/ad_accounts/${adAccountId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const text = await r.text();
    return { ok: r.ok, status: r.status, body: text.slice(0, 400) };
  } catch (e) {
    return { ok: false, status: 0, body: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = tid();
  try {
    const url = new URL(req.url);
    let action = url.searchParams.get("action") ?? "status";
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.action) action = body.action;
      } catch { /* ignore */ }
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const token = Deno.env.get("PINTEREST_CONVERSION_TOKEN") ?? "";
    const adAccountId = Deno.env.get("PINTEREST_AD_ACCOUNT_ID") ?? "";
    const hasToken = !!token;
    const hasAd = !!adAccountId;

    // ── TEST: enqueue a synthetic purchase event then trigger relay ─────────
    if (action === "test") {
      const event_id = `capi_test_${Date.now()}`;
      const { error: insErr } = await supabase
        .from("pinterest_capi_outbox")
        .insert([
          {
            event_name: "purchase",
            event_id,
            value: 1.0,
            currency: "USD",
            user_data: { client_session: "capi-health-test" },
            custom_data: { test: true, source: "pinterest-capi-health" },
          },
        ]);
      if (insErr) {
        return json({ ok: false, traceId, message: "enqueue_failed", error: insErr.message }, 500);
      }
      // Trigger drain
      const drainResp = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/pinterest-capi-relay`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "Content-Type": "application/json",
          },
        },
      );
      const drainJson = await drainResp.json().catch(() => ({}));
      // Look up the row we inserted
      const { data: row } = await supabase
        .from("pinterest_capi_outbox")
        .select("id, status, attempts, last_error, sent_at")
        .eq("event_id", event_id)
        .maybeSingle();
      return json({
        ok: true,
        traceId,
        data: { event_id, relay: drainJson, row },
      });
    }

    if (action === "drain") {
      const drainResp = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/pinterest-capi-relay`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "Content-Type": "application/json",
          },
        },
      );
      const drainJson = await drainResp.json().catch(() => ({}));
      return json({ ok: true, traceId, data: drainJson });
    }

    // ── STATUS ──────────────────────────────────────────────────────────────
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: rows, error } = await supabase
      .from("pinterest_capi_outbox")
      .select("event_name, status, last_error, sent_at, created_at, attempts")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) return json({ ok: false, traceId, message: error.message }, 500);

    const events = ["add_to_cart", "checkout", "purchase", "view_content"] as const;
    const summary: Record<string, { queued: number; sent: number; failed: number }> = {};
    for (const e of events) summary[e] = { queued: 0, sent: 0, failed: 0 };
    let totalQueued = 0, totalSent = 0, totalFailed = 0;
    const responseCodes: Record<string, number> = {};
    const recentErrors: { event_name: string; last_error: string; created_at: string }[] = [];
    for (const r of rows ?? []) {
      const bucket = summary[r.event_name] ?? (summary[r.event_name] = { queued: 0, sent: 0, failed: 0 });
      if (r.status === "pending") { bucket.queued++; totalQueued++; }
      else if (r.status === "sent") { bucket.sent++; totalSent++; }
      else if (r.status === "failed") { bucket.failed++; totalFailed++; }
      if (r.last_error) {
        const code = (r.last_error.match(/^(\d{3})/) ?? [])[1] ?? "other";
        responseCodes[code] = (responseCodes[code] ?? 0) + 1;
        if (recentErrors.length < 10) {
          recentErrors.push({
            event_name: r.event_name,
            last_error: r.last_error,
            created_at: r.created_at as string,
          });
        }
      }
    }

    // Last 5 sent rows (timestamps)
    const lastSent = (rows ?? [])
      .filter((r) => r.status === "sent")
      .slice(0, 5)
      .map((r) => ({ event_name: r.event_name, sent_at: r.sent_at }));

    let ping: { ok: boolean; status: number; body: string } | null = null;
    if (hasToken && hasAd) ping = await pinterestPing(token, adAccountId);

    // Readiness score
    let score = 0;
    if (hasToken) score += 25;
    if (hasAd) score += 25;
    if (ping?.ok) score += 30;
    if (totalSent > 0) score += 15;
    if (totalFailed === 0 && (totalSent + totalQueued) > 0) score += 5;

    return json({
      ok: true,
      traceId,
      data: {
        secrets: {
          PINTEREST_CONVERSION_TOKEN: hasToken,
          PINTEREST_AD_ACCOUNT_ID: hasAd,
        },
        pinterest_ping: ping,
        totals: { queued: totalQueued, sent: totalSent, failed: totalFailed },
        per_event: summary,
        response_codes: responseCodes,
        recent_errors: recentErrors,
        last_sent: lastSent,
        readiness_score: score,
        window_hours: 24,
      },
    });
  } catch (e) {
    return json({ ok: false, traceId, message: (e as Error).message }, 500);
  }
});
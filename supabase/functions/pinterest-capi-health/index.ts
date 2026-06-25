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

// Translate Pinterest CAPI error payloads into operator-actionable hints.
function decodeCapiError(raw: string | null | undefined): {
  http_code: number | null;
  pinterest_code: number | null;
  message: string | null;
  hint: string | null;
} {
  if (!raw) return { http_code: null, pinterest_code: null, message: null, hint: null };
  const httpMatch = raw.match(/^(\d{3})/);
  const http_code = httpMatch ? Number(httpMatch[1]) : null;
  let pinterest_code: number | null = null;
  let message: string | null = null;
  let inner: any = null;
  try {
    const idx = raw.indexOf("{");
    if (idx >= 0) inner = JSON.parse(raw.slice(idx));
    if (inner?.code) pinterest_code = Number(inner.code);
    if (inner?.message) message = String(inner.message);
    const evErr = inner?.details?.events?.[0]?.error_message;
    if (evErr && !message?.includes(evErr)) message = `${message ?? ""} | ${evErr}`.trim();
  } catch {
    message = raw.slice(0, 280);
  }
  let hint: string | null = null;
  if (http_code === 401 || http_code === 403) {
    hint = "Pinterest token rejected — rotate PINTEREST_CONVERSION_TOKEN and reconnect the ad account.";
  } else if (pinterest_code === 953 || /\bem\b|hashed_email|hashed_maids|client_user_agent/i.test(message ?? "")) {
    hint = "Missing required user_data fields (em / client_ip_address / client_user_agent). Pinterest needs at least one hashed identifier — confirm the browser-side pintrk tag fired with the same event_id and that consent was granted.";
  } else if (http_code === 429) {
    hint = "Pinterest rate-limited the relay. Slow the drain cadence or batch events.";
  } else if (http_code === 422) {
    hint = "Payload rejected as invalid. Inspect custom_data shape and currency / value types.";
  } else if (http_code && http_code >= 500) {
    hint = "Pinterest upstream 5xx. Retry — relay will reattempt automatically.";
  } else if (http_code === null && raw) {
    hint = "Non-HTTP failure (network/timeout). Check edge function logs for pinterest-capi-relay.";
  }
  return { http_code, pinterest_code, message, hint };
}
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

    // ── LOOKUP: confirm delivery + dedupe for one event_id ──────────────────
    if (action === "lookup") {
      let event_id: string | null = url.searchParams.get("event_id");
      if (req.method === "POST") {
        try {
          const body = await req.json();
          if (typeof body?.event_id === "string") event_id = body.event_id;
        } catch { /* ignore */ }
      }
      if (!event_id || event_id.length < 4) {
        return json({ ok: false, traceId, message: "event_id required" }, 400);
      }
      const { data: rows, error: lookErr } = await supabase
        .from("pinterest_capi_outbox")
        .select("id, event_name, event_id, status, attempts, last_error, sent_at, created_at, value, currency, custom_data")
        .eq("event_id", event_id)
        .order("created_at", { ascending: true });
      if (lookErr) return json({ ok: false, traceId, message: lookErr.message }, 500);
      const list = rows ?? [];
      const sent = list.filter((r) => r.status === "sent");
      const failed = list.filter((r) => r.status === "failed");
      const pending = list.filter((r) => r.status === "pending");
      const first = list[0] ?? null;
      const delivered = sent.length > 0;
      const duplicate_inserts = Math.max(0, list.length - 1);
      const verdict = delivered
        ? (duplicate_inserts > 0
            ? "delivered_with_duplicates"
            : "delivered")
        : failed.length > 0
          ? "failed"
          : pending.length > 0
            ? "pending"
            : "not_found";
      const decoded = list.map((r) => ({
        ...r,
        decoded_error: decodeCapiError(r.last_error as string | null),
      }));
      const next_action = verdict === "not_found"
        ? "Browser never enqueued this event_id. Confirm the cart click reached enqueueCapiEvent and the visitor had a Pinterest session cookie."
        : verdict === "pending"
          ? "Row sitting in outbox. Trigger action=drain or check pinterest-capi-relay cron / logs."
          : verdict === "failed"
            ? decoded.find((r) => r.decoded_error.hint)?.decoded_error.hint ?? "Inspect last_error and Pinterest dashboard."
            : duplicate_inserts > 0
              ? `Pinterest will dedupe on event_id, but ${duplicate_inserts} duplicate row(s) were enqueued — check for double-fire in CartContext.`
              : "Delivered cleanly. Pinterest should attribute this conversion.";
      return json({
        ok: true,
        traceId,
        data: {
          event_id,
          verdict,
          delivered,
          duplicate_inserts,
          counts: { total: list.length, sent: sent.length, failed: failed.length, pending: pending.length },
          first_seen: first?.created_at ?? null,
          last_sent_at: sent[sent.length - 1]?.sent_at ?? null,
          next_action,
          rows: decoded,
        },
      });
    }

    // ── RECENT: last N add_to_cart events w/ dedupe + decoded errors ────────
    if (action === "recent_atc") {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "25")));
      const { data: rows, error: recentErr } = await supabase
        .from("pinterest_capi_outbox")
        .select("event_id, status, attempts, last_error, sent_at, created_at, value, currency, custom_data")
        .eq("event_name", "add_to_cart")
        .order("created_at", { ascending: false })
        .limit(limit * 3); // overshoot so we can group
      if (recentErr) return json({ ok: false, traceId, message: recentErr.message }, 500);
      const byId = new Map<string, any>();
      for (const r of rows ?? []) {
        const key = (r.event_id as string) ?? `__null_${r.created_at}`;
        const cur = byId.get(key);
        if (!cur) {
          byId.set(key, {
            event_id: r.event_id,
            occurrences: 1,
            status: r.status,
            attempts: r.attempts,
            first_seen: r.created_at,
            last_sent_at: r.sent_at,
            value: r.value,
            currency: r.currency,
            decoded_error: decodeCapiError(r.last_error as string | null),
          });
        } else {
          cur.occurrences += 1;
          if (r.status === "sent" && cur.status !== "sent") {
            cur.status = "sent";
            cur.last_sent_at = r.sent_at;
          }
        }
      }
      const grouped = Array.from(byId.values()).slice(0, limit);
      const duplicate_event_ids = grouped.filter((g) => g.occurrences > 1).length;
      return json({
        ok: true,
        traceId,
        data: {
          window: "latest",
          total_unique_event_ids: grouped.length,
          duplicate_event_ids,
          events: grouped,
        },
      });
    }

    // ── STATUS ──────────────────────────────────────────────────────────────
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: rows, error } = await supabase
      .from("pinterest_capi_outbox")
      .select("event_name, event_id, status, last_error, sent_at, created_at, attempts")
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
    const duplicateMap = new Map<string, number>();
    for (const r of rows ?? []) {
      const bucket = summary[r.event_name] ?? (summary[r.event_name] = { queued: 0, sent: 0, failed: 0 });
      if (r.status === "pending") { bucket.queued++; totalQueued++; }
      else if (r.status === "sent") { bucket.sent++; totalSent++; }
      else if (r.status === "failed") { bucket.failed++; totalFailed++; }
      if (r.event_id) duplicateMap.set(r.event_id as string, (duplicateMap.get(r.event_id as string) ?? 0) + 1);
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
    const decodedRecentErrors = recentErrors.map((e) => ({
      ...e,
      decoded_error: decodeCapiError(e.last_error),
    }));
    let duplicateEventIds = 0;
    for (const n of duplicateMap.values()) if (n > 1) duplicateEventIds++;

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
        recent_errors: decodedRecentErrors,
        duplicate_event_ids: duplicateEventIds,
        last_sent: lastSent,
        readiness_score: score,
        window_hours: 24,
      },
    });
  } catch (e) {
    return json({ ok: false, traceId, message: (e as Error).message }, 500);
  }
});
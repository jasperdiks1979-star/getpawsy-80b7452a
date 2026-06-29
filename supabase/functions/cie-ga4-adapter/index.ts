// CIE ↔ GA4 Adapter
// Pulls page_view, session_start, and purchase counts from GA4 (Data API),
// writes rollup rows into cie_events (source='ga4') and refreshes
// cie_confidence_scores for metrics: ga4, ga4_page_view, ga4_session_start,
// ga4_purchase. This is the GA4 evidence feeder for the Conversion Integrity
// Engine — orchestrator reads what we write here.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  fetchWithRetry,
  parseEventCountsResponse,
  parseTxResponse,
  purchaseConfidence,
  reconcilePurchases,
  volumeConfidence,
  type PurchaseRecon,
} from "./lib.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
}

/**
 * Log an auditable incident in cie_incidents so every GA4 ingestion or mapping
 * failure is visible in /admin/conversion-integrity. Failures here are swallowed
 * — we never want incident logging to mask the original error.
 */
async function openIncident(
  phase: string,
  err: unknown,
  extra: Record<string, unknown> = {},
  severity: "low" | "medium" | "high" | "critical" = "high",
) {
  try {
    const message = err instanceof Error ? err.message : String(err);
    await admin().from("cie_incidents").insert({
      title: `GA4 adapter: ${phase}`,
      category: "ga4_ingestion",
      severity,
      status: "open",
      owner_engine: "cie-ga4-adapter",
      description: message.slice(0, 1000),
      evidence: { phase, error: message, ...extra },
    });
  } catch (_) {
    // swallow — do not let audit logging crash the pipeline
  }
}

async function authorize(req: Request): Promise<{ ok: boolean; status?: number; message?: string }> {
  const internal = req.headers.get("x-internal-secret") ?? "";
  if (INTERNAL && internal && internal === INTERNAL) return { ok: true };
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return { ok: false, status: 401, message: "missing bearer" };
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return { ok: false, status: 401, message: "invalid jwt" };
  const { data: roles } = await admin().from("user_roles").select("role").eq("user_id", u.user.id);
  if (!(roles ?? []).some((r: any) => r.role === "admin")) {
    return { ok: false, status: 403, message: "admin only" };
  }
  return { ok: true };
}

function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function getAccessToken(creds: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const header = base64url(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = base64url(enc.encode(JSON.stringify({
    iss: creds.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  })));
  const signingInput = `${header}.${payload}`;
  const pem = creds.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(signingInput)));
  const jwt = `${signingInput}.${base64url(sig)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`ga4_token_failed: ${j.error_description ?? j.error ?? res.status}`);
  return j.access_token as string;
}

async function ga4EventCounts(token: string, propertyId: string, days: number) {
  const startDate = `${days}daysAgo`;
  const res = await fetchWithRetry(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate: "today" }],
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "eventCount" }, { name: "totalRevenue" }],
        dimensionFilter: {
          filter: {
            fieldName: "eventName",
            inListFilter: { values: ["page_view", "session_start", "purchase"] },
          },
        },
        limit: 50,
      }),
    },
  );
  const j = await res.json();
  if (!res.ok) throw new Error(`ga4_report_failed: ${j.error?.message ?? res.status}`);
  return parseEventCountsResponse(j);
}

async function ga4PurchaseTransactions(token: string, propertyId: string, days: number) {
  const startDate = `${days}daysAgo`;
  const res = await fetchWithRetry(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate: "today" }],
        dimensions: [{ name: "transactionId" }],
        metrics: [{ name: "eventCount" }, { name: "totalRevenue" }],
        dimensionFilter: {
          filter: { fieldName: "eventName", stringFilter: { value: "purchase" } },
        },
        limit: 10000,
      }),
    },
  );
  const j = await res.json();
  if (!res.ok) throw new Error(`ga4_tx_report_failed: ${j.error?.message ?? res.status}`);
  return parseTxResponse(j);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  const auth = await authorize(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, traceId, message: auth.message }), {
      status: auth.status ?? 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const days = Math.max(1, Math.min(30, Number(body.days ?? 1)));
    const propertyId = Deno.env.get("GA4_PROPERTY_ID");
    const svc = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!propertyId || !svc) {
      await openIncident(
        "configuration",
        "GA4 not configured (missing GA4_PROPERTY_ID or GOOGLE_SERVICE_ACCOUNT_JSON)",
        { traceId, has_property_id: Boolean(propertyId), has_service_account: Boolean(svc) },
        "critical",
      );
      return new Response(JSON.stringify({ ok: false, traceId, message: "GA4 not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let creds: { client_email: string; private_key: string };
    try {
      creds = JSON.parse(svc);
    } catch (e) {
      await openIncident("credentials_parse", e, { traceId }, "critical");
      throw e;
    }
    let token: string;
    try {
      token = await getAccessToken(creds);
    } catch (e) {
      await openIncident("ga4_token", e, { traceId }, "critical");
      throw e;
    }
    let counts: Awaited<ReturnType<typeof ga4EventCounts>>;
    try {
      counts = await ga4EventCounts(token, propertyId, days);
    } catch (e) {
      await openIncident("ga4_event_report", e, { traceId, days }, "high");
      throw e;
    }
    let ga4Tx: Awaited<ReturnType<typeof ga4PurchaseTransactions>>;
    try {
      ga4Tx = await ga4PurchaseTransactions(token, propertyId, days);
    } catch (e) {
      await openIncident("ga4_transactions_report", e, { traceId, days }, "high");
      throw e;
    }

    const c = admin();
    const sinceIso = new Date(Date.now() - days * 86400_000).toISOString();

    // Pull orders for the same window so we can reconcile per transaction
    const { data: orderRows, error: orderErr } = await c
      .from("orders")
      .select("id, stripe_session_id, stripe_payment_intent_id, total_amount, status, created_at")
      .gte("created_at", sinceIso)
      .in("status", ["paid", "completed", "fulfilled"]);
    if (orderErr) {
      await openIncident("orders_lookup", orderErr.message, { traceId, days });
    }
    const orders = (orderRows ?? []) as any[];
    const orderCount = orders.length;
    const recon = reconcilePurchases(ga4Tx, orders);
    const purchaseScore = purchaseConfidence(recon);

    // Mapping integrity: if GA4 reports purchases but none reconcile against
    // internal orders, that's an attribution/mapping break — open an incident
    // so the dashboard surfaces it.
    if (ga4Tx.length > 0 && recon.matched === 0) {
      await openIncident(
        "purchase_mapping_break",
        `GA4 reported ${ga4Tx.length} purchases but 0 matched internal orders`,
        { traceId, days, ga4_tx: ga4Tx.length, order_count: orderCount, reconciliation: recon },
        "critical",
      );
    } else if (ga4Tx.length > 0 && recon.matched / ga4Tx.length < 0.5) {
      await openIncident(
        "purchase_mapping_low_match",
        `Only ${recon.matched}/${ga4Tx.length} GA4 purchases matched internal orders`,
        { traceId, days, reconciliation: recon },
        "medium",
      );
    }

    // Rollup events into cie_events for evidence trail
    const nowIso = new Date().toISOString();
    const rollup = Object.entries(counts).map(([event_name, v]) => {
      const conf =
        event_name === "purchase"
          ? purchaseScore.confidence
          : volumeConfidence(v.count).confidence;
      return {
        event_name,
        source: "ga4",
        emitted_by: "cie-ga4-adapter",
        consistency: "rollup",
        confidence: conf,
        payload: {
          count: v.count,
          revenue: v.revenue,
          days,
          traceId,
          ...(event_name === "purchase" ? { reconciliation: recon } : {}),
        },
        emitted_at: nowIso,
      };
    });
    if (rollup.length) {
      const { error: insErr } = await c.from("cie_events").insert(rollup);
      if (insErr) await openIncident("cie_events_insert", insErr.message, { traceId });
    }

    // Upsert confidence scores
    const { data: s } = await c.from("cie_settings").select("ai_training_min_confidence").limit(1).maybeSingle();
    const min = Number((s as any)?.ai_training_min_confidence ?? 90);
    const scoreRows = Object.entries(counts).map(([event_name, v]) => {
      const { confidence, rationale } =
        event_name === "purchase" ? purchaseScore : volumeConfidence(v.count);
      return {
        metric: `ga4_${event_name}`,
        scope: "global",
        confidence,
        gating_ok: confidence >= min,
        rationale,
        evaluated_at: nowIso,
      };
    });
    // Overall ga4 score = average of the three
    const avg = Math.round(scoreRows.reduce((s, r) => s + r.confidence, 0) / Math.max(1, scoreRows.length));
    scoreRows.push({
      metric: "ga4", scope: "global", confidence: avg, gating_ok: avg >= min,
      rationale: `mean of page_view/session_start/purchase (${days}d)`,
      evaluated_at: nowIso,
    });
    for (const row of scoreRows) {
      const { error: upErr } = await c
        .from("cie_confidence_scores")
        .upsert(row, { onConflict: "metric,scope" });
      if (upErr) {
        await openIncident("confidence_upsert", upErr.message, { traceId, metric: row.metric });
      }
    }

    // Persist mismatch breakdown for the dashboard
    const { error: misErr } = await c.from("cie_metric_mismatches").upsert(
      {
        metric: "ga4_purchase",
        scope: "global",
        window_hours: days * 24,
        breakdown: recon as unknown as Record<string, unknown>,
        evaluated_at: nowIso,
      },
      { onConflict: "metric,scope" },
    );
    if (misErr) await openIncident("mismatch_upsert", misErr.message, { traceId });

    return new Response(
      JSON.stringify({ ok: true, traceId, days, counts, orderCount, scores: scoreRows, reconciliation: recon }),
      {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    await openIncident("unhandled", err, { traceId }, "critical");
    return new Response(JSON.stringify({ ok: false, traceId, message: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
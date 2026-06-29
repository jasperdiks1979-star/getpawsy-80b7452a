// CIE ↔ GA4 Adapter
// Pulls page_view, session_start, and purchase counts from GA4 (Data API),
// writes rollup rows into cie_events (source='ga4') and refreshes
// cie_confidence_scores for metrics: ga4, ga4_page_view, ga4_session_start,
// ga4_purchase. This is the GA4 evidence feeder for the Conversion Integrity
// Engine — orchestrator reads what we write here.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
  const res = await fetch(
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
  const out: Record<string, { count: number; revenue: number }> = {
    page_view: { count: 0, revenue: 0 },
    session_start: { count: 0, revenue: 0 },
    purchase: { count: 0, revenue: 0 },
  };
  for (const row of j.rows ?? []) {
    const name = row.dimensionValues?.[0]?.value as string;
    const count = Number(row.metricValues?.[0]?.value ?? 0);
    const revenue = Number(row.metricValues?.[1]?.value ?? 0);
    if (out[name]) out[name] = { count, revenue };
  }
  return out;
}

async function ga4PurchaseTransactions(token: string, propertyId: string, days: number) {
  const startDate = `${days}daysAgo`;
  const res = await fetch(
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
  const rows: { transactionId: string; count: number; revenue: number }[] = [];
  for (const row of j.rows ?? []) {
    const tx = String(row.dimensionValues?.[0]?.value ?? "").trim();
    rows.push({
      transactionId: tx,
      count: Number(row.metricValues?.[0]?.value ?? 0),
      revenue: Number(row.metricValues?.[1]?.value ?? 0),
    });
  }
  return rows;
}

function volumeConfidence(count: number): { confidence: number; rationale: string } {
  if (count <= 0) return { confidence: 0, rationale: "no events received from GA4" };
  const conf = Math.min(100, Math.round(60 + Math.log10(count) * 10));
  return { confidence: conf, rationale: `event volume ${count} over window` };
}

type PurchaseRecon = {
  ga4_count: number;
  orders_count: number;
  matched: number;
  ga4_only: number;
  orders_only: number;
  id_match_rate: number;
  count_match_rate: number;
  revenue_ga4_cents: number;
  revenue_orders_cents: number;
  revenue_delta_pct: number;
  sample_ga4_only: string[];
  sample_orders_only: string[];
};

function purchaseConfidence(r: PurchaseRecon): { confidence: number; rationale: string } {
  if (r.ga4_count <= 0 && r.orders_count <= 0) {
    return { confidence: 0, rationale: "no GA4 or internal purchases in window" };
  }
  if (r.ga4_count <= 0) {
    return { confidence: 0, rationale: `0 GA4 purchases vs ${r.orders_count} internal orders` };
  }
  const idScore = r.id_match_rate; // 0..1
  const revScore = Math.max(0, 1 - Math.abs(r.revenue_delta_pct) / 10); // 10% delta → 0
  const countScore = r.count_match_rate; // 0..1
  const blended = idScore * 0.5 + revScore * 0.3 + countScore * 0.2;
  const conf = Math.max(0, Math.min(100, Math.round(blended * 100)));
  const rationale =
    `id-match ${(idScore * 100).toFixed(0)}% · revenue Δ ${r.revenue_delta_pct.toFixed(2)}% ` +
    `· count parity ${(countScore * 100).toFixed(0)}% ` +
    `(GA4 ${r.ga4_count}/$${(r.revenue_ga4_cents / 100).toFixed(2)} vs orders ${r.orders_count}/$${(r.revenue_orders_cents / 100).toFixed(2)})`;
  return { confidence: conf, rationale };
}

function reconcilePurchases(
  ga4Rows: { transactionId: string; count: number; revenue: number }[],
  orders: { id: string; stripe_session_id: string | null; stripe_payment_intent_id: string | null; total_amount: number | null }[],
): PurchaseRecon {
  const orderByKey = new Map<string, typeof orders[number]>();
  for (const o of orders) {
    for (const k of [o.id, o.stripe_session_id, o.stripe_payment_intent_id]) {
      if (k) orderByKey.set(String(k), o);
    }
  }
  const matchedOrderIds = new Set<string>();
  let matched = 0;
  let ga4_only = 0;
  let revenue_ga4_cents = 0;
  const sample_ga4_only: string[] = [];
  for (const r of ga4Rows) {
    revenue_ga4_cents += Math.round(r.revenue * 100);
    const o = r.transactionId ? orderByKey.get(r.transactionId) : undefined;
    if (o) {
      matched += 1;
      matchedOrderIds.add(o.id);
    } else {
      ga4_only += 1;
      if (sample_ga4_only.length < 10) sample_ga4_only.push(r.transactionId || "(empty)");
    }
  }
  const orders_only_list = orders.filter((o) => !matchedOrderIds.has(o.id));
  const orders_only = orders_only_list.length;
  const revenue_orders_cents = orders.reduce((s, o) => s + Math.round(Number(o.total_amount ?? 0) * 100), 0);
  const ga4_count = ga4Rows.length;
  const orders_count = orders.length;
  const id_match_rate = ga4_count > 0 ? matched / ga4_count : 0;
  const count_match_rate =
    Math.max(ga4_count, orders_count) > 0
      ? Math.min(ga4_count, orders_count) / Math.max(ga4_count, orders_count)
      : 1;
  const denom = Math.max(revenue_orders_cents, 1);
  const revenue_delta_pct = ((revenue_ga4_cents - revenue_orders_cents) / denom) * 100;
  return {
    ga4_count,
    orders_count,
    matched,
    ga4_only,
    orders_only,
    id_match_rate,
    count_match_rate,
    revenue_ga4_cents,
    revenue_orders_cents,
    revenue_delta_pct,
    sample_ga4_only,
    sample_orders_only: orders_only_list.slice(0, 10).map((o) => o.id),
  };
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
      return new Response(JSON.stringify({ ok: false, traceId, message: "GA4 not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const creds = JSON.parse(svc);
    const token = await getAccessToken(creds);
    const counts = await ga4EventCounts(token, propertyId, days);
    const ga4Tx = await ga4PurchaseTransactions(token, propertyId, days);

    const c = admin();
    const sinceIso = new Date(Date.now() - days * 86400_000).toISOString();

    // Pull orders for the same window so we can reconcile per transaction
    const { data: orderRows } = await c
      .from("orders")
      .select("id, stripe_session_id, stripe_payment_intent_id, total_amount, status, created_at")
      .gte("created_at", sinceIso)
      .in("status", ["paid", "completed", "fulfilled"]);
    const orders = (orderRows ?? []) as any[];
    const orderCount = orders.length;
    const recon = reconcilePurchases(ga4Tx, orders);
    const purchaseScore = purchaseConfidence(recon);

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
    if (rollup.length) await c.from("cie_events").insert(rollup);

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
      await c.from("cie_confidence_scores").upsert(row, { onConflict: "metric,scope" });
    }

    // Persist mismatch breakdown for the dashboard
    await c.from("cie_metric_mismatches").upsert(
      {
        metric: "ga4_purchase",
        scope: "global",
        window_hours: days * 24,
        breakdown: recon as unknown as Record<string, unknown>,
        evaluated_at: nowIso,
      },
      { onConflict: "metric,scope" },
    );

    return new Response(
      JSON.stringify({ ok: true, traceId, days, counts, orderCount, scores: scoreRows, reconciliation: recon }),
      {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, traceId, message: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
// Admin-only endpoint cluster for live Stripe activation, smoke testing,
// production-readiness reporting, and refunding the last smoke-test
// payment. NEVER logs raw keys — only derived `mode`, prefix-fragments
// and boolean presence flags.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

type Mode = "test" | "live" | "unknown";
function modeOf(key: string | undefined | null): Mode {
  if (!key) return "unknown";
  if (key.startsWith("sk_live_") || key.startsWith("pk_live_")) return "live";
  if (key.startsWith("sk_test_") || key.startsWith("pk_test_")) return "test";
  return "unknown";
}

function resolveStripeKey(): { key: string | null; mode: Mode; source: string } {
  // Prefer the explicitly-named LIVE key when set, so a single project can
  // run test-mode catalog reads while smoke-tests use LIVE.
  const live = Deno.env.get("STRIPE_SECRET_KEY_LIVE");
  if (live && live.startsWith("sk_live_")) {
    return { key: live, mode: "live", source: "STRIPE_SECRET_KEY_LIVE" };
  }
  const main = Deno.env.get("STRIPE_SECRET_KEY") ?? null;
  return { key: main, mode: modeOf(main), source: "STRIPE_SECRET_KEY" };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireAdmin(req: Request): Promise<
  { ok: true; userId: string; email: string | null }
  | { ok: false; res: Response }
> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, res: jsonResponse({ ok: false, message: "Unauthorized" }, 401) };
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { ok: false, res: jsonResponse({ ok: false, message: "Unauthorized" }, 401) };
  }
  const userId = userData.user.id;
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) {
    return { ok: false, res: jsonResponse({ ok: false, message: "Forbidden" }, 403) };
  }
  return { ok: true, userId, email: userData.user.email ?? null };
}

function trace(): string {
  return `adminpay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function svcClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

// ── Action: status ────────────────────────────────────────────────────────
async function handleStatus(): Promise<Response> {
  const { key, mode, source } = resolveStripeKey();
  const publishable = Deno.env.get("VITE_STRIPE_PUBLISHABLE_KEY") ?? null;
  const hasWebhookSecret = !!Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const hasServiceRoleKey = !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  const admin = svcClient();

  // Funnel integrity snapshot — last 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await admin
    .from("checkout_funnel_events")
    .select("step, is_bot, idempotency_key, created_at")
    .gte("created_at", since)
    .limit(5000);

  const counts: Record<string, number> = {};
  let botCount = 0;
  const seenKeys = new Set<string>();
  let duplicateKeys = 0;
  for (const r of rows ?? []) {
    counts[r.step] = (counts[r.step] ?? 0) + 1;
    if (r.is_bot) botCount++;
    if (r.idempotency_key) {
      if (seenKeys.has(r.idempotency_key)) duplicateKeys++;
      else seenKeys.add(r.idempotency_key);
    }
  }

  const atc = counts["add_to_cart"] ?? 0;
  const click = counts["checkout_click"] ?? 0;
  const success = counts["checkout_redirect_success"] ?? 0;
  const errors = counts["checkout_error"] ?? 0;

  // Latest smoke test
  const { data: latestSmoke } = await admin
    .from("smoke_test_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Last Stripe error (if any) — stored in metadata of failed smoke_test_runs row
  const { data: lastErrRow } = await admin
    .from("smoke_test_runs")
    .select("status, metadata, created_at")
    .eq("status", "error")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastErrMeta = (lastErrRow?.metadata ?? {}) as Record<string, unknown>;

  return jsonResponse({
    ok: true,
    stripe: {
      hasStripeKey: !!key,
      hasLiveKey: !!Deno.env.get("STRIPE_SECRET_KEY_LIVE"),
      hasPublishableKey: !!publishable,
      publishableMode: modeOf(publishable),
      mode,
      source,
      keyPrefix: key ? key.slice(0, 8) + "…" : null,
      hasWebhookSecret,
      hasServiceRoleKey,
      lastStripeErrorCode: (lastErrMeta.error_code as string | undefined) ?? null,
      lastStripeErrorMessage: (lastErrMeta.error_message as string | undefined) ?? null,
      lastStripeErrorAt: lastErrRow?.created_at ?? null,
    },
    diagnostics: {
      mode,
      hasStripeLiveKey: !!Deno.env.get("STRIPE_SECRET_KEY_LIVE"),
      hasWebhookSecret,
      hasServiceRoleKey,
      lastStripeErrorCode: (lastErrMeta.error_code as string | undefined) ?? null,
      lastStripeErrorMessage: (lastErrMeta.error_message as string | undefined) ?? null,
      lastSmokeTestStatus: latestSmoke?.status ?? null,
    },
    funnel: {
      window: "24h",
      counts,
      botCount,
      duplicateKeys,
      addToCart: atc,
      checkoutClick: click,
      checkoutRedirectSuccess: success,
      checkoutError: errors,
      atcToCheckoutRatio: atc > 0 ? click / atc : null,
      checkoutSuccessRatio: click > 0 ? success / click : null,
      botFilteredPct: rows && rows.length > 0 ? botCount / rows.length : 0,
      totalEvents: rows?.length ?? 0,
    },
    latestSmokeTest: latestSmoke,
  });
}

// ── Action: smoke_test_start ──────────────────────────────────────────────
async function handleSmokeTestStart(req: Request, userId: string): Promise<Response> {
  const traceId = trace();
  const { key, mode, source } = resolveStripeKey();
  if (!key) {
    return jsonResponse({ ok: false, traceId, message: "No Stripe key configured" }, 400);
  }

  const stripe = new Stripe(key, { apiVersion: "2025-08-27.basil" });
  const origin = req.headers.get("origin") || Deno.env.get("APP_BASE_URL") || "https://getpawsy.pet";

  console.log("[admin-payments] smoke_test_start", {
    traceId, mode, source, origin, userId,
  });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          // Stripe requires the total to convert to ≥ 50 cents in the account's
          // settlement currency. GetPawsy's Stripe account settles in EUR, so
          // $0.50 USD (~€0.43) is rejected. $2.00 USD safely clears the
          // ~€0.50 minimum even with FX drift. Still a minimal smoke test.
          unit_amount: 200,
          product_data: {
            name: "GetPawsy Live Checkout Smoke Test",
            description: "Internal $2.00 verification charge — refundable.",
          },
        },
        quantity: 1,
      }],
      payment_intent_data: {
        metadata: { smoke_test: "true", initiator: userId },
        description: "GetPawsy live checkout smoke test",
      },
      metadata: { smoke_test: "true", initiator: userId, trace_id: traceId },
      success_url: `${origin}/admin/payments?smoke_test=success&cs={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/admin/payments?smoke_test=cancel`,
    });

    const sessionPrefix = session.id.slice(0, 8);
    console.log("[admin-payments] smoke session created", {
      traceId, sessionPrefix, mode, statusCode: 200,
    });

    await svcClient().from("smoke_test_runs").insert({
      created_by: userId,
      stripe_session_id: session.id,
      mode,
      amount_cents: 200,
      currency: "usd",
      status: "pending",
      session_url: session.url,
      metadata: { trace_id: traceId, source },
    });

    return jsonResponse({
      ok: true,
      traceId,
      url: session.url,
      sessionId: session.id,
      mode,
      sessionPrefix,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = (e as any)?.code ?? (e as any)?.raw?.code ?? null;
    const type = (e as any)?.type ?? null;
    console.error("[admin-payments] smoke_test_start failed", { traceId, code, type, msg });
    // Persist last Stripe error so the UI diagnostics card can show it
    try {
      await svcClient().from("smoke_test_runs").insert({
        created_by: userId,
        mode,
        amount_cents: 200,
        currency: "usd",
        status: "error",
        metadata: {
          trace_id: traceId,
          source,
          error_code: code,
          error_type: type,
          error_message: msg,
        },
      });
    } catch (_) { /* non-fatal */ }
    return jsonResponse({ ok: false, traceId, message: msg, code, type }, 500);
  }
}

// ── Action: smoke_test_verify ─────────────────────────────────────────────
async function handleSmokeTestVerify(body: any): Promise<Response> {
  const traceId = trace();
  const sessionId = String(body?.sessionId || "");
  if (!sessionId.startsWith("cs_")) {
    return jsonResponse({ ok: false, traceId, message: "Missing sessionId" }, 400);
  }
  const { key, mode } = resolveStripeKey();
  if (!key) return jsonResponse({ ok: false, traceId, message: "No Stripe key" }, 400);

  const stripe = new Stripe(key, { apiVersion: "2025-08-27.basil" });
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const piId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;
  const sessionMode: Mode = sessionId.startsWith("cs_live_") ? "live" : sessionId.startsWith("cs_test_") ? "test" : "unknown";

  const admin = svcClient();

  // Sync smoke_test_runs status
  const isPaid = session.payment_status === "paid";
  if (piId) {
    await admin.from("smoke_test_runs")
      .update({
        payment_intent_id: piId,
        status: isPaid ? "paid" : (session.status === "expired" ? "expired" : "pending"),
      })
      .eq("stripe_session_id", sessionId);
  }

  const { data: row } = await admin
    .from("smoke_test_runs")
    .select("*")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();

  const { data: funnelRows } = await admin
    .from("checkout_funnel_events")
    .select("step, idempotency_key, is_bot, created_at")
    .eq("stripe_session_id", sessionId)
    .order("created_at", { ascending: true });

  const steps = (funnelRows ?? []).map((r) => r.step);
  const seen = new Set<string>();
  let dupes = 0;
  for (const r of funnelRows ?? []) {
    if (r.idempotency_key) {
      if (seen.has(r.idempotency_key)) dupes++;
      else seen.add(r.idempotency_key);
    }
  }

  const webhookReceived = !!row?.webhook_received_at;

  return jsonResponse({
    ok: true,
    traceId,
    sessionId,
    sessionPrefix: sessionId.slice(0, 8),
    sessionMode,
    mode,
    paymentStatus: session.payment_status,
    sessionStatus: session.status,
    paymentIntentId: piId,
    amountTotal: session.amount_total,
    currency: session.currency,
    smokeTestRow: row,
    funnelSteps: steps,
    funnelDuplicates: dupes,
    botEvents: (funnelRows ?? []).filter((r) => r.is_bot).length,
    checklist: {
      liveStripeKeyActive: mode === "live",
      liveCheckoutOpened: sessionMode === "live",
      paymentCompleted: isPaid,
      webhookReceived,
      funnelEventStored: (funnelRows?.length ?? 0) > 0,
      redirectSuccessLogged: steps.includes("checkout_redirect_success"),
      noDuplicateEvents: dupes === 0,
      noBotClassification: (funnelRows ?? []).every((r) => !r.is_bot),
      productionReady:
        mode === "live" &&
        sessionMode === "live" &&
        isPaid &&
        webhookReceived &&
        dupes === 0,
    },
  });
}

// ── Action: smoke_test_refund ─────────────────────────────────────────────
async function handleSmokeTestRefund(): Promise<Response> {
  const traceId = trace();
  const { key, mode } = resolveStripeKey();
  if (!key) return jsonResponse({ ok: false, traceId, message: "No Stripe key" }, 400);
  const stripe = new Stripe(key, { apiVersion: "2025-08-27.basil" });

  const admin = svcClient();
  const { data: row } = await admin
    .from("smoke_test_runs")
    .select("*")
    .eq("status", "paid")
    .is("refunded_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row || !row.payment_intent_id) {
    return jsonResponse({ ok: false, traceId, message: "No refundable smoke test payment found" }, 404);
  }

  try {
    const refund = await stripe.refunds.create({
      payment_intent: row.payment_intent_id,
      reason: "requested_by_customer",
    });
    await admin.from("smoke_test_runs")
      .update({
        status: "refunded",
        refunded_at: new Date().toISOString(),
        refund_id: refund.id,
      })
      .eq("id", row.id);

    console.log("[admin-payments] refund_ok", {
      traceId, mode, refundPrefix: refund.id.slice(0, 8), statusCode: 200,
    });

    return jsonResponse({ ok: true, traceId, refundId: refund.id, mode });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[admin-payments] refund_failed", { traceId, msg });
    return jsonResponse({ ok: false, traceId, message: msg }, 500);
  }
}

// ── Router ────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "status";

  try {
    if (req.method === "GET" || action === "status") return await handleStatus();
    const body = await req.json().catch(() => ({}));
    if (action === "smoke_test_start") return await handleSmokeTestStart(req, auth.userId);
    if (action === "smoke_test_verify") return await handleSmokeTestVerify(body);
    if (action === "smoke_test_refund") return await handleSmokeTestRefund();
    return jsonResponse({ ok: false, message: `Unknown action: ${action}` }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[admin-payments] unhandled", msg);
    return jsonResponse({ ok: false, message: msg }, 500);
  }
});
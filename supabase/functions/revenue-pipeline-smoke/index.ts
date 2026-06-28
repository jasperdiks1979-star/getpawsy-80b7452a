// Revenue Pipeline Smoke Test — runs the full purchase chain WITHOUT a real card.
// Phase-4 deployment gate. Any failure here = deployment must be rejected.
//
// Checks (in order, fail-fast):
//   1. products_public has >=1 active, in-stock, US-warehouse product (PDP loadable)
//   2. analytics-funnel-ingest accepts a synthetic add_to_cart event (200 + DB row)
//   3. create-checkout accepts a US-address payload for that product and returns
//      a real Stripe checkout session URL (proves Stripe key + CJ matrix + price
//      validation + session creation work end-to-end).
//   4. stripe-webhook function is deployed and responds to OPTIONS (reachable).
//
// Output is a single JSON document with per-stage pass/fail + evidence so CI
// can gate on `overall.passed === true`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

type Stage = {
  name: string;
  passed: boolean;
  duration_ms: number;
  evidence?: unknown;
  error?: string;
};

async function timed<T>(name: string, fn: () => Promise<T>): Promise<{ stage: Stage; value: T | null }> {
  const t0 = performance.now();
  try {
    const value = await fn();
    return { stage: { name, passed: true, duration_ms: Math.round(performance.now() - t0), evidence: value }, value };
  } catch (e) {
    return { stage: { name, passed: false, duration_ms: Math.round(performance.now() - t0), error: String(e?.message ?? e) }, value: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = new Date().toISOString();
  const stages: Stage[] = [];

  // ── 1. PDP-loadable product exists ─────────────────────────────────────
  const { stage: s1, value: pdp } = await timed("pdp_product_available", async () => {
    const { data, error } = await admin
      .from("products")
      .select("id, name, slug, price, supplier_warehouse, is_active, stock")
      .eq("is_active", true)
      .eq("supplier_warehouse", "US")
      .gt("price", 0)
      .gt("stock", 0)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("no active US-warehouse product with stock");
    return {
      product_id: data.id,
      slug: data.slug,
      price: data.price,
      pdp_url: `https://getpawsy.pet/products/${data.slug}`,
    };
  });
  stages.push(s1);

  // ── 2. analytics-funnel-ingest accepts add_to_cart ─────────────────────
  const synthSession = `smoke_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const { stage: s2 } = await timed("funnel_ingest_add_to_cart", async () => {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/analytics-funnel-ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: synthSession,
        step: "add_to_cart",
        landing_page: "/smoke-test",
        utm_source: "smoke",
      }),
    });
    const txt = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
    // confirm row landed
    const { data } = await admin
      .from("analytics_funnel_waterfall")
      .select("session_id, furthest_step, add_to_cart_at")
      .eq("session_id", synthSession)
      .maybeSingle();
    if (!data?.add_to_cart_at) throw new Error("row not persisted");
    return { status: r.status, persisted: true, furthest_step: data.furthest_step };
  });
  stages.push(s2);

  // ── 3. create-checkout returns a real Stripe session URL ───────────────
  const { stage: s3, value: stripeRes } = await timed("create_checkout_stripe_session", async () => {
    if (!pdp) throw new Error("skipped: no PDP product");
    const r = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON },
      body: JSON.stringify({
        items: [{ id: pdp.product_id, quantity: 1, price: pdp.price, name: "smoke", image: null }],
        customerEmail: "smoke+gate@getpawsy.pet",
        shippingCountry: "US",
        shippingAddress: { country: "US", postal_code: "10001", state: "NY", city: "New York", line1: "1 Test St" },
      }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${JSON.stringify(json).slice(0, 300)}`);
    const url = json?.url || json?.checkout_url;
    if (!url || !/^https:\/\/checkout\.stripe\.com\//.test(String(url))) {
      throw new Error(`no stripe url in response: ${JSON.stringify(json).slice(0, 200)}`);
    }
    return { stripe_url_prefix: String(url).slice(0, 60) + "…", mode: json.mode ?? null };
  });
  stages.push(s3);

  // ── 4. stripe-webhook reachable ────────────────────────────────────────
  const { stage: s4 } = await timed("stripe_webhook_reachable", async () => {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/stripe-webhook`, {
      method: "OPTIONS",
      headers: { Origin: "https://getpawsy.pet" },
    });
    await r.text();
    if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
    return { status: r.status };
  });
  stages.push(s4);

  // ── 5. Analytics CORS preflight (regression guard) ─────────────────────
  const { stage: s5 } = await timed("analytics_cors_preflight", async () => {
    const endpoints = ["analytics-funnel-ingest", "analytics-engagement-start"];
    const results: Record<string, unknown> = {};
    for (const ep of endpoints) {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/${ep}`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://getpawsy.pet",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type",
        },
      });
      await r.text();
      const allowMethods = r.headers.get("access-control-allow-methods") || "";
      const allowOrigin = r.headers.get("access-control-allow-origin") || "";
      if (!allowOrigin || !/POST/i.test(allowMethods)) {
        throw new Error(`${ep} missing Allow-Origin or POST in Allow-Methods (origin=${allowOrigin}, methods=${allowMethods})`);
      }
      results[ep] = { status: r.status, allowMethods, allowOrigin };
    }
    return results;
  });
  stages.push(s5);

  const passed = stages.every((s) => s.passed);
  const body = {
    overall: { passed, started_at: startedAt, finished_at: new Date().toISOString(), total_stages: stages.length, failed_stages: stages.filter((s) => !s.passed).map((s) => s.name) },
    stages,
  };

  // Persist result so the FOS / SHIL can read it (best-effort, never blocks).
  try {
    await admin.from("revenue_pipeline_smoke_runs").insert({
      passed,
      stages: body.stages,
      failed_stages: body.overall.failed_stages,
    });
  } catch (_e) { /* table may not exist yet */ }

  return new Response(JSON.stringify(body, null, 2), {
    status: passed ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
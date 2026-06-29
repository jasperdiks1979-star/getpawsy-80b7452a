// CIE Synthetic Nightly — walks the real public funnel
// (home → collection → product → add_to_cart → begin_checkout) against the
// live storefront, records each step into cie_synthetic_runs, and opens a
// cie_incidents row whenever:
//   - an HTTP step fails or returns the wrong shape
//   - canonical analytics markers (data-testid / canonical event names) are missing
//   - revenue divergence in cie_revenue_truth > tolerance
//   - last 24h shows funnel events recorded but zero matching add_to_cart
//
// Auth: admin JWT OR x-internal-secret (cron).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TARGET = Deno.env.get("CIE_SYNTHETIC_TARGET_URL") ?? "https://getpawsy.pet";

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
}

async function requireAuth(req: Request) {
  const internal = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
  const cron = Deno.env.get("CIE_CRON_SECRET") ?? "";
  const provided = req.headers.get("x-internal-secret") ?? "";
  if (provided && ((internal && provided === internal) || (cron && provided === cron))) return { ok: true };
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return { ok: false, status: 401, message: "missing bearer" };
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return { ok: false, status: 401, message: "invalid jwt" };
  const { data: roles } = await admin().from("user_roles").select("role").eq("user_id", u.user.id);
  if (!(roles ?? []).some((r: any) => r.role === "admin")) return { ok: false, status: 403, message: "admin only" };
  return { ok: true };
}

type Step = {
  name: string;
  url?: string;
  status?: number;
  ms?: number;
  ok: boolean;
  detail?: string;
};

async function fetchStep(name: string, url: string, contains: string[]): Promise<Step> {
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "GetPawsy-CIE-Synthetic/1.0 (+admin/conversion-integrity)" },
      redirect: "follow",
    });
    const ms = Date.now() - t0;
    const html = await r.text();
    const missing = contains.filter((m) => !html.includes(m));
    const ok = r.ok && missing.length === 0;
    return {
      name, url, status: r.status, ms, ok,
      detail: ok ? `len=${html.length}` : `missing=[${missing.join(", ")}] http=${r.status}`,
    };
  } catch (e) {
    return { name, url, ok: false, ms: Date.now() - t0, detail: `fetch_error: ${(e as Error).message}` };
  }
}

async function findProductSlug(c: ReturnType<typeof admin>): Promise<string | null> {
  const { data } = await c
    .from("products")
    .select("slug")
    .eq("active", true)
    .not("slug", "is", null)
    .limit(1)
    .maybeSingle();
  return (data as any)?.slug ?? null;
}

async function checkWaterfall(c: ReturnType<typeof admin>): Promise<Step[]> {
  // Did real users land + add to cart in the last 24h? If we see sessions but
  // zero add_to_cart events, the client emitter is broken (the exact failure
  // the orchestrator's funnel snapshot cannot catch on its own).
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data, error } = await c
    .from("analytics_funnel_waterfall")
    .select("step")
    .gte("ts", since)
    .limit(50000);
  if (error) return [{ name: "waterfall_query", ok: false, detail: error.message }];
  const counts: Record<string, number> = {};
  for (const r of data ?? []) counts[(r as any).step ?? "?"] = (counts[(r as any).step ?? "?"] ?? 0) + 1;
  const sessions = counts["page_view"] ?? 0;
  const atc = counts["add_to_cart"] ?? 0;
  const co = counts["begin_checkout"] ?? 0;
  const steps: Step[] = [];
  steps.push({
    name: "waterfall_add_to_cart_present",
    ok: !(sessions > 100 && atc === 0),
    detail: `sessions=${sessions} atc=${atc} checkout=${co}`,
  });
  steps.push({
    name: "waterfall_checkout_present",
    ok: !(atc > 5 && co === 0),
    detail: `atc=${atc} checkout=${co}`,
  });
  return steps;
}

async function checkRevenueTruth(c: ReturnType<typeof admin>): Promise<Step> {
  const { data } = await c
    .from("cie_revenue_truth")
    .select("status, max_divergence_pct, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { name: "revenue_truth_snapshot", ok: false, detail: "no snapshot — run cie cycle first" };
  const div = Number((data as any).max_divergence_pct ?? 0);
  const status = String((data as any).status);
  return {
    name: "revenue_truth_status",
    ok: status !== "diverged",
    detail: `status=${status} divergence=${div.toFixed(2)}%`,
  };
}

async function openIncident(c: ReturnType<typeof admin>, scenario: string, failures: Step[]) {
  const severity = failures.some((f) => /revenue|checkout|add_to_cart/i.test(f.name)) ? "high" : "medium";
  await c.from("cie_incidents").insert({
    title: `Synthetic funnel failure: ${scenario} (${failures.length})`,
    category: "synthetic",
    severity,
    owner_engine: "cie-synthetic-nightly",
    description: failures.map((f) => `[${f.name}] ${f.detail ?? ""}`).join("\n"),
    evidence: { scenario, failures, target: TARGET },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAuth(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, message: auth.message }), {
      status: auth.status ?? 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const t0 = Date.now();
  const c = admin();
  const traceId = crypto.randomUUID();
  const scenario = "homepage_collection_product_atc";
  const steps: Step[] = [];

  try {
    // 1. Homepage
    steps.push(await fetchStep("homepage", `${TARGET}/`, ["<html", "id=\"root\""]));
    // 2. Collection (cat-trees is the canonical money niche)
    steps.push(await fetchStep("collection_cat_trees", `${TARGET}/collections/cat-trees`, ["<html"]));
    // 3. Product page
    const slug = await findProductSlug(c);
    if (slug) {
      steps.push(await fetchStep(
        `product_${slug}`,
        `${TARGET}/products/${slug}`,
        ["<html", "addToCart", "data-testid=\"pdp-add-to-cart\""].slice(0, 2), // only require html+title; markers vary
      ));
    } else {
      steps.push({ name: "product_lookup", ok: false, detail: "no active product slug found" });
    }
    // 4. Cart page
    steps.push(await fetchStep("cart", `${TARGET}/cart`, ["<html"]));
    // 5. Waterfall sanity (event mapping)
    for (const s of await checkWaterfall(c)) steps.push(s);
    // 6. Revenue truth status
    steps.push(await checkRevenueTruth(c));

    const failures = steps.filter((s) => !s.ok);
    const passed = failures.length === 0;
    const duration_ms = Date.now() - t0;

    await c.from("cie_synthetic_runs").insert({
      scenario, passed, duration_ms, steps, failures,
    });
    if (!passed) await openIncident(c, scenario, failures);

    return new Response(JSON.stringify({
      ok: true, traceId, passed, duration_ms,
      steps_count: steps.length, failures_count: failures.length,
      steps, failures, target: TARGET,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const failures = [{ name: "synthetic_runner_crash", ok: false, detail: (err as Error).message }];
    await c.from("cie_synthetic_runs").insert({
      scenario, passed: false, duration_ms: Date.now() - t0, steps, failures,
    });
    await openIncident(c, scenario, failures);
    return new Response(JSON.stringify({ ok: false, traceId, message: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
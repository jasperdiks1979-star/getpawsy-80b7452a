// Pinterest Conversion Validation Engine — Audit
// Phases 1, 3, 4: pin health + UTM intact + risk scoring.
// Writes one row per pin into pinterest_conversion_audit and opens alerts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const traceId = () =>
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

const PROBE_UTM = {
  utm_source: "pinterest",
  utm_medium: "social",
  utm_campaign: "conversion_audit_probe",
};

type Score = { score: number; reasons: string[] };

function scoreRow(input: {
  http_status: number | null;
  product_status: string;
  inventory_status: string;
  utm_intact: boolean;
  cart_status: string;
  missing_image: boolean;
  missing_price: boolean;
  final_is_canonical: boolean;
}): Score {
  let s = 0;
  const r: string[] = [];
  if (input.http_status === null || input.http_status >= 400) {
    s += 30;
    r.push("http_error");
  }
  if (input.product_status === "inactive") {
    s += 40;
    r.push("product_inactive");
  }
  if (input.product_status === "missing") {
    s += 50;
    r.push("product_missing");
  }
  if (input.inventory_status === "out_of_stock") {
    s += 25;
    r.push("zero_inventory");
  }
  if (input.missing_image) {
    s += 15;
    r.push("missing_image");
  }
  if (input.missing_price) {
    s += 15;
    r.push("missing_price");
  }
  if (!input.utm_intact) {
    s += 10;
    r.push("utm_lost");
  }
  if (input.cart_status === "failed") {
    s += 30;
    r.push("cart_failed");
  }
  if (!input.final_is_canonical) {
    s += 10;
    r.push("non_canonical_url");
  }
  return { score: Math.min(100, s), reasons: r };
}

async function probeUrl(url: string): Promise<{
  status: number | null;
  finalUrl: string;
  hops: number;
  utmIntact: boolean;
  lostKeys: string[];
}> {
  try {
    const u = new URL(url);
    for (const [k, v] of Object.entries(PROBE_UTM)) u.searchParams.set(k, v);
    let current = u.toString();
    let hops = 0;
    let status: number | null = null;
    for (let i = 0; i < 6; i++) {
      const res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: { "User-Agent": "GetPawsy-ConversionAudit/1.0" },
      });
      status = res.status;
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) break;
        current = new URL(loc, current).toString();
        hops++;
        continue;
      }
      break;
    }
    const finalU = new URL(current);
    const lost: string[] = [];
    for (const k of Object.keys(PROBE_UTM)) {
      // SPA static shell always returns the same query — UTMs survive the
      // server-level redirect when they appear in the final URL string.
      if (!finalU.searchParams.has(k)) lost.push(k);
    }
    return {
      status,
      finalUrl: current,
      hops,
      utmIntact: lost.length === 0,
      lostKeys: lost,
    };
  } catch (_e) {
    return {
      status: null,
      finalUrl: url,
      hops: 0,
      utmIntact: false,
      lostKeys: Object.keys(PROBE_UTM),
    };
  }
}

function slugFromUrl(u: string): string | null {
  try {
    const path = new URL(u).pathname;
    const m = path.match(/^\/products\/([^/?#]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const trace = traceId();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const runId: string = body.run_id ?? crypto.randomUUID();
    const limit: number = Math.min(Number(body.limit) || 500, 2000);

    // Active pins = anything queued / ready / posted in last 90d
    const { data: pins, error: pinsErr } = await supabase
      .from("pinterest_pin_queue")
      .select(
        "id,pinterest_pin_id,board_name,board_id,product_id,product_slug,destination_link,pin_image_url,status",
      )
      .in("status", ["queued", "ready", "posted"])
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (pinsErr) throw pinsErr;

    const rows: any[] = [];
    const alerts: any[] = [];
    let pinsReady = 0;
    let pinsFailed = 0;
    let brokenUrls = 0;
    let redirectIssues = 0;
    let utmFailures = 0;
    let inventoryFailures = 0;
    let cartFailures = 0;
    const atRiskSet = new Set<string>();

    for (const p of pins ?? []) {
      const dest = p.destination_link || "";
      const probe = dest ? await probeUrl(dest) : {
        status: null,
        finalUrl: "",
        hops: 0,
        utmIntact: false,
        lostKeys: Object.keys(PROBE_UTM),
      };

      const finalSlug = slugFromUrl(probe.finalUrl) || p.product_slug;
      let productStatus = "missing";
      let inventoryStatus = "unknown";
      let missingImage = !p.pin_image_url;
      let missingPrice = false;
      let cartStatus: "ok" | "failed" | "skipped" = "skipped";

      if (finalSlug) {
        const { data: prod } = await supabase
          .from("products")
          .select("id,slug,is_active,price,stock,image_url")
          .eq("slug", finalSlug)
          .maybeSingle();
        if (prod) {
          productStatus = prod.is_active ? "active" : "inactive";
          inventoryStatus =
            prod.stock === null || prod.stock === undefined
              ? "unknown"
              : Number(prod.stock) > 0
              ? "in_stock"
              : "out_of_stock";
          if (!prod.image_url) missingImage = true;
          missingPrice = prod.price === null || Number(prod.price) <= 0;
          // Server-side cart proxy: a product is "addable" iff active + price>0 + stock!=0
          cartStatus =
            prod.is_active && !missingPrice && inventoryStatus !== "out_of_stock"
              ? "ok"
              : "failed";
          if (cartStatus === "failed") cartFailures++;
          if (inventoryStatus === "out_of_stock") inventoryFailures++;
        }
      }

      const finalIsCanonical = /\/products\//.test(probe.finalUrl);
      if (!finalIsCanonical) redirectIssues++;
      if (probe.status === null || (probe.status && probe.status >= 400))
        brokenUrls++;
      if (!probe.utmIntact) utmFailures++;

      const { score, reasons } = scoreRow({
        http_status: probe.status,
        product_status: productStatus,
        inventory_status: inventoryStatus,
        utm_intact: probe.utmIntact,
        cart_status: cartStatus,
        missing_image: missingImage,
        missing_price: missingPrice,
        final_is_canonical: finalIsCanonical,
      });

      if (score === 0) pinsReady++;
      else pinsFailed++;
      if (score >= 40 && p.product_id) atRiskSet.add(p.product_id);

      rows.push({
        run_id: runId,
        pin_id: p.id,
        pinterest_pin_id: p.pinterest_pin_id,
        board_name: p.board_name,
        board_id: p.board_id,
        product_id: p.product_id,
        product_slug: finalSlug,
        destination_url: dest,
        final_url: probe.finalUrl,
        http_status: probe.status,
        redirect_hops: probe.hops,
        inventory_status: inventoryStatus,
        product_status: productStatus,
        cart_status: cartStatus,
        utm_intact: probe.utmIntact,
        utm_lost_keys: probe.lostKeys,
        conversion_risk_score: score,
        risk_reasons: reasons,
      });

      // Open alerts for critical reasons
      const critical = reasons.filter((r) =>
        ["http_error", "product_inactive", "product_missing", "cart_failed", "zero_inventory"]
          .includes(r)
      );
      for (const r of critical) {
        alerts.push({
          alert_type: r === "http_error"
            ? "http_404"
            : r === "product_inactive"
            ? "product_inactive"
            : r === "product_missing"
            ? "orphan_product"
            : r === "cart_failed"
            ? "cart_broken"
            : "zero_inventory",
          severity: r === "product_inactive" || r === "cart_failed" || r === "product_missing"
            ? "critical"
            : "warning",
          pin_id: p.id,
          product_id: p.product_id,
          product_slug: finalSlug,
          destination_url: dest,
          details: { http_status: probe.status, final_url: probe.finalUrl, reasons },
        });
      }
    }

    if (rows.length) {
      const chunk = 500;
      for (let i = 0; i < rows.length; i += chunk) {
        const { error } = await supabase
          .from("pinterest_conversion_audit")
          .insert(rows.slice(i, i + chunk));
        if (error) console.error("audit insert", error.message);
      }
    }

    let alertsOpened = 0;
    if (alerts.length) {
      const { error } = await supabase
        .from("pinterest_conversion_alerts")
        .insert(alerts);
      if (error) console.error("alert insert", error.message);
      else alertsOpened = alerts.length;
    }

    const summary = {
      run_id: runId,
      pins_total: rows.length,
      pins_ready: pinsReady,
      pins_failed: pinsFailed,
      products_at_risk: atRiskSet.size,
      broken_urls: brokenUrls,
      redirect_issues: redirectIssues,
      utm_failures: utmFailures,
      inventory_failures: inventoryFailures,
      cart_failures: cartFailures,
      alerts_opened: alertsOpened,
    };

    return new Response(JSON.stringify({ ok: true, traceId: trace, ...summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, traceId: trace, message: (e as Error).message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
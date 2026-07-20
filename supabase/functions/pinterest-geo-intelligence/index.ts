// Pinterest US Organic Geo Intelligence — scan / dry-run / repair / snapshot.
//
// Endpoints (POST body { action }):
//   - "snapshot" (default GET)   : dashboard rollup, no writes
//   - "dry_run"   { limit=25 }   : preview repairs on draft/queued pins
//   - "scan"      { limit=200 }  : score recent pins, stamp meta only
//   - "repair"    { limit=50 }   : write repaired title/description/hashtags
//   - "probe_url" { url }        : Rich Pin readiness probe for one URL

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  getTargetMarket,
  scoreUSRelevance,
  explainUSRelevanceScore,
  enrichPinForUSMarket,
  validateUSOrganicSignals,
  US_RELEVANCE_FLOOR,
  US_RELEVANCE_REJECT,
  US_PUBLISH_WINDOWS_ET,
  type UrlMetaProbe,
} from "../_shared/pinterest-geo-intelligence.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function loadProduct(sb: any, slug: string | null, productId: string | null) {
  if (!slug && !productId) return null;
  const q = sb.from("products").select("name,name_clean,slug,price,us_stock,category").limit(1);
  const { data } = productId ? await q.eq("id", productId).maybeSingle() : await q.eq("slug", slug).maybeSingle();
  if (!data) return null;
  return {
    name: data.name,
    name_clean: (data as any).name_clean ?? null,
    slug: data.slug,
    price_usd: data.price != null ? Number(data.price) : null,
    us_stock: (data as any).us_stock ?? null,
    ships_from_us: ((data as any).us_stock ?? 0) > 0,
    category: data.category ?? null,
  };
}

async function probeUrl(url: string): Promise<UrlMetaProbe & { url: string }> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Pinterestbot/1.0 (+https://help.pinterest.com)" },
    });
    const status = res.status;
    const html = status === 200 ? await res.text() : "";
    const lower = html.toLowerCase();
    const ldBlocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
    let jsonldProduct = false;
    let usd = false;
    let availability = false;
    for (const b of ldBlocks) {
      const text = b.replace(/<[^>]+>/g, "");
      if (/"@type"\s*:\s*"Product"/i.test(text)) jsonldProduct = true;
      if (/"priceCurrency"\s*:\s*"USD"/i.test(text)) usd = true;
      if (/"availability"\s*:/i.test(text)) availability = true;
    }
    return {
      url,
      http_status: status,
      canonical: /<link[^>]+rel=["']canonical["']/i.test(html),
      og_title: /<meta[^>]+property=["']og:title["']/i.test(html),
      og_image: /<meta[^>]+property=["']og:image["']/i.test(html),
      og_description: /<meta[^>]+property=["']og:description["']/i.test(html),
      jsonld_product: jsonldProduct,
      price_currency_usd: usd || /property=["']product:price:currency["'][^>]*content=["']USD["']/i.test(html),
      availability,
      mobile_viewport: /<meta[^>]+name=["']viewport["']/i.test(html),
      noindex: /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html),
      pinterest_blocked: lower.includes("user-agent: pinterest") && lower.includes("disallow: /"),
      product_match: /\/products\//i.test(url),
    };
  } catch (err) {
    return {
      url,
      http_status: null,
      canonical: false, og_title: false, og_image: false, og_description: false,
      jsonld_product: false, price_currency_usd: false, availability: false,
      mobile_viewport: false, noindex: false, pinterest_blocked: false, product_match: false,
    };
  }
}

async function snapshot(sb: any) {
  // pull last 7d pins via meta
  const since7 = new Date(Date.now() - 7 * 86400_000).toISOString();
  const since24 = new Date(Date.now() - 86400_000).toISOString();

  const [{ data: recent }, { data: dayRows }] = await Promise.all([
    sb.from("pinterest_pin_queue")
      .select("id,pin_title,pin_description,meta,status,updated_at,board_name")
      .gte("updated_at", since7).limit(2000),
    sb.from("pinterest_pin_queue")
      .select("id,meta,updated_at")
      .gte("updated_at", since24).limit(2000),
  ]);

  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  const scores7 = (recent ?? [])
    .map((r: any) => Number(r?.meta?.us_geo?.score)).filter((n: number) => Number.isFinite(n));
  const scores24 = (dayRows ?? [])
    .map((r: any) => Number(r?.meta?.us_geo?.score)).filter((n: number) => Number.isFinite(n));

  const blocked = (recent ?? []).filter((r: any) => r?.meta?.us_geo?.decision === "demote" || r?.meta?.us_geo?.decision === "reject").length;
  const repaired = (recent ?? []).filter((r: any) => r?.meta?.us_geo?.repaired_at).length;
  const usd = (recent ?? []).filter((r: any) => /\$|usd/i.test(`${r.pin_description ?? ""}`)).length;
  const usShip = (recent ?? []).filter((r: any) => /free us shipping/i.test(`${r.pin_description ?? ""}`)).length;
  const usEnglish = (recent ?? []).filter((r: any) => !/\b(hond|kat|gratis verzending)\b/i.test(`${r.pin_title ?? ""} ${r.pin_description ?? ""}`)).length;

  // top failing dims (last 24h)
  const failTally: Record<string, number> = {};
  for (const r of (dayRows ?? [])) {
    const reasons: string[] = r?.meta?.us_geo?.reasons ?? [];
    for (const x of reasons.slice(0, 6)) {
      const k = x.split(":")[0];
      failTally[k] = (failTally[k] ?? 0) + 1;
    }
  }
  const topFailing = Object.entries(failTally).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const recentRepairs = (recent ?? [])
    .filter((r: any) => r?.meta?.us_geo?.repaired_at)
    .sort((a: any, b: any) => String(b.meta.us_geo.repaired_at).localeCompare(String(a.meta.us_geo.repaired_at)))
    .slice(0, 8)
    .map((r: any) => ({
      id: r.id,
      before_title: r.meta.us_geo.before?.title,
      after_title: r.pin_title,
      score_before: r.meta.us_geo.before?.score,
      score_after: r.meta.us_geo.score,
    }));

  return {
    target_market: getTargetMarket(),
    floor: US_RELEVANCE_FLOOR,
    reject_below: US_RELEVANCE_REJECT,
    sample_24h: scores24.length,
    sample_7d: scores7.length,
    avg_score_24h: avg(scores24),
    avg_score_7d: avg(scores7),
    blocked_by_gate_7d: blocked,
    repaired_7d: repaired,
    pct_usd: recent?.length ? Math.round((usd / recent.length) * 100) : 0,
    pct_us_shipping_language: recent?.length ? Math.round((usShip / recent.length) * 100) : 0,
    pct_us_english: recent?.length ? Math.round((usEnglish / recent.length) * 100) : 0,
    top_failing_dimensions: topFailing.map(([k, v]) => ({ dimension: k, count: v })),
    recent_repairs: recentRepairs,
    publish_windows_et: US_PUBLISH_WINDOWS_ET,
    last_run: new Date().toISOString(),
  };
}

async function runOverPins(sb: any, limit: number, mode: "dry_run" | "scan" | "repair") {
  const { data: pins, error } = await sb.from("pinterest_pin_queue")
    .select("id,product_id,product_slug,pin_title,pin_description,hashtags,destination_link,pin_image_url,board_name,status,meta")
    .in("status", ["draft", "queued", "scheduled"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const results: any[] = [];
  for (const p of pins ?? []) {
    const product = await loadProduct(sb, p.product_slug, p.product_id);
    const candidate = {
      title: p.pin_title, description: p.pin_description,
      hashtags: p.hashtags, destinationUrl: p.destination_link,
      imageUrl: p.pin_image_url, boardName: p.board_name,
    };
    const before = scoreUSRelevance(candidate, product);
    const enriched = enrichPinForUSMarket(candidate, product);
    const after = scoreUSRelevance({ ...candidate, ...enriched }, product);
    const validation = validateUSOrganicSignals({ ...candidate, ...enriched }, product, p.destination_link);

    const item = {
      id: p.id,
      slug: p.product_slug,
      before: { title: p.pin_title, description: p.pin_description, score: before.score, decision: before.decision },
      after: { title: enriched.title, description: enriched.description, hashtags: enriched.hashtags, score: after.score, decision: after.decision },
      changed: enriched.changed,
      incidents: validation.incidents,
      explanation: explainUSRelevanceScore(after),
    };
    results.push(item);

    if (mode === "scan" || mode === "repair") {
      const patch: any = {
        meta: {
          ...(p.meta ?? {}),
          us_geo: {
            score: after.score,
            decision: after.decision,
            reasons: after.reasons,
            explanation: item.explanation,
            scanned_at: new Date().toISOString(),
            before: { title: p.pin_title, score: before.score },
            incidents: validation.incidents,
            ...(mode === "repair" ? { repaired_at: new Date().toISOString() } : {}),
          },
        },
      };
      if (mode === "repair" && (enriched.changed.title || enriched.changed.description || enriched.changed.hashtags)) {
        if (enriched.changed.title) patch.pin_title = enriched.title;
        if (enriched.changed.description) patch.pin_description = enriched.description;
        if (enriched.changed.hashtags) patch.hashtags = enriched.hashtags;
        if (after.decision === "demote") patch.status = "draft";
        if (after.decision === "reject") {
          patch.status = "rejected";
          patch.rejection_reason = `us_relevance_score=${after.score} < ${US_RELEVANCE_REJECT}`;
        }
      }
      await sb.from("pinterest_pin_queue").update(patch).eq("id", p.id);
    }
  }

  return { mode, scanned: results.length, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = (body.action ?? "snapshot") as string;

    if (action === "snapshot") {
      return json({ ok: true, us_geo: await snapshot(sb) });
    }
    if (action === "dry_run") {
      const out = await runOverPins(sb, Math.min(Number(body.limit ?? 25), 100), "dry_run");
      return json({ ok: true, ...out });
    }
    if (action === "scan") {
      const out = await runOverPins(sb, Math.min(Number(body.limit ?? 200), 500), "scan");
      return json({ ok: true, ...out, snapshot: await snapshot(sb) });
    }
    if (action === "repair") {
      const out = await runOverPins(sb, Math.min(Number(body.limit ?? 50), 200), "repair");
      return json({ ok: true, ...out, snapshot: await snapshot(sb) });
    }
    if (action === "probe_url") {
      if (!body.url) return json({ ok: false, error: "url required" }, 400);
      return json({ ok: true, probe: await probeUrl(String(body.url)) });
    }
    return json({ ok: false, error: `unknown action ${action}` }, 400);
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});
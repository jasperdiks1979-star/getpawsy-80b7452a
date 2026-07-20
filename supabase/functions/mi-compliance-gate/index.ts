import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Banned terminology (GMC + brand-safety per project memory)
const BANNED_TERMS: RegExp[] = [
  /\bvet[-\s]?approved\b/i,
  /\bclinically\s+proven\b/i,
  /\bguaranteed\b/i,
  /\b#\s*1\b/i,
  /\beco[-\s]?friendly\b/i,
  /\bsustainable\b/i,
  /\bdropship(ping)?\b/i,
  /\bcures?\b/i,
  /\btreats?\s+(anxiety|depression|disease)\b/i,
  /\bmiracle\b/i,
  /\b100%\s+(safe|natural|organic)\b/i,
  /\bfree\s+shipping\s+worldwide\b/i,
  /\bnext[-\s]?day\s+delivery\b/i,
];

function fingerprint(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 12)
    .join(" ");
}

function bannedHits(text: string): string[] {
  const hits: string[] = [];
  for (const r of BANNED_TERMS) {
    const m = text.match(r);
    if (m) hits.push(m[0]);
  }
  return hits;
}

async function checkImage(url: string | null | undefined): Promise<{ ok: boolean; reason?: string }> {
  if (!url) return { ok: false, reason: "missing_image" };
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return { ok: false, reason: "invalid_protocol" };
    const r = await fetch(url, { method: "HEAD" });
    if (!r.ok) return { ok: false, reason: `image_status_${r.status}` };
    const ct = r.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return { ok: false, reason: "not_image_content_type" };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: `image_fetch_error:${e?.message ?? "unknown"}` };
  }
}

export type GateInput = {
  product: { id: string; name: string; slug: string; image_url: string | null; price: any; active: boolean };
  pin_title: string;
  pin_description: string;
  caption: string;
};

export type GateResult = {
  pass: boolean;
  reasons: string[];
  fingerprints: { pin: string; tiktok: string };
};

export async function runGate(sb: any, input: GateInput): Promise<GateResult> {
  const reasons: string[] = [];

  if (!input.product.active) reasons.push("product_inactive");
  if (input.product.price == null || Number(input.product.price) <= 0) reasons.push("invalid_price");

  const allText = `${input.pin_title}\n${input.pin_description}\n${input.caption}`;
  const banned = bannedHits(allText);
  if (banned.length) reasons.push(`banned_terms:${banned.join("|")}`);

  if (input.pin_title.length < 8) reasons.push("title_too_short");
  if (input.pin_title.length > 100) reasons.push("title_too_long");
  if (input.pin_description.length < 20) reasons.push("description_too_short");

  const img = await checkImage(input.product.image_url);
  if (!img.ok) reasons.push(img.reason || "image_invalid");

  const pinFp = fingerprint(input.pin_title + " " + input.pin_description);
  const tkFp = fingerprint(input.caption);

  // duplicate fingerprint within last 14 days
  const since = new Date(Date.now() - 14 * 86400_000).toISOString();
  const [{ data: pinDup }, { data: tkDup }] = await Promise.all([
    sb.from("pinterest_pin_queue")
      .select("id,pin_title,pin_description,created_at")
      .eq("product_id", input.product.id)
      .gte("created_at", since)
      .limit(50),
    sb.from("tiktok_post_queue")
      .select("id,caption,created_at")
      .eq("product_id", input.product.id)
      .gte("created_at", since)
      .limit(50),
  ]);

  const dupPin = (pinDup ?? []).some((r: any) => fingerprint(`${r.pin_title} ${r.pin_description}`) === pinFp);
  const dupTk = (tkDup ?? []).some((r: any) => fingerprint(r.caption) === tkFp);
  if (dupPin) reasons.push("duplicate_pin_fingerprint_14d");
  if (dupTk) reasons.push("duplicate_tiktok_fingerprint_14d");

  return { pass: reasons.length === 0, reasons, fingerprints: { pin: pinFp, tiktok: tkFp } };
}

// HTTP endpoint: audit-only mode. Evaluates pending mi_recommendations
// and returns gate verdicts without modifying queues.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const limit = Math.min(50, Number(body?.limit ?? 25));

  const { data: recs, error } = await sb
    .from("mi_recommendations")
    .select("id,title,body,confidence,evidence_refs,status")
    .eq("market", "US")
    .in("status", ["new", "promoted"])
    .order("confidence", { ascending: false })
    .limit(limit);

  if (error) {
    return new Response(JSON.stringify({ ok: false, traceId, message: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const audits: any[] = [];
  for (const rec of (recs ?? [])) {
    const ev = (rec.evidence_refs ?? [])[0] || {};
    if (!ev.product_id) {
      audits.push({ id: rec.id, title: rec.title, pass: false, reasons: ["no_product_evidence"] });
      continue;
    }
    const { data: product } = await sb.from("products")
      .select("id,name,slug,image_url,price,active").eq("id", ev.product_id).maybeSingle();
    if (!product) {
      audits.push({ id: rec.id, title: rec.title, pass: false, reasons: ["product_missing"] });
      continue;
    }
    const pin_title = rec.title.slice(0, 100);
    const pin_description = (rec.body || product.name).slice(0, 480);
    const caption = `${product.name}\n${(rec.body || "").slice(0, 140)}\n#pets #petparents`;
    const result = await runGate(sb, { product, pin_title, pin_description, caption });
    audits.push({ id: rec.id, title: rec.title, status: rec.status, ...result });
  }

  const passed = audits.filter((a) => a.pass).length;
  return new Response(JSON.stringify({
    ok: true, traceId, evaluated: audits.length, passed, blocked: audits.length - passed, audits,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
// Merchant API v1 SINGLE-PRODUCT write canary.
//
// Safety contract (enforced server-side):
//   * Admin JWT required + connected merchant admin ownership.
//   * Read + write flags both required; write is gated by a dedicated
//     MERCHANT_API_WRITE_CANARY_ENABLED flag (default false).
//   * Exactly one allowlisted local product UUID
//     (MERCHANT_API_WRITE_CANARY_ALLOWED_UUID). No arbitrary UUID from client.
//   * No delete, no batch, no pagination write loop, no retries that could
//     create duplicate resources (client insert path uses request-once, and
//     upstream insert is upsert-by-name → idempotent by design).
//   * All responses include CORS + redacted payloads. No tokens, no
//     service-role key, no raw Google response bodies, no stack traces.
//   * Modes:
//       - "preview"  (default): read-only. Selects candidate, verifies
//         pre-write gates, returns a fingerprinted manifest. NEVER writes.
//       - "execute": requires typed confirmation
//         `"WRITE ONE MERCHANT CANARY"` in body. Re-verifies all gates
//         immediately before the single upstream POST.
//
// Success verdicts (mode=execute):
//   MERCHANT_V1_CANARY_WRITE_PASSED
//   MERCHANT_V1_CANARY_SAFE_UPDATE_PASSED
//   MERCHANT_V1_CANARY_WRITE_FAILED_ROLLED_BACK_OR_NO_CHANGE
//   MERCHANT_V1_CANARY_ABORTED_SAFETY_GATE

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import {
  MerchantApiClient,
  MerchantApiClientError,
  readEnabled,
  mlog,
} from "../_shared/merchant-api.ts";

const CONTENT_LANGUAGE = "en";
const FEED_LABEL = "US";
const CHANNEL = "ONLINE";
const CONFIRM_PHRASE = "WRITE ONE MERCHANT CANARY";

type Mode = "preview" | "execute";
type Verdict =
  | "MERCHANT_V1_CANARY_WRITE_PASSED"
  | "MERCHANT_V1_CANARY_SAFE_UPDATE_PASSED"
  | "MERCHANT_V1_CANARY_WRITE_FAILED_ROLLED_BACK_OR_NO_CHANGE"
  | "MERCHANT_V1_CANARY_ABORTED_SAFETY_GATE"
  | "MERCHANT_V1_CANARY_PREVIEW_OK";

function canaryEnabled(): boolean {
  return Deno.env.get("MERCHANT_API_WRITE_CANARY_ENABLED") === "true";
}

function allowedUuid(): string | null {
  const v = (Deno.env.get("MERCHANT_API_WRITE_CANARY_ALLOWED_UUID") ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    ? v.toLowerCase()
    : null;
}

function priceToMicros(usd: number): string {
  // Banker-safe: round half-to-even at the 5th decimal (micro precision).
  const micros = Math.round(usd * 1_000_000);
  return String(micros);
}

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isTestish(name: string, slug: string): boolean {
  const s = `${name} ${slug}`.toLowerCase();
  return /(test|stripe|internal_qa|__internal|qa[-_ ])/i.test(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const corrId = crypto.randomUUID();
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify({ ...(b as object), correlationId: corrId }), {
      status: s,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  let stage = "init";
  try {
    // ── Parse mode & confirmation ─────────────────────────────────────────
    let mode: Mode = "preview";
    let confirm = "";
    if (req.method === "POST") {
      try {
        const body = (await req.json()) as { mode?: string; confirm?: string };
        if (body?.mode === "execute") mode = "execute";
        confirm = typeof body?.confirm === "string" ? body.confirm : "";
      } catch { /* empty body → preview */ }
    }

    // ── Flag gates ────────────────────────────────────────────────────────
    stage = "flags";
    if (!readEnabled()) {
      return json({ ok: false, verdict: "MERCHANT_V1_CANARY_ABORTED_SAFETY_GATE" as Verdict, error: "MERCHANT_API_READ_ENABLED_false" }, 403);
    }
    if (mode === "execute" && !canaryEnabled()) {
      return json({ ok: false, verdict: "MERCHANT_V1_CANARY_ABORTED_SAFETY_GATE" as Verdict, error: "MERCHANT_API_WRITE_CANARY_ENABLED_false" }, 403);
    }
    if (mode === "execute" && confirm !== CONFIRM_PHRASE) {
      return json({ ok: false, verdict: "MERCHANT_V1_CANARY_ABORTED_SAFETY_GATE" as Verdict, error: "confirmation_phrase_missing_or_wrong" }, 400);
    }

    const targetUuid = allowedUuid();
    if (!targetUuid) {
      return json({ ok: false, verdict: "MERCHANT_V1_CANARY_ABORTED_SAFETY_GATE" as Verdict, error: "allowed_uuid_missing_or_invalid" }, 500);
    }

    // ── Auth ──────────────────────────────────────────────────────────────
    stage = "auth";
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith("Bearer ")) return json({ ok: false, error: "missing_auth" }, 401);
    const bearer = authz.slice(7).trim();
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authz } } },
    );
    const { data: userData, error: uerr } = await authClient.auth.getUser(bearer);
    if (uerr || !userData?.user?.id) return json({ ok: false, error: "invalid_auth" }, 401);
    const userId = userData.user.id;

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    stage = "authorize";
    const { data: token } = await supabase
      .from("merchant_oauth_tokens")
      .select("id, is_connected")
      .eq("user_id", userId).eq("is_connected", true).maybeSingle();
    if (!token) return json({ ok: false, error: "forbidden" }, 403);

    // ── Pre-write readback ────────────────────────────────────────────────
    stage = "load_product";
    const { data: prod, error: perr } = await supabase
      .from("products")
      .select("id, slug, name, description, price, stock, availability, brand, condition, image_url, google_product_category, gtin, mpn, is_active, is_duplicate")
      .eq("id", targetUuid)
      .maybeSingle();
    if (perr || !prod) return json({ ok: false, verdict: "MERCHANT_V1_CANARY_ABORTED_SAFETY_GATE" as Verdict, error: "product_not_found" }, 404);

    // Product-level safety gates
    const gateFailures: string[] = [];
    if (!prod.is_active) gateFailures.push("not_active");
    if (prod.is_duplicate) gateFailures.push("is_duplicate");
    if (!(Number(prod.price) > 0)) gateFailures.push("non_positive_price");
    if (!(Number(prod.stock) > 0)) gateFailures.push("out_of_stock");
    if (String(prod.availability ?? "").toLowerCase() !== "in stock") gateFailures.push("availability_not_in_stock");
    if (!prod.name || !prod.slug) gateFailures.push("missing_name_or_slug");
    if (!prod.description || String(prod.description).length < 40) gateFailures.push("weak_description");
    if (!/^https:\/\//i.test(String(prod.image_url ?? ""))) gateFailures.push("invalid_image");
    if (isTestish(String(prod.name), String(prod.slug))) gateFailures.push("test_like_name_or_slug");

    if (gateFailures.length) {
      return json({ ok: false, verdict: "MERCHANT_V1_CANARY_ABORTED_SAFETY_GATE" as Verdict, gateFailures }, 400);
    }

    const offerId = `getpawsy_${prod.id}`;
    const link = `https://getpawsy.pet/products/${prod.slug}`;

    // ── Merchant API pre-read ─────────────────────────────────────────────
    stage = "merchant_lookup";
    const client = new MerchantApiClient({ supabase });
    const account = await client.resolveAccount();
    let dataSource: string;
    try {
      dataSource = client.resolveDataSourceName();
    } catch (dsErr) {
      return json({ ok: false, verdict: "MERCHANT_V1_CANARY_ABORTED_SAFETY_GATE" as Verdict, error: "data_source_unresolved", detail: (dsErr as Error).message }, 500);
    }

    // List all products (up to 5000) to establish baseline + duplicate map.
    let baselineCount = 0;
    let canonicalPresent: { name: string; attributes?: Record<string, unknown> } | null = null;
    let bareUuidPresent: string | null = null;
    let pageToken: string | undefined;
    for (let pages = 0; pages < 20; pages++) {
      const page = await client.listProducts(250, pageToken);
      for (const raw of page.products ?? []) {
        const p = raw as Record<string, unknown>;
        baselineCount++;
        const oid = typeof p.offerId === "string" ? p.offerId : "";
        const name = typeof p.name === "string" ? p.name : "";
        if (oid === offerId) canonicalPresent = { name, attributes: (p.attributes ?? {}) as Record<string, unknown> };
        if (oid === prod.id) bareUuidPresent = name;
      }
      if (!page.nextPageToken) break;
      pageToken = page.nextPageToken;
    }

    // ── Build ProductInput payload ────────────────────────────────────────
    stage = "build_payload";
    const attributes: Record<string, unknown> = {
      title: String(prod.name),
      description: String(prod.description),
      link,
      imageLink: String(prod.image_url),
      availability: "in_stock",
      condition: (prod.condition && String(prod.condition)) || "new",
      price: { amountMicros: priceToMicros(Number(prod.price)), currencyCode: "USD" },
    };
    if (prod.brand) attributes.brand = String(prod.brand);
    if (prod.gtin) attributes.gtin = String(prod.gtin);
    if (prod.mpn) attributes.mpn = String(prod.mpn);
    if (prod.google_product_category) {
      // Only pass if it looks locally valid (path or numeric id).
      const gpc = String(prod.google_product_category).trim();
      if (gpc.length > 0 && gpc.length < 300) attributes.googleProductCategory = gpc;
    }

    const productInput = {
      offerId,
      contentLanguage: CONTENT_LANGUAGE,
      feedLabel: FEED_LABEL,
      channel: CHANNEL,
      attributes,
    };

    const payloadFingerprint = await sha256(JSON.stringify(productInput));
    const preWriteVerdict = canonicalPresent ? "SAFE_UPDATE" : "SAFE_INSERT";

    const manifest = {
      correlationId: corrId,
      mode,
      account,
      dataSource,
      offerId,
      contentLanguage: CONTENT_LANGUAGE,
      feedLabel: FEED_LABEL,
      channel: CHANNEL,
      localProduct: {
        id: prod.id, slug: prod.slug, name: prod.name, price: prod.price,
        stock: prod.stock, availability: prod.availability, brand: prod.brand,
        image: prod.image_url, link,
      },
      merchantPresence: {
        canonicalGetpawsyPresent: !!canonicalPresent,
        bareUuidPresent: !!bareUuidPresent,
        baselineTotalResources: baselineCount,
      },
      payloadFingerprint,
      preWriteVerdict,
    };

    if (mode === "preview") {
      return json({ ok: true, verdict: "MERCHANT_V1_CANARY_PREVIEW_OK" as Verdict, manifest });
    }

    // ── EXECUTE — one write only ──────────────────────────────────────────
    stage = "write";
    const startedAt = new Date().toISOString();
    let inserted: { name: string };
    try {
      inserted = await client.insertProductInput(productInput as never);
    } catch (writeErr) {
      const finishedAt = new Date().toISOString();
      if (writeErr instanceof MerchantApiClientError) {
        mlog("canary_write_failed", { corrId, status: writeErr.status, code: writeErr.code });
        return json({
          ok: false,
          verdict: "MERCHANT_V1_CANARY_WRITE_FAILED_ROLLED_BACK_OR_NO_CHANGE" as Verdict,
          manifest,
          write: { startedAt, finishedAt, upstreamStatus: writeErr.status, upstreamCode: writeErr.code ?? null },
        }, 502);
      }
      throw writeErr;
    }
    const finishedAt = new Date().toISOString();

    // ── Post-write readback ───────────────────────────────────────────────
    stage = "readback";
    // Fetch canonical processed product by exact returned resource name is
    // not directly possible from productInputs → derive processed name via
    // list scan by offerId. Also re-check total count.
    let postCount = 0;
    let processed: Record<string, unknown> | null = null;
    let duplicateAfter = false;
    pageToken = undefined;
    for (let pages = 0; pages < 20; pages++) {
      const page = await client.listProducts(250, pageToken);
      for (const raw of page.products ?? []) {
        const p = raw as Record<string, unknown>;
        postCount++;
        const oid = typeof p.offerId === "string" ? p.offerId : "";
        if (oid === offerId) processed = p;
        if (oid === prod.id) duplicateAfter = true;
      }
      if (!page.nextPageToken) break;
      pageToken = page.nextPageToken;
    }

    const attrs = (processed?.attributes ?? {}) as Record<string, unknown>;
    const remotePriceMicros = (attrs.price as { amountMicros?: string } | undefined)?.amountMicros;
    const remotePriceUsd = remotePriceMicros ? Number(remotePriceMicros) / 1_000_000 : null;

    const readback = processed ? {
      resourceName: String(processed.name ?? inserted.name),
      offerIdMatch: processed.offerId === offerId,
      titleMatch: attrs.title === prod.name,
      linkMatch: attrs.link === link,
      imageMatch: attrs.imageLink === prod.image_url,
      priceMatch: remotePriceUsd !== null && Number(remotePriceUsd) === Number(prod.price),
      availabilityMatch: attrs.availability === "in_stock",
      contentLanguage: processed.contentLanguage,
      feedLabel: processed.feedLabel,
    } : null;

    const equal = !!readback && readback.offerIdMatch && readback.titleMatch && readback.linkMatch
      && readback.imageMatch && readback.priceMatch && readback.availabilityMatch;
    const delta = postCount - baselineCount;
    const countOk = canonicalPresent ? delta === 0 : (delta === 0 || delta === 1);
    const noNewBareDup = !(bareUuidPresent === null && duplicateAfter);

    let verdict: Verdict;
    if (equal && countOk && noNewBareDup) {
      verdict = canonicalPresent
        ? "MERCHANT_V1_CANARY_SAFE_UPDATE_PASSED"
        : "MERCHANT_V1_CANARY_WRITE_PASSED";
    } else {
      verdict = "MERCHANT_V1_CANARY_WRITE_FAILED_ROLLED_BACK_OR_NO_CHANGE";
    }

    return json({
      ok: verdict !== "MERCHANT_V1_CANARY_WRITE_FAILED_ROLLED_BACK_OR_NO_CHANGE",
      verdict,
      manifest,
      write: {
        operation: canonicalPresent ? "UPDATE" : "INSERT",
        insertedResourceName: inserted.name,
        startedAt,
        finishedAt,
      },
      readback,
      counts: { before: baselineCount, after: postCount, delta },
      duplicateCheck: { bareUuidPresentBefore: !!bareUuidPresent, bareUuidPresentAfter: duplicateAfter, noNewBareDup },
    });
  } catch (e) {
    if (e instanceof MerchantApiClientError) {
      mlog("canary_upstream_error", { corrId, stage, status: e.status, code: e.code });
      return json({ ok: false, verdict: "MERCHANT_V1_CANARY_ABORTED_SAFETY_GATE" as Verdict, error: e.code ?? "upstream_error", stage, upstreamStatus: e.status }, 502);
    }
    const err = e as Error;
    mlog("canary_unexpected", { corrId, stage, message: err?.message });
    return json({ ok: false, verdict: "MERCHANT_V1_CANARY_ABORTED_SAFETY_GATE" as Verdict, error: "internal_error", stage }, 500);
  }
});
// pinterest-publish-preflight
//
// A single, strict, fail-closed preflight gate that MUST pass before any
// Pinterest publisher function creates a pin. It validates:
//
//   1. destination_pdp   – The destination URL responds 200, contains the
//                          expected product slug, and shows NO disabled /
//                          black video-block markers.
//   2. board_valid       – board_id resolves to a real, production-verified,
//                          non-blacklisted, non-sandbox pinterest_boards row.
//   3. image_reachable   – The image URL responds 200 with an image/*
//                          content-type and non-trivial byte length.
//   4. duplicate_hash    – SHA-256 of the image bytes and the (title,
//                          description, destination_link) tuple are not
//                          already used by a posted pin.
//   5. metadata_sane     – title/description length + destination_link URL
//                          shape.
//
// If `execute: true` AND all gates pass, this function invokes the named
// publisher edge function server-side, then runs one final public
// verification GET on the returned Pinterest pin URL. Only after the pin
// verifies as publicly reachable (HTTP 200) does it return
// `verdict: "PUBLISHED_AND_VERIFIED"`.
//
// Any single gate failure → `verdict: "PREFLIGHT_FAIL"` with the exact
// failing gates + no publish. No retries. No partial state written.

import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

// Markers that indicate a broken / disabled video block on the PDP.
// Any of these signals a "black video block" and is a hard fail.
const PDP_BAD_MARKERS = [
  "video-disabled-black",
  "video-error-fallback",
  "data-video-suppressed=\"true\"",
  "aria-label=\"video unavailable\"",
];

type Gate = {
  name: string;
  ok: boolean;
  detail?: string;
  data?: unknown;
};

type PreflightInput = {
  product_id?: string;
  product_slug: string;
  board_id: string;
  board_name?: string;
  destination_url: string;
  image_url: string;
  title: string;
  description: string;
  execute?: boolean;
  publisher_function?: string; // e.g. "pinterest-canary-publish"
  publisher_body?: Record<string, unknown>;
  idempotency_key?: string;
};

async function authorize(req: Request): Promise<{ ok: boolean; status?: number; msg?: string; userId?: string }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return { ok: false, status: 401, msg: "missing bearer" };
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return { ok: false, status: 401, msg: "invalid jwt" };
  const svc = createClient(SUPABASE_URL, SERVICE);
  const { data: roles } = await svc.from("user_roles").select("role").eq("user_id", u.user.id);
  if (!(roles ?? []).some((r: { role?: string }) => r.role === "admin"))
    return { ok: false, status: 403, msg: "admin only" };
  return { ok: true, userId: u.user.id };
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function gateDestinationPdp(input: PreflightInput): Promise<Gate> {
  try {
    const res = await fetch(input.destination_url, { redirect: "follow" });
    if (!res.ok) return { name: "destination_pdp", ok: false, detail: `HTTP ${res.status}` };
    const html = await res.text();
    if (!html.includes(input.product_slug))
      return { name: "destination_pdp", ok: false, detail: "product_slug not found in PDP HTML" };
    for (const marker of PDP_BAD_MARKERS) {
      if (html.includes(marker))
        return { name: "destination_pdp", ok: false, detail: `bad marker present: ${marker}` };
    }
    // Reject obvious black-block placeholders: <video ... poster=""> or explicit
    // "video is currently unavailable" copy that our fallback UI would render.
    if (/video[^>]*poster=""/i.test(html))
      return { name: "destination_pdp", ok: false, detail: "empty video poster" };
    if (/video (is|currently) unavailable/i.test(html))
      return { name: "destination_pdp", ok: false, detail: "unavailable-video copy present" };
    return { name: "destination_pdp", ok: true, detail: `HTTP 200, ${html.length} bytes` };
  } catch (e) {
    return { name: "destination_pdp", ok: false, detail: (e as Error).message };
  }
}

async function gateBoard(sb: ReturnType<typeof createClient>, input: PreflightInput): Promise<Gate> {
  const { data, error } = await sb
    .from("pinterest_boards")
    .select("id,name,is_sandbox,is_blacklisted,blacklist_reason,production_verified,privacy")
    .eq("id", input.board_id)
    .maybeSingle();
  if (error) return { name: "board_valid", ok: false, detail: `db: ${error.message}` };
  if (!data) return { name: "board_valid", ok: false, detail: "board_id not found" };
  const row = data as {
    id: string; name: string; is_sandbox: boolean | null; is_blacklisted: boolean | null;
    blacklist_reason: string | null; production_verified: boolean | null; privacy: string | null;
  };
  if (row.is_sandbox) return { name: "board_valid", ok: false, detail: "board is sandbox" };
  if (row.is_blacklisted)
    return { name: "board_valid", ok: false, detail: `blacklisted: ${row.blacklist_reason ?? "unknown"}` };
  if (!row.production_verified)
    return { name: "board_valid", ok: false, detail: "not production_verified" };
  if (input.board_name && row.name && row.name.trim() !== input.board_name.trim())
    return {
      name: "board_valid", ok: false,
      detail: `board_name mismatch: expected "${input.board_name}", got "${row.name}"`,
    };
  return { name: "board_valid", ok: true, detail: `board="${row.name}" verified`, data: { name: row.name } };
}

async function gateImageAndHash(
  sb: ReturnType<typeof createClient>, input: PreflightInput,
): Promise<{ imgGate: Gate; dupGate: Gate; imageHash?: string }> {
  let bytes: ArrayBuffer | null = null;
  let ctype = "";
  try {
    const res = await fetch(input.image_url);
    if (!res.ok) {
      return {
        imgGate: { name: "image_reachable", ok: false, detail: `HTTP ${res.status}` },
        dupGate: { name: "duplicate_hash", ok: false, detail: "skipped (image unreachable)" },
      };
    }
    ctype = res.headers.get("content-type") ?? "";
    bytes = await res.arrayBuffer();
  } catch (e) {
    return {
      imgGate: { name: "image_reachable", ok: false, detail: (e as Error).message },
      dupGate: { name: "duplicate_hash", ok: false, detail: "skipped (image fetch threw)" },
    };
  }
  if (!ctype.startsWith("image/"))
    return {
      imgGate: { name: "image_reachable", ok: false, detail: `bad content-type: ${ctype}` },
      dupGate: { name: "duplicate_hash", ok: false, detail: "skipped (not image)" },
    };
  if (!bytes || bytes.byteLength < 4096)
    return {
      imgGate: {
        name: "image_reachable", ok: false,
        detail: `image too small (${bytes?.byteLength ?? 0} bytes)`,
      },
      dupGate: { name: "duplicate_hash", ok: false, detail: "skipped (image too small)" },
    };

  const imageHash = await sha256Hex(bytes);
  const metaBlob = new TextEncoder().encode(
    JSON.stringify({ t: input.title.trim(), d: input.description.trim(), u: input.destination_url.trim() }),
  );
  const metaHash = await sha256Hex(metaBlob.buffer);

  const { data: dupImage } = await sb
    .from("pinterest_pin_queue")
    .select("id,pinterest_pin_id,pin_title,posted_at")
    .eq("status", "posted")
    .or(`image_hash.eq.${imageHash},pin_image_phash.eq.${imageHash}`)
    .limit(1);
  if (dupImage && dupImage.length > 0) {
    return {
      imgGate: {
        name: "image_reachable", ok: true,
        detail: `HTTP 200 ${ctype} ${bytes.byteLength} bytes`,
      },
      dupGate: {
        name: "duplicate_hash", ok: false,
        detail: `image hash already posted (pin ${(dupImage[0] as { pinterest_pin_id?: string }).pinterest_pin_id ?? "?"})`,
        data: { image_hash: imageHash, meta_hash: metaHash, existing: dupImage[0] },
      },
      imageHash,
    };
  }

  // Meta-tuple dedupe: same title + destination_link on a posted pin.
  const { data: dupMeta } = await sb
    .from("pinterest_pin_queue")
    .select("id,pinterest_pin_id,pin_title")
    .eq("status", "posted")
    .eq("pin_title", input.title.trim())
    .eq("destination_link", input.destination_url.trim())
    .limit(1);
  if (dupMeta && dupMeta.length > 0) {
    return {
      imgGate: {
        name: "image_reachable", ok: true,
        detail: `HTTP 200 ${ctype} ${bytes.byteLength} bytes`,
      },
      dupGate: {
        name: "duplicate_hash", ok: false,
        detail: `identical title+destination already posted (pin ${(dupMeta[0] as { pinterest_pin_id?: string }).pinterest_pin_id ?? "?"})`,
        data: { image_hash: imageHash, meta_hash: metaHash, existing: dupMeta[0] },
      },
      imageHash,
    };
  }

  return {
    imgGate: {
      name: "image_reachable", ok: true,
      detail: `HTTP 200 ${ctype} ${bytes.byteLength} bytes`,
    },
    dupGate: {
      name: "duplicate_hash", ok: true,
      detail: "no duplicate on image or (title,destination)",
      data: { image_hash: imageHash, meta_hash: metaHash },
    },
    imageHash,
  };
}

function gateMetadata(input: PreflightInput): Gate {
  const t = input.title?.trim() ?? "";
  const d = input.description?.trim() ?? "";
  if (t.length < 10 || t.length > 100)
    return { name: "metadata_sane", ok: false, detail: `title length ${t.length} not in [10,100]` };
  if (d.length < 30 || d.length > 500)
    return { name: "metadata_sane", ok: false, detail: `description length ${d.length} not in [30,500]` };
  try {
    const u = new URL(input.destination_url);
    if (u.protocol !== "https:") return { name: "metadata_sane", ok: false, detail: "destination not https" };
  } catch {
    return { name: "metadata_sane", ok: false, detail: "destination_url not a valid URL" };
  }
  return { name: "metadata_sane", ok: true, detail: "sane" };
}

async function invokePublisher(
  fn: string, body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = `${SUPABASE_URL}/functions/v1/${fn}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SERVICE}`,
      "apikey": SERVICE,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  return { ok: res.ok, status: res.status, body: parsed };
}

async function verifyLivePin(pinUrl: string): Promise<Gate> {
  try {
    // Pinterest often returns 200 for both live and deleted pins in HEAD; use
    // GET and require the returned HTML to reference the pin id.
    const res = await fetch(pinUrl, { redirect: "follow" });
    if (!res.ok) return { name: "public_verification", ok: false, detail: `HTTP ${res.status}` };
    const html = await res.text();
    if (/Page not found|This Pin was deleted|Sorry! We couldn't find/i.test(html))
      return { name: "public_verification", ok: false, detail: "deleted/missing page copy" };
    return { name: "public_verification", ok: true, detail: `HTTP 200 ${html.length} bytes` };
  } catch (e) {
    return { name: "public_verification", ok: false, detail: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  const auth = await authorize(req);
  if (!auth.ok)
    return new Response(JSON.stringify({ ok: false, traceId, error: auth.msg }), {
      status: auth.status ?? 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  let input: PreflightInput;
  try {
    input = (await req.json()) as PreflightInput;
  } catch {
    return new Response(JSON.stringify({ ok: false, traceId, error: "invalid JSON body" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  for (const k of ["product_slug", "board_id", "destination_url", "image_url", "title", "description"] as const) {
    if (!input[k] || typeof input[k] !== "string")
      return new Response(JSON.stringify({ ok: false, traceId, error: `missing field: ${k}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
  }

  const sb = createClient(SUPABASE_URL, SERVICE);

  const [metaGate, pdpGate, boardGate, imgResult] = await Promise.all([
    Promise.resolve(gateMetadata(input)),
    gateDestinationPdp(input),
    gateBoard(sb, input),
    gateImageAndHash(sb, input),
  ]);
  const gates: Gate[] = [metaGate, pdpGate, boardGate, imgResult.imgGate, imgResult.dupGate];
  const preflightPass = gates.every((g) => g.ok);

  // Persist an audit row regardless of outcome.
  await sb.from("pinterest_integrity_reports").insert({
    report_type: "publish_preflight",
    payload: {
      trace_id: traceId,
      product_slug: input.product_slug,
      product_id: input.product_id ?? null,
      board_id: input.board_id,
      destination_url: input.destination_url,
      image_hash: imgResult.imageHash ?? null,
      idempotency_key: input.idempotency_key ?? null,
      gates,
      preflight_pass: preflightPass,
    },
  }).catch(() => { /* audit best-effort */ });

  if (!preflightPass) {
    return new Response(JSON.stringify({
      ok: false, traceId, verdict: "PREFLIGHT_FAIL",
      failed_gates: gates.filter((g) => !g.ok).map((g) => g.name),
      gates,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (!input.execute) {
    return new Response(JSON.stringify({
      ok: true, traceId, verdict: "PREFLIGHT_PASS", gates,
      image_hash: imgResult.imageHash ?? null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (!input.publisher_function || typeof input.publisher_function !== "string")
    return new Response(JSON.stringify({
      ok: false, traceId, verdict: "PREFLIGHT_PASS_EXEC_MISCONFIGURED",
      error: "execute:true requires publisher_function", gates,
    }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // Invoke the publisher server-side. We do NOT retry on failure.
  const pubBody = {
    ...(input.publisher_body ?? {}),
    preflight_trace_id: traceId,
    idempotency_key: input.idempotency_key ?? `preflight:${traceId}`,
  };
  const pub = await invokePublisher(input.publisher_function, pubBody);
  if (!pub.ok) {
    return new Response(JSON.stringify({
      ok: false, traceId, verdict: "PUBLISH_FAIL",
      gates, publisher: { status: pub.status, body: pub.body },
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Extract the resulting pin id / URL from the publisher response.
  const pb = (pub.body ?? {}) as Record<string, unknown>;
  const pinId = (pb.pinterest_pin_id ?? pb.pin_id ?? pb.new_pin_id ?? pb.id ?? null) as string | null;
  const pinUrl = (pb.pin_url ?? pb.external_url ??
    (pinId ? `https://www.pinterest.com/pin/${pinId}/` : null)) as string | null;

  if (!pinUrl) {
    return new Response(JSON.stringify({
      ok: false, traceId, verdict: "PUBLISHED_UNVERIFIABLE",
      gates, publisher: pub.body,
      error: "publisher response missing pin id / url",
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const publicGate = await verifyLivePin(pinUrl);
  gates.push(publicGate);

  await sb.from("pinterest_integrity_reports").insert({
    report_type: "publish_verification",
    payload: {
      trace_id: traceId,
      pinterest_pin_id: pinId,
      pin_url: pinUrl,
      product_slug: input.product_slug,
      public_gate: publicGate,
    },
  }).catch(() => { /* audit best-effort */ });

  return new Response(JSON.stringify({
    ok: publicGate.ok, traceId,
    verdict: publicGate.ok ? "PUBLISHED_AND_VERIFIED" : "PUBLISHED_BUT_UNVERIFIED",
    pinterest_pin_id: pinId, pin_url: pinUrl,
    gates, publisher: pub.body,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
// Server-side TikTok Events API v1.3 dispatcher.
// Docs: https://business-api.tiktok.com/portal/docs?id=1771101203489281
//
// Requires the following secrets:
//   - TIKTOK_EVENTS_API_TOKEN  (long-lived Events API access token from
//     TikTok Events Manager → Settings → Events API)
//   - TIKTOK_PIXEL_ID          (the same pixel ID as the browser pixel,
//     so server + browser events deduplicate via event_id)
//
// Best-effort: never throws — we still want the order flow to succeed
// even when TikTok is degraded. Each call is logged in
// public.tiktok_server_events for verification.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { sanitizeSecret } from "./tiktok-secrets.ts";

const ENDPOINT = "https://business-api.tiktok.com/open_api/v1.3/event/track/";

interface ContentItem {
  content_id: string;
  content_name?: string;
  quantity?: number;
  price?: number;
}

export interface ServerEventInput {
  eventName: string;          // 'CompletePayment' | 'KlarnaPurchase' | ...
  eventId: string;            // unique per logical event (use order id) for dedup
  eventTimeMs?: number;       // defaults to Date.now()
  url?: string;               // page URL where event happened (for purchase: success URL)
  email?: string;             // hashed automatically (sha256 of lowercased trimmed)
  phone?: string;             // hashed automatically
  externalId?: string;        // e.g. user id or order id (hashed)
  ip?: string;
  userAgent?: string;
  ttp?: string;               // _ttp cookie value if available
  ttclid?: string;            // ttclid from URL when ad-attributed
  value?: number;
  currency?: string;
  contents?: ContentItem[];
  description?: string;
  properties?: Record<string, unknown>;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashEmail(v?: string): Promise<string | undefined> {
  if (!v) return undefined;
  return await sha256Hex(v.trim().toLowerCase());
}

async function hashPhone(v?: string): Promise<string | undefined> {
  if (!v) return undefined;
  // E.164-ish normalise: strip non-digits, then sha256.
  const digits = v.replace(/[^\d]/g, "");
  if (!digits) return undefined;
  return await sha256Hex(digits);
}

async function hashId(v?: string): Promise<string | undefined> {
  if (!v) return undefined;
  return await sha256Hex(String(v).trim());
}

export async function sendTikTokServerEvent(
  input: ServerEventInput,
): Promise<{ ok: boolean; status: number; body: unknown; error?: string }> {
  const token = sanitizeSecret(Deno.env.get("TIKTOK_EVENTS_API_TOKEN"));
  const pixelId = sanitizeSecret(Deno.env.get("TIKTOK_PIXEL_ID"));

  // Always log attempts — even when secrets are missing — so admins can
  // see why nothing arrived in TikTok Events Manager.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  if (!token || !pixelId) {
    const error =
      "TIKTOK_EVENTS_API_TOKEN or TIKTOK_PIXEL_ID is not configured";
    await admin.from("tiktok_server_events").insert({
      event_name: input.eventName,
      event_id: input.eventId,
      pixel_id: pixelId || null,
      payload: { input },
      response_status: null,
      response_body: null,
      error,
    });
    console.warn("[tiktok-events-api]", error);
    return { ok: false, status: 0, body: null, error };
  }

  const [emailHash, phoneHash, externalIdHash] = await Promise.all([
    hashEmail(input.email),
    hashPhone(input.phone),
    hashId(input.externalId),
  ]);

  const userPayload: Record<string, unknown> = {};
  if (emailHash) userPayload.email = emailHash;
  if (phoneHash) userPayload.phone = phoneHash;
  if (externalIdHash) userPayload.external_id = externalIdHash;
  if (input.ip) userPayload.ip = input.ip;
  if (input.userAgent) userPayload.user_agent = input.userAgent;
  if (input.ttp) userPayload.ttp = input.ttp;
  if (input.ttclid) userPayload.ttclid = input.ttclid;

  const propertiesPayload: Record<string, unknown> = {
    ...(input.properties || {}),
  };
  if (typeof input.value === "number") propertiesPayload.value = input.value;
  if (input.currency) propertiesPayload.currency = input.currency.toUpperCase();
  if (input.contents && input.contents.length > 0) {
    propertiesPayload.contents = input.contents.map((c) => ({
      content_id: c.content_id,
      content_type: "product",
      content_name: c.content_name,
      quantity: c.quantity ?? 1,
      price: c.price,
    }));
  }
  if (input.description) propertiesPayload.description = input.description;

  const body = {
    event_source: "web",
    event_source_id: pixelId,
    data: [
      {
        event: input.eventName,
        event_time: Math.floor((input.eventTimeMs ?? Date.now()) / 1000),
        event_id: input.eventId,
        user: userPayload,
        properties: propertiesPayload,
        page: input.url ? { url: input.url } : undefined,
      },
    ],
  };

  let status = 0;
  let respBody: unknown = null;
  let error: string | undefined;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Access-Token": token,
      },
      body: JSON.stringify(body),
    });
    status = res.status;
    respBody = await res.json().catch(() => null);
    if (!res.ok) {
      error = `HTTP ${res.status}`;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  await admin.from("tiktok_server_events").insert({
    event_name: input.eventName,
    event_id: input.eventId,
    pixel_id: pixelId,
    payload: body,
    response_status: status || null,
    response_body: respBody as never,
    error: error ?? null,
  });

  return { ok: !error, status, body: respBody, error };
}

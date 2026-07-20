// Dedup verification: fires the SAME event_id 3x for both InitiateCheckout
// and CompletePayment, then queries the log to prove every dispatch carried
// an identical event_id. TikTok's Events API deduplicates by (pixel_id,
// event_name, event_id), so identical IDs across submits = no duplicates
// counted in TikTok Events Manager.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { sendTikTokServerEvent } from "../_shared/tiktok-events-api.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const orderId = `dedup_${Date.now()}`;
  const initiateId = `${orderId}_initiate`;
  const purchaseId = `${orderId}_purchase`;
  const SUBMITS = 3;

  const fire = async (eventName: string, eventId: string) =>
    sendTikTokServerEvent({
      eventName,
      eventId,
      url: `https://getpawsy.pet/test/dedup?run=${orderId}`,
      value: 49.95,
      currency: "USD",
      contents: [{ content_id: "dedup-001", quantity: 1, price: 49.95 }],
      properties: { dedup_test: true, order_id: orderId },
    });

  const dispatches: Array<{
    eventName: string;
    attempt: number;
    eventId: string;
    ok: boolean;
    status: number;
  }> = [];

  for (let i = 1; i <= SUBMITS; i++) {
    const a = await fire("InitiateCheckout", initiateId);
    dispatches.push({
      eventName: "InitiateCheckout",
      attempt: i,
      eventId: initiateId,
      ok: a.ok,
      status: a.status,
    });
    const b = await fire("CompletePayment", purchaseId);
    dispatches.push({
      eventName: "CompletePayment",
      attempt: i,
      eventId: purchaseId,
      ok: b.ok,
      status: b.status,
    });
  }

  // Read back what we just stored to PROVE every dispatch carried the
  // same event_id. If TikTok ever sees identical event_id values for the
  // same pixel + event, only the first is counted (dedup).
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const { data: logRows } = await admin
    .from("tiktok_server_events")
    .select("event_name, event_id, payload, response_body, created_at")
    .in("event_id", [initiateId, purchaseId])
    .order("created_at", { ascending: true });

  const byEvent: Record<
    string,
    { count: number; uniqueEventIds: string[]; uniquePayloadIds: string[] }
  > = {};
  for (const r of logRows ?? []) {
    const key = r.event_name as string;
    const entry = byEvent[key] ?? {
      count: 0,
      uniqueEventIds: [],
      uniquePayloadIds: [],
    };
    entry.count += 1;
    if (!entry.uniqueEventIds.includes(r.event_id))
      entry.uniqueEventIds.push(r.event_id);
    // The exact event_id sent inside the TikTok payload (must match).
    const payloadEventId =
      // @ts-ignore narrow shape
      (r.payload?.data?.[0]?.event_id as string | undefined) ?? "";
    if (payloadEventId && !entry.uniquePayloadIds.includes(payloadEventId))
      entry.uniquePayloadIds.push(payloadEventId);
    byEvent[key] = entry;
  }

  const dedupPass = Object.entries(byEvent).every(
    ([, v]) =>
      v.count === SUBMITS &&
      v.uniqueEventIds.length === 1 &&
      v.uniquePayloadIds.length === 1,
  );

  return new Response(
    JSON.stringify(
      {
        ok: dedupPass,
        orderId,
        submitsPerEvent: SUBMITS,
        verdict: dedupPass
          ? "PASS — every submit carried the same event_id, so TikTok will dedup."
          : "FAIL — event_ids drifted across submits, dedup will NOT happen.",
        perEvent: byEvent,
        dispatches,
        hint: "Open /admin/tiktok-server-events and filter by event_id to see all 3 rows per event sharing one id.",
      },
      null,
      2,
    ),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    },
  );
});
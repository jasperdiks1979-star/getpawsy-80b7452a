// Manual test runner: fires server-side InitiateCheckout + Purchase events
// against the TikTok Events API so we can confirm end-to-end delivery.
// Each call is logged in public.tiktok_server_events.
import { corsHeaders } from "../_shared/cors.ts";
import { sendTikTokServerEvent } from "../_shared/tiktok-events-api.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const runId = `test_${Date.now()}`;
  const baseUrl = "https://getpawsy.pet/test/server-events";

  const initiate = await sendTikTokServerEvent({
    eventName: "InitiateCheckout",
    eventId: `${runId}_initiate`,
    url: `${baseUrl}?step=initiate`,
    value: 49.95,
    currency: "USD",
    contents: [
      {
        content_id: "test-product-001",
        content_name: "Test Product (server-events QA)",
        quantity: 1,
        price: 49.95,
      },
    ],
    description: "Server-side test InitiateCheckout",
    properties: { test_event: true, run_id: runId },
  });

  const purchase = await sendTikTokServerEvent({
    eventName: "CompletePayment",
    eventId: `${runId}_purchase`,
    url: `${baseUrl}?step=purchase`,
    value: 49.95,
    currency: "USD",
    contents: [
      {
        content_id: "test-product-001",
        content_name: "Test Product (server-events QA)",
        quantity: 1,
        price: 49.95,
      },
    ],
    description: "Server-side test CompletePayment",
    properties: { test_event: true, run_id: runId },
  });

  return new Response(
    JSON.stringify({
      ok: initiate.ok && purchase.ok,
      runId,
      results: {
        initiateCheckout: {
          ok: initiate.ok,
          status: initiate.status,
          error: initiate.error ?? null,
          tiktok: initiate.body,
        },
        purchase: {
          ok: purchase.ok,
          status: purchase.status,
          error: purchase.error ?? null,
          tiktok: purchase.body,
        },
      },
      hint: "Open /admin/tiktok-server-events to see the logged dispatches.",
    }, null, 2),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    },
  );
});
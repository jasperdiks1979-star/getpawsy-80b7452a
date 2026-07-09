// Reads Merchant Center data via the existing merchant_oauth_tokens flow.
// Read-only: only surfaces products + issues; never mutates Merchant.
import { corsHeaders, jsonResponse, serviceClient, startRun, finishRun, markConnection } from "../_shared/geip-common.ts";

async function getMerchantToken(sb: any): Promise<{ token?: string; merchantId?: string; blocker?: string }> {
  const { data } = await sb
    .from("merchant_oauth_tokens")
    .select("access_token, refresh_token, expires_at, merchant_id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { blocker: "check_oauth" };
  if (data.expires_at && new Date(data.expires_at).getTime() > Date.now() + 60000) {
    return { token: data.access_token, merchantId: data.merchant_id };
  }
  // Refresh
  const clientId = Deno.env.get("MERCHANT_GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("MERCHANT_GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret || !data.refresh_token) return { blocker: "check_oauth" };
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      grant_type: "refresh_token", refresh_token: data.refresh_token,
    }),
  });
  const j = await r.json();
  if (!r.ok) return { blocker: "provider_error" };
  await sb.from("merchant_oauth_tokens").update({
    access_token: j.access_token,
    expires_at: new Date(Date.now() + (j.expires_in ?? 3600) * 1000).toISOString(),
  }).eq("merchant_id", data.merchant_id);
  return { token: j.access_token, merchantId: data.merchant_id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = serviceClient();
  const runId = await startRun(sb, "merchant");

  const { token, merchantId, blocker } = await getMerchantToken(sb);
  if (!token || !merchantId) {
    await markConnection(sb, "merchant", "waiting_for_auth", blocker ?? "check_oauth");
    await finishRun(sb, runId, { status: "waiting_for_auth", blocker: blocker ?? "check_oauth" });
    return jsonResponse({ ok: false, blocker: blocker ?? "check_oauth" });
  }

  // Fetch productstatuses (Content API v2.1)
  let rows = 0;
  try {
    const url = `https://shoppingcontent.googleapis.com/content/v2.1/${merchantId}/productstatuses?maxResults=250`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 300));
    const batch = (j.resources ?? []).flatMap((p: any) => {
      return (p.destinationStatuses ?? [{ destination: "Shopping", status: p.status }]).map((d: any) => ({
        merchant_id: String(merchantId),
        product_id: p.productId,
        title: p.title,
        status: (d.status ?? "").toLowerCase(),
        destination: d.destination ?? "Shopping",
        disapproval_reasons: p.itemLevelIssues?.filter((i: any) => i.servability === "disapproved") ?? [],
        warnings: p.itemLevelIssues?.filter((i: any) => i.severity === "warning") ?? [],
        captured_at: new Date().toISOString(),
        raw: p,
      }));
    });
    if (batch.length) {
      await sb.from("geip_merchant_products").upsert(batch, {
        onConflict: "merchant_id,product_id,destination",
      });
      rows = batch.length;
    }
  } catch (e) {
    await markConnection(sb, "merchant", "error", "provider_error");
    await finishRun(sb, runId, { status: "error", blocker: "provider_error", error: String(e) });
    return jsonResponse({ ok: false, error: String(e) });
  }

  await markConnection(sb, "merchant", "ready");
  await finishRun(sb, runId, { status: "ok", rows_ingested: rows });
  return jsonResponse({ ok: true, rows });
});
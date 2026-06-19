import "https://deno.land/x/xhr@0.1.0/mod.ts";

const RENDER_API = "https://api.render.com/v1";
const KEY = Deno.env.get("RENDER_API_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function rApi(path: string) {
  const r = await fetch(`${RENDER_API}${path}`, {
    headers: { Authorization: `Bearer ${KEY}`, Accept: "application/json" },
  });
  const text = await r.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, body: json };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (!KEY) {
    return new Response(JSON.stringify({ ok: false, error: "RENDER_API_KEY missing" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const services = await rApi("/services?limit=100");
  const svcArr = Array.isArray(services.body) ? services.body : [];
  const candidates = svcArr
    .map((s: any) => s.service ?? s)
    .filter((s: any) => {
      const name = (s?.name ?? "").toLowerCase();
      return name.includes("worker") || name.includes("render");
    });

  const out: any = { ok: true, totalServices: svcArr.length, candidateCount: candidates.length, services: [] };

  for (const svc of candidates) {
    const id = svc.id;
    const [deploys, events] = await Promise.all([
      rApi(`/services/${id}/deploys?limit=3`),
      rApi(`/services/${id}/events?limit=10`),
    ]);
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const logsResp = await fetch(
      `${RENDER_API}/logs?ownerId=${svc.ownerId}&resource=${id}&limit=200&startTime=${encodeURIComponent(since)}`,
      { headers: { Authorization: `Bearer ${KEY}`, Accept: "application/json" } },
    );
    const logsText = await logsResp.text();
    let logBody: unknown;
    try { logBody = JSON.parse(logsText); } catch { logBody = logsText; }

    out.services.push({
      id,
      name: svc.name,
      type: svc.type,
      suspended: svc.suspended,
      imagePath: svc.imagePath ?? svc.serviceDetails?.image?.imagePath,
      url: svc.serviceDetails?.url,
      serviceDetails: svc.serviceDetails,
      latestDeploys: deploys.body,
      recentEvents: events.body,
      logs: { status: logsResp.status, body: logBody },
    });
  }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});

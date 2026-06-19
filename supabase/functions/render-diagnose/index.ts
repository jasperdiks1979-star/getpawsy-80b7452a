const RENDER_API = "https://api.render.com/v1";
const KEY = Deno.env.get("RENDER_API_KEY") ?? "";
const cors = { "Access-Control-Allow-Origin": "*" };

async function rApi(path: string) {
  const r = await fetch(`${RENDER_API}${path}`, {
    headers: { Authorization: `Bearer ${KEY}`, Accept: "application/json" },
  });
  const t = await r.text();
  try { return { status: r.status, body: JSON.parse(t) }; }
  catch { return { status: r.status, body: t }; }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const svcId = url.searchParams.get("service");
  if (svcId) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const svc = await rApi(`/services/${svcId}`);
    const deploys = await rApi(`/services/${svcId}/deploys?limit=3`);
    const events = await rApi(`/services/${svcId}/events?limit=15`);
    const ownerId = (svc.body as any)?.ownerId;
    const logs = await rApi(`/logs?ownerId=${ownerId}&resource=${svcId}&limit=300&startTime=${encodeURIComponent(since)}`);
    return new Response(JSON.stringify({ svc: svc.body, deploys: deploys.body, events: events.body, logs: logs.body }, null, 2),
      { headers: { ...cors, "Content-Type": "application/json" } });
  }
  const all = await rApi("/services?limit=100");
  const arr = Array.isArray(all.body) ? all.body : [];
  const summary = arr.map((s: any) => {
    const x = s.service ?? s;
    return {
      id: x.id, name: x.name, type: x.type, suspended: x.suspended,
      env: x.serviceDetails?.env, runtime: x.serviceDetails?.runtime,
      imagePath: x.imagePath ?? x.serviceDetails?.image?.imagePath,
      createdAt: x.createdAt, updatedAt: x.updatedAt,
    };
  });
  return new Response(JSON.stringify({ count: summary.length, services: summary }, null, 2),
    { headers: { ...cors, "Content-Type": "application/json" } });
});

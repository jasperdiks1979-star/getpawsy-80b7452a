import { corsHeaders, svc, ok, err, requireAdmin } from "../_shared/acos-common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;
  const traceId = crypto.randomUUID();
  try {
    const sb = svc();
    const { data: alerts } = await sb.from("acos_alerts")
      .select("id,severity,source,title,detail,created_at")
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .limit(20);
    let sent = 0;
    for (const a of alerts ?? []) {
      const { error } = await sb.from("guardian_notification_queue").insert({
        severity: a.severity,
        channel: "ops",
        title: `[ACOS] ${a.title}`,
        body: JSON.stringify(a.detail ?? {}),
        metadata: { source: a.source, acos_alert_id: a.id },
      });
      if (!error) {
        await sb.from("acos_alerts").update({ status: "notified" }).eq("id", a.id);
        sent++;
      }
    }
    return ok({ traceId, sent, queued: (alerts ?? []).length });
  } catch (e) {
    return err(String((e as Error).message ?? e), 500, traceId);
  }
});
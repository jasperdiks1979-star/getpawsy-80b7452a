import { admin, cors, jsonResp } from "../_shared/creative-helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = admin();
    const since = new Date(Date.now() - 14 * 86400_000).toISOString();
    const { data: assets } = await sb
      .from("creative_assets")
      .select("id, product_id, created_at, status")
      .gte("created_at", since)
      .in("status", ["queued", "published", "approved"]);

    let snapshots = 0;
    let fatigueFlags = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const a of assets ?? []) {
      // Pull funnel events tagged with this creative_asset_id
      const { count: clicks } = await sb
        .from("pinterest_funnel_events")
        .select("id", { count: "exact", head: true })
        .eq("meta->>creative_asset_id", a.id);

      const verdict = (clicks ?? 0) === 0 ? "neutral" : (clicks! > 20 ? "winner" : "neutral");
      await sb.from("creative_performance_snapshots").upsert({
        creative_asset_id: a.id,
        snapshot_date: today,
        clicks: clicks ?? 0,
        verdict,
      }, { onConflict: "creative_asset_id,snapshot_date" });
      snapshots++;
    }

    // Fatigue: hooks used >3 times in last 30d
    const { data: hookGroups } = await sb.rpc("execute_sql", {}).then(() => ({ data: null })).catch(() => ({ data: null }));
    // fallback: count via standard query
    const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data: recent } = await sb.from("creative_assets").select("hook_hash, hook").gte("created_at", since30).not("hook_hash", "is", null);
    const counts = new Map<string, { count: number; hook: string }>();
    for (const r of recent ?? []) {
      const c = counts.get(r.hook_hash!) ?? { count: 0, hook: r.hook ?? "" };
      c.count++;
      counts.set(r.hook_hash!, c);
    }
    for (const [hash, { count, hook }] of counts) {
      if (count > 3) {
        await sb.from("creative_fatigue_flags").upsert({
          scope: "hook", scope_key: hash, reason: `used_${count}_times`,
          detail: { hook, count }, active: true,
        }, { onConflict: "scope,scope_key" } as any).catch(() => {});
        fatigueFlags++;
      }
    }

    return jsonResp({ ok: true, snapshots, fatigueFlags });
  } catch (e) {
    return jsonResp({ ok: false, error: String(e) }, 500);
  }
});
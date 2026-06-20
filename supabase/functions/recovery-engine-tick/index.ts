import { sbAdmin, jsonResponse, RECOVERY_CORS } from "../_shared/recovery-engine.ts";

// Self-healing orchestrator. Cron every 15 minutes. Flow:
// 1. Find protected SKUs with effective_global_stock = 0.
// 2. Re-audit worldwide.
// 3. If still 0 → run supplier-discovery.
// 4. If high-match candidate (≥85) found → auto-swap.
// 5. Else run product-replacement-finder; queue for admin review.
// 6. After all fail → deactivate and alert.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: RECOVERY_CORS });
  const startedAt = new Date().toISOString();
  const sb = sbAdmin();
  const counters = { scanned: 0, audited: 0, swapped: 0, replaced: 0, deactivated: 0, alerts: 0 };
  const details: any[] = [];

  try {
    const { data: targets } = await sb
      .from("winner_products")
      .select("product_id, score, signals")
      .eq("is_protected", true)
      .limit(150);

    const ids = (targets ?? []).map((t: any) => t.product_id);
    counters.scanned = ids.length;
    if (!ids.length) {
      const { data: run } = await sb.from("recovery_engine_runs").insert({
        trigger: "cron", ...counters, details: { note: "no targets" }, started_at: startedAt, finished_at: new Date().toISOString(),
      }).select("id").maybeSingle();
      return jsonResponse({ ok: true, runId: run?.id, ...counters });
    }

    const { data: prods } = await sb.from("products").select("id, name, effective_stock, is_active").in("id", ids);
    const lowStock = (prods ?? []).filter((p: any) => (p.effective_stock ?? 0) === 0);

    for (const p of lowStock as any[]) {
      const log: any = { id: p.id, name: p.name };
      try {
        // Step 1: re-audit
        const auditRes = await sb.functions.invoke("product-global-audit", { body: { productId: p.id } });
        counters.audited++;
        const auditQty = auditRes?.data?.results?.[0]?.globalQty ?? 0;
        log.audit = { qty: auditQty };
        if (auditQty > 0) { log.action = "recovered_audit"; details.push(log); continue; }

        // Step 2: supplier discovery
        const disc = await sb.functions.invoke("supplier-discovery", { body: { productId: p.id } });
        const top = (disc?.data?.top ?? [])[0];
        log.discovery = { found: disc?.data?.found ?? 0, topScore: top?.match_score ?? 0 };

        if (top && top.match_score >= 85 && top.global_qty > 0) {
          // Step 3: auto-swap
          const { data: cand } = await sb.from("product_supplier_candidates")
            .select("id").eq("product_id", p.id).eq("supplier_product_id", top.supplier_product_id).maybeSingle();
          if (cand) {
            await sb.functions.invoke("supplier-swap", {
              body: { productId: p.id, candidateId: cand.id, reason: "auto_recovery" },
            });
            counters.swapped++; log.action = "auto_swapped";
            details.push(log); continue;
          }
        }

        // Step 4: replacement
        const repl = await sb.functions.invoke("product-replacement-finder", { body: { productId: p.id } });
        if (repl?.data?.found && (repl.data.matchPct ?? 0) >= 90) {
          counters.replaced++; log.action = "replacement_queued"; log.matchPct = repl.data.matchPct;
        } else {
          // Step 5: deactivate + alert
          await sb.from("products").update({ is_active: false }).eq("id", p.id);
          counters.deactivated++; counters.alerts++; log.action = "deactivated";
          await sb.from("monitoring_alerts").upsert({
            alert_key: `winner_lost:${p.id}`,
            severity: "high",
            category: "recovery_engine",
            title: `Protected winner lost: ${p.name}`,
            description: JSON.stringify({ product_id: p.id, audit: log }).slice(0, 1000),
            is_active: true,
            last_detected_at: new Date().toISOString(),
          }, { onConflict: "alert_key" }).then(() => {}).catch(() => {});
        }
      } catch (e) {
        log.error = String(e);
      }
      details.push(log);
    }

    const { data: run } = await sb.from("recovery_engine_runs").insert({
      trigger: "cron", ...counters, details: { items: details },
      started_at: startedAt, finished_at: new Date().toISOString(),
    }).select("id").maybeSingle();

    return jsonResponse({ ok: true, runId: run?.id, ...counters });
  } catch (e) {
    await sb.from("recovery_engine_runs").insert({
      trigger: "cron", ...counters, details: { error: String(e), items: details },
      started_at: startedAt, finished_at: new Date().toISOString(),
    });
    return jsonResponse({ ok: false, error: String(e), ...counters }, 500);
  }
});
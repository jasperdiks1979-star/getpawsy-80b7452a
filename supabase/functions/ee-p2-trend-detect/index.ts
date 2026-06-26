import { corsHeaders, svc, requireAdmin, ok, err } from "../_shared/ee-p2-common.ts";

// Observation-only trend detector. Reads from existing Pinterest performance tables
// and writes signals to ee_p2_trend_signals. Never mutates production data.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const sb = svc();
  const stats = { product_trending: 0, declining: 0, viral: 0, category_growth: 0, pinterest_velocity: 0, seasonal: 0 };

  try {
    // 1. Pinterest pin velocity (impressions/saves last 7d vs prior 7d)
    const { data: perf } = await sb
      .from("pcie2_pin_performance")
      .select("product_id, impressions, saves, outbound_clicks, observed_at")
      .gte("observed_at", new Date(Date.now() - 14 * 86400000).toISOString())
      .limit(5000);

    const byProd: Record<string, { recent: number; prior: number; saves: number }> = {};
    const cut = Date.now() - 7 * 86400000;
    for (const r of perf ?? []) {
      const pid = String((r as any).product_id ?? "");
      if (!pid) continue;
      const t = new Date((r as any).observed_at).getTime();
      const imp = Number((r as any).impressions ?? 0);
      const sv = Number((r as any).saves ?? 0);
      byProd[pid] ??= { recent: 0, prior: 0, saves: 0 };
      if (t >= cut) { byProd[pid].recent += imp; byProd[pid].saves += sv; }
      else byProd[pid].prior += imp;
    }

    const inserts: any[] = [];
    for (const [pid, v] of Object.entries(byProd)) {
      const velocity = v.prior > 0 ? (v.recent - v.prior) / v.prior : (v.recent > 0 ? 1 : 0);
      if (velocity >= 0.4 && v.recent >= 100) {
        inserts.push({ signal_type: "pinterest_velocity", entity_type: "product", entity_id: pid, score: Math.min(1, velocity), velocity, confidence: Math.min(1, v.recent / 1000), evidence: { recent: v.recent, prior: v.prior } });
        stats.pinterest_velocity++;
        if (velocity >= 1.5) { inserts.push({ signal_type: "viral", entity_type: "product", entity_id: pid, score: Math.min(1, velocity / 3), velocity, confidence: 0.8, evidence: { recent: v.recent } }); stats.viral++; }
        inserts.push({ signal_type: "product_trending", entity_type: "product", entity_id: pid, score: Math.min(1, velocity), velocity, momentum: v.saves, confidence: 0.7, evidence: { saves: v.saves } });
        stats.product_trending++;
      } else if (velocity <= -0.3 && v.prior >= 200) {
        inserts.push({ signal_type: "declining", entity_type: "product", entity_id: pid, score: Math.abs(velocity), velocity, confidence: 0.7, evidence: { recent: v.recent, prior: v.prior } });
        stats.declining++;
      }
    }

    // 2. Category growth from products table
    const { data: cats } = await sb.from("products").select("category, id").not("category", "is", null).limit(5000);
    const catProds: Record<string, Set<string>> = {};
    for (const c of cats ?? []) {
      const cat = String((c as any).category);
      catProds[cat] ??= new Set();
      catProds[cat].add(String((c as any).id));
    }
    for (const [cat, set] of Object.entries(catProds)) {
      if (set.size < 3) continue;
      let totalRecent = 0;
      for (const pid of set) totalRecent += byProd[pid]?.recent ?? 0;
      if (totalRecent > 500) {
        inserts.push({ signal_type: "category_growth", entity_type: "category", entity_id: cat, entity_label: cat, score: Math.min(1, totalRecent / 5000), confidence: 0.6, evidence: { products: set.size, impressions: totalRecent } });
        stats.category_growth++;
      }
    }

    // 3. Seasonal: month-based heuristic
    const month = new Date().getUTCMonth(); // 0..11
    const seasonal = [
      { months: [10, 11], theme: "holiday_gifting", score: 0.9 },
      { months: [11, 0], theme: "new_year_pets", score: 0.7 },
      { months: [4, 5], theme: "summer_outdoor", score: 0.7 },
      { months: [8, 9], theme: "back_to_school_pets", score: 0.5 },
    ];
    for (const s of seasonal) if (s.months.includes(month)) {
      inserts.push({ signal_type: "seasonal", entity_type: "keyword", entity_id: s.theme, entity_label: s.theme, score: s.score, confidence: 0.7, window_days: 30, evidence: { month } });
      stats.seasonal++;
    }

    if (inserts.length) {
      const chunks = [];
      for (let i = 0; i < inserts.length; i += 500) chunks.push(inserts.slice(i, i + 500));
      for (const c of chunks) await sb.from("ee_p2_trend_signals").insert(c);
    }

    return ok({ stats, inserted: inserts.length });
  } catch (e) {
    return err(String(e));
  }
});
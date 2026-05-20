import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Product = {
  id: string;
  name: string;
  slug: string | null;
  category: string | null;
  image_url: string | null;
  images: string[] | null;
  price: number | null;
  cost_price: number | null;
  stock: number | null;
  is_active: boolean | null;
  primary_keyword: string | null;
  quality_score: number | null;
  primary_species: string | null;
};

function imageQualityScore(p: Product): number {
  const imgs = (p.images ?? []).filter(Boolean);
  const base = p.image_url ? 8 : 0;
  const extra = Math.min(12, imgs.length * 3);
  return base + extra; // 0-20
}

function priceScore(price: number | null): number {
  if (!price || price <= 0) return 0;
  if (price >= 25 && price <= 120) return 15;
  if (price > 120 && price <= 250) return 10;
  if (price < 25) return 6;
  return 4;
}

function marginScore(price: number | null, cost: number | null): number {
  if (!price || !cost || cost <= 0) return 6; // unknown — neutral
  const margin = (price - cost) / price;
  if (margin >= 0.6) return 15;
  if (margin >= 0.4) return 11;
  if (margin >= 0.25) return 7;
  return 3;
}

function categoryDemandScore(cat: string | null): number {
  if (!cat) return 4;
  const c = cat.toLowerCase();
  const hot = ["litter", "bed", "tree", "carrier", "feeder", "grooming", "fountain"];
  if (hot.some((h) => c.includes(h))) return 10;
  return 6;
}

function pinterestFit(p: Product): number {
  // Visual lifestyle categories index higher on Pinterest
  const c = (p.category ?? "").toLowerCase();
  const visual = ["bed", "tree", "tower", "fountain", "feeder", "carrier", "house", "litter"];
  return visual.some((v) => c.includes(v)) ? 10 : 6;
}

function tiktokFit(p: Product): number {
  // Problem-solver / wow-factor categories
  const c = (p.category ?? "").toLowerCase();
  const wow = ["automatic", "smart", "self-cleaning", "fountain", "litter", "feeder"];
  return wow.some((v) => c.includes(v)) || /smart|auto|self/.test((p.name ?? "").toLowerCase()) ? 10 : 5;
}

function pageQualityScore(p: Product): number {
  let s = 0;
  if (p.primary_keyword) s += 3;
  if ((p.quality_score ?? 0) >= 70) s += 5;
  else if ((p.quality_score ?? 0) >= 40) s += 3;
  if (p.slug) s += 2;
  return s; // 0-10
}

function availabilityScore(p: Product): number {
  if (!p.is_active) return 0;
  if ((p.stock ?? 0) > 0) return 10;
  return 4; // dropship default
}

function pickAngle(p: Product): { angle: string; hook: string; channel: string } {
  const name = (p.name ?? "").toLowerCase();
  const cat = (p.category ?? "").toLowerCase();
  if (/litter|smell|odor/.test(name + cat)) {
    return { angle: "odor_control", hook: "The smell finally stopped.", channel: "pinterest" };
  }
  if (/feeder|fountain|auto|smart|self/.test(name + cat)) {
    return { angle: "time_saving", hook: "I stopped doing this twice a day.", channel: "pinterest" };
  }
  if (/bed|tree|tower|house/.test(name + cat)) {
    return { angle: "cozy_lifestyle", hook: "She picked this spot on day one.", channel: "pinterest" };
  }
  return { angle: "problem_solution", hook: "This quietly fixed it.", channel: "pinterest" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const today = new Date().toISOString().slice(0, 10);

    const { data: products, error: pErr } = await sb
      .from("products")
      .select("id,name,slug,category,image_url,images,price,cost_price,stock,is_active,primary_keyword,quality_score,primary_species")
      .eq("is_active", true)
      .eq("is_duplicate", false)
      .limit(1000);
    if (pErr) throw pErr;

    // Prior pinterest performance per product (last 30d)
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data: perfRows } = await sb
      .from("pinterest_pin_performance")
      .select("product_id, saves, clicks, impressions")
      .gte("created_at", since)
      .limit(5000);

    const perfByProduct = new Map<string, { saves: number; clicks: number; impressions: number }>();
    for (const r of perfRows ?? []) {
      const id = (r as { product_id: string | null }).product_id;
      if (!id) continue;
      const cur = perfByProduct.get(id) ?? { saves: 0, clicks: 0, impressions: 0 };
      cur.saves += Number((r as { saves?: number }).saves ?? 0);
      cur.clicks += Number((r as { clicks?: number }).clicks ?? 0);
      cur.impressions += Number((r as { impressions?: number }).impressions ?? 0);
      perfByProduct.set(id, cur);
    }

    let scored = 0;
    const upserts: any[] = [];

    for (const p of (products ?? []) as Product[]) {
      const reasons: { label: string; points: number }[] = [];
      const img = imageQualityScore(p); reasons.push({ label: "image_quality", points: img });
      const price = priceScore(p.price); reasons.push({ label: "price", points: price });
      const margin = marginScore(p.price, p.cost_price); reasons.push({ label: "margin", points: margin });
      const demand = categoryDemandScore(p.category); reasons.push({ label: "category_demand", points: demand });
      const pin = pinterestFit(p); reasons.push({ label: "pinterest_fit", points: pin });
      const tt = tiktokFit(p); reasons.push({ label: "tiktok_fit", points: tt });
      const page = pageQualityScore(p); reasons.push({ label: "page_quality", points: page });
      const avail = availabilityScore(p); reasons.push({ label: "availability", points: avail });

      const perf = perfByProduct.get(p.id);
      let perfPoints = 0;
      if (perf) {
        const ctr = perf.impressions > 0 ? perf.clicks / perf.impressions : 0;
        perfPoints = Math.min(15, Math.round(perf.saves * 0.5 + perf.clicks * 1 + ctr * 200));
      }
      reasons.push({ label: "prior_performance", points: perfPoints });

      const raw = img + price + margin + demand + pin + tt + page + avail + perfPoints;
      // Normalize to 0-100 (max possible ~100)
      const score = Math.max(0, Math.min(100, Math.round(raw)));

      const { angle, hook, channel } = pickAngle(p);
      const confidence = Math.min(100, 40 + (perf ? 30 : 0) + (img >= 14 ? 15 : 0) + (page >= 5 ? 15 : 0));

      upserts.push({
        product_id: p.id,
        day: today,
        opportunity_score: score,
        reasons,
        recommended_channel: channel,
        recommended_angle: angle,
        recommended_hook: hook,
        confidence_score: confidence,
        signals: {
          image_count: (p.images ?? []).length,
          has_perf: !!perf,
          stock: p.stock ?? 0,
        },
      });
      scored++;
    }

    // Upsert in batches
    for (let i = 0; i < upserts.length; i += 500) {
      const chunk = upserts.slice(i, i + 500);
      const { error: uErr } = await sb
        .from("growth_product_scores")
        .upsert(chunk, { onConflict: "product_id,day" });
      if (uErr) throw uErr;
    }

    await sb.from("growth_events").insert({
      event_type: "scoring_run",
      trace_id: traceId,
      payload: { scored, day: today },
    });

    return new Response(
      JSON.stringify({ ok: true, traceId, scored, message: `Scored ${scored} products` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ ok: false, traceId, message: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }
});
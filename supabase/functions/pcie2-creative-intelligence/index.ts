import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

const PASS_THRESHOLD = 95;
const DIVERSITY_WINDOW = 50;

const FAMILIES = [
  "problem_solving","lifestyle","before_after","educational","buying_guide",
  "pet_happiness","training","home_inspiration","minimalist","luxury","funny",
  "seasonal","safety","travel","organization","interactive_play",
];

type QueueRow = {
  id: string; product_id: string; product_slug: string; headline: string | null;
  hook: string | null; image_url: string | null; destination_url: string | null;
  product_class: string | null; meta: any;
};
type Product = { id: string; name: string; category: string | null; description: string | null; primary_species: string | null };

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalize(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function jaccard(a: string, b: string): number {
  const A = new Set(normalize(a).split(" ").filter(Boolean));
  const B = new Set(normalize(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

async function loadBanned(sb: any): Promise<string[]> {
  const { data } = await sb.from("pcie2_ci_banned_phrases").select("phrase").eq("severity","hard_block");
  return (data ?? []).map((r: any) => r.phrase.toLowerCase());
}

function detectBanned(text: string, banned: string[]): string[] {
  const lower = text.toLowerCase();
  return banned.filter(p => lower.includes(p));
}

function detectFamily(headline: string, product: Product): string {
  const h = (headline ?? "").toLowerCase();
  const c = (product.category ?? "").toLowerCase();
  if (/holiday|christmas|gift|valentine|halloween|easter|summer|winter/.test(h)) return "seasonal";
  if (/before|after|transform|upgrade/.test(h)) return "before_after";
  if (/travel|road|car|trip/.test(h) || /carrier|stroller/.test(c)) return "travel";
  if (/train|teach|learn/.test(h)) return "training";
  if (/funny|laugh|silly/.test(h)) return "funny";
  if (/luxury|premium|elegant/.test(h)) return "luxury";
  if (/minimal|simple|clean/.test(h)) return "minimalist";
  if (/safe|safety|protect/.test(h)) return "safety";
  if (/play|toy|interactive/.test(h) || /toy/.test(c)) return "interactive_play";
  if (/organize|storage|tidy/.test(h)) return "organization";
  if (/home|room|decor|space/.test(h)) return "home_inspiration";
  if (/happy|joy|love/.test(h)) return "pet_happiness";
  if (/guide|how|tips|why/.test(h)) return "educational";
  if (/problem|fix|solve|stop/.test(h)) return "problem_solving";
  return "lifestyle";
}

function detectEmotion(h: string): string {
  const x = h.toLowerCase();
  if (/cozy|calm|peace|relax/.test(x)) return "calm";
  if (/fun|play|joy|happy/.test(x)) return "joy";
  if (/safe|protect|secure/.test(x)) return "security";
  if (/discover|explore|adventure/.test(x)) return "curiosity";
  if (/style|chic|modern/.test(x)) return "aspiration";
  return "neutral";
}

function detectAngle(h: string): string {
  const x = h.toLowerCase();
  if (x.startsWith("how ") || x.includes(" how ")) return "how_to";
  if (/why|reason/.test(x)) return "why";
  if (/best|top \d|favorite/.test(x)) return "listicle";
  if (/your |for your /.test(x)) return "direct_address";
  if (/\?$/.test(h)) return "question";
  return "statement";
}

async function callAI(prompt: string, system: string): Promise<string | null> {
  if (!LOVABLE_KEY) return null;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LOVABLE_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
        temperature: 0.7,
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.choices?.[0]?.message?.content ?? null;
  } catch { return null; }
}

async function aiRewrite(product: Product, prior: string, banned: string[], recent: string[]): Promise<string | null> {
  const sys = `You write Pinterest pin headlines for a US pet retailer. Rules:
- 6-12 words, natural English, no clickbait
- NEVER use medical/veterinary/clinical claims unless the product is explicitly medical
- FORBIDDEN phrases: ${banned.slice(0,30).join(", ")}
- Headline must match the actual product purpose
- Avoid generic AI fluff ("game changer", "must have", "ultimate")
- Avoid these recent headlines (do not repeat structure): ${recent.slice(0,10).join(" | ")}
Return ONLY the headline text, no quotes, no preamble.`;
  const usr = `Product: ${product.name}
Category: ${product.category ?? "pet"}
Species: ${product.primary_species ?? "unknown"}
Description: ${(product.description ?? "").slice(0, 400)}
Prior headline (rejected): ${prior}
Write ONE new Pinterest headline.`;
  const out = await callAI(usr, sys);
  if (!out) return null;
  return out.replace(/^["']|["']$/g, "").split("\n")[0].trim().slice(0, 110);
}

type Score = {
  overall: number; spam: number; trust: number; seo: number; novelty: number;
  ctr: number; save: number; outbound: number; recommendation: number;
  claim_risk: number; duplicate_similarity: number; category_consistency: number;
  brand_consistency: number; image_match: number;
  banned: string[]; reasons: string[]; family: string; emotion: string; angle: string;
};

function scoreCreative(headline: string, product: Product, banned: string[], recent: string[]): Score {
  const reasons: string[] = [];
  const bannedHits = detectBanned(headline, banned);
  const claim_risk = bannedHits.length > 0 ? 100 : 0;
  if (bannedHits.length) reasons.push(`banned:${bannedHits.join(",")}`);

  const wc = headline.trim().split(/\s+/).length;
  const lenOk = wc >= 5 && wc <= 14;
  if (!lenOk) reasons.push(`length:${wc}`);

  const hWords = new Set(normalize(headline).split(" "));
  const pWords = new Set(normalize(product.name + " " + (product.category ?? "")).split(" "));
  let overlap = 0; for (const w of hWords) if (pWords.has(w)) overlap++;
  const category_consistency = Math.min(100, Math.round((overlap / Math.max(1, hWords.size)) * 100) + 40);
  if (category_consistency < 60) reasons.push("low_category_match");

  const brand_consistency = /getpawsy|pawsy/i.test(headline) ? 100 : 90;
  const image_match = product.name ? 90 : 70;

  let maxSim = 0;
  for (const r of recent) { const s = jaccard(headline, r); if (s > maxSim) maxSim = s; }
  const duplicate_similarity = Math.round(maxSim * 100);
  if (duplicate_similarity > 60) reasons.push(`dup:${duplicate_similarity}`);

  const novelty = Math.max(0, 100 - duplicate_similarity);
  const spam = Math.min(100, claim_risk + (/!|FREE|BUY NOW/.test(headline) ? 30 : 0) + (duplicate_similarity > 70 ? 20 : 0));
  const trust = Math.max(0, 100 - claim_risk - (spam * 0.3));

  // SEO: contains product/category keyword + reasonable length
  const seo = Math.min(100, (category_consistency * 0.7) + (lenOk ? 30 : 0));

  // CTR/save/outbound heuristics
  const ctr = Math.round(0.6 * novelty + 0.3 * seo + 0.1 * (lenOk ? 100 : 0));
  const save = Math.round(0.5 * novelty + 0.4 * category_consistency + 0.1 * trust);
  const outbound = Math.round(0.5 * ctr + 0.3 * trust + 0.2 * seo);
  const recommendation = Math.round((trust + novelty + seo) / 3);

  const overall = claim_risk > 0 || !lenOk
    ? Math.min(60, Math.round((novelty + seo + trust) / 3))
    : Math.round(
        0.20 * novelty + 0.20 * seo + 0.20 * trust + 0.15 * category_consistency +
        0.10 * ctr + 0.10 * (100 - spam) + 0.05 * brand_consistency
      );

  return {
    overall, spam, trust, seo, novelty, ctr, save, outbound, recommendation,
    claim_risk, duplicate_similarity, category_consistency, brand_consistency, image_match,
    banned: bannedHits, reasons,
    family: detectFamily(headline, product),
    emotion: detectEmotion(headline),
    angle: detectAngle(headline),
  };
}

async function fetchRecent(sb: any): Promise<string[]> {
  const { data } = await sb
    .from("pcie2_publish_queue")
    .select("headline")
    .in("status", ["queued","publishing","ready"])
    .order("created_at", { ascending: false })
    .limit(DIVERSITY_WINDOW);
  return (data ?? []).map((r: any) => r.headline).filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const action = body.action ?? "rescore_ready";
  const dryRun = body.dry_run === true;
  const limit = Math.min(Number(body.limit ?? 200), 500);

  const banned = await loadBanned(sb);

  if (action === "score_one") {
    const headline = body.headline ?? "";
    const product: Product = body.product ?? { id:"", name:"", category:null, description:null, primary_species:null };
    const recent = await fetchRecent(sb);
    const s = scoreCreative(headline, product, banned, recent);
    return jsonResp({ ok: true, score: s, pass: s.overall >= PASS_THRESHOLD && s.banned.length === 0 });
  }

  // rescore_ready (default)
  const { data: run } = await sb.from("pcie2_ci_runs").insert({
    trigger: body.trigger ?? "manual",
    scope: action,
    status: "running",
  }).select().single();

  const { data: rows } = await sb
    .from("pcie2_publish_queue")
    .select("id,product_id,product_slug,headline,hook,image_url,destination_url,product_class,meta")
    .eq("status","ready")
    .limit(limit);

  const queue: QueueRow[] = rows ?? [];
  const productIds = [...new Set(queue.map(q => q.product_id))];
  const { data: products } = await sb
    .from("products")
    .select("id,name,category,description,primary_species")
    .in("id", productIds);
  const pMap = new Map<string, Product>();
  (products ?? []).forEach((p: any) => pMap.set(p.id, p));

  const recentList = await fetchRecent(sb);

  let passed = 0, rewritten = 0, rejected = 0;
  const scoresAcc: any[] = [];
  const sumScores: number[] = [];

  for (const row of queue) {
    const product = pMap.get(row.product_id);
    if (!product || !row.headline) {
      rejected++;
      scoresAcc.push({
        queue_row_id: row.id, product_id: row.product_id, product_slug: row.product_slug,
        headline: row.headline, overall_score: 0, rejected: true,
        reject_reasons: ["missing_product_or_headline"],
      });
      continue;
    }

    let current = row.headline;
    let score = scoreCreative(current, product, banned, recentList);
    let didRewrite = false;

    if (score.overall < PASS_THRESHOLD || score.banned.length > 0) {
      // Attempt rewrite up to 2x
      for (let i = 0; i < 2; i++) {
        const rewrite = await aiRewrite(product, current, banned, recentList);
        if (!rewrite) break;
        const ns = scoreCreative(rewrite, product, banned, recentList);
        if (ns.overall > score.overall) {
          current = rewrite; score = ns; didRewrite = true;
        }
        if (ns.overall >= PASS_THRESHOLD && ns.banned.length === 0) break;
      }
    }

    const pass = score.overall >= PASS_THRESHOLD && score.banned.length === 0;
    if (pass) {
      passed++;
      if (didRewrite && !dryRun) {
        recentList.unshift(current);
        await sb.from("pcie2_publish_queue").update({
          headline: current,
          quality_score: score.overall,
          meta: { ...(row.meta ?? {}), ci_v1: { family: score.family, emotion: score.emotion, angle: score.angle, rewritten: true } },
        }).eq("id", row.id);
        await sb.from("pcie2_ci_diversity_log").insert({
          signature: normalize(current), dimension: "headline", value: current, queue_row_id: row.id,
        });
        rewritten++;
      } else if (!dryRun) {
        await sb.from("pcie2_publish_queue").update({ quality_score: score.overall }).eq("id", row.id);
      }
    } else {
      rejected++;
      if (!dryRun) {
        await sb.from("pcie2_publish_queue").update({
          status: "rejected",
          reject_detail: `ci_v1: ${score.reasons.join("; ")}`,
          quality_score: score.overall,
        }).eq("id", row.id);
      }
    }

    sumScores.push(score.overall);
    scoresAcc.push({
      queue_row_id: row.id, product_id: row.product_id, product_slug: row.product_slug,
      headline: current, family: score.family, emotion: score.emotion, angle: score.angle,
      overall_score: score.overall, spam_score: score.spam, trust_score: score.trust,
      seo_score: score.seo, novelty_score: score.novelty,
      ctr_prediction: score.ctr, save_prediction: score.save, outbound_prediction: score.outbound,
      recommendation_probability: score.recommendation, claim_risk: score.claim_risk,
      duplicate_similarity: score.duplicate_similarity, category_consistency: score.category_consistency,
      brand_consistency: score.brand_consistency, image_match: score.image_match,
      rejected: !pass, reject_reasons: score.reasons, banned_phrases: score.banned,
      rewrite_applied: didRewrite,
    });
  }

  if (scoresAcc.length) {
    // chunk inserts to keep payload small
    for (let i = 0; i < scoresAcc.length; i += 50) {
      await sb.from("pcie2_ci_scores").insert(scoresAcc.slice(i, i + 50));
    }
  }

  const avg = sumScores.length ? sumScores.reduce((a,b)=>a+b,0) / sumScores.length : 0;
  await sb.from("pcie2_ci_runs").update({
    total_rows: queue.length, passed, rewritten, rejected,
    avg_score: avg, finished_at: new Date().toISOString(), status: "completed",
    notes: { dry_run: dryRun },
  }).eq("id", run.id);

  return jsonResp({ ok: true, run_id: run.id, totals: { total: queue.length, passed, rewritten, rejected, avg_score: avg }});
});
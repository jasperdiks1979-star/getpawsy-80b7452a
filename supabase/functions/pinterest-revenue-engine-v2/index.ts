// Pinterest Revenue Engine V2
// Actions:
//   seed       — generate ~50 templates per category/type via Lovable AI (idempotent)
//   tick       — drain pending replacement jobs, recombine templates, auto-publish, schedule 24h archive
//   archive    — archive originals where replacement is verified and 24h grace elapsed
//   dashboard  — return metrics for /admin/pinterest-revenue-engine-v2
//   run_nightly — seed top-up + tick(batch) + archive
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const PINTEREST_API = "https://api.pinterest.com/v5";

const BANNED_PHRASES = [
  "stop scooping every day", "stop scooping", "scooping?",
  "tired of", "see how", "read reviews",
];

const EMOTIONAL_ANGLES = [
  "curiosity", "urgency", "convenience", "luxury", "comfort",
  "problem_solving", "before_after", "pet_happiness", "cleaner_home",
  "travel_convenience", "premium_quality",
];

const CATEGORY_KEYS = [
  "cat_litter", "cat_tree", "cat_bed", "cat_toy", "cat_feeder",
  "dog_bed", "dog_harness", "dog_toy", "dog_grooming",
  "smart_gadget", "generic_pet",
];

// caps per the spec
const CAP_HEADLINE = 3;
const CAP_CTA = 5;
const CAP_ANGLE = 10;

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function hasBanned(s: string) { const l = s.toLowerCase(); return BANNED_PHRASES.some((b) => l.includes(b)); }

async function authorize(sb: any, req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace("Bearer ", "");
  if (token === SERVICE_KEY) return true;
  if (!token) return false;
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return false;
  const { data: r } = await sb.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
  return !!r;
}

// ─── Lovable AI: batch-generate templates ────────────────────────────────────
async function aiGenerate(category: string, type: string, count: number): Promise<string[]> {
  const typeBrief: Record<string, string> = {
    headline: `Pinterest pin headlines, 3-6 words, scroll-stopping, emotionally varied. Mix curiosity, urgency, convenience, luxury, comfort, problem-solving, before/after, pet happiness, cleaner home, travel convenience, premium quality.`,
    cta: `Pinterest call-to-action phrases, 2-4 words, varied tone. NEVER use "shop now", "click here", "tap to shop", "see more", "read reviews".`,
    description: `Pinterest pin descriptions, 1-2 sentences (max 180 chars), benefit-driven, US-native voice.`,
    hook: `Opening hook phrases, 3-7 words, varied emotional pull (problem, transformation, aspiration, social proof).`,
  };
  const sys = `You write Pinterest creative for a premium US pet product store (GetPawsy).
CATEGORY: ${category}. TYPE: ${type}. ${typeBrief[type]}
ABSOLUTELY BANNED phrases (zero tolerance, also no near-variants): ${BANNED_PHRASES.join(" / ")}.
No emoji, no hashtags, no ALL-CAPS, no quotation marks. Output ONLY a JSON array of ${count} unique strings.`;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_KEY}` },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: `Generate ${count} ${type} templates for ${category}. JSON array only.` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${await res.text().catch(() => "")}`);
  const j = await res.json();
  let txt: string = j?.choices?.[0]?.message?.content ?? "[]";
  txt = txt.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```$/, "").trim();
  const m = txt.match(/\[[\s\S]*\]/);
  if (m) txt = m[0];
  let arr: any[] = [];
  try { arr = JSON.parse(txt); } catch { arr = []; }
  return arr.filter((s) => typeof s === "string" && s.trim().length > 0 && !hasBanned(s)).map((s) => s.trim());
}

async function seedTemplates(sb: any, opts: { categories?: string[]; perType?: number } = {}) {
  const cats = opts.categories?.length ? opts.categories : CATEGORY_KEYS;
  const perType = opts.perType ?? 50;
  const types = ["headline", "cta", "description", "hook"];
  let totalInserted = 0;
  const errors: string[] = [];
  for (const cat of cats) {
    for (const type of types) {
      // skip if already have >=perType active
      const { count } = await sb.from("pinterest_v2_templates")
        .select("id", { count: "exact", head: true })
        .eq("category_key", cat).eq("template_type", type).eq("is_active", true);
      if ((count ?? 0) >= perType) continue;
      try {
        const need = perType - (count ?? 0);
        const items = await aiGenerate(cat, type, Math.min(need, 50));
        const rows = items.map((text) => ({
          category_key: cat,
          template_type: type,
          emotional_angle: pick(EMOTIONAL_ANGLES),
          text,
        }));
        if (rows.length) {
          const { error } = await sb.from("pinterest_v2_templates").upsert(rows, {
            onConflict: "category_key,template_type,text", ignoreDuplicates: true,
          });
          if (error) errors.push(`${cat}/${type}: ${error.message}`);
          else totalInserted += rows.length;
        }
        await sleep(400);
      } catch (e) {
        errors.push(`${cat}/${type}: ${(e as Error).message}`);
      }
    }
  }
  return { totalInserted, errors };
}

// ─── Live caps ───────────────────────────────────────────────────────────────
async function liveCount(sb: any, kind: "headline" | "overlay", text: string): Promise<number> {
  const { data } = await sb.from("pinterest_v2_live_usage").select("live_count")
    .eq("kind", kind).eq("key", text.toLowerCase()).maybeSingle();
  return Number(data?.live_count ?? 0);
}
async function liveAngleCount(sb: any, angle: string): Promise<number> {
  const { count } = await sb.from("pinterest_pin_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "posted")
    .gt("posted_at", new Date(Date.now() - 90 * 86400000).toISOString())
    .contains("meta", { v2: { angle } });
  return count ?? 0;
}

function detectCategory(slug: string, productName?: string): string {
  const s = `${slug} ${productName ?? ""}`.toLowerCase();
  if (/(litter|scoop)/.test(s)) return "cat_litter";
  if (/(cat\s*tree|condo|scratch)/.test(s)) return "cat_tree";
  if (/(cat).*bed|cave/.test(s)) return "cat_bed";
  if (/(cat).*toy|feather|laser/.test(s)) return "cat_toy";
  if (/(feeder|fountain|bowl).*cat|cat.*(feeder|fountain|bowl)/.test(s)) return "cat_feeder";
  if (/(dog).*bed|orthopedic|memory.foam/.test(s)) return "dog_bed";
  if (/harness|leash|collar/.test(s)) return "dog_harness";
  if (/(dog).*toy|chew|squeak/.test(s)) return "dog_toy";
  if (/groom|brush|clipper|nail/.test(s)) return "dog_grooming";
  if (/smart|camera|app|wifi|gps|sensor/.test(s)) return "smart_gadget";
  return "generic_pet";
}

async function pickTemplate(sb: any, category: string, type: string, angle?: string): Promise<string | null> {
  let q = sb.from("pinterest_v2_templates").select("text,emotional_angle")
    .eq("category_key", category).eq("template_type", type).eq("is_active", true).limit(50);
  if (angle) q = q.eq("emotional_angle", angle);
  const { data } = await q;
  const rows = (data || []) as { text: string; emotional_angle: string }[];
  if (!rows.length && angle) return pickTemplate(sb, category, type); // fallback w/o angle
  if (!rows.length && category !== "generic_pet") return pickTemplate(sb, "generic_pet", type);
  if (!rows.length) return null;
  return pick(rows).text;
}

// ─── Tick: publish one replacement job ──────────────────────────────────────
async function tickOne(sb: any): Promise<{ jobId?: string; published?: boolean; reason?: string; pinterest_pin_id?: string }> {
  // Take a job with a generated draft, not yet auto-published
  const { data: job } = await sb.from("pinterest_overlay_replacement_jobs")
    .select("*")
    .in("status", ["pending_indexing", "pending_creative"])
    .is("published_queue_id", null)
    .order("created_at", { ascending: true })
    .limit(1).maybeSingle();
  if (!job) return { reason: "no_jobs" };

  // Mark claimed
  await sb.from("pinterest_overlay_replacement_jobs")
    .update({ status: "v2_publishing", last_checked_at: new Date().toISOString() })
    .eq("id", job.id);

  // Find the first usable draft (or first draft id from replacement_draft_ids)
  const draftIds: string[] = Array.isArray(job.replacement_draft_ids) ? job.replacement_draft_ids : [];
  if (draftIds.length === 0) {
    await sb.from("pinterest_overlay_replacement_jobs").update({ status: "draft_generation_failed" }).eq("id", job.id);
    return { jobId: job.id, reason: "no_drafts" };
  }
  const { data: draft } = await sb.from("pinterest_pin_queue").select("*").in("id", draftIds)
    .eq("status", "draft").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!draft) {
    await sb.from("pinterest_overlay_replacement_jobs").update({ status: "no_usable_draft" }).eq("id", job.id);
    return { jobId: job.id, reason: "no_usable_draft" };
  }

  const category = detectCategory(draft.product_slug, draft.product_name);

  // Choose angle by rotation: find under-cap angle
  let chosenAngle: string | null = null;
  for (const a of [...EMOTIONAL_ANGLES].sort(() => Math.random() - 0.5)) {
    if ((await liveAngleCount(sb, a)) < CAP_ANGLE) { chosenAngle = a; break; }
  }
  if (!chosenAngle) chosenAngle = pick(EMOTIONAL_ANGLES);

  // Pick templates with caps
  let headline = "", cta = "", description = "", hook = "";
  for (let i = 0; i < 12; i++) {
    const cand = await pickTemplate(sb, category, "headline", chosenAngle);
    if (!cand) break;
    if (hasBanned(cand)) continue;
    if ((await liveCount(sb, "headline", cand)) >= CAP_HEADLINE) continue;
    headline = cand; break;
  }
  for (let i = 0; i < 8; i++) {
    const cand = await pickTemplate(sb, category, "cta", chosenAngle);
    if (!cand) break;
    if (hasBanned(cand)) continue;
    if ((await liveCount(sb, "overlay", cand)) >= CAP_CTA) continue;
    cta = cand; break;
  }
  description = (await pickTemplate(sb, category, "description", chosenAngle)) ?? draft.pin_description;
  hook = (await pickTemplate(sb, category, "hook", chosenAngle)) ?? "";

  if (!headline) {
    await sb.from("pinterest_overlay_replacement_jobs").update({ status: "cap_exhausted_headline" }).eq("id", job.id);
    return { jobId: job.id, reason: "headline_cap_exhausted" };
  }
  if (hasBanned(headline) || hasBanned(description) || hasBanned(cta)) {
    await sb.from("pinterest_overlay_replacement_jobs").update({ status: "banned_phrase_blocked" }).eq("id", job.id);
    return { jobId: job.id, reason: "banned_phrase" };
  }

  // Rewrite draft with V2 copy
  const meta = { ...(draft.meta || {}), v2: { angle: chosenAngle, category, headline, cta, hook } };
  const { error: upErr } = await sb.from("pinterest_pin_queue").update({
    pin_title: headline.slice(0, 95),
    pin_description: `${hook ? hook + " — " : ""}${description}`.slice(0, 480),
    overlay_text: cta,
    status: "queued",
    priority: "high",
    approved_at: new Date().toISOString(),
    meta,
  }).eq("id", draft.id);
  if (upErr) {
    await sb.from("pinterest_overlay_replacement_jobs").update({ status: "draft_update_failed", notes: { error: upErr.message } }).eq("id", job.id);
    return { jobId: job.id, reason: upErr.message };
  }

  // Force publish
  const pubRes = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-publish-now`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    body: JSON.stringify({ mode: "pin", pinId: draft.id }),
  });
  const pubJson: any = await pubRes.json().catch(() => ({}));
  const ok = pubJson?.ok !== false && (pubJson?.pinterest_pin_id || pubJson?.pin_id || pubJson?.id);

  // Re-read draft for pinterest_pin_id
  const { data: after } = await sb.from("pinterest_pin_queue").select("pinterest_pin_id,status").eq("id", draft.id).maybeSingle();
  const ppid = after?.pinterest_pin_id || pubJson?.pinterest_pin_id || null;

  if (!ppid) {
    await sb.from("pinterest_overlay_replacement_jobs").update({
      status: "publish_failed",
      notes: { publish_response: pubJson, after_status: after?.status },
      emotional_angle: chosenAngle, headline_used: headline, cta_used: cta,
    }).eq("id", job.id);
    return { jobId: job.id, reason: "no_pin_id" };
  }

  const now = new Date();
  const archiveAt = new Date(now.getTime() + 24 * 3600 * 1000);
  await sb.from("pinterest_overlay_replacement_jobs").update({
    status: "published_awaiting_archive",
    auto_publish: true,
    published_queue_id: draft.id,
    published_pin_id: ppid,
    published_at: now.toISOString(),
    verified_at: now.toISOString(),
    archive_eligible_at: archiveAt.toISOString(),
    emotional_angle: chosenAngle,
    headline_used: headline,
    cta_used: cta,
  }).eq("id", job.id);

  return { jobId: job.id, published: true, pinterest_pin_id: ppid };
}

async function getPinterestToken(sb: any): Promise<string | null> {
  const { data } = await sb.from("pinterest_connection").select("access_token").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return data?.access_token ?? null;
}

async function archiveDue(sb: any, limit = 50) {
  const token = await getPinterestToken(sb);
  const { data: due } = await sb.from("pinterest_overlay_replacement_jobs")
    .select("id, legacy_pinterest_pin_id, legacy_queue_id")
    .eq("status", "published_awaiting_archive")
    .lte("archive_eligible_at", new Date().toISOString())
    .is("archived_at", null)
    .limit(limit);
  let ok = 0, fail = 0;
  for (const row of (due || [])) {
    let deleted = false;
    if (token && row.legacy_pinterest_pin_id) {
      try {
        const r = await fetch(`${PINTEREST_API}/pins/${row.legacy_pinterest_pin_id}`, {
          method: "DELETE", headers: { Authorization: `Bearer ${token}` },
        });
        deleted = r.ok || r.status === 404;
      } catch { deleted = false; }
    }
    await sb.from("pinterest_overlay_replacement_jobs").update({
      status: deleted ? "archived" : "archive_failed",
      archived_at: deleted ? new Date().toISOString() : null,
    }).eq("id", row.id);
    if (row.legacy_queue_id && deleted) {
      await sb.from("pinterest_pin_queue").update({ status: "archived" }).eq("id", row.legacy_queue_id);
    }
    deleted ? ok++ : fail++;
  }
  return { archived: ok, failed: fail, considered: (due || []).length };
}

async function dashboard(sb: any) {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [postedAgg, jobAgg, topHeadlines, recentRuns] = await Promise.all([
    sb.from("pinterest_pin_performance").select("impressions,outbound_clicks,saves").gt("date", since.slice(0,10)),
    sb.from("pinterest_overlay_replacement_jobs").select("status"),
    sb.from("pinterest_v2_live_usage").select("*").eq("kind", "headline").order("live_count", { ascending: false }).limit(15),
    sb.from("pinterest_v2_engine_runs").select("*").order("created_at", { ascending: false }).limit(20),
  ]);

  const perf = postedAgg.data || [];
  const impressions = perf.reduce((s: number, r: any) => s + (r.impressions || 0), 0);
  const outbound = perf.reduce((s: number, r: any) => s + (r.outbound_clicks || 0), 0);
  const saves = perf.reduce((s: number, r: any) => s + (r.saves || 0), 0);
  const ctr = impressions ? outbound / impressions : 0;

  const jobs = jobAgg.data || [];
  const byStatus: Record<string, number> = {};
  for (const j of jobs) byStatus[j.status] = (byStatus[j.status] || 0) + 1;
  const replSuccess = (byStatus["archived"] || 0) + (byStatus["published_awaiting_archive"] || 0);
  const replTotal = jobs.length || 1;

  // top categories by recent posted pin perf
  const { data: cats } = await sb.rpc("noop_does_not_exist").select?.() ?? { data: null };
  const { data: categoryPerf } = await sb.from("pinterest_pin_queue")
    .select("category_key, status")
    .eq("status", "posted")
    .gt("posted_at", since)
    .limit(5000);
  const catCount: Record<string, number> = {};
  for (const r of (categoryPerf || [])) catCount[r.category_key || "unknown"] = (catCount[r.category_key || "unknown"] || 0) + 1;
  const catList = Object.entries(catCount).map(([k, v]) => ({ category: k, posted: v })).sort((a, b) => b.posted - a.posted);

  return {
    impressions, outbound, saves, ctr,
    jobs_by_status: byStatus,
    replacement_success_rate: replSuccess / replTotal,
    top_headlines: (topHeadlines.data || []).map((r: any) => ({ headline: r.key, live_count: r.live_count })),
    top_categories: catList.slice(0, 10),
    worst_categories: catList.slice(-10).reverse(),
    recent_runs: recentRuns.data || [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: any = {};
  try { body = await req.json(); } catch {/*ok*/}
  const action = body.action || new URL(req.url).searchParams.get("action") || "dashboard";

  // Cron uses service-role; admin UI uses user token
  const allowed = await authorize(sb, req);
  if (!allowed) return json({ ok: false, message: "admin only" }, 403);

  try {
    if (action === "seed") {
      const r = await seedTemplates(sb, { categories: body.categories, perType: body.perType ?? 50 });
      await sb.from("pinterest_v2_engine_runs").insert({ action, templates_seeded: r.totalInserted, errors: r.errors.length, detail: { errors: r.errors } });
      return json({ ok: true, ...r });
    }
    if (action === "tick") {
      const batch = Math.min(Number(body.batch ?? 5), 25);
      const results = [];
      let published = 0, errors = 0;
      for (let i = 0; i < batch; i++) {
        const r = await tickOne(sb);
        results.push(r);
        if (r.published) published++;
        if (r.reason && !r.published) errors++;
        if (r.reason === "no_jobs") break;
      }
      await sb.from("pinterest_v2_engine_runs").insert({ action, jobs_processed: results.length, pins_published: published, errors, detail: { results } });
      return json({ ok: true, processed: results.length, published, errors, results });
    }
    if (action === "archive") {
      const r = await archiveDue(sb, Math.min(Number(body.limit ?? 50), 200));
      await sb.from("pinterest_v2_engine_runs").insert({ action, pins_archived: r.archived, errors: r.failed, detail: r });
      return json({ ok: true, ...r });
    }
    if (action === "dashboard") {
      const d = await dashboard(sb);
      return json({ ok: true, ...d });
    }
    if (action === "run_nightly") {
      const seed = await seedTemplates(sb, { perType: 50 });
      let pub = 0, err = 0; const all: any[] = [];
      for (let i = 0; i < 20; i++) {
        const r = await tickOne(sb); all.push(r);
        if (r.published) pub++;
        if (!r.published && r.reason && r.reason !== "no_jobs") err++;
        if (r.reason === "no_jobs") break;
      }
      const arch = await archiveDue(sb, 200);
      await sb.from("pinterest_v2_engine_runs").insert({
        action: "run_nightly", templates_seeded: seed.totalInserted, jobs_processed: all.length,
        pins_published: pub, pins_archived: arch.archived, errors: err + arch.failed,
        detail: { seed_errors: seed.errors, archive: arch },
      });
      return json({ ok: true, seed, published: pub, archived: arch });
    }
    return json({ ok: false, message: "unknown action" }, 400);
  } catch (e) {
    await sb.from("pinterest_v2_engine_runs").insert({ action, status: "error", errors: 1, detail: { message: (e as Error).message } });
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
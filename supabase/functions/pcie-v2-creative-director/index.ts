// PCIE-V2 Creative Director — config-driven pipeline orchestrator.
// Every stage reads its catalog from the database. No hardcoded limits.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const STORAGE_BUCKET = "pcie-v2-creatives";

type Catalogs = {
  config: Record<string, unknown>;
  flags: Record<string, boolean>;
  style_families: any[];
  typography: any[];
  hook_categories: any[];
  hooks: any[];
  cameras: any[];
  emotions: any[];
  ctas: any[];
  scenes: any[];
  axes: any[];
  stages: any[];
  signals: any[];
  weights: Map<string, number>; // key: attr|value|signal
  providers: any[];
};

function pickWeighted<T extends { slug: string; weight?: number; enabled?: boolean }>(
  pool: T[],
  attr: string,
  weights: Map<string, number>,
  signal = "ctr",
): T {
  const enabled = pool.filter((p) => p.enabled !== false);
  if (enabled.length === 0) throw new Error(`empty_catalog:${attr}`);
  const scored = enabled.map((item) => {
    const base = Number(item.weight ?? 1);
    const learned = weights.get(`${attr}|${item.slug}|${signal}`) ?? 1;
    return { item, w: Math.max(0.01, base * learned) };
  });
  const total = scored.reduce((a, b) => a + b.w, 0);
  let r = Math.random() * total;
  for (const s of scored) { r -= s.w; if (r <= 0) return s.item; }
  return scored[0].item;
}

async function loadCatalogs(supabase: any): Promise<Catalogs> {
  const [cfg, flg, sf, ty, hc, hk, cam, em, cta, sc, ax, st, sig, wt, pr] = await Promise.all([
    supabase.from("pcie_v2_config").select("*"),
    supabase.from("pcie_v2_feature_flags").select("*"),
    supabase.from("pcie_v2_style_families").select("*").eq("enabled", true),
    supabase.from("pcie_v2_typography_systems").select("*").eq("enabled", true),
    supabase.from("pcie_v2_hook_categories").select("*").eq("enabled", true),
    supabase.from("pcie_v2_hooks").select("*").eq("enabled", true),
    supabase.from("pcie_v2_camera_presets").select("*").eq("enabled", true),
    supabase.from("pcie_v2_emotions").select("*").eq("enabled", true),
    supabase.from("pcie_v2_cta_styles").select("*").eq("enabled", true),
    supabase.from("pcie_v2_scene_generators").select("*").eq("enabled", true),
    supabase.from("pcie_v2_scoring_axes").select("*").eq("enabled", true),
    supabase.from("pcie_v2_pipeline_stages").select("*").eq("enabled", true).order("order_index"),
    supabase.from("pcie_v2_performance_signals").select("*").eq("enabled", true),
    supabase.from("pcie_v2_attribute_weights").select("attribute,value_slug,signal_slug,weight"),
    supabase.from("pcie_v2_render_providers").select("*").eq("enabled", true).order("priority"),
  ]);
  const config = Object.fromEntries((cfg.data ?? []).map((r: any) => [r.key, r.value]));
  const flags = Object.fromEntries((flg.data ?? []).map((r: any) => [r.flag, r.enabled]));
  const weights = new Map<string, number>();
  for (const w of wt.data ?? []) weights.set(`${w.attribute}|${w.value_slug}|${w.signal_slug}`, Number(w.weight));
  return {
    config, flags,
    style_families: sf.data ?? [], typography: ty.data ?? [], hook_categories: hc.data ?? [],
    hooks: hk.data ?? [], cameras: cam.data ?? [], emotions: em.data ?? [], ctas: cta.data ?? [],
    scenes: sc.data ?? [], axes: ax.data ?? [], stages: st.data ?? [], signals: sig.data ?? [], weights,
    providers: pr.data ?? [],
  };
}

function fingerprint(decisions: Record<string, string>): string {
  const keys = Object.keys(decisions).sort();
  return keys.map((k) => `${k}:${decisions[k]}`).join("|");
}

async function callLovable(model: string, messages: any[], json = false) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({ model, messages, ...(json ? { response_format: { type: "json_object" } } : {}) }),
  });
  if (!res.ok) throw new Error(`lovable_${res.status}:${(await res.text()).slice(0,200)}`);
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? "";
}

// ---------- image renderer (provider-agnostic with failover) ----------
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("");
}

const PROVIDER_HANDLERS: Record<string, (prompt: string, opts: any) => Promise<{ bytes: Uint8Array; mime: string; seed?: string }>> = {
  async lovable_image(prompt, opts) {
    const model = opts.model as string;
    const isGemini = model.startsWith("google/");
    const body: any = isGemini
      ? { model, messages: [{ role: "user", content: prompt }], modalities: ["image", "text"] }
      : { model, prompt, size: "1024x1536", quality: "low", n: 1 };
    const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`provider_${res.status}:${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    const b64 = j?.data?.[0]?.b64_json;
    if (!b64) throw new Error("provider_no_image");
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return { bytes, mime: "image/png", seed: j?.data?.[0]?.seed?.toString() };
  },
};

async function renderWithFailover(supabase: any, ctx: any, candidateNo: number) {
  const providers = ctx.cat.providers;
  if (!providers.length) throw new Error("no_providers");
  const maxRetries = Number(ctx.cat.config.render_max_retries ?? 2);
  let lastErr: any = null;
  for (const provider of providers) {
    for (let attempt = 1; attempt <= (provider.max_retries ?? maxRetries); attempt++) {
      const t0 = Date.now();
      try {
        const handler = PROVIDER_HANDLERS[provider.handler];
        if (!handler) throw new Error(`unknown_handler:${provider.handler}`);
        const out = await handler(ctx.prompt, { model: provider.model, ...provider.config });
        const fp = await sha256Hex(out.bytes);
        const path = `${ctx.product.slug || "seed"}/${ctx.candidate_set_id}/${candidateNo}-${fp.slice(0, 12)}.png`;
        const up = await supabase.storage.from(STORAGE_BUCKET).upload(path, out.bytes, { contentType: out.mime, upsert: true });
        if (up.error) throw new Error(`storage:${up.error.message}`);
        const sig = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365);
        const image_url = sig.data?.signedUrl ?? null;
        const attemptRow = await supabase.from("pcie_v2_render_attempts").insert({
          candidate_set_id: ctx.candidate_set_id, provider_slug: provider.slug, model: provider.model,
          attempt_no: attempt, status: "ok", duration_ms: Date.now() - t0, seed: out.seed,
          render_settings: { size: "1024x1536" }, image_url, image_fingerprint: fp,
        }).select("id").single();
        return { image_url, image_fingerprint: fp, provider_slug: provider.slug, seed: out.seed, render_attempt_id: attemptRow.data?.id, storage_path: path };
      } catch (e) {
        lastErr = e;
        await supabase.from("pcie_v2_render_attempts").insert({
          candidate_set_id: ctx.candidate_set_id, provider_slug: provider.slug, model: provider.model,
          attempt_no: attempt, status: "error", duration_ms: Date.now() - t0, error: String(e),
        });
      }
    }
  }
  throw new Error(`render_failover_exhausted:${lastErr}`);
}

// ---------- pipeline stage handlers (each pure, swappable) ----------
const STAGE_HANDLERS: Record<string, (ctx: any) => Promise<void> | void> = {
  product_context(ctx) {
    ctx.trace.push({ stage: "product_context", out: { niche: ctx.product.niche, slug: ctx.product.slug } });
  },
  story(ctx) {
    ctx.story = `A real ${ctx.product.niche.replace(/_/g, " ")} moment showing genuine outcome for a real pet parent.`;
    ctx.trace.push({ stage: "story", out: ctx.story });
  },
  style(ctx) {
    const sf = pickWeighted(ctx.cat.style_families, "style_family", ctx.cat.weights);
    ctx.decisions.style_family = sf.slug; ctx.refs.style_family = sf;
    ctx.trace.push({ stage: "style", choice: sf.slug });
  },
  emotion(ctx) {
    const e = pickWeighted(ctx.cat.emotions, "emotion", ctx.cat.weights);
    ctx.decisions.emotion = e.slug; ctx.refs.emotion = e;
    ctx.trace.push({ stage: "emotion", choice: e.slug });
  },
  typography(ctx) {
    const t = pickWeighted(ctx.cat.typography, "typography", ctx.cat.weights);
    ctx.decisions.typography = t.slug; ctx.refs.typography = t;
    ctx.trace.push({ stage: "typography", choice: t.slug });
  },
  hook(ctx) {
    const cat = pickWeighted(ctx.cat.hook_categories, "hook_category", ctx.cat.weights);
    const pool = ctx.cat.hooks.filter((h: any) => h.category_id === cat.id);
    const hook = pool.length ? pool[Math.floor(Math.random() * pool.length)] : { text: "Why pet parents love this" };
    ctx.decisions.hook_category = cat.slug;
    ctx.decisions.hook = (hook.text as string).replaceAll("{niche}", ctx.product.niche.replace(/_/g, " "));
    ctx.trace.push({ stage: "hook", choice: cat.slug });
  },
  composition(ctx) {
    const s = pickWeighted(ctx.cat.scenes, "scene", ctx.cat.weights);
    ctx.decisions.scene = s.slug; ctx.refs.scene = s;
    ctx.trace.push({ stage: "composition", choice: s.slug });
  },
  camera(ctx) {
    const c = pickWeighted(ctx.cat.cameras, "camera", ctx.cat.weights);
    ctx.decisions.camera = c.slug; ctx.refs.camera = c;
    ctx.trace.push({ stage: "camera", choice: c.slug });
  },
  cta(ctx) {
    const c = pickWeighted(ctx.cat.ctas, "cta", ctx.cat.weights);
    ctx.decisions.cta = c.slug; ctx.refs.cta = c;
    ctx.cta_text = (c.text_template as string).replaceAll("{product}", ctx.product.title ?? "this");
    ctx.trace.push({ stage: "cta", choice: c.slug });
  },
  qa(ctx) {
    const prompt = [
      `Vertical 2:3 Pinterest pin (1000x1500).`,
      ctx.refs.style_family?.prompt_fragment,
      ctx.refs.scene?.prompt_fragment,
      ctx.refs.camera?.prompt_fragment,
      ctx.refs.emotion?.prompt_fragment,
      `Story: ${ctx.story}`,
      `Product: ${ctx.product.title}. Hero product must be instantly identifiable.`,
      `Headline overlay treatment: ${ctx.refs.typography?.prompt_fragment}. Text: "${ctx.decisions.hook}".`,
      `Secondary CTA: "${ctx.cta_text}".`,
      `No AI artifacts. No floating product. No mutated paws. Premium editorial finish.`,
    ].filter(Boolean).join(" ");
    ctx.prompt = prompt;
    ctx.trace.push({ stage: "qa", out: { len: prompt.length } });
  },
  async prompt_qa(ctx) {
    // Deterministic checks — no LLM, fast.
    const p = ctx.prompt || "";
    const checks: { check_slug: string; passed: boolean; severity: string; detail?: string }[] = [
      { check_slug: "product_in_prompt",     passed: p.toLowerCase().includes((ctx.product.title || ctx.product.niche || "").toLowerCase().split(" ")[0]), severity: "hard" },
      { check_slug: "aspect_ratio_declared", passed: /1000x1500|2:3/i.test(p), severity: "hard" },
      { check_slug: "headline_present",      passed: /Headline/.test(p) && (ctx.decisions.hook?.length ?? 0) <= 60, severity: "hard" },
      { check_slug: "headline_length",       passed: (ctx.decisions.hook?.split(/\s+/).length ?? 0) >= 2 && (ctx.decisions.hook?.split(/\s+/).length ?? 0) <= 7, severity: "soft" },
      { check_slug: "no_duplicate_concept",  passed: !ctx.duplicate, severity: "hard" },
      { check_slug: "typography_safe",       passed: !!ctx.refs.typography, severity: "hard" },
      { check_slug: "no_hallucinated_brand", passed: !/\b(apple|nike|disney|marvel)\b/i.test(p), severity: "hard" },
      { check_slug: "pinterest_safe_layout", passed: !/collage|split[- ]screen|infographic/i.test(p), severity: "hard" },
      { check_slug: "mobile_readable_overlay", passed: (ctx.decisions.hook?.length ?? 99) <= 40, severity: "soft" },
    ];
    ctx.prompt_qa = checks;
    const hardFail = checks.find(c => !c.passed && c.severity === "hard");
    if (hardFail) { ctx.prompt_qa_blocked = hardFail.check_slug; ctx.reject_reason = `prompt_qa:${hardFail.check_slug}`; }
    ctx.trace.push({ stage: "prompt_qa", passed: !hardFail, fail: hardFail?.check_slug });
  },
  brand_safety(ctx) {
    if (!ctx.cat.flags.pcie_v2_brand_safety) { ctx.trace.push({ stage: "brand_safety", skipped: true }); return; }
    const p = ctx.prompt || "";
    const must = ["premium", "natural light", "Pinterest", "lifestyle"];
    const score = must.reduce((acc, k) => acc + (new RegExp(k, "i").test(p) ? 1 : 0), 0) / must.length;
    ctx.brand_safety_score = Math.round(score * 100);
    ctx.trace.push({ stage: "brand_safety", score: ctx.brand_safety_score });
  },
  async image_render(ctx) {
    if (ctx.dry_run || ctx.prompt_qa_blocked || !ctx.cat.flags.pcie_v2_image_render) {
      ctx.render_status = "skipped";
      ctx.trace.push({ stage: "image_render", skipped: true, reason: ctx.dry_run ? "dry_run" : (ctx.prompt_qa_blocked ?? "disabled") });
      return;
    }
    try {
      const r = await renderWithFailover(ctx.supabase, ctx, ctx.candidate_no);
      Object.assign(ctx, r);
      ctx.render_status = "rendered";
      ctx.trace.push({ stage: "image_render", ok: true, provider: r.provider_slug });
    } catch (e) {
      ctx.render_status = "failed";
      ctx.reject_reason = ctx.reject_reason ?? "render_failed";
      ctx.trace.push({ stage: "image_render", error: String(e) });
    }
  },
  async render_qa(ctx) {
    if (!ctx.image_url || !ctx.cat.flags.pcie_v2_render_qa) { ctx.trace.push({ stage: "render_qa", skipped: true }); return; }
    // Lightweight deterministic QA: signed URL reachable + non-trivial byte size.
    let okFetch = false; let size = 0;
    try {
      const r = await fetch(ctx.image_url, { method: "GET" });
      okFetch = r.ok;
      const buf = await r.arrayBuffer().catch(() => new ArrayBuffer(0));
      size = buf.byteLength;
    } catch { /* swallow */ }
    const checks = [
      { check_slug: "image_fetched",   passed: okFetch, score: okFetch ? 100 : 0 },
      { check_slug: "image_size_ok",   passed: size > 30_000, score: Math.min(100, Math.round(size / 10_000)) },
      { check_slug: "fingerprint_set", passed: !!ctx.image_fingerprint, score: 100 },
    ];
    ctx.render_qa = checks;
    const minScore = Number(ctx.cat.config.render_qa_min_score ?? 70);
    const avg = checks.reduce((a, c) => a + (c.score ?? 0), 0) / checks.length;
    ctx.render_qa_score = Math.round(avg);
    if (avg < minScore) { ctx.render_qa_blocked = true; ctx.reject_reason = ctx.reject_reason ?? "render_qa_low"; }
    ctx.trace.push({ stage: "render_qa", score: ctx.render_qa_score, blocked: !!ctx.render_qa_blocked });
  },
  async self_critique(ctx) {
    if (!ctx.cat.flags.pcie_v2_self_critique) { ctx.trace.push({ stage: "self_critique", skipped: true }); return; }
    try {
      const txt = await callLovable(
        (ctx.cat.config.default_text_model as string) ?? "google/gemini-3-flash-preview",
        [
          { role: "system", content: "You are a Pinterest creative director. Rate the proposed pin concept on 9 axes 0-100 and return strict JSON {scores:{axis_slug:number}, reasons:string}." },
          { role: "user", content: `Axes: ${ctx.cat.axes.map((a:any)=>a.slug).join(",")}\nConcept JSON:\n${JSON.stringify({decisions: ctx.decisions, hook: ctx.decisions.hook, story: ctx.story})}` },
        ],
        true,
      );
      const parsed = JSON.parse(txt || "{}");
      ctx.scores = parsed.scores ?? {};
      ctx.critique = parsed.reasons ?? "";
      ctx.trace.push({ stage: "self_critique", scores: ctx.scores });
    } catch (e) {
      ctx.trace.push({ stage: "self_critique", error: String(e) });
      ctx.scores = {};
    }
  },
  publish(ctx) {
    // Compute weighted novelty_total + per-axis pass.
    const axes = ctx.cat.axes;
    let total = 0, wsum = 0; const breakdown: any[] = []; let hardFail = false;
    for (const ax of axes) {
      const s = Number(ctx.scores?.[ax.slug] ?? 50);
      total += s * Number(ax.weight); wsum += Number(ax.weight);
      const passed = s >= Number(ax.pass_threshold);
      if (!passed && ax.hard_reject) hardFail = true;
      breakdown.push({ axis_slug: ax.slug, score: s, passed });
    }
    ctx.novelty_total = wsum ? total / wsum : 0;
    ctx.axis_breakdown = breakdown;
    const threshold = Number(ctx.cat.config.publish_gate_threshold ?? 95);
    ctx.pass_publish_gate = !hardFail && ctx.novelty_total >= threshold && !ctx.duplicate;
    ctx.reject_reason = hardFail ? "hard_axis_failure" : ctx.duplicate ? "duplicate_fingerprint" : (!ctx.pass_publish_gate ? "below_threshold" : null);
    ctx.trace.push({ stage: "publish", novelty_total: ctx.novelty_total, pass: ctx.pass_publish_gate, reject: ctx.reject_reason });
  },
};

async function runPipeline(supabase: any, cat: Catalogs, run_id: string, product: any) {
  const ctx: any = { product, decisions: {}, refs: {}, scores: {}, trace: [], cat, duplicate: false };
  for (const stage of cat.stages) {
    try { await STAGE_HANDLERS[stage.handler]?.(ctx); }
    catch (e) { ctx.trace.push({ stage: stage.slug, error: String(e) }); }
  }
  const fp = fingerprint(ctx.decisions);
  // dedupe
  const { data: existing } = await supabase.from("pcie_v2_combo_fingerprints").select("fingerprint").eq("fingerprint", fp).maybeSingle();
  ctx.duplicate = !!existing;
  // re-run publish stage now that duplicate is known
  STAGE_HANDLERS.publish(ctx);

  const status = ctx.pass_publish_gate ? "draft" : "rejected";
  const { data: creative, error } = await supabase.from("pcie_v2_creatives").insert({
    run_id, product_id: product.id, product_slug: product.slug, niche: product.niche,
    status, reject_reason: ctx.reject_reason, prompt: ctx.prompt,
    prompt_version: "pcie_v2.0", model: cat.config.default_image_model,
    fingerprint: fp, novelty_total: ctx.novelty_total,
    pass_publish_gate: ctx.pass_publish_gate,
    decisions: ctx.decisions, scores: ctx.scores, pipeline_trace: ctx.trace,
  }).select("id").single();
  if (error) throw error;

  // decision rows + novelty rows + events
  const decisionRows = Object.entries(ctx.decisions).map(([attribute, value_slug]) => ({
    creative_id: creative.id, attribute, value_slug, source: "weighted",
  }));
  if (decisionRows.length) await supabase.from("pcie_v2_creative_decisions").insert(decisionRows);
  if (ctx.axis_breakdown?.length) {
    await supabase.from("pcie_v2_novelty_scores").insert(
      ctx.axis_breakdown.map((a: any) => ({ creative_id: creative.id, ...a }))
    );
  }
  await supabase.from("pcie_v2_combo_fingerprints").upsert({ fingerprint: fp, creative_id: creative.id });
  await supabase.from("pcie_v2_events").insert({
    creative_id: creative.id, run_id, stage: "pipeline_complete",
    event_type: status, payload: { reject_reason: ctx.reject_reason, novelty_total: ctx.novelty_total },
  });
  return { creative_id: creative.id, status, novelty_total: ctx.novelty_total, reject_reason: ctx.reject_reason };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const count = Math.min(20, Math.max(1, Number(body.count ?? 3)));
    const niche = String(body.niche ?? "cat_litter");
    const cat = await loadCatalogs(supabase);
    if (cat.flags.pcie_v2_enabled === false) {
      return new Response(JSON.stringify({ ok: false, error: "pcie_v2_disabled" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: run } = await supabase.from("pcie_v2_runs").insert({ trigger: body.trigger ?? "manual", requested: count, config_snapshot: { count, niche } }).select("id").single();
    const results: any[] = [];
    let produced = 0, rejected = 0, duplicates = 0;
    for (let i = 0; i < count; i++) {
      const product = { id: null, slug: `seed-${niche}-${i}`, title: niche.replace(/_/g, " "), niche };
      const r = await runPipeline(supabase, cat, run!.id, product);
      results.push(r);
      if (r.status === "draft") produced++;
      else if (r.reject_reason === "duplicate_fingerprint") { rejected++; duplicates++; }
      else rejected++;
    }
    await supabase.from("pcie_v2_runs").update({ status: "complete", produced, rejected, duplicates, finished_at: new Date().toISOString() }).eq("id", run!.id);
    return new Response(JSON.stringify({ ok: true, run_id: run!.id, produced, rejected, duplicates, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
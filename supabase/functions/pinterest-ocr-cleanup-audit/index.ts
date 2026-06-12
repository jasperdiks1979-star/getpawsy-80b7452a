// ─────────────────────────────────────────────────────────────────────────────
// pinterest-ocr-cleanup-audit
//
// OCR-based overlay detection. Replaces metadata-only detection in
// pinterest-historical-cleanup with the visible text actually rendered in the
// pin image. Uses Lovable AI Gateway (google/gemini-2.5-flash) for OCR.
//
// Pipeline:
//   1. Scan ALL posted pins (entire account history, paginated).
//   2. For each pin: skip if already OCR'd (pinterest_pin_ocr_cache). Else
//      download image, ask Gemini for visible text, cache result.
//   3. Build a normalized phrase frequency table from OCR text (line-level).
//   4. Report total pins, OCR processed, top 50 phrases, and specifically
//      every pin_id whose OCR text contains "stop scooping every day".
//   5. If any such pin exists → engine_failed = true.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const OCR_MODEL = "google/gemini-2.5-flash";
// Per-invocation OCR cap. Edge functions have a 150s wall clock, and each
// Gemini call is ~1.5-3s. 60 * 3s / 6 concurrency ≈ 30s headroom. Cache is
// persistent so calling repeatedly drains the backlog deterministically.
const OCR_BUDGET = 60;
const CONCURRENCY = 6;
const SOFT_DEADLINE_MS = 110_000; // stop OCR'ing 110s after start; still write summary
const PAGE_SIZE = 1000;
const TARGET_PHRASE = "stop scooping every day";

function normalizePhrase(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
function splitLines(text: string): string[] {
  return (text || "")
    .split(/[\n\r]+|(?<=[.!?])\s+/)
    .map(l => l.trim())
    .filter(l => l.length >= 3 && l.length <= 120);
}

async function ocrImage(imageUrl: string, apiKey: string): Promise<{ text: string; model: string } | { error: string }> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: OCR_MODEL,
      messages: [
        { role: "system", content: "You extract overlay text visible inside Pinterest pin images. Return ONLY the visible overlay/headline text, line by line, exactly as rendered. No commentary, no quotes, no markdown. If no text is visible, return the single token: NONE." },
        { role: "user", content: [
          { type: "text", text: "Extract every word of text rendered in this image. Return each phrase/line on its own line, nothing else." },
          { type: "image_url", image_url: { url: imageUrl } },
        ]},
      ],
      temperature: 0,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    return { error: `gateway_${res.status}: ${t.slice(0,180)}` };
  }
  const body = await res.json().catch(() => null);
  const text = body?.choices?.[0]?.message?.content?.toString().trim() || "";
  return { text: text === "NONE" ? "" : text, model: OCR_MODEL };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "POST required" }, 405);

  const traceId = crypto.randomUUID();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const LOVABLE_AI_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_AI_KEY) return json({ ok: false, traceId, message: "LOVABLE_API_KEY not configured" }, 500);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  let trigger: "manual" | "cron" = "manual";
  let cronSecret: string | null = null;
  let budgetOverride: number | null = null;
  try {
    const b = await req.json();
    if (b?.trigger === "cron") trigger = "cron";
    if (typeof b?.cron_secret === "string") cronSecret = b.cron_secret;
    if (Number.isFinite(b?.budget)) budgetOverride = Number(b.budget);
  } catch {}

  // Auth: admin OR cron secret
  const auth = req.headers.get("authorization") || "";
  let ok = false;
  if (trigger === "cron") {
    const exp = Deno.env.get("CRON_SECRET");
    if (!exp || (cronSecret && cronSecret === exp)) ok = true;
  }
  if (!ok && auth.startsWith("Bearer ")) {
    const uc = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data } = await uc.auth.getUser();
    if (data?.user) {
      const { data: role } = await sb.from("user_roles").select("role")
        .eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
      if (role) ok = true;
    }
  }
  if (!ok) return json({ ok: false, traceId, message: "unauthorized" }, 401);

  const { data: run, error: runErr } = await sb.from("pinterest_ocr_cleanup_runs")
    .insert({ status: "running", trigger }).select("*").single();
  if (runErr || !run) return json({ ok: false, traceId, message: runErr?.message || "run_insert_failed" }, 500);

  const budget = budgetOverride && budgetOverride > 0 ? Math.min(budgetOverride, 2000) : OCR_BUDGET;
  const startedAt = Date.now();

  try {
    // 1. ALL posted pins (paginate, no 500 cap)
    type Pin = { id: string; pinterest_pin_id: string; pin_image_url: string | null };
    const allPins: Pin[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await sb.from("pinterest_pin_queue")
        .select("id, pinterest_pin_id, pin_image_url")
        .eq("status", "posted")
        .not("pinterest_pin_id", "is", null)
        .order("posted_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      const batch = (data || []) as Pin[];
      allPins.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      if (offset > 50000) break; // hard safety
    }

    const total = allPins.length;

    // 2. Load existing OCR cache
    const pinIds = allPins.map(p => p.pinterest_pin_id).filter(Boolean);
    const cache = new Map<string, { ocr_text: string | null; status: string }>();
    for (let i = 0; i < pinIds.length; i += 500) {
      const slice = pinIds.slice(i, i + 500);
      const { data } = await sb.from("pinterest_pin_ocr_cache")
        .select("pin_id, ocr_text, status").in("pin_id", slice);
      (data || []).forEach((r: any) => cache.set(r.pin_id, { ocr_text: r.ocr_text, status: r.status }));
    }
    let alreadyCached = 0;
    for (const p of allPins) {
      const c = cache.get(p.pinterest_pin_id);
      if (c && c.status === "ok") alreadyCached++;
    }

    // 3. Determine which pins still need OCR (image present, not cached ok)
    const toOcr = allPins.filter(p => p.pin_image_url && (cache.get(p.pinterest_pin_id)?.status !== "ok"));
    const targets = toOcr.slice(0, budget);

    let processed = 0, failed = 0;
    // Concurrency-limited OCR
    let cursor = 0;
    async function worker() {
      while (cursor < targets.length) {
        if (Date.now() - startedAt > SOFT_DEADLINE_MS) return;
        const idx = cursor++;
        const p = targets[idx];
        try {
          const out = await ocrImage(p.pin_image_url!, LOVABLE_AI_KEY!);
          if ("error" in out) {
            failed++;
            await sb.from("pinterest_pin_ocr_cache").upsert({
              pin_id: p.pinterest_pin_id, queue_id: p.id, image_url: p.pin_image_url,
              status: "error", error: out.error.slice(0, 500), model: OCR_MODEL, ocr_at: new Date().toISOString(),
            }, { onConflict: "pin_id" });
            cache.set(p.pinterest_pin_id, { ocr_text: null, status: "error" });
          } else {
            processed++;
            const lines = splitLines(out.text);
            await sb.from("pinterest_pin_ocr_cache").upsert({
              pin_id: p.pinterest_pin_id, queue_id: p.id, image_url: p.pin_image_url,
              ocr_text: out.text, ocr_lines: lines, model: out.model,
              status: "ok", error: null, ocr_at: new Date().toISOString(),
            }, { onConflict: "pin_id" });
            cache.set(p.pinterest_pin_id, { ocr_text: out.text, status: "ok" });
          }
        } catch (e: any) {
          failed++;
          await sb.from("pinterest_pin_ocr_cache").upsert({
            pin_id: p.pinterest_pin_id, queue_id: p.id, image_url: p.pin_image_url,
            status: "error", error: String(e?.message || e).slice(0, 500),
            model: OCR_MODEL, ocr_at: new Date().toISOString(),
          }, { onConflict: "pin_id" });
          cache.set(p.pinterest_pin_id, { ocr_text: null, status: "error" });
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    // 4. Build frequency table from OCR text
    const freq = new Map<string, { sample: string; count: number }>();
    const stopScoopingPins: string[] = [];
    for (const p of allPins) {
      const c = cache.get(p.pinterest_pin_id);
      if (!c || c.status !== "ok" || !c.ocr_text) continue;
      const seenInPin = new Set<string>();
      for (const line of splitLines(c.ocr_text)) {
        const norm = normalizePhrase(line);
        if (!norm || norm.length < 4) continue;
        if (seenInPin.has(norm)) continue;
        seenInPin.add(norm);
        const cur = freq.get(norm);
        if (cur) cur.count += 1;
        else freq.set(norm, { sample: line.slice(0, 120), count: 1 });
      }
      if (normalizePhrase(c.ocr_text).includes(TARGET_PHRASE)) {
        stopScoopingPins.push(p.pinterest_pin_id);
      }
    }

    const topPhrases = Array.from(freq.entries())
      .map(([norm, v]) => ({ phrase: v.sample, normalized: norm, count: v.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    const engineFailed = stopScoopingPins.length > 0;

    await sb.from("pinterest_ocr_cleanup_runs").update({
      status: "completed",
      finished_at: new Date().toISOString(),
      pins_total: total,
      pins_already_cached: alreadyCached,
      pins_ocr_processed: processed,
      pins_ocr_failed: failed,
      top_phrases: topPhrases,
      stop_scooping_count: stopScoopingPins.length,
      stop_scooping_pin_ids: stopScoopingPins,
      engine_failed: engineFailed,
      summary: {
        ocr_budget: budget, model: OCR_MODEL, concurrency: CONCURRENCY,
        pending_after_run: Math.max(0, toOcr.length - targets.length),
        unique_phrases: freq.size,
      },
    }).eq("id", run.id);

    return json({
      ok: true, traceId, run_id: run.id,
      pins_total: total, pins_already_cached: alreadyCached,
      pins_ocr_processed: processed, pins_ocr_failed: failed,
      top_phrases: topPhrases,
      stop_scooping_every_day: {
        count: stopScoopingPins.length, pin_ids: stopScoopingPins,
      },
      engine_failed: engineFailed,
      pending_after_run: Math.max(0, toOcr.length - targets.length),
    });
  } catch (e: any) {
    await sb.from("pinterest_ocr_cleanup_runs").update({
      status: "failed", finished_at: new Date().toISOString(),
      error_message: String(e?.message || e).slice(0, 500),
    }).eq("id", run.id);
    return json({ ok: false, traceId, message: String(e?.message || e) }, 500);
  }
});
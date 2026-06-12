// Pinterest Creative Variety + Anti-Duplication Governor engine.
// Actions: seed_pools | retire_phrases | expand_underrepresented | recompute_density | run_full
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const CATEGORIES = [
  "cat_trees",
  "cat_litter_boxes",
  "self_cleaning_litter",
  "cat_essentials",
  "dog_travel",
  "pet_furniture",
] as const;

type Kind = "headline" | "overlay" | "cta" | "description";
const KINDS: Kind[] = ["headline", "overlay", "cta", "description"];

const KIND_LIMITS: Record<Kind, number> = {
  headline: 42,
  overlay: 32,
  cta: 18,
  description: 180,
};

const STATIC_BANNED = [
  "stop scooping so much",
  "stop buying cheap cat trees",
  "why cat owners are switching",
  "cats are obsessed with this",
  "vet-approved",
  "eco-friendly",
  "stop scooping",
];

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function callAi(prompt: string, system: string): Promise<string> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Lovable-API-Key": LOVABLE_API_KEY,
      "X-Lovable-AIG-SDK": "edge-direct",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = await res.json();
  return json?.choices?.[0]?.message?.content ?? "";
}

function parseLines(raw: string, limit: number): string[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s\-\*\d\.\)]+/, "").trim())
    .filter((l) => l.length > 0 && l.length <= limit)
    .filter((l) => !STATIC_BANNED.some((b) => l.toLowerCase().includes(b)));
}

async function bannedPhrasesFromDb(): Promise<string[]> {
  const { data } = await supabase
    .from("pinterest_governor_rules")
    .select("banned_phrases")
    .eq("id", 1)
    .maybeSingle();
  const arr: string[] = Array.isArray(data?.banned_phrases)
    ? data!.banned_phrases
    : [];
  return Array.from(new Set([...arr.map((s) => s.toLowerCase()), ...STATIC_BANNED]));
}

async function generateBatch(
  category: string,
  kind: Kind,
  count: number,
  banned: string[],
): Promise<string[]> {
  const sys =
    "You write Pinterest copy for a US-native premium pet brand. Tone: confident, specific, benefit-driven, US English. No emojis except ONE optional sparingly. No clickbait, no exclamation spam, no 'vet-approved', no 'eco-friendly', no 'stop scooping' fluff. No fake reviews, no anchoring. One variant per line, no numbering, no quotes.";
  const niche = category.replace(/_/g, " ");
  const kindHint: Record<Kind, string> = {
    headline: `Pinterest pin headlines for ${niche}. Max ${KIND_LIMITS.headline} chars. Specific, scroll-stopping, benefit-led.`,
    overlay: `Short on-image overlay text for ${niche} pins. Max ${KIND_LIMITS.overlay} chars. 2-5 words. Punchy.`,
    cta: `Pinterest CTAs for ${niche}. Max ${KIND_LIMITS.cta} chars. Action verbs.`,
    description: `Pinterest pin descriptions for ${niche}. Max ${KIND_LIMITS.description} chars. One sentence, US English, includes a concrete benefit.`,
  };
  const prompt = `${kindHint[kind]}\nProduce ${count} UNIQUE variants. Avoid these phrases entirely: ${banned.join(", ")}.\nReturn one per line, plain text only.`;
  const raw = await callAi(prompt, sys);
  return parseLines(raw, KIND_LIMITS[kind]).slice(0, count);
}

async function seedPools(force = false) {
  const banned = await bannedPhrasesFromDb();
  const summary: Record<string, Record<Kind, number>> = {};
  let totalInserted = 0;

  for (const cat of CATEGORIES) {
    summary[cat] = { headline: 0, overlay: 0, cta: 0, description: 0 };
    for (const kind of KINDS) {
      if (!force) {
        const { count } = await supabase
          .from("pinterest_variety_pools")
          .select("id", { count: "exact", head: true })
          .eq("category", cat)
          .eq("kind", kind)
          .eq("banned", false);
        if ((count ?? 0) >= 100) {
          summary[cat][kind] = count ?? 0;
          continue;
        }
      }
      // Generate in two halves to keep prompt diversity high
      const halves = await Promise.all([
        generateBatch(cat, kind, 60, banned),
        generateBatch(cat, kind, 60, banned),
      ]);
      const variants = Array.from(
        new Set(halves.flat().map((v) => v.trim())),
      ).slice(0, 100);
      if (variants.length === 0) continue;
      const rows = variants.map((text) => ({
        category: cat,
        kind,
        text,
      }));
      const { error, count } = await supabase
        .from("pinterest_variety_pools")
        .upsert(rows, {
          onConflict: "category,kind,text_norm",
          ignoreDuplicates: true,
          count: "exact",
        });
      if (error) {
        console.error("seed insert error", cat, kind, error.message);
      }
      summary[cat][kind] = count ?? variants.length;
      totalInserted += variants.length;
    }
  }
  return { totalInserted, summary };
}

async function retirePhrases() {
  const banned = await bannedPhrasesFromDb();

  // 1. Mark pool rows banned
  let poolBanned = 0;
  for (const phrase of banned) {
    const { error, count } = await supabase
      .from("pinterest_variety_pools")
      .update({ banned: true, updated_at: new Date().toISOString() })
      .ilike("text_norm", `%${phrase}%`)
      .eq("banned", false)
      .select("id", { count: "exact", head: true });
    if (!error) poolBanned += count ?? 0;
  }

  // 2. Compute hot-repeats >20 across queued+published
  const { data: titles } = await supabase
    .from("pinterest_pin_queue")
    .select("pin_title")
    .not("pin_title", "is", null)
    .limit(20000);
  const counts = new Map<string, number>();
  for (const r of titles ?? []) {
    const k = (r.pin_title as string).trim().toLowerCase();
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const hotRepeats = [...counts.entries()]
    .filter(([, n]) => n > 20)
    .map(([k]) => k);

  const newBanned = Array.from(new Set([...banned, ...hotRepeats])).slice(0, 200);
  await supabase
    .from("pinterest_governor_rules")
    .update({ banned_phrases: newBanned, updated_at: new Date().toISOString() })
    .eq("id", 1);

  // 3. Reject queued (NOT published) pins matching banned phrases
  let rejected = 0;
  for (const phrase of newBanned) {
    const { data: rows } = await supabase
      .from("pinterest_pin_queue")
      .select("id, meta")
      .in("status", ["queued", "approved", "scheduled", "draft"])
      .ilike("pin_title", `%${phrase}%`)
      .limit(1000);
    for (const r of rows ?? []) {
      const meta = { ...(r.meta ?? {}), retired_phrase: phrase, retired_at: new Date().toISOString() };
      const { error } = await supabase
        .from("pinterest_pin_queue")
        .update({ status: "rejected", rejection_reason: `banned_phrase:${phrase}`, meta })
        .eq("id", r.id);
      if (!error) rejected++;
    }
  }

  return { poolBanned, hotRepeats: hotRepeats.length, totalBanned: newBanned.length, rejectedQueued: rejected };
}

async function expandUnderrepresented(dryRun: boolean) {
  const { data } = await supabase
    .from("pinterest_product_pin_coverage")
    .select("product_id, product_slug, product_name, category, active_pin_count")
    .order("active_pin_count", { ascending: true })
    .limit(200);
  const zero = (data ?? []).filter((r) => r.active_pin_count === 0).slice(0, 25);
  const lt3 = (data ?? []).filter((r) => r.active_pin_count > 0 && r.active_pin_count < 3).slice(0, 25);
  return {
    dryRun,
    zeroCount: zero.length,
    lt3Count: lt3.length,
    sampleZero: zero.slice(0, 10),
    sampleLt3: lt3.slice(0, 10),
    note: dryRun
      ? "Dry run — no jobs enqueued. Approve to call pinterest-creative-director for these slugs."
      : "Live mode not yet wired into publisher; queue calls would be issued here.",
  };
}

const ACTIVE_STATUSES = ["posted", "draft", "scheduled", "approved", "queued", "published"];

async function fetchAllPaged<T>(
  builder: (from: number, to: number) => Promise<{ data: T[] | null }>,
  pageSize = 1000,
  maxRows = 50000,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  while (from < maxRows) {
    const to = Math.min(from + pageSize - 1, maxRows - 1);
    const { data } = await builder(from, to);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function recomputeDensity() {
  const slugs = await fetchAllPaged<{ product_slug: string | null }>((from, to) =>
    supabase
      .from("pinterest_pin_queue")
      .select("product_slug")
      .in("status", ACTIVE_STATUSES)
      .range(from, to),
  );
  const counts = new Map<string, number>();
  for (const r of slugs ?? []) {
    const k = (r.product_slug as string) ?? "";
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const totalActive = slugs.length;
  const duplicateSlugs = [...counts.entries()].filter(([, n]) => n >= 10);
  const duplicatePins = duplicateSlugs.reduce((s, [, n]) => s + n, 0);

  // board diversity from last 30d posted
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const boards = await fetchAllPaged<{ board_id: string | null }>((from, to) =>
    supabase
      .from("pinterest_pin_queue")
      .select("board_id")
      .eq("status", "posted")
      .gte("posted_at", since)
      .range(from, to),
  );
  const boardCounts = new Map<string, number>();
  for (const r of boards ?? []) {
    const b = (r.board_id as string) ?? "";
    if (!b) continue;
    boardCounts.set(b, (boardCounts.get(b) ?? 0) + 1);
  }
  const totalBoardPins = boards.length;
  const activeBoards = boardCounts.size;
  // Simple diversity = 1 - (top3 share)
  const top3 = [...boardCounts.values()].sort((a, b) => b - a).slice(0, 3).reduce((s, n) => s + n, 0);
  const top3Share = totalBoardPins > 0 ? top3 / totalBoardPins : 0;
  const diversity = 1 - top3Share;

  // Stage 2 candidates (zero-engagement dup, perf rows present)
  const dupSlugSet = new Set(duplicateSlugs.map(([k]) => k));
  let stage2 = 0;
  if (dupSlugSet.size > 0) {
    // Pull pin ids in dup slugs then check perf separately (avoid PostgREST FK ambiguity)
    const cand = await fetchAllPaged<{ pinterest_pin_id: string | null }>((from, to) =>
      supabase
        .from("pinterest_pin_queue")
        .select("pinterest_pin_id")
        .in("product_slug", [...dupSlugSet])
        .in("status", ACTIVE_STATUSES)
        .not("pinterest_pin_id", "is", null)
        .range(from, to),
    );
    const pinIds = cand.map((r) => r.pinterest_pin_id!).filter(Boolean);
    // Batch perf lookup
    const chunk = 500;
    for (let i = 0; i < pinIds.length; i += chunk) {
      const slice = pinIds.slice(i, i + chunk);
      const { data: perf } = await supabase
        .from("pinterest_pin_performance")
        .select("pin_id,impressions,clicks,saves")
        .in("pin_id", slice);
      for (const p of perf ?? []) {
        if ((p.impressions ?? 0) < 50 && (p.clicks ?? 0) === 0 && (p.saves ?? 0) === 0) stage2++;
      }
    }
  }

  return {
    totalActive,
    duplicateSlugs: duplicateSlugs.length,
    duplicatePins,
    activeBoards,
    top3Share: Number(top3Share.toFixed(4)),
    boardDiversity: Number(diversity.toFixed(4)),
    stage2Candidates: stage2,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "report";
  const force = url.searchParams.get("force") === "true";
  const dryRun = url.searchParams.get("dry_run") !== "false";

  try {
    if (action === "seed_pools") return ok({ ok: true, action, ...(await seedPools(force)) });
    if (action === "retire_phrases") return ok({ ok: true, action, ...(await retirePhrases()) });
    if (action === "expand_underrepresented") return ok({ ok: true, action, ...(await expandUnderrepresented(dryRun) )});
    if (action === "recompute_density") return ok({ ok: true, action, ...(await recomputeDensity()) });
    if (action === "run_full") {
      const retired = await retirePhrases();
      const seeded = await seedPools(force);
      const expansion = await expandUnderrepresented(true);
      const density = await recomputeDensity();
      return ok({ ok: true, action, retired, seeded, expansion, density });
    }
    return ok({ ok: true, actions: ["seed_pools", "retire_phrases", "expand_underrepresented", "recompute_density", "run_full"] });
  } catch (e) {
    console.error("[pinterest-creative-variety]", e);
    return ok({ ok: false, error: (e as Error).message }, 500);
  }
});
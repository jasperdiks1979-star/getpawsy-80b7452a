// Media Integrity Guard — scans product images for supplier artifacts.
//
// Detects: Chinese / Japanese / Korean / Cyrillic text, watermarks, QR codes,
// supplier logos, measurement lines, red guide lines, arrows, factory
// annotations, promotional stickers, price labels.
//
// Status rules (per image):
//   confidence >= 0.90  → BLOCKED
//   confidence >= 0.70  → REVIEW
//   else                → CLEAN
//
// Side-effects:
//   - upserts rows into public.media_audit
//   - if every image for a product is BLOCKED → products.pinterest_eligible=false
//   - writes a run summary to public.media_audit_runs
//
// Triggers: nightly cron, manual admin run, or cj-backfill-media-variants on
// completion (?trigger=cj_import&product_ids=...).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const VISION_MODEL =
  Deno.env.get("MEDIA_AUDIT_VISION_MODEL") || "google/gemini-2.5-flash";

const ISSUE_KEYS = [
  "chinese_text",
  "japanese_text",
  "korean_text",
  "cyrillic_text",
  "watermark",
  "qr_code",
  "supplier_logo",
  "measurement_lines",
  "red_guide_lines",
  "arrows",
  "factory_annotation",
  "promotional_sticker",
  "price_label",
] as const;
type IssueKey = (typeof ISSUE_KEYS)[number];

type ScanResult = {
  status: "CLEAN" | "REVIEW" | "BLOCKED";
  confidence: number;
  issues: IssueKey[];
  issue_type: string;
  detected_languages: string[];
  notes: string;
};

function classify(confidence: number): ScanResult["status"] {
  if (confidence >= 0.9) return "BLOCKED";
  if (confidence >= 0.7) return "REVIEW";
  return "CLEAN";
}

async function scanImage(imageUrl: string): Promise<ScanResult> {
  if (!LOVABLE_API_KEY) {
    return {
      status: "REVIEW",
      confidence: 0,
      issues: [],
      issue_type: "scanner_unavailable",
      detected_languages: [],
      notes: "LOVABLE_API_KEY missing",
    };
  }

  const prompt = `You are an e-commerce media compliance scanner. Inspect this product image and determine if it contains supplier contamination that would make it unsafe to use on a US-facing storefront or on Pinterest.

Detect ANY of these contaminants:
- Chinese, Japanese, Korean, or Cyrillic text (any character)
- watermarks or supplier logos (overlaid brand marks, "AliExpress", "1688", "CJ", supplier names)
- QR codes or barcodes
- measurement lines, red guide lines, arrows, factory annotations
- promotional stickers, price labels, % off banners

Return ONLY a JSON object with this exact shape (no markdown, no commentary):
{"issues":["chinese_text","watermark",...],"detected_languages":["zh","ru"],"confidence":0.0,"notes":"short reason"}

- "issues" uses only these keys: ${ISSUE_KEYS.join(", ")}.
- "confidence" is your certainty (0..1) that the image IS contaminated. 0 means clearly clean, 1 means definitely contaminated.
- If the image is clean, return {"issues":[],"detected_languages":[],"confidence":0,"notes":"clean"}.`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`vision ${resp.status}: ${body.slice(0, 200)}`);
  }

  const json = await resp.json();
  const raw = json?.choices?.[0]?.message?.content ?? "{}";
  let parsed: any = {};
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    parsed = {};
  }

  const issuesArr = Array.isArray(parsed.issues) ? parsed.issues : [];
  const issues = issuesArr.filter((k: string): k is IssueKey =>
    (ISSUE_KEYS as readonly string[]).includes(k),
  );
  const langs = Array.isArray(parsed.detected_languages)
    ? parsed.detected_languages.map(String)
    : [];
  let confidence = Number(parsed.confidence ?? 0);
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.max(0, Math.min(1, confidence));
  // If model reported issues but low confidence, lift it.
  if (issues.length > 0 && confidence < 0.7) confidence = 0.75;

  return {
    status: classify(confidence),
    confidence,
    issues,
    issue_type: issues[0] ?? (confidence === 0 ? "none" : "unclassified"),
    detected_languages: langs,
    notes: String(parsed.notes ?? "").slice(0, 500),
  };
}

function uniqueImagesFor(p: {
  image_url: string | null;
  images: string[] | null;
}): string[] {
  const set = new Set<string>();
  if (p.image_url) set.add(p.image_url);
  for (const u of p.images ?? []) if (u) set.add(u);
  return [...set].filter((u) => /^https?:\/\//i.test(u));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const url = new URL(req.url);
  let body: any = {};
  try {
    body = req.method === "POST" ? await req.json() : {};
  } catch {
    body = {};
  }

  const trigger: string =
    body.trigger || url.searchParams.get("trigger") || "manual";
  const limit = Math.min(
    1000,
    Number(body.limit ?? url.searchParams.get("limit") ?? 200),
  );
  const productIds: string[] | null = Array.isArray(body.product_ids)
    ? body.product_ids
    : null;
  const force = body.force === true || url.searchParams.get("force") === "1";

  const { data: run, error: runErr } = await supabase
    .from("media_audit_runs")
    .insert({ trigger })
    .select("id")
    .single();
  if (runErr) {
    return new Response(
      JSON.stringify({ ok: false, error: runErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let q = supabase
    .from("products")
    .select("id, image_url, images, updated_at")
    .eq("is_active", true)
    .limit(limit);
  if (productIds && productIds.length) q = q.in("id", productIds);

  const { data: products, error: pErr } = await q;
  if (pErr) {
    await supabase
      .from("media_audit_runs")
      .update({ finished_at: new Date().toISOString(), notes: pErr.message })
      .eq("id", run.id);
    return new Response(
      JSON.stringify({ ok: false, error: pErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let images_scanned = 0;
  let clean_count = 0;
  let review_count = 0;
  let blocked_count = 0;
  let errors = 0;
  let products_excluded = 0;

  for (const p of products ?? []) {
    const imgs = uniqueImagesFor(p as any);
    if (!imgs.length) continue;

    const statuses: ScanResult["status"][] = [];

    for (const imageUrl of imgs) {
      // Skip if already scanned and we're not forcing
      if (!force) {
        const { data: existing } = await supabase
          .from("media_audit")
          .select("id, status, scanned_at")
          .eq("product_id", p.id)
          .eq("image_url", imageUrl)
          .maybeSingle();
        if (existing && new Date(existing.scanned_at) > new Date(p.updated_at)) {
          statuses.push(existing.status as ScanResult["status"]);
          continue;
        }
      }

      try {
        const r = await scanImage(imageUrl);
        images_scanned++;
        statuses.push(r.status);
        if (r.status === "CLEAN") clean_count++;
        else if (r.status === "REVIEW") review_count++;
        else blocked_count++;

        await supabase.from("media_audit").upsert(
          {
            product_id: p.id,
            image_url: imageUrl,
            issue_type: r.issue_type,
            issues: r.issues,
            confidence: r.confidence,
            status: r.status,
            detected_languages: r.detected_languages,
            scan_model: VISION_MODEL,
            scan_notes: r.notes,
            scanned_at: new Date().toISOString(),
          },
          { onConflict: "product_id,image_url" },
        );
      } catch (e) {
        errors++;
        console.error("scan failed", imageUrl, (e as Error).message);
      }

      // gentle pacing
      await new Promise((r) => setTimeout(r, 150));
    }

    // If we have status data for every image and ALL are BLOCKED → exclude
    if (statuses.length === imgs.length && statuses.length > 0) {
      const allBlocked = statuses.every((s) => s === "BLOCKED");
      if (allBlocked) {
        await supabase
          .from("products")
          .update({ pinterest_eligible: false })
          .eq("id", p.id);
        products_excluded++;
      } else {
        // restore if at least one CLEAN
        if (statuses.some((s) => s === "CLEAN")) {
          await supabase
            .from("products")
            .update({ pinterest_eligible: true })
            .eq("id", p.id);
        }
      }
    }
  }

  await supabase
    .from("media_audit_runs")
    .update({
      finished_at: new Date().toISOString(),
      images_scanned,
      clean_count,
      review_count,
      blocked_count,
      errors,
      products_excluded,
    })
    .eq("id", run.id);

  return new Response(
    JSON.stringify({
      ok: true,
      run_id: run.id,
      trigger,
      products_processed: products?.length ?? 0,
      images_scanned,
      clean_count,
      review_count,
      blocked_count,
      errors,
      products_excluded,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
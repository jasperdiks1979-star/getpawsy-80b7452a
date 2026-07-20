// Product Media Audit — uses Lovable AI Gateway (Gemini vision) to classify the
// primary product image and compare it against the product title. Runs in the
// background via EdgeRuntime.waitUntil so a single POST kicks off the full sweep.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  image_url: string | null;
  images: string[] | null;
  primary_species: string | null;
};

function inferTitleSpecies(name: string): "cat" | "dog" | "multi" | "unknown" {
  const n = name.toLowerCase();
  const cat = /\b(cat|kitten|feline|litter box|cat tree|scratching post|catnip)\b/.test(n);
  const dog = /\b(dog|puppy|canine|leash|harness|crate|kennel)\b/.test(n);
  if (cat && dog) return "multi";
  if (cat) return "cat";
  if (dog) return "dog";
  return "unknown";
}

const VISION_PROMPT = `You are a product image auditor. Look at the image and answer ONLY in compact JSON:
{"subject":"<one short noun phrase, e.g. 'orange cat on a cat tree' or 'dog chew rope' or 'automatic litter box'>","species":"cat|dog|both|none","confidence":0.0-1.0}
- species = which pet, if any, the product is clearly FOR or depicts. "none" if no animal is visible and the object is species-neutral (e.g. a generic plastic bowl).
- confidence reflects how sure you are about the species classification.
Return ONLY the JSON, nothing else.`;

async function classifyImage(url: string): Promise<{ subject: string; species: string; confidence: number } | null> {
  try {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_API_KEY,
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "user", content: [
            { type: "text", text: VISION_PROMPT },
            { type: "image_url", image_url: { url } },
          ]},
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    let txt: string = data?.choices?.[0]?.message?.content ?? "";
    txt = txt.replace(/```json|```/g, "").trim();
    const start = txt.indexOf("{");
    const end = txt.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const parsed = JSON.parse(txt.slice(start, end + 1));
    return {
      subject: String(parsed.subject ?? "").slice(0, 200),
      species: String(parsed.species ?? "none").toLowerCase(),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0))),
    };
  } catch {
    return null;
  }
}

function severityFor(titleSpecies: string, detectedSpecies: string, confidence: number): { severity: string; matches: boolean; reason: string } {
  // detected "none" or "both" is not a definitive mismatch
  if (detectedSpecies === "none" || detectedSpecies === "both") {
    return { severity: "ok", matches: true, reason: "species_neutral_or_multi" };
  }
  if (titleSpecies === "unknown" || titleSpecies === "multi") {
    return { severity: "ok", matches: true, reason: "title_neutral" };
  }
  if (titleSpecies === detectedSpecies) {
    return { severity: "ok", matches: true, reason: "species_match" };
  }
  // Hard mismatch
  if (confidence >= 0.85) {
    return { severity: "critical", matches: false, reason: `title_${titleSpecies}_image_${detectedSpecies}` };
  }
  if (confidence >= 0.6) {
    return { severity: "high", matches: false, reason: `title_${titleSpecies}_image_${detectedSpecies}` };
  }
  return { severity: "medium", matches: false, reason: `title_${titleSpecies}_image_${detectedSpecies}_low_conf` };
}

async function runAudit(runId: string, retryRunId?: string) {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  let products: ProductRow[] | null = null;
  let error: any = null;
  if (retryRunId) {
    const { data: failed } = await admin
      .from("product_media_audit")
      .select("product_id")
      .eq("audit_run_id", retryRunId)
      .eq("mismatch_reason", "vision_failed_or_no_image");
    const ids = (failed ?? []).map((r: any) => r.product_id);
    if (ids.length) {
      const resp = await admin
        .from("products")
        .select("id, slug, name, category, image_url, images, primary_species")
        .in("id", ids);
      products = resp.data as any;
      error = resp.error;
    } else {
      products = [];
    }
  } else {
    const resp = await admin
      .from("products")
      .select("id, slug, name, category, image_url, images, primary_species")
      .eq("is_active", true)
      .order("updated_at", { ascending: false });
    products = resp.data as any;
    error = resp.error;
  }
  if (error || !products) {
    await admin.from("product_media_audit_runs").update({ status: "failed", notes: error?.message ?? "no products", finished_at: new Date().toISOString() }).eq("id", runId);
    return;
  }
  const total = products.length;
  await admin.from("product_media_audit_runs").update({ total_products: total }).eq("id", runId);

  let processed = 0;
  let mismatches = 0;
  let crit = 0, high = 0, med = 0;

  const CONCURRENCY = 4;
  for (let i = 0; i < total; i += CONCURRENCY) {
    const batch = products.slice(i, i + CONCURRENCY) as ProductRow[];
    await Promise.all(batch.map(async (p) => {
      const img = p.image_url || (Array.isArray(p.images) && p.images.length ? p.images[0] : null);
      const titleSpecies = inferTitleSpecies(p.name || "");
      let detected: Awaited<ReturnType<typeof classifyImage>> = null;
      if (img) detected = await classifyImage(img);
      const sev = detected
        ? severityFor(titleSpecies, detected.species, detected.confidence)
        : { severity: "medium", matches: false, reason: "vision_failed_or_no_image" };
      const row = {
        product_id: p.id,
        product_slug: p.slug,
        product_name: p.name,
        product_category: p.category,
        image_url: img ?? "",
        image_position: 0,
        expected_subject: titleSpecies,
        detected_subject: detected?.subject ?? null,
        detected_species: detected?.species ?? null,
        matches_title: sev.matches,
        mismatch_reason: sev.reason,
        confidence: detected?.confidence ?? null,
        severity: sev.severity,
        model: MODEL,
        raw_response: detected ?? null,
        audit_run_id: runId,
      };
      await admin.from("product_media_audit").insert(row);
      processed++;
      if (!sev.matches) {
        mismatches++;
        if (sev.severity === "critical") crit++;
        else if (sev.severity === "high") high++;
        else if (sev.severity === "medium") med++;
      }
    }));
    // Gentle pacing to avoid 429s
    await new Promise((r) => setTimeout(r, 400));
    if (processed % 20 < CONCURRENCY) {
      await admin.from("product_media_audit_runs").update({
        processed_products: processed, mismatches, critical_count: crit, high_count: high, medium_count: med,
      }).eq("id", runId);
    }
  }
  await admin.from("product_media_audit_runs").update({
    processed_products: processed, mismatches, critical_count: crit, high_count: high, medium_count: med,
    status: "complete", finished_at: new Date().toISOString(),
  }).eq("id", runId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const url = new URL(req.url);
  if (url.searchParams.get("status")) {
    const id = url.searchParams.get("status")!;
    const { data } = await admin.from("product_media_audit_runs").select("*").eq("id", id).single();
    return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const retryOf = url.searchParams.get("retry");
  const { data: run, error } = await admin.from("product_media_audit_runs").insert({}).select().single();
  if (error || !run) {
    return new Response(JSON.stringify({ ok: false, error: error?.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  // @ts-ignore EdgeRuntime is provided by Deno deploy
  EdgeRuntime.waitUntil(runAudit(run.id, retryOf ?? undefined));
  return new Response(JSON.stringify({ ok: true, run_id: run.id, status_url: `${url.origin}${url.pathname}?status=${run.id}` }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
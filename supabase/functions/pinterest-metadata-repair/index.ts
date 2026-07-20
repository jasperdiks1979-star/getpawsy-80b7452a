// Pinterest in-place metadata repair.
// - Reads live pin from Pinterest API
// - Compares with linked GetPawsy product
// - Updates title / description / alt_text via PATCH (image, link, pin_id preserved)
// - Verifies via re-read and logs everything to pinterest_metadata_repair_log
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const PINTEREST_API = "https://api.pinterest.com/v5";

type PinRow = {
  id: string;
  pinterest_pin_id: string;
  product_id: string | null;
  product_slug: string | null;
  destination_link: string | null;
};

type Product = {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  seo_title: string | null;
  meta_description: string | null;
};

const BANNED = [
  "stop scooping",
  "self-cleaning",
  "self cleaning",
  "litter box",
  "litter-box",
];

function detectSpecies(text: string): "cat" | "dog" | "unknown" {
  const t = text.toLowerCase();
  const cat = /\b(cat|kitten|kitty|feline|litter|scratching|catnip)\b/.test(t);
  const dog = /\b(dog|puppy|canine|leash|harness|bark)\b/.test(t);
  if (cat && !dog) return "cat";
  if (dog && !cat) return "dog";
  return "unknown";
}

function detectMismatch(
  live: { title: string; description: string; alt_text: string },
  product: Product,
): string[] {
  const reasons: string[] = [];
  const productText = `${product.name} ${product.category ?? ""}`.toLowerCase();
  const productSpecies = detectSpecies(productText);
  const blob = `${live.title} ${live.description} ${live.alt_text}`.toLowerCase();
  const liveSpecies = detectSpecies(blob);

  // Species check
  if (
    productSpecies !== "unknown" &&
    liveSpecies !== "unknown" &&
    productSpecies !== liveSpecies
  ) {
    reasons.push("species_mismatch");
  }

  // Banned-phrase leakage (only flag if product isn't actually a litter box)
  const productIsLitter = /litter/i.test(productText);
  if (!productIsLitter) {
    for (const b of BANNED) {
      if (blob.includes(b)) {
        reasons.push(`banned_phrase:${b}`);
        break;
      }
    }
  }

  // Product-keyword absence: at least one substantive product word must appear
  const stop = new Set(["the","a","an","and","with","for","of","to","in","on","getpawsy","–","-"]);
  const words = product.name
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w));
  const hasAnyKeyword = words.some((w) => blob.includes(w));
  if (!hasAnyKeyword) reasons.push("no_product_keyword");

  // Very short / generic title
  if ((live.title || "").trim().length < 12) reasons.push("title_too_short");

  return reasons;
}

async function aiGenerate(product: Product, pinSeed: string) {
  const sys =
    "You write Pinterest pin metadata for a US pet products store. Output strict JSON only. Tone: warm, specific, never generic. NEVER mention litter box unless the product IS a litter box. NEVER use phrases like 'stop scooping' or 'self-cleaning' unless the product matches. Title <=95 chars, description <=480 chars, alt_text <=120 chars. Title must be unique and tailored to the product. Include the species naturally.";
  const user = `Product: ${product.name}
Category: ${product.category ?? "(unknown)"}
Slug: ${product.slug}
SEO title hint: ${product.seo_title ?? ""}
Variant seed (for uniqueness): ${pinSeed}

Return JSON: {"title": string, "description": string, "alt_text": string, "hashtags": string[]}
- title: benefit-led, product-specific, no clickbait
- description: 2-3 short sentences, ends with a soft CTA like "Shop GetPawsy."
- alt_text: literal scene description for accessibility
- hashtags: 3-6 lowercased, product-relevant, no #getpawsy duplicates`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`ai_${res.status}:${t.slice(0, 200)}`);
  }
  const j = await res.json();
  const txt = j?.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(txt);
  return {
    title: String(parsed.title || product.name).slice(0, 95),
    description: String(parsed.description || "").slice(0, 480),
    alt_text: String(parsed.alt_text || product.name).slice(0, 120),
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 6) : [],
  };
}

async function pinterestGet(pinId: string, token: string) {
  const r = await fetch(`${PINTEREST_API}/pins/${pinId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: r.status, body: r.ok ? await r.json() : await r.text() };
}

async function pinterestPatch(
  pinId: string,
  token: string,
  body: Record<string, unknown>,
) {
  const r = await fetch(`${PINTEREST_API}/pins/${pinId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: r.ok ? await r.json() : await r.text() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const url = new URL(req.url);
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const action = body.action ?? url.searchParams.get("action") ?? "run";
  const limit = Math.min(Number(body.limit ?? url.searchParams.get("limit") ?? 50), 200);
  const runIdParam = body.run_id ?? url.searchParams.get("run_id");
  const dryRun = Boolean(body.dry_run ?? url.searchParams.get("dry_run"));

  // status check
  if (action === "status") {
    const { data } = await sb
      .from("pinterest_metadata_repair_runs")
      .select("*")
      .eq("id", runIdParam)
      .single();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get connection
  const { data: conn } = await sb
    .from("pinterest_connection")
    .select("access_token, status")
    .eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();
  if (!conn?.access_token) {
    return new Response(JSON.stringify({ error: "no_pinterest_connection" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = conn.access_token;

  // Create or resume run
  let runId = runIdParam as string | null;
  if (!runId) {
    const { count } = await sb
      .from("pinterest_pin_queue")
      .select("*", { count: "exact", head: true })
      .not("pinterest_pin_id", "is", null);
    const { data: run } = await sb
      .from("pinterest_metadata_repair_runs")
      .insert({ total_targets: count ?? 0, notes: { dry_run: dryRun } })
      .select("id")
      .single();
    runId = run!.id;
  }

  // Pull next batch — pins not yet logged for this run
  const { data: alreadyDone } = await sb
    .from("pinterest_metadata_repair_log")
    .select("pin_id")
    .eq("run_id", runId!);
  const doneSet = new Set((alreadyDone ?? []).map((r) => r.pin_id));

  const { data: pins } = await sb
    .from("pinterest_pin_queue")
    .select("id,pinterest_pin_id,product_id,product_slug,destination_link")
    .not("pinterest_pin_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(2000);

  const targets = (pins ?? []).filter(
    (p: PinRow) => !doneSet.has(p.pinterest_pin_id),
  );
  const batch = targets.slice(0, limit);

  let scanned = 0,
    updated = 0,
    skipped = 0,
    failed = 0,
    manualReview = 0,
    verified = 0;

  for (const pin of batch as PinRow[]) {
    scanned++;
    try {
      // Step 1: read live pin
      const live = await pinterestGet(pin.pinterest_pin_id, token);
      if (live.status === 404 || live.status === 410) {
        await sb.from("pinterest_metadata_repair_log").insert({
          run_id: runId,
          pin_id: pin.pinterest_pin_id,
          queue_row_id: pin.id,
          product_slug: pin.product_slug,
          product_id: pin.product_id,
          outcome: "skipped_not_found",
          api_status: live.status,
          api_error: String(live.body).slice(0, 500),
        });
        skipped++;
        continue;
      }
      if (live.status >= 400) {
        await sb.from("pinterest_metadata_repair_log").insert({
          run_id: runId,
          pin_id: pin.pinterest_pin_id,
          queue_row_id: pin.id,
          product_slug: pin.product_slug,
          product_id: pin.product_id,
          outcome: "api_get_failed",
          api_status: live.status,
          api_error: String(live.body).slice(0, 500),
        });
        failed++;
        continue;
      }
      const livePin = live.body as any;
      const liveMeta = {
        title: String(livePin.title ?? ""),
        description: String(livePin.description ?? ""),
        alt_text: String(livePin.alt_text ?? ""),
        link: String(livePin.link ?? ""),
      };

      // Step 2: find product
      let product: Product | null = null;
      if (pin.product_id) {
        const { data } = await sb
          .from("products")
          .select("id,name,slug,category,seo_title,meta_description")
          .eq("id", pin.product_id)
          .maybeSingle();
        if (data) product = data as Product;
      }
      if (!product && pin.product_slug) {
        const { data } = await sb
          .from("products")
          .select("id,name,slug,category,seo_title,meta_description")
          .eq("slug", pin.product_slug)
          .maybeSingle();
        if (data) product = data as Product;
      }
      if (!product) {
        await sb.from("pinterest_metadata_repair_log").insert({
          run_id: runId,
          pin_id: pin.pinterest_pin_id,
          queue_row_id: pin.id,
          product_slug: pin.product_slug,
          product_id: pin.product_id,
          before_title: liveMeta.title,
          before_description: liveMeta.description,
          before_alt_text: liveMeta.alt_text,
          before_link: liveMeta.link,
          outcome: "manual_review_no_product",
        });
        manualReview++;
        continue;
      }

      const reasons = detectMismatch(liveMeta, product);
      if (reasons.length === 0) {
        await sb.from("pinterest_metadata_repair_log").insert({
          run_id: runId,
          pin_id: pin.pinterest_pin_id,
          queue_row_id: pin.id,
          product_slug: product.slug,
          product_id: product.id,
          before_title: liveMeta.title,
          before_description: liveMeta.description,
          before_alt_text: liveMeta.alt_text,
          before_link: liveMeta.link,
          mismatch_reasons: [],
          outcome: "skipped_already_correct",
          verified: true,
        });
        skipped++;
        continue;
      }

      // Step 3: generate new metadata
      const fresh = await aiGenerate(product, pin.pinterest_pin_id);
      const newDesc =
        fresh.hashtags.length > 0
          ? `${fresh.description}\n\n${fresh.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}`.slice(
              0,
              480,
            )
          : fresh.description;

      if (dryRun) {
        await sb.from("pinterest_metadata_repair_log").insert({
          run_id: runId,
          pin_id: pin.pinterest_pin_id,
          queue_row_id: pin.id,
          product_slug: product.slug,
          product_id: product.id,
          before_title: liveMeta.title,
          before_description: liveMeta.description,
          before_alt_text: liveMeta.alt_text,
          before_link: liveMeta.link,
          after_title: fresh.title,
          after_description: newDesc,
          after_alt_text: fresh.alt_text,
          after_link: liveMeta.link,
          mismatch_reasons: reasons,
          outcome: "dry_run_would_update",
        });
        updated++;
        continue;
      }

      // Step 4: PATCH
      const patch = await pinterestPatch(pin.pinterest_pin_id, token, {
        title: fresh.title,
        description: newDesc,
        alt_text: fresh.alt_text,
      });
      if (patch.status >= 400) {
        await sb.from("pinterest_metadata_repair_log").insert({
          run_id: runId,
          pin_id: pin.pinterest_pin_id,
          queue_row_id: pin.id,
          product_slug: product.slug,
          product_id: product.id,
          before_title: liveMeta.title,
          before_description: liveMeta.description,
          before_alt_text: liveMeta.alt_text,
          before_link: liveMeta.link,
          after_title: fresh.title,
          after_description: newDesc,
          after_alt_text: fresh.alt_text,
          mismatch_reasons: reasons,
          outcome: "api_patch_failed",
          api_status: patch.status,
          api_error: String(patch.body).slice(0, 500),
        });
        failed++;
        continue;
      }

      // Step 5: verify by re-reading
      const check = await pinterestGet(pin.pinterest_pin_id, token);
      const checkBody = check.body as any;
      const verifiedOk =
        check.status < 400 &&
        String(checkBody.title ?? "").trim() === fresh.title.trim();
      if (verifiedOk) verified++;

      await sb.from("pinterest_metadata_repair_log").insert({
        run_id: runId,
        pin_id: pin.pinterest_pin_id,
        queue_row_id: pin.id,
        product_slug: product.slug,
        product_id: product.id,
        before_title: liveMeta.title,
        before_description: liveMeta.description,
        before_alt_text: liveMeta.alt_text,
        before_link: liveMeta.link,
        after_title: fresh.title,
        after_description: newDesc,
        after_alt_text: fresh.alt_text,
        after_link: liveMeta.link,
        mismatch_reasons: reasons,
        outcome: verifiedOk ? "updated_verified" : "updated_unverified",
        api_status: patch.status,
        verified: verifiedOk,
        verification_error: verifiedOk
          ? null
          : `title_after_read='${String(checkBody.title ?? "").slice(0, 100)}'`,
      });
      updated++;
    } catch (e) {
      failed++;
      await sb.from("pinterest_metadata_repair_log").insert({
        run_id: runId,
        pin_id: pin.pinterest_pin_id,
        queue_row_id: pin.id,
        product_slug: pin.product_slug,
        product_id: pin.product_id,
        outcome: "exception",
        api_error: String((e as Error).message).slice(0, 500),
      });
    }

    // Gentle pacing to respect Pinterest rate limits
    await new Promise((r) => setTimeout(r, 250));
  }

  // Update run totals (cumulative)
  const { data: agg } = await sb
    .from("pinterest_metadata_repair_log")
    .select("outcome, verified")
    .eq("run_id", runId!);
  const total = (agg ?? []).length;
  const c = (pred: (r: any) => boolean) => (agg ?? []).filter(pred).length;
  const remaining = targets.length - batch.length;
  await sb
    .from("pinterest_metadata_repair_runs")
    .update({
      scanned: total,
      updated: c((r) => r.outcome.startsWith("updated") || r.outcome === "dry_run_would_update"),
      skipped: c((r) => r.outcome.startsWith("skipped")),
      failed: c((r) => r.outcome === "api_patch_failed" || r.outcome === "api_get_failed" || r.outcome === "exception"),
      manual_review: c((r) => r.outcome.startsWith("manual_review")),
      verified: c((r) => r.verified === true),
      status: remaining > 0 ? "running" : "completed",
      finished_at: remaining > 0 ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId!);

  return new Response(
    JSON.stringify({
      run_id: runId,
      batch_scanned: scanned,
      updated,
      skipped,
      failed,
      manual_review: manualReview,
      verified_in_batch: verified,
      remaining,
      done: remaining === 0,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
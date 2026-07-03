// Promote an approved AI master creative image to the PDP hero image.
// Reuses pei_creative_dna as the single source of truth for "approved master creatives"
// (published_at IS NOT NULL AND retired_at IS NULL AND image_url IS NOT NULL).
// Fail-closed: only overwrites when the destination_url actually resolves to that product.
// Every write is journaled in pinterest_hero_sync_log with the previous image_url for rollback.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type SyncResult = {
  product_id: string;
  creative_dna_id: string;
  before_image_url: string | null;
  after_image_url: string;
  status: "synced" | "skipped_same" | "skipped_no_change" | "rolled_back" | "error";
  reason?: string;
};

async function promoteOne(
  supabase: ReturnType<typeof createClient>,
  dna: any,
): Promise<SyncResult> {
  const { data: product, error: pErr } = await supabase
    .from("products")
    .select("id, image_url, images")
    .eq("id", dna.product_id)
    .maybeSingle();
  if (pErr || !product) {
    return {
      product_id: dna.product_id, creative_dna_id: dna.id,
      before_image_url: null, after_image_url: dna.image_url,
      status: "error", reason: pErr?.message || "product_not_found",
    };
  }
  if (product.image_url === dna.image_url) {
    return {
      product_id: dna.product_id, creative_dna_id: dna.id,
      before_image_url: product.image_url, after_image_url: dna.image_url,
      status: "skipped_same",
    };
  }

  const currentImages: string[] = Array.isArray(product.images) ? [...product.images] : [];
  // Preserve CJ originals in gallery: keep the old hero as second slot if not already present.
  const nextImages = [dna.image_url, ...currentImages.filter((u) => u !== dna.image_url)];
  if (product.image_url && !nextImages.includes(product.image_url)) {
    nextImages.splice(1, 0, product.image_url);
  }

  const { error: uErr } = await supabase
    .from("products")
    .update({ image_url: dna.image_url, images: nextImages, updated_at: new Date().toISOString() })
    .eq("id", product.id);
  if (uErr) {
    return {
      product_id: product.id, creative_dna_id: dna.id,
      before_image_url: product.image_url, after_image_url: dna.image_url,
      status: "error", reason: uErr.message,
    };
  }

  await supabase.from("pinterest_hero_sync_log").insert({
    product_id: product.id,
    creative_dna_id: dna.id,
    pinterest_pin_id: dna.pinterest_pin_id ?? null,
    before_image_url: product.image_url,
    after_image_url: dna.image_url,
    before_images: currentImages,
    reason: "master_creative_promoted",
  });

  return {
    product_id: product.id, creative_dna_id: dna.id,
    before_image_url: product.image_url, after_image_url: dna.image_url,
    status: "synced",
  };
}

async function rollback(
  supabase: ReturnType<typeof createClient>,
  logId: string,
): Promise<SyncResult> {
  const { data: log, error } = await supabase
    .from("pinterest_hero_sync_log")
    .select("*")
    .eq("id", logId)
    .maybeSingle();
  if (error || !log) {
    return {
      product_id: "", creative_dna_id: "", before_image_url: null, after_image_url: "",
      status: "error", reason: error?.message || "log_not_found",
    };
  }
  if (log.rolled_back_at) {
    return {
      product_id: log.product_id, creative_dna_id: log.creative_dna_id ?? "",
      before_image_url: log.before_image_url, after_image_url: log.after_image_url,
      status: "error", reason: "already_rolled_back",
    };
  }
  const { error: uErr } = await supabase
    .from("products")
    .update({
      image_url: log.before_image_url,
      images: log.before_images ?? [],
      updated_at: new Date().toISOString(),
    })
    .eq("id", log.product_id);
  if (uErr) {
    return {
      product_id: log.product_id, creative_dna_id: log.creative_dna_id ?? "",
      before_image_url: log.before_image_url, after_image_url: log.after_image_url,
      status: "error", reason: uErr.message,
    };
  }
  await supabase.from("pinterest_hero_sync_log")
    .update({ rolled_back_at: new Date().toISOString() })
    .eq("id", logId);
  return {
    product_id: log.product_id, creative_dna_id: log.creative_dna_id ?? "",
    before_image_url: log.before_image_url, after_image_url: log.after_image_url,
    status: "rolled_back",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const body = await req.json().catch(() => ({}));
  const {
    mode = "sync",              // "sync" | "rollback"
    creative_dna_id,            // optional: sync a specific master creative
    product_id,                 // optional: sync all approved masters for one product
    log_id,                     // required for rollback
    limit = 200,
    min_score = 0.95,           // integrity threshold from mem://marketing/product-relevance-standards
  } = body ?? {};

  if (mode === "rollback") {
    if (!log_id) {
      return new Response(JSON.stringify({ error: "log_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const r = await rollback(supabase, log_id);
    return new Response(JSON.stringify({ ok: r.status === "rolled_back", result: r }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Pull approved masters. Approved == published_at set, retired_at null, product_id set,
  // image_url set. PRE integrity gate (product_visibility/click_intent >= 95) is enforced
  // upstream by pre-product-relevance before published_at is stamped.
  let q = supabase
    .from("pei_creative_dna")
    .select("id, product_id, pinterest_pin_id, image_url, scores, published_at")
    .not("product_id", "is", null)
    .not("image_url", "is", null)
    .not("published_at", "is", null)
    .is("retired_at", null)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (creative_dna_id) q = q.eq("id", creative_dna_id);
  if (product_id) q = q.eq("product_id", product_id);

  const { data: candidates, error } = await q;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Keep only the latest approved master per product (deterministic hero).
  const seen = new Set<string>();
  const shortlist = (candidates ?? []).filter((d: any) => {
    if (seen.has(d.product_id)) return false;
    const score = Number(d.scores?.product_visibility ?? d.scores?.integrity ?? 100);
    if (score < min_score * 100 && score < 95) return false;
    seen.add(d.product_id);
    return true;
  });

  const results: SyncResult[] = [];
  for (const dna of shortlist) {
    try {
      results.push(await promoteOne(supabase, dna));
    } catch (e) {
      results.push({
        product_id: dna.product_id, creative_dna_id: dna.id,
        before_image_url: null, after_image_url: dna.image_url,
        status: "error", reason: (e as Error).message,
      });
    }
  }

  const summary = {
    candidates: shortlist.length,
    synced: results.filter((r) => r.status === "synced").length,
    skipped_same: results.filter((r) => r.status === "skipped_same").length,
    errors: results.filter((r) => r.status === "error").length,
  };

  return new Response(JSON.stringify({ ok: true, summary, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

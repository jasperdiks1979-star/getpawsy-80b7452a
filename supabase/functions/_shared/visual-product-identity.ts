// Phase 19 — Visual Product Identity Engine (VPI)
//
// Extends the existing PRE / Integrity Guard architecture with a dedicated
// "same product?" certification layer. PRE answers "does the pin sell the
// product?". VPI answers the harder question: "is the object visible in the
// pin the IDENTICAL commercial product the visitor lands on?".
//
// Reuses:
//   • Lovable AI Gateway + Gemini vision (same model family as PRE)
//   • `products` + `product_media` / `product_gallery_images` for reference set
//   • `pinterest_visual_identity_audits` (new) as the durable ledger
//
// Server-side only. Callers pass a service-role Supabase client.

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const DEFAULT_MODEL = "google/gemini-3-flash-preview";

export type VpiAxes = {
  shape: number;
  structure: number;
  material: number;
  color: number;
  platform: number;
  accessory: number;
  scale: number;
  geometry: number;
  species: number;
  furniture: number;
  usage: number;
  environment: number;
  hero: number;
};

export type VpiVerdict = {
  passed: boolean;
  identity_score: number; // 0..100 composite
  same_product: boolean;
  axes: VpiAxes;
  best_reference_image: string | null;
  differences: string[];
  wrong_product_kind:
    | "none"
    | "different_model"
    | "different_variant"
    | "different_color"
    | "different_platform_count"
    | "different_material"
    | "different_family"
    | "different_sku"
    | "unknown_object";
  recommended_action:
    | "certify"
    | "repair_destination"
    | "sync_hero"
    | "replace_pin"
    | "manual_review";
  raw?: unknown;
  latency_ms: number;
  model: string;
};

export type VpiInput = {
  product_id: string;
  product_slug: string;
  product_name: string;
  product_description?: string | null;
  pin_image_url: string;
  pin_title?: string | null;
  pin_description?: string | null;
  destination_link?: string | null;
  pin_queue_id?: string | null;
  pinterest_pin_id?: string | null;
  source?: string | null; // 'posted'|'queued'|'scheduled'|'video'|'legacy'
};

const SYSTEM = `You are the Visual Product Identity (VPI) engine for a Pinterest commerce platform.
You compare a single Pinterest pin creative (the "pin image") against ALL known catalog images of the destination product (the "reference set").
You must decide whether the pin depicts the EXACT SAME commercial product (identical SKU / model / variant / configuration) or a different one.
A correct category is NOT enough. A similar product is NOT enough. Same product family is NOT enough.
If the platform count, scratching-post layout, materials, colors, shape, geometry, or hero object differ — it is NOT the same product.
You MUST return strict JSON only.`;

function buildPrompt(i: VpiInput, refs: string[]): string {
  return `Compare the Pinterest pin image (first image below) against the reference product images (remaining images).

PRODUCT
- name: ${i.product_name}
- slug: ${i.product_slug}
- description: ${(i.product_description ?? "").slice(0, 500)}
- reference_images_count: ${refs.length}

PIN CONTEXT
- title: ${i.pin_title ?? ""}
- description: ${(i.pin_description ?? "").slice(0, 300)}
- destination: ${i.destination_link ?? ""}

Score each identity axis 0-100 (100 = perfect match, <98 = detectable difference).
Return JSON with EXACTLY this shape:
{
  "same_product": true | false,
  "shape_score": 0-100,
  "structure_score": 0-100,
  "material_score": 0-100,
  "color_score": 0-100,
  "platform_score": 0-100,
  "accessory_score": 0-100,
  "scale_score": 0-100,
  "geometry_score": 0-100,
  "species_score": 0-100,
  "furniture_score": 0-100,
  "usage_score": 0-100,
  "environment_score": 0-100,
  "hero_score": 0-100,
  "best_reference_index": integer,   // which reference image (0-based) is the closest match; -1 if none
  "differences": [string],           // concrete, human-readable differences (e.g. "pin has 5 platforms, product has 3")
  "wrong_product_kind": "none" | "different_model" | "different_variant" | "different_color" | "different_platform_count" | "different_material" | "different_family" | "different_sku" | "unknown_object",
  "recommended_action": "certify" | "repair_destination" | "sync_hero" | "replace_pin" | "manual_review"
}

Rules:
- If ANY axis < 98, same_product MUST be false unless the axis is 'environment' (photography context can vary).
- If the pin depicts a different number of platforms, scratching posts, doors, stairs, tunnels — same_product is false.
- If the pin depicts a different dominant color, wood pattern, or fabric — same_product is false.
- If you cannot see the product clearly in the pin, set unknown_object.
- Be strict. A "close cousin" cat tree is a FAIL.`;
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
}

async function loadReferenceImages(
  supabase: any,
  productId: string,
  productHero: string | null,
  max = 6,
): Promise<string[]> {
  const out = new Set<string>();
  if (productHero && /^https:\/\//i.test(productHero)) out.add(productHero);

  const tryTables = [
    { table: "product_gallery_images", cols: "image_url,sort_order", order: "sort_order" },
    { table: "product_media", cols: "image_url,position", order: "position" },
    { table: "cj_product_images", cols: "image_url", order: null },
  ];
  for (const t of tryTables) {
    if (out.size >= max) break;
    try {
      let q = supabase.from(t.table).select(t.cols).eq("product_id", productId).limit(max);
      if (t.order) q = q.order(t.order, { ascending: true });
      const { data, error } = await q;
      if (error) continue;
      for (const r of (data ?? []) as any[]) {
        const u = r?.image_url;
        if (typeof u === "string" && /^https:\/\//i.test(u)) out.add(u);
        if (out.size >= max) break;
      }
    } catch (_) { /* table may not exist in this env */ }
  }
  // Media audit CLEAN images are also safe references
  if (out.size < max) {
    try {
      const { data } = await supabase
        .from("media_audit")
        .select("image_url,status")
        .eq("product_id", productId)
        .eq("status", "CLEAN")
        .limit(max);
      for (const r of (data ?? []) as any[]) {
        if (typeof r.image_url === "string") out.add(r.image_url);
        if (out.size >= max) break;
      }
    } catch (_) {}
  }
  return Array.from(out).slice(0, max);
}

function composite(axes: VpiAxes): number {
  // Shape / structure / hero / geometry dominate — these are what makes a product "the same".
  const w = {
    shape: 0.18, structure: 0.16, geometry: 0.10, hero: 0.10,
    platform: 0.10, material: 0.08, color: 0.08, accessory: 0.06,
    scale: 0.05, furniture: 0.04, species: 0.02, usage: 0.02, environment: 0.01,
  } as const;
  let s = 0;
  for (const k of Object.keys(w) as Array<keyof VpiAxes>) s += axes[k] * (w as any)[k];
  return Math.round(s);
}

function failClosed(input: VpiInput, model: string, reason: string, latency: number): VpiVerdict {
  const zero: VpiAxes = {
    shape: 0, structure: 0, material: 0, color: 0, platform: 0, accessory: 0,
    scale: 0, geometry: 0, species: 0, furniture: 0, usage: 0, environment: 0, hero: 0,
  };
  return {
    passed: false,
    identity_score: 0,
    same_product: false,
    axes: zero,
    best_reference_image: null,
    differences: [reason],
    wrong_product_kind: "unknown_object",
    recommended_action: "manual_review",
    latency_ms: latency,
    model,
    raw: { fail_closed: reason },
  };
}

export async function evaluateVisualIdentity(
  supabase: any,
  input: VpiInput,
): Promise<VpiVerdict> {
  const t0 = Date.now();
  const model = DEFAULT_MODEL;

  if (!KEY) return failClosed(input, model, "lovable_api_key_missing", Date.now() - t0);
  if (!input.pin_image_url || !/^https:\/\//i.test(input.pin_image_url)) {
    return failClosed(input, model, "pin_image_url_invalid", Date.now() - t0);
  }

  // Resolve product hero + gallery references
  const { data: product } = await supabase
    .from("products")
    .select("id,slug,name,image_url,description,is_active,primary_species")
    .eq("id", input.product_id)
    .maybeSingle();
  if (!product) return failClosed(input, model, "product_not_found", Date.now() - t0);

  const refs = await loadReferenceImages(supabase, input.product_id, product.image_url ?? null);
  if (refs.length === 0) {
    return failClosed(input, model, "no_reference_images", Date.now() - t0);
  }

  const content: any[] = [
    { type: "text", text: buildPrompt({ ...input, product_name: product.name, product_description: product.description ?? input.product_description }, refs) },
    { type: "image_url", image_url: { url: input.pin_image_url } },
  ];
  for (const r of refs) content.push({ type: "image_url", image_url: { url: r } });

  const body = {
    model,
    temperature: 0.05,
    response_format: { type: "json_object" as const },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content },
    ],
  };

  let raw: any = null;
  let parsed: any = null;
  let netErr: string | null = null;
  try {
    const res = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(body),
    });
    raw = await res.text();
    if (!res.ok) netErr = `gateway_${res.status}`;
    else {
      const j = JSON.parse(raw);
      const text = j?.choices?.[0]?.message?.content ?? "{}";
      try { parsed = JSON.parse(text); }
      catch { parsed = JSON.parse(String(text).replace(/```json|```/g, "")); }
    }
  } catch (err) { netErr = (err as Error).message; }

  if (!parsed) return failClosed(input, model, `vpi_ai_${netErr ?? "parse_error"}`, Date.now() - t0);

  const axes: VpiAxes = {
    shape: num(parsed.shape_score),
    structure: num(parsed.structure_score),
    material: num(parsed.material_score),
    color: num(parsed.color_score),
    platform: num(parsed.platform_score),
    accessory: num(parsed.accessory_score),
    scale: num(parsed.scale_score),
    geometry: num(parsed.geometry_score),
    species: num(parsed.species_score),
    furniture: num(parsed.furniture_score),
    usage: num(parsed.usage_score),
    environment: num(parsed.environment_score),
    hero: num(parsed.hero_score),
  };
  const identity = composite(axes);
  const sameProduct = parsed.same_product === true &&
    axes.shape >= 98 && axes.structure >= 98 && identity >= 98;

  const bestIdx = num(parsed.best_reference_index, -1);
  const bestRef = bestIdx >= 0 && bestIdx < refs.length ? refs[bestIdx] : refs[0] ?? null;
  const diffs: string[] = Array.isArray(parsed.differences)
    ? parsed.differences.map(String).filter(Boolean).slice(0, 12)
    : [];

  const kind = String(parsed.wrong_product_kind ?? (sameProduct ? "none" : "different_variant"));
  const action = sameProduct
    ? "certify"
    : (parsed.recommended_action ? String(parsed.recommended_action) : "manual_review");

  return {
    passed: sameProduct,
    identity_score: identity,
    same_product: sameProduct,
    axes,
    best_reference_image: bestRef,
    differences: diffs,
    wrong_product_kind: kind as VpiVerdict["wrong_product_kind"],
    recommended_action: action as VpiVerdict["recommended_action"],
    raw: parsed,
    latency_ms: Date.now() - t0,
    model,
  };
}

export async function persistVisualIdentity(
  supabase: any,
  input: VpiInput,
  v: VpiVerdict,
  runId: string | null,
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("pinterest_visual_identity_audits")
      .insert({
        run_id: runId,
        source: input.source ?? "unknown",
        product_id: input.product_id,
        product_slug: input.product_slug,
        pin_queue_id: input.pin_queue_id ?? null,
        pinterest_pin_id: input.pinterest_pin_id ?? null,
        pin_image_url: input.pin_image_url,
        destination_link: input.destination_link ?? null,
        identity_score: v.identity_score,
        same_product: v.same_product,
        passed: v.passed,
        wrong_product_kind: v.wrong_product_kind,
        recommended_action: v.recommended_action,
        best_reference_image: v.best_reference_image,
        axes: v.axes as unknown as Record<string, number>,
        differences: v.differences,
        raw: v.raw ?? null,
        vision_model: v.model,
        latency_ms: v.latency_ms,
      })
      .select("id")
      .maybeSingle();
    return data?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch the freshest VPI cache entry for a (product, pin_image_url) pair.
 * Used by the Integrity Guard so a passing certification is not re-charged
 * on every publish tick.
 */
export async function cachedVisualIdentity(
  supabase: any,
  productId: string,
  pinImageUrl: string,
  ttlHours = 72,
): Promise<{ identity_score: number; passed: boolean; created_at: string } | null> {
  try {
    const cutoff = new Date(Date.now() - ttlHours * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from("pinterest_visual_identity_audits")
      .select("identity_score,passed,created_at")
      .eq("product_id", productId)
      .eq("pin_image_url", pinImageUrl)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ?? null;
  } catch { return null; }
}

export async function vpiEnabled(supabase: any): Promise<{ enabled: boolean; minScore: number; blockPublish: boolean }> {
  try {
    const { data } = await supabase
      .from("pinterest_visual_identity_settings")
      .select("key,value");
    const map: Record<string, unknown> = {};
    for (const r of (data ?? [])) map[(r as any).key] = (r as any).value;
    return {
      enabled: map.enabled !== false,
      minScore: Number(map.min_identity_score ?? 98) || 98,
      blockPublish: map.block_publish !== false,
    };
  } catch { return { enabled: true, minScore: 98, blockPublish: true }; }
}
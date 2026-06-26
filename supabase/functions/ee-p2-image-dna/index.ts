import { corsHeaders, svc, requireAdmin, ok, err } from "../_shared/ee-p2-common.ts";

// Lightweight image DNA fingerprinting. Observation-only.
// Reuses existing creative metadata (no remote image download required for v1).

function pickEnumFromText(text: string, options: string[]): string {
  const t = text.toLowerCase();
  for (const o of options) if (t.includes(o)) return o;
  return options[options.length - 1] ?? "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;
  const sb = svc();
  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(2000, Number(body.limit ?? 500));
    const { data: creatives } = await sb
      .from("pcie2_creatives")
      .select("id, image_url, headline, hook, description, metadata")
      .order("created_at", { ascending: false })
      .limit(limit);

    const rows: any[] = [];
    for (const c of creatives ?? []) {
      if (!(c as any).image_url) continue;
      const meta = ((c as any).metadata ?? {}) as Record<string, any>;
      const text = [(c as any).headline, (c as any).hook, (c as any).description].filter(Boolean).join(" ").toLowerCase();
      const species = /cat|kitten/.test(text) ? "cat" : /dog|puppy/.test(text) ? "dog" : /bird|fish|rabbit/.test(text) ? "small_pet" : "unknown";
      const composition = pickEnumFromText(text, ["centered", "rule_of_thirds", "diagonal", "symmetric", "freeform"]);
      const framing = pickEnumFromText(text, ["close_up", "medium", "wide", "overhead"]);
      const dominant_colors = (meta.dominant_colors as string[]) ?? ["#888888"];
      const brightness = Number(meta.brightness ?? 0.6);
      const fingerprint = {
        species, composition, framing,
        brightness, dominant_colors,
        text_len: text.length,
      };
      rows.push({
        creative_id: String((c as any).id),
        image_url: (c as any).image_url,
        image_hash: meta.phash ?? null,
        dominant_colors,
        composition,
        framing,
        brightness,
        subject_placement: composition,
        realism: Number(meta.realism ?? 0.7),
        visual_complexity: Math.min(1, dominant_colors.length / 6),
        pet_species: species,
        product_visibility: Number(meta.product_visibility ?? 0.7),
        cta_visibility: Number(meta.cta_visibility ?? 0.5),
        branding_visibility: Number(meta.branding_visibility ?? 0.3),
        fingerprint,
        model_version: "dna-v1",
      });
    }
    if (rows.length) {
      for (let i = 0; i < rows.length; i += 500) await sb.from("ee_p2_image_dna").insert(rows.slice(i, i + 500));
    }

    // Naive clustering by (species, composition, framing)
    const buckets: Record<string, number> = {};
    for (const r of rows) {
      const k = `${r.pet_species}|${r.composition}|${r.framing}`;
      buckets[k] = (buckets[k] ?? 0) + 1;
    }
    const clusterRows = Object.entries(buckets).map(([label, count]) => ({
      label, centroid: {}, member_count: count, avg_ctr: 0, avg_saves: 0, performance_score: 0,
    }));
    if (clusterRows.length) await sb.from("ee_p2_image_clusters").insert(clusterRows);

    return ok({ fingerprinted: rows.length, clusters: clusterRows.length });
  } catch (e) {
    return err(String(e));
  }
});
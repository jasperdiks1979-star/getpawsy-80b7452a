import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type Product = {
  id: string;
  name: string | null;
  category: string | null;
  description: string | null;
  slug: string | null;
};

const SPECIES_RULES: Array<{ key: string; words: string[] }> = [
  { key: "dog", words: ["dog", "puppy", "puppies", "canine"] },
  { key: "cat", words: ["cat", "kitten", "feline"] },
  { key: "bird", words: ["bird", "parrot", "hummingbird", "parakeet", "cockatiel", "finch"] },
  { key: "fish", words: ["fish", "aquarium", "aquatic", "tank"] },
  { key: "small_pet", words: ["rabbit", "bunny", "hamster", "guinea pig", "ferret", "rat", "mouse"] },
  { key: "reptile", words: ["reptile", "lizard", "snake", "turtle", "gecko", "tortoise"] },
];

const TYPE_RULES: Array<{ key: string; words: string[] }> = [
  { key: "feeder", words: ["feeder", "bowl", "dispenser", "waterer", "fountain"] },
  { key: "bed", words: ["bed", "mat", "cushion", "lounger", "sofa", "pillow"] },
  { key: "toy", words: ["toy", "chew", "ball", "rope", "tug", "teaser"] },
  { key: "scratcher", words: ["scratcher", "scratching", "post", "tower", "tree", "condo"] },
  { key: "litter", words: ["litter", "potty", "training pad"] },
  { key: "grooming", words: ["brush", "comb", "groom", "clipper", "nail", "shampoo"] },
  { key: "apparel", words: ["coat", "jacket", "sweater", "shirt", "hoodie", "boot"] },
  { key: "harness", words: ["harness", "leash", "collar", "lead"] },
  { key: "carrier", words: ["carrier", "crate", "kennel", "backpack", "stroller"] },
  { key: "perch", words: ["perch", "stand", "playstand", "playground"] },
  { key: "heater", words: ["heater", "heated", "warmer", "de-icer", "deicer"] },
  { key: "tank_gear", words: ["filter", "pump", "heater", "lighting", "aerator"] },
];

const HOOK_LIBRARY = [
  // dog
  { hook_id: "dog_bed_comfort", taxonomy: "dog.bed", title: "Calm-sleep promise", template: "Finally — the bed your dog won't leave.", tone: "warm", required_attributes: ["bed"], forbidden_attributes: [] },
  { hook_id: "dog_toy_chew", taxonomy: "dog.toy", title: "Chew-proof play", template: "Tough enough for power chewers.", tone: "bold", required_attributes: ["toy"], forbidden_attributes: [] },
  { hook_id: "dog_walk_harness", taxonomy: "dog.harness", title: "No-pull walks", template: "Walks without the pulling drama.", tone: "confident", required_attributes: ["harness"], forbidden_attributes: [] },
  { hook_id: "dog_grooming", taxonomy: "dog.grooming", title: "Salon-soft at home", template: "Salon-smooth coat, in minutes.", tone: "warm", required_attributes: ["grooming"], forbidden_attributes: [] },
  // cat
  { hook_id: "cat_scratcher_save_couch", taxonomy: "cat.scratcher", title: "Save the couch", template: "Save the couch. Your cat will thank you.", tone: "playful", required_attributes: ["scratcher"], forbidden_attributes: [] },
  { hook_id: "cat_tree_climb", taxonomy: "cat.scratcher", title: "Cat-tree kingdom", template: "A whole kingdom for your cat to climb.", tone: "playful", required_attributes: ["scratcher"], forbidden_attributes: [] },
  { hook_id: "cat_litter_clean", taxonomy: "cat.litter", title: "Zero-mess litter", template: "Cleaner litter routine, every day.", tone: "neutral", required_attributes: ["litter"], forbidden_attributes: [] },
  { hook_id: "cat_bed_nap", taxonomy: "cat.bed", title: "Nap fortress", template: "Their new favorite nap spot.", tone: "warm", required_attributes: ["bed"], forbidden_attributes: [] },
  // bird
  { hook_id: "bird_perch_play", taxonomy: "bird.perch", title: "Perch playground", template: "A playground perch your parrot will love.", tone: "warm", required_attributes: ["perch"], forbidden_attributes: [] },
  { hook_id: "bird_feeder_garden", taxonomy: "bird.feeder", title: "Garden of wings", template: "Bring hummingbirds to your window.", tone: "warm", required_attributes: ["feeder"], forbidden_attributes: [] },
  { hook_id: "bird_bath_heated", taxonomy: "bird.heater", title: "Winter water", template: "Fresh water for birds, even in freezing weather.", tone: "neutral", required_attributes: ["heater"], forbidden_attributes: [] },
  // fish
  { hook_id: "fish_tank_clean", taxonomy: "fish.tank_gear", title: "Crystal-clear tank", template: "Crystal-clear water without the work.", tone: "neutral", required_attributes: ["tank_gear"], forbidden_attributes: [] },
  // small pet
  { hook_id: "small_pet_play", taxonomy: "small_pet.toy", title: "Tiny pet joy", template: "Big fun for your littlest pet.", tone: "playful", required_attributes: ["toy"], forbidden_attributes: [] },
  // reptile
  { hook_id: "reptile_habitat", taxonomy: "reptile.tank_gear", title: "Habitat upgrade", template: "Upgrade their habitat, the safe way.", tone: "neutral", required_attributes: ["tank_gear"], forbidden_attributes: [] },
  // universal feeder
  { hook_id: "universal_feeder", taxonomy: "*.feeder", title: "No-spill feeding", template: "Mealtime without the mess.", tone: "neutral", required_attributes: ["feeder"], forbidden_attributes: [] },
];

const RESTRICTIONS = [
  { taxonomy: "*", rule_type: "banned_phrase", pattern: "vet-approved", reason: "Brand guideline" },
  { taxonomy: "*", rule_type: "banned_phrase", pattern: "eco-friendly", reason: "Brand guideline" },
  { taxonomy: "*", rule_type: "banned_phrase", pattern: "stop scooping", reason: "Brand guideline" },
  { taxonomy: "*", rule_type: "banned_phrase", pattern: "best ever", reason: "Generic AI fluff" },
  { taxonomy: "*", rule_type: "banned_phrase", pattern: "must-have", reason: "Generic AI fluff" },
  { taxonomy: "*", rule_type: "banned_phrase", pattern: "game changer", reason: "Generic AI fluff" },
  { taxonomy: "cat.*", rule_type: "species_lock", pattern: "dog|puppy", reason: "Wrong species for cat product" },
  { taxonomy: "dog.*", rule_type: "species_lock", pattern: "cat|kitten", reason: "Wrong species for dog product" },
  { taxonomy: "bird.*", rule_type: "species_lock", pattern: "dog|cat", reason: "Wrong species for bird product" },
  { taxonomy: "fish.*", rule_type: "species_lock", pattern: "dog|cat|bird", reason: "Wrong species for fish product" },
  { taxonomy: "*.bed", rule_type: "type_lock", pattern: "feeder|toy|harness|leash", reason: "Hook must match bed product type" },
  { taxonomy: "*.feeder", rule_type: "type_lock", pattern: "bed|toy|harness", reason: "Hook must match feeder product type" },
  { taxonomy: "*.toy", rule_type: "type_lock", pattern: "bed|feeder|harness", reason: "Hook must match toy product type" },
  { taxonomy: "*.scratcher", rule_type: "type_lock", pattern: "bed|feeder|toy", reason: "Hook must match scratcher product type" },
];

function classify(p: Product) {
  const text = `${p.name ?? ""} ${p.category ?? ""} ${p.description ?? ""}`.toLowerCase();
  let species = "unknown";
  for (const s of SPECIES_RULES) if (s.words.some((w) => text.includes(w))) { species = s.key; break; }
  let type = "other";
  for (const t of TYPE_RULES) if (t.words.some((w) => text.includes(w))) { type = t.key; break; }
  const taxonomy = `${species}.${type}`;
  const allowed = HOOK_LIBRARY.filter((h) => {
    const [hSpecies, hType] = h.taxonomy.split(".");
    const speciesOk = hSpecies === "*" || hSpecies === species;
    const typeOk = hType === "*" || hType === type;
    return speciesOk && typeOk;
  }).map((h) => h.hook_id);
  const banned = HOOK_LIBRARY.filter((h) => !allowed.includes(h.hook_id)).map((h) => h.hook_id);
  const confidence = species !== "unknown" && type !== "other" ? 0.9 : species !== "unknown" || type !== "other" ? 0.6 : 0.3;
  const rationale = `species=${species}, type=${type}, ${allowed.length} hooks allowed`;
  return { species, type, taxonomy, allowed, banned, confidence, rationale };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: run } = await supa.from("pin_wave1_runs").insert({ status: "running" }).select().single();
  const runId = run!.id;

  // Seed hook library + restrictions (idempotent)
  await supa.from("pin_hook_library").upsert(HOOK_LIBRARY, { onConflict: "hook_id" });
  await supa.from("pin_hook_restrictions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supa.from("pin_hook_restrictions").insert(RESTRICTIONS);

  const { data: products } = await supa
    .from("products")
    .select("id,name,category,description,slug")
    .eq("is_active", true);

  let classified = 0;
  let failed = 0;
  const taxCounts: Record<string, number> = {};
  const lowConf: any[] = [];

  for (const p of products ?? []) {
    try {
      const c = classify(p as Product);
      taxCounts[c.taxonomy] = (taxCounts[c.taxonomy] ?? 0) + 1;
      if (c.confidence < 0.7) lowConf.push({ id: p.id, name: p.name, taxonomy: c.taxonomy, confidence: c.confidence });
      await supa.from("pin_product_understanding").upsert({
        product_id: p.id,
        primary_species: c.species,
        product_type: c.type,
        use_case: c.type,
        audience: c.species,
        key_attributes: [c.species, c.type],
        confidence: c.confidence,
        source: "rule",
        updated_at: new Date().toISOString(),
      });
      await supa.from("pin_product_classification").upsert({
        product_id: p.id,
        taxonomy: c.taxonomy,
        subtaxonomy: c.type,
        allowed_hook_ids: c.allowed,
        banned_hook_ids: c.banned,
        rationale: c.rationale,
        confidence: c.confidence,
        updated_at: new Date().toISOString(),
      });
      classified++;
    } catch (e) {
      failed++;
    }
  }

  const summary = {
    taxonomy_distribution: taxCounts,
    low_confidence_count: lowConf.length,
    low_confidence_sample: lowConf.slice(0, 25),
    publishing_paused: true,
  };

  await supa
    .from("pin_wave1_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: "completed",
      products_total: products?.length ?? 0,
      products_classified: classified,
      products_failed: failed,
      hooks_registered: HOOK_LIBRARY.length,
      restrictions_registered: RESTRICTIONS.length,
      summary,
    })
    .eq("id", runId);

  return new Response(
    JSON.stringify({ ok: true, run_id: runId, products_total: products?.length ?? 0, classified, failed, summary }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
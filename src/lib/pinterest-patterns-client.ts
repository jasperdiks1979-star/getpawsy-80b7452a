// Client-side mirror of the Pinterest pattern library used by the admin
// Patterns page. Kept in sync with `supabase/functions/_shared/pinterest-patterns.ts`.
// Edit both files together if patterns change.

export type PatternId =
  | 'cozy_warm_interior'
  | 'before_after_transformation'
  | 'editorial_minimal'
  | 'soft_luxury'
  | 'scandi_decor'
  | 'cinematic_pet_portrait'
  | 'lifestyle_first_subtle_product'
  | 'emotional_bonding'
  | 'adventure_golden_hour'
  | 'cozy_emotional_comfort'
  | 'clean_aspirational_routine'
  | 'multi_pet_decor';

export interface PatternSummary {
  id: PatternId;
  label: string;
  psychology: string;
  composition_rule: string;
  typography_preference: string;
  whitespace: 'high' | 'medium' | 'low';
  cta_placement: 'bottom_subtle' | 'top_minimal' | 'none';
  hook_angle: string;
  must_have: string[];
  must_avoid: string[];
  niche_affinity: Record<string, number>;
}

export const PATTERNS: PatternSummary[] = [
  {
    id: 'cozy_warm_interior',
    label: 'Cozy warm interior',
    psychology: "Warm domestic light + soft textures trigger a 'I want this calm life' save reflex.",
    composition_rule:
      'Wide editorial interior, warm late-afternoon light raking across natural wood and linen, product placed naturally inside a styled corner of a real home.',
    typography_preference: 'serif elegant',
    whitespace: 'medium',
    cta_placement: 'bottom_subtle',
    hook_angle: "calm, relief, 'home you want'",
    must_have: ['warm light', 'interior', 'natural'],
    must_avoid: ['floating product card', 'collage', 'template', 'cta bar'],
    niche_affinity: { cat_litter: 0.85, calming_bed: 0.7, dog_bed: 0.8, cat_fountain: 0.6, feeder: 0.6, generic_pet: 0.7 },
  },
  {
    id: 'before_after_transformation',
    label: 'Before / after transformation',
    psychology: 'Sequential contrast forces the eye to compare and creates an instant outcome promise.',
    composition_rule:
      'Two clearly separated halves of one cohesive scene — the same room or pet, captured before and after the product is in use.',
    typography_preference: 'serif bold',
    whitespace: 'low',
    cta_placement: 'bottom_subtle',
    hook_angle: 'outcome promise, transformation',
    must_have: ['before', 'after', 'same scene'],
    must_avoid: ['split screen graphic', 'comparison chart'],
    niche_affinity: { cat_litter: 0.6, grooming: 0.85, calming_bed: 0.5, interactive_toy: 0.5 },
  },
  {
    id: 'editorial_minimal',
    label: 'Editorial minimal',
    psychology: "70%+ negative space reads as premium and earns the save as 'aesthetic inspo'.",
    composition_rule:
      'Magazine-style composition with at least 60% clean negative space, single hero subject, restrained palette, gallery-quality framing.',
    typography_preference: 'serif refined',
    whitespace: 'high',
    cta_placement: 'top_minimal',
    hook_angle: 'aspirational, design-forward',
    must_have: ['negative space', 'minimal', 'single hero'],
    must_avoid: ['floating product card', 'collage', 'template'],
    niche_affinity: { cat_tree: 0.85, cat_fountain: 0.75, feeder: 0.6, grooming: 0.5, generic_pet: 0.6 },
  },
  {
    id: 'soft_luxury',
    label: 'Soft luxury',
    psychology: 'Cream/oat palette + refined serif signals premium, raises perceived price + trust.',
    composition_rule:
      'Cream, oat, and warm-white palette with a single hero subject, layered fabrics, refined natural textures, soft daylight.',
    typography_preference: 'serif elegant',
    whitespace: 'medium',
    cta_placement: 'bottom_subtle',
    hook_angle: 'premium, refined comfort',
    must_have: ['cream', 'soft', 'premium'],
    must_avoid: ['floating product card', 'collage', 'template'],
    niche_affinity: { cat_litter: 0.85, calming_bed: 0.85, dog_bed: 0.85, cat_tree: 0.6, generic_pet: 0.7 },
  },
  {
    id: 'scandi_decor',
    label: 'Scandinavian decor',
    psychology: 'White oak + plants + neutral textiles is the dominant home-decor Pinterest aesthetic.',
    composition_rule:
      'Scandinavian living room: white oak floors, linen sofa, large monstera or olive tree, neutral rug, abundant daylight.',
    typography_preference: 'serif refined',
    whitespace: 'high',
    cta_placement: 'top_minimal',
    hook_angle: 'decor harmony, home aesthetic',
    must_have: ['scandinavian', 'neutral', 'daylight'],
    must_avoid: ['floating product card', 'collage', 'template'],
    niche_affinity: { cat_tree: 0.95, cat_fountain: 0.7, feeder: 0.6, generic_pet: 0.55 },
  },
  {
    id: 'cinematic_pet_portrait',
    label: 'Cinematic pet portrait',
    psychology: 'Shallow depth of field + dramatic light + eye contact creates emotional stop-scroll.',
    composition_rule: 'Tight portrait of the pet with shallow depth of field, dramatic directional light, soulful eye contact, painterly bokeh.',
    typography_preference: 'serif soft',
    whitespace: 'medium',
    cta_placement: 'bottom_subtle',
    hook_angle: 'emotional connection, soulful',
    must_have: ['portrait', 'shallow depth', 'eye contact'],
    must_avoid: ['floating product card', 'collage'],
    niche_affinity: { calming_bed: 0.8, dog_car: 0.75, dog_harness: 0.8, dog_bed: 0.6, generic_pet: 0.65 },
  },
  {
    id: 'lifestyle_first_subtle_product',
    label: 'Lifestyle first, subtle product',
    psychology: 'Product is secondary to the scene — viewer projects the lifestyle onto themselves first.',
    composition_rule:
      'Lifestyle scene where the pet and owner moment is the focus; product appears naturally integrated and recognizable but never the visual center.',
    typography_preference: 'serif elegant',
    whitespace: 'medium',
    cta_placement: 'bottom_subtle',
    hook_angle: 'aspirational lifestyle',
    must_have: ['lifestyle', 'naturally integrated', 'moment'],
    must_avoid: ['product hero shot', 'studio packshot', 'floating product card'],
    niche_affinity: { dog_bed: 0.85, cat_litter: 0.6, dog_car: 0.7, feeder: 0.7, generic_pet: 0.8 },
  },
  {
    id: 'emotional_bonding',
    label: 'Emotional bonding',
    psychology: "Owner+pet hands or embrace activates oxytocin association.",
    composition_rule:
      "Intimate framing of owner and pet together — hands resting on the pet, foreheads touching, or pet curled into the owner's lap.",
    typography_preference: 'serif soft',
    whitespace: 'low',
    cta_placement: 'bottom_subtle',
    hook_angle: 'love, bond, devotion',
    must_have: ['owner', 'pet together', 'intimate'],
    must_avoid: ['floating product card', 'collage'],
    niche_affinity: { calming_bed: 0.8, dog_car: 0.7, grooming: 0.7, generic_pet: 0.7 },
  },
  {
    id: 'adventure_golden_hour',
    label: 'Adventure / golden hour',
    psychology: 'Outdoor warm-light motion = freedom + family travel fantasy.',
    composition_rule:
      'Outdoor adventure setting (trail, coast, open road) at golden hour, warm raking light, sense of motion or open horizon.',
    typography_preference: 'serif bold',
    whitespace: 'medium',
    cta_placement: 'bottom_subtle',
    hook_angle: 'adventure, freedom, family travel',
    must_have: ['golden hour', 'outdoor', 'horizon'],
    must_avoid: ['floating product card', 'collage'],
    niche_affinity: { dog_car: 0.95, dog_harness: 0.95, generic_pet: 0.4 },
  },
  {
    id: 'cozy_emotional_comfort',
    label: 'Cozy emotional comfort',
    psychology: "Sleeping pet in low warm light triggers safety + cuteness save behavior.",
    composition_rule:
      'Dim cozy bedroom corner with layered blankets, knit throw, candle, side lamp; pet sinking into deep relaxation.',
    typography_preference: 'serif soft',
    whitespace: 'low',
    cta_placement: 'bottom_subtle',
    hook_angle: 'safety, deep rest, calm',
    must_have: ['blanket', 'low warm light', 'sleeping'],
    must_avoid: ['floating product card'],
    niche_affinity: { calming_bed: 0.95, dog_bed: 0.7, generic_pet: 0.5 },
  },
  {
    id: 'clean_aspirational_routine',
    label: 'Clean aspirational routine',
    psychology: "Morning ritual + clean kitchen + hands-shown is the dominant DTC aesthetic for effortless ownership.",
    composition_rule:
      'Bright clean kitchen or feeding nook, marble or oak surface, neutral ceramics, hands shown performing the routine.',
    typography_preference: 'serif refined',
    whitespace: 'high',
    cta_placement: 'top_minimal',
    hook_angle: 'effortless routine, clean home',
    must_have: ['routine', 'morning', 'clean'],
    must_avoid: ['floating product card', 'template'],
    niche_affinity: { cat_litter: 0.9, cat_fountain: 0.85, feeder: 0.9, grooming: 0.7 },
  },
  {
    id: 'multi_pet_decor',
    label: 'Multi-pet decor harmony',
    psychology: 'Two cats interacting in a styled space doubles cuteness and the home-decor signal.',
    composition_rule:
      'Two cats on different levels of the product or in calm interaction in a styled Scandinavian or warm interior.',
    typography_preference: 'serif refined',
    whitespace: 'medium',
    cta_placement: 'bottom_subtle',
    hook_angle: 'harmony, family of pets',
    must_have: ['two cats', 'styled interior'],
    must_avoid: ['floating product card'],
    niche_affinity: { cat_tree: 0.85, cat_fountain: 0.6, cat_litter: 0.5 },
  },
];

export const ALL_NICHES = [
  'cat_litter', 'dog_car', 'cat_tree', 'dog_harness', 'calming_bed',
  'dog_bed', 'cat_fountain', 'interactive_toy', 'grooming', 'feeder', 'generic_pet',
] as const;
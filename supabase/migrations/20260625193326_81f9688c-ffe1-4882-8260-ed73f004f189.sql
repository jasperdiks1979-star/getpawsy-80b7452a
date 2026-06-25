
-- Wave 3A+: Potential score, style families, adaptive retry settings

ALTER TABLE public.pin_product_intelligence
  ADD COLUMN IF NOT EXISTS potential_score INT,
  ADD COLUMN IF NOT EXISTS potential_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS potential_scored_at TIMESTAMPTZ;

ALTER TABLE public.pin_headline_bank
  ADD COLUMN IF NOT EXISTS weight NUMERIC NOT NULL DEFAULT 1.0;

-- Adaptive retry settings (pin_wave3_settings already exists per Wave 3A)
INSERT INTO public.pin_wave3_settings(key, value)
VALUES
  ('retry_min', '3'::jsonb),
  ('retry_max', '15'::jsonb),
  ('quality_gate', '0.99'::jsonb),
  ('credit_cap_usd', '25'::jsonb),
  ('golden_batch_size', '100'::jsonb),
  ('variants_per_product', '10'::jsonb),
  ('potential_min', '70'::jsonb),
  ('diversity_max_pair_similarity', '0.82'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 15 visual style families
CREATE TABLE IF NOT EXISTS public.pin_scene_style_families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  palette_guidance TEXT NOT NULL,
  camera_guidance TEXT NOT NULL,
  lighting_guidance TEXT NOT NULL,
  composition_guidance TEXT NOT NULL,
  allowed_pet_contexts TEXT[] NOT NULL DEFAULT '{}',
  banned_cliches TEXT[] NOT NULL DEFAULT '{}',
  weight NUMERIC NOT NULL DEFAULT 1.0,
  usage_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pin_scene_style_families TO authenticated;
GRANT ALL ON public.pin_scene_style_families TO service_role;
ALTER TABLE public.pin_scene_style_families ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage style families"
  ON public.pin_scene_style_families
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.pin_scene_style_families (slug, name, palette_guidance, camera_guidance, lighting_guidance, composition_guidance, allowed_pet_contexts, banned_cliches) VALUES
('luxury','Luxury','Warm neutrals, brass, walnut, ivory, deep emerald accents','Medium tele 50–85mm, shallow depth of field','Soft directional window light, golden hour glow','Editorial rule-of-thirds, generous negative space','{"calm portrait","resting on premium fabric"}','{"plastic toys","cluttered backgrounds","white cyclorama"}'),
('scandinavian','Scandinavian','Whites, light oak, pale grey, soft sage','Wide 28–35mm, eye-level','Bright diffused daylight, large windows','Clean lines, minimal props, lots of whitespace','{"on light wood floor","near a window"}','{"dark moody bg","heavy ornament","gilded accents"}'),
('modern-home','Modern Home','Warm grey, oak, matte black, terracotta accents','35–50mm, slight low angle','Mixed daylight + warm lamp practicals','Lifestyle vignette, depth layers (foreground prop + pet + bg)','{"living room","kitchen island","entryway"}','{"studio backdrop","obvious AI artifacts"}'),
('cozy','Cozy','Caramel, cream, rust, deep amber','Close 50mm, eye-level, soft bokeh','Warm tungsten + candle glow','Tight framing, layered textures (knit, wood, ceramic)','{"napping on blanket","near fireplace"}','{"harsh shadows","cold blue tones"}'),
('outdoor','Outdoor','Natural greens, sky blue, earth tones','24–35mm, dynamic angles','Golden hour or overcast soft daylight','Environmental wide shot with sense of place','{"walking","park","beach","backyard"}','{"studio bg","obvious greenscreen"}'),
('minimal','Minimal','Off-white, bone, pale grey, one accent color','50mm, centered','Even soft light, no harsh shadows','One subject, one prop, massive negative space','{"sitting calm","single object focus"}','{"props clutter","multiple competing subjects"}'),
('emotional','Emotional','Muted desaturated palette + one warm highlight','85mm portrait, very shallow DOF','Soft window light, slight rim','Tight portrait, eye contact, micro-expression','{"close-up gaze","owner cuddle"}','{"goofy props","loud overlays"}'),
('funny','Funny','Bright pops, primaries, playful','35mm, slightly low','Bright even daylight','Decisive moment, exaggerated motion captured mid-action','{"zoomies","head tilt","stealing socks"}','{"forced costumes that look fake","AI-distorted faces"}'),
('family','Family','Warm neutrals + skin-tone friendly','35mm, eye-level with family','Soft natural daylight','Multi-subject (pet + owner/kid), candid moment','{"on couch with owner","kid hugging pet"}','{"stock-photo poses","fake smiles"}'),
('macro','Macro','True-to-product material colors','90–105mm macro','Soft diffused side light to show texture','Extreme close-up on product detail or paw/eye/whisker','{"paw detail","whisker detail","fabric texture"}','{"whole-room context","wide angles"}'),
('lifestyle','Lifestyle','Real-home palette, lived-in','35mm, candid','Natural daylight, mixed practicals','Documentary, slight imperfection, real props','{"daily routine","feeding","grooming"}','{"studio sterile","perfect symmetry"}'),
('pov','POV','Slightly desaturated, true-to-life','Wide 24mm, first-person','Available light','Hand-in-frame or owner perspective, motion blur ok','{"hand petting","leash POV","feeding POV"}','{"third-person posed shots"}'),
('before-after','Before/After','Matched palette across both halves','Identical framing per half','Identical lighting per half','Split frame or stacked, identical crop','{"messy vs clean","dull coat vs shiny"}','{"misleading transformations","different products in halves"}'),
('premium','Premium','Charcoal, ivory, brushed metal, single jewel tone','85mm, low angle hero','Controlled key + soft fill, subtle rim','Hero product shot, pet as supporting character','{"product hero with pet nearby"}','{"cluttered scene","cheap props"}'),
('seasonal','Seasonal','Season-appropriate palette (autumn rust, winter cool, spring pastel, summer warm)','35–50mm','Season-true daylight','Seasonal props (leaves, snow dusting, blossoms) used sparingly','{"seasonal backyard","seasonal living room"}','{"out-of-season props","Christmas in July"}')
ON CONFLICT (slug) DO NOTHING;

-- Audit table for products that fail the potential gate
CREATE TABLE IF NOT EXISTS public.pin_potential_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  potential_score INT NOT NULL,
  reasons JSONB NOT NULL,
  scored_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pin_potential_audit_product_idx ON public.pin_potential_audit(product_id);
GRANT SELECT ON public.pin_potential_audit TO authenticated;
GRANT ALL ON public.pin_potential_audit TO service_role;
ALTER TABLE public.pin_potential_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read potential audit" ON public.pin_potential_audit
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

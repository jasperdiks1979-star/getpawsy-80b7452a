
-- PART 1: Grants
GRANT SELECT ON
  public.shopify_id_map,
  public.shopify_migration_waves,
  public.shopify_field_mapping,
  public.shopify_migration_conflicts,
  public.shopify_migration_audit_log
TO authenticated;

GRANT ALL ON
  public.shopify_id_map,
  public.shopify_migration_waves,
  public.shopify_field_mapping,
  public.shopify_migration_conflicts,
  public.shopify_migration_audit_log
TO service_role;

-- Only the audit log has a sequence (bigint identity via nextval).
GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.shopify_migration_audit_log_id_seq TO service_role;

-- PART 2: CJ product ID metafield mapping (framework-only, no Shopify writes yet)
INSERT INTO public.shopify_field_mapping
  (source_entity, source_field, shopify_entity, shopify_field, transformer, required, notes)
VALUES (
  'products',
  'cj_product_id',
  'Product',
  'metafields.custom.cj_product_id',
  'trim_nonblank_text',
  false,
  'Round-trip fulfillment key. Shopify metafield definition: namespace=custom, key=cj_product_id, type=single_line_text_field, ownerType=PRODUCT. Transformer trim_nonblank_text: TRIM(value); if result is empty/NULL treat as missing. Required=true when products.supplier_name ILIKE ''%CJ%'' (CJ-fulfilled); required=false otherwise. Conflict handling: if two Supabase products resolve to the same CJ id, emit a shopify_migration_conflicts row of severity=high and skip write. Metafield itself is created during Wave 2 setup, not now.'
)
ON CONFLICT (source_entity, source_field, shopify_entity, shopify_field) DO UPDATE
  SET transformer = EXCLUDED.transformer,
      required    = EXCLUDED.required,
      notes       = EXCLUDED.notes,
      updated_at  = now();

-- PART 3: Status enum documentation on existing rule
UPDATE public.shopify_field_mapping
   SET notes = 'Shopify ProductStatus GraphQL enum. Canonical mapping (case-exact for GraphQL): products.is_active=true OR status IN (''active'',''published'') -> ACTIVE; is_active=false OR status IN (''inactive'',''draft'') -> DRAFT; status IN (''archived'',''discontinued'') -> ARCHIVED. Unknown values: DO NOT silently default to ACTIVE. Emit shopify_migration_conflicts row (severity=medium), propose DRAFT as dry-run safe default, block promotion to live until resolved.',
       updated_at = now()
 WHERE source_entity='products' AND source_field='status' AND shopify_field='status';

-- PART 4: Wave 2 gate note
UPDATE public.shopify_migration_waves
   SET notes = COALESCE(notes,'') || E'\n[W1 2026-07-10] Variant mapping is UNCERTIFIED. Source variants live in products.variants (jsonb array), NOT a product_variants table. Existing shopify_field_mapping rows targeting source_entity=product_variants are placeholders. Wave 2 MUST NOT execute product creation until: (a) jsonb variant shape mapped to Shopify option1/2/3 + inventory items, (b) 28 products with missing SKU triaged, (c) 84 multi-variant products dry-run verified.',
       updated_at = now()
 WHERE wave = 'W2';

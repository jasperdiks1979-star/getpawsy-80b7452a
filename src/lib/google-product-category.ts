/**
 * Frontend re-export of the canonical Google Product Category mapper.
 * The implementation is mirrored from `supabase/functions/_shared/google-product-category.ts`
 * so it can be used in admin UI, CSV exports and prerender scripts without
 * pulling in Deno-specific imports.
 */
export {
  classifyGoogleProductCategory,
  getGoogleProductCategoryId,
  getGoogleProductCategoryPath,
  GPC_CATALOG,
  type GpcMatch,
  type GpcKey,
} from "../../supabase/functions/_shared/google-product-category";
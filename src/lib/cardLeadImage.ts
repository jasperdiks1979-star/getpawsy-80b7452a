/**
 * Card lead-image overrides. Each override must be a photo from the SAME
 * product's own gallery (never another SKU) and is only applied when that
 * exact URL is present in the product's stored images. Catalog data is not
 * changed; PDP galleries and feeds keep their stored order.
 */
const BASE = 'https://nojvgfbcjgipjxpfatmm.supabase.co/storage/v1/object/public/product-images/rehosted';

export const CARD_LEAD_IMAGE_OVERRIDES: Record<string, string> = {
  // 54" cat tree: stored lead is a spec collage; gallery has a clean grey product shot.
  'b9c0f448-162b-4464-bf36-7697e6fe4852': `${BASE}/b9c0f448-162b-4464-bf36-7697e6fe4852/0136bcb3bba709d8.jpg`,
  // Raised dog bed: stored lead is a breed size chart; gallery shows this bed with a dog on it.
  'ecf613cb-2160-4842-9438-91d19b3a1967': `${BASE}/ecf613cb-2160-4842-9438-91d19b3a1967/33902580d3dd14f6.jpg`,
};

export function cardLeadImage(p: { id: string; image_url: string | null; images?: string[] | null }): string | null {
  const o = CARD_LEAD_IMAGE_OVERRIDES[p.id];
  if (o && Array.isArray(p.images) && p.images.includes(o)) return o;
  return p.image_url;
}

/**
 * Retired (stock_sync_status='discontinued', stock 0) product slugs that are
 * no longer publicly readable, so the build cannot discover them. Hosting has
 * no per-route HTTP 404, so the prerenderer writes a noindex 404 page for each
 * slug instead of letting the indexable SPA shell answer. A slug that is
 * active/prerendered again always wins (never stubbed). Snapshot 2026-10-12.
 */
export const RETIRED_PRODUCT_SLUGS: readonly string[] = [
  'anti-falling-cat-dog-feeding-water-bowl',
  'elevated-cat-bed-with-rotatable-egg-chair-pod-cat-basket-bed-with-thick-cushion-natural-mat-grass-wo',
  'elevated-cat-bed-with-sisal-scratching-post-for-indoor-kitties-modern-cat-tree-be3b',
  'extra-large-stainless-steel-cat-litter-box-for-big-cats-with-flip-cover-high-sided-enclosure-scoop',
  'front-flip-door-dual-opening-anti-splashing-anti-tracking-odor-locking-cat-e265',
  'pet-interactive-sound-ball-the-mellow-dog-cat-pet-voice-ball-interactive-pet-439e',
  'smart-pet-water-fountain-automatic-cat-water-dispenser-4-5l-cordless-685f',
  'xl-stainless-steel-cat-litter-box-flip-top',
  'xl-stainless-steel-litter-box-w-100-flip-top-scoop-step-top-side-entry-enclosed-litter-box-for-big-c',
];

/** Retired slugs to stub, excluding any slug that is currently prerendered as a live product. */
export function retiredStubSlugs(liveSlugs: Iterable<string>): string[] {
  const live = new Set(liveSlugs);
  return RETIRED_PRODUCT_SLUGS.filter((s) => !live.has(s));
}

/**
 * Guide Consolidation Redirect Map
 * 
 * Maps weaker/duplicate-intent guide slugs to the strongest canonical guide
 * for that search intent. This prevents keyword cannibalization and
 * concentrates link equity on the primary guide.
 * 
 * Rules:
 * - Primary guide = highest word count, strongest keyword match, most internal links
 * - Redirect = 301-equivalent (Navigate replace) from weak → strong
 * - Redirected slugs are excluded from sitemap via noindex flag
 */

export const GUIDE_REDIRECTS: Record<string, string> = {
  // ── Cat Litter Box Consolidation ────────────────────────────
  'best-litter-box-studio-apartment': 'best-litter-boxes-apartments-2026',
  'litter-box-for-studio-apartment': 'best-litter-boxes-apartments-2026',
  'best-litter-box-small-apartments': 'best-litter-boxes-apartments-2026',
  'high-sided-litter-box-guide': 'best-high-sided-litter-box',
  'best-litter-box-for-multiple-cats': 'best-litter-boxes-multi-cat',
  'top-rated-litter-box-under-100': 'best-litter-box-under-100',
  'litter-box-odor-control-tips': 'best-odor-control-litter-box',
  'cat-litter-box-odor-solutions': 'best-odor-control-litter-box',
  'best-litter-box-odor-bathroom': 'best-odor-control-litter-box',
  'automatic-vs-manual-litter-box': 'best-self-cleaning-litter-box-2026',
  'self-cleaning-litter-box-worth-it': 'best-self-cleaning-litter-box-2026',

  // ── Dog Bed Pillar Consolidation ─────────────────────────────
  // PILLAR: best-dog-bed-2026 (targets "best dog beds")
  // SUB-PILLAR: best-orthopedic-dog-bed-2026 (targets "orthopedic dog beds")
  // KEEP: best-dog-beds-for-large-dogs, best-dog-bed-materials-explained,
  //   how-to-choose-the-right-dog-bed-size, how-to-wash-a-dog-bed-properly,
  //   dog-bed-for-anxiety-do-they-work, best-elevated-dog-bed, best-outdoor-dog-bed,
  //   best-dog-bed-under-100, best-dog-bed-for-small-dogs, best-dog-bed-for-crate,
  //   best-dog-bed-for-golden-retrievers

  // → Redirect to PILLAR (best-dog-bed-2026)
  'dog-bed-buying-guide': 'best-dog-bed-2026',
  'dog-bed-for-anxiety': 'dog-bed-for-anxiety-do-they-work',
  'dog-bed-for-anxiety-do-they-work': 'dog-bed-for-anxiety-do-they-work',  // identity — keep target
  'dog-bed-size-chart-guide': 'how-to-choose-the-right-dog-bed-size',

  // → Redirect to SUB-PILLAR (best-orthopedic-dog-bed-2026)
  'best-orthopedic-dog-bed': 'best-orthopedic-dog-bed-2026',
  'best-orthopedic-dog-bed-for-large-dogs': 'best-orthopedic-dog-bed-2026',
  'best-orthopedic-dog-bed-large-dogs-2026': 'best-orthopedic-dog-bed-2026',
  'how-to-choose-orthopedic-dog-bed': 'best-orthopedic-dog-bed-2026',
  'best-dog-bed-hip-dysplasia': 'best-orthopedic-dog-bed-2026',
  'best-dog-beds-for-hip-dysplasia-2026': 'best-orthopedic-dog-bed-2026',
  'best-dog-beds-for-arthritis': 'best-orthopedic-dog-bed-2026',
  'do-orthopedic-dog-beds-help-arthritis': 'best-orthopedic-dog-bed-2026',
  'do-dogs-really-need-orthopedic-beds': 'best-orthopedic-dog-bed-2026',
  'are-orthopedic-dog-beds-worth-it': 'best-orthopedic-dog-bed-2026',
  'orthopedic-dog-beds-for-senior-dogs': 'best-orthopedic-dog-bed-2026',
  'calming-dog-bed-anxiety': 'dog-bed-for-anxiety-do-they-work',

  // → Redirect to supporting guides
  'dog-bed-for-large-breeds': 'best-dog-beds-for-large-dogs',
  'best-dog-beds-large-breeds-2026': 'best-dog-beds-for-large-dogs',
  'memory-foam-vs-egg-crate-foam-dog-bed': 'best-dog-bed-materials-explained',
  'memory-foam-vs-standard-dog-bed': 'best-dog-bed-materials-explained',
  'memory-foam-vs-egg-crate-dog-beds': 'best-dog-bed-materials-explained',
  'memory-foam-vs-regular-dog-bed': 'best-dog-bed-materials-explained',
  'orthopedic-vs-memory-foam-dog-beds': 'best-dog-bed-materials-explained',
  'machine-washable-dog-bed-guide': 'how-to-wash-a-dog-bed-properly',
  'waterproof-orthopedic-dog-beds-guide': 'how-to-wash-a-dog-bed-properly',
  'how-thick-should-a-dog-bed-be': 'how-to-choose-the-right-dog-bed-size',

  // ── Cat Furniture Consolidation ────────────────────────────
  'cat-condo-vs-cat-tower': 'cat-condo-vs-cat-tree-2026',
  'modern-cat-condo-vs-traditional-cat-tree': 'cat-condo-vs-cat-tree-2026',
  'cat-condo-vs-cat-tree-difference': 'cat-condo-vs-cat-tree-2026',

  // ── Dog Training Guide Consolidation (→ new pillar guides) ──
  'dog-leash-training': 'leash-training-dog-step-by-step',
  'puppy-leash-training': 'leash-training-dog-step-by-step',
  'leash-training-tips': 'leash-training-dog-step-by-step',
  'leash-training-guide': 'leash-training-dog-step-by-step',
  'how-to-leash-train-dog': 'leash-training-dog-step-by-step',
  'how-to-leash-train-puppy': 'leash-training-dog-step-by-step',
  'leash-training-art-guide': 'leash-training-dog-step-by-step',
  'dog-potty-training-tips': 'dog-potty-training-complete-guide',
  'potty-training-guide': 'dog-potty-training-complete-guide',
  'house-training-guide': 'dog-potty-training-complete-guide',
  'potty-training-puppy': 'dog-potty-training-complete-guide',
  'puppy-house-training': 'dog-potty-training-complete-guide',
  'puppy-potty-training': 'dog-potty-training-complete-guide',
  'ultimate-puppy-training-guide-potty-obedience': 'dog-potty-training-complete-guide',
  'puppy-training-tips': 'puppy-training-first-30-days',
  'puppy-training-guide': 'puppy-training-first-30-days',
  'puppy-training-basics-essential-commands': 'puppy-training-first-30-days',
  'dog-training-basics': 'best-dog-training-tools',
  'dog-training-guide': 'best-dog-training-tools',
  'basic-dog-training': 'best-dog-training-tools',
  'clicker-training-dogs-beginners-complete-guide': 'best-dog-training-tools',
  'no-pull-harness-guide': 'leash-training-dog-step-by-step',
  'harness-training-guide': 'leash-training-dog-step-by-step',
  'dog-harness-guide': 'leash-training-dog-step-by-step',
  'best-dog-harness-for-pulling': 'leash-training-dog-step-by-step',
  'how-to-stop-barking': 'how-to-stop-dog-barking',
  'stop-barking-guide': 'how-to-stop-dog-barking',
  'barking-solutions': 'how-to-stop-dog-barking',
  'crate-training-tips': 'puppy-training-first-30-days',
  'crate-training-guide': 'puppy-training-first-30-days',

  // ── Dog Collar / Gear Consolidation ──────────────────────
  'dog-collar-guide': 'leash-training-dog-step-by-step',
  'dog-collar-sizing-guide': 'leash-training-dog-step-by-step',
  'best-dog-collars': 'leash-training-dog-step-by-step',
  'collar-vs-harness': 'leash-training-dog-step-by-step',

  // ── Short slug → canonical year-tagged redirects ─────────────────
  'best-cat-litter-box': 'best-cat-litter-box-2026',
  'best-dog-bed': 'best-dog-bed-2026',
  'best-cat-tree': 'best-cat-trees-2026',
  'best-cat-trees': 'best-cat-trees-2026',
  'best-cat-trees-large-cats': 'best-cat-trees-large-cats-2026',
  'best-orthopedic-dog-bed-large-dogs': 'best-orthopedic-dog-bed-large-dogs-2026',
  'best-dog-beds-large-breeds': 'best-dog-beds-large-breeds-2026',
  'best-litter-boxes-apartments': 'best-litter-boxes-apartments-2026',
  'best-self-cleaning-litter-box': 'best-self-cleaning-litter-box-2026',
  'best-cat-litter-box-furniture': 'best-cat-litter-box-furniture-enclosures-2026',
  'best-cat-litter-box-furniture-enclosures': 'best-cat-litter-box-furniture-enclosures-2026',
  'best-no-pull-dog-harness': 'best-no-pull-dog-harness-2026',

  // ── SEO Guide System Redirects (requested slug → existing canonical) ──
  'best-cat-litter-box-for-odor-control': 'best-odor-control-litter-box',
  'best-low-tracking-cat-litter-box': 'best-low-tracking-litter-box',
  'best-cat-litter-box-small-apartment': 'best-litter-boxes-apartments-2026',
  'best-automatic-cat-litter-box': 'best-self-cleaning-litter-box-2026',
  // 'best-cat-litter-box-furniture' already mapped above (line 94)
  'best-cat-litter-box-multiple-cats': 'best-litter-boxes-multi-cat',
  'best-cat-tree-for-large-cats': 'best-cat-trees-large-cats-2026',
  'modern-cat-tree-furniture': 'modern-cat-trees-home-design',
  'best-memory-foam-dog-bed': 'memory-foam-vs-egg-crate-dog-beds',
  'best-dog-bed-for-senior-dogs': 'orthopedic-dog-beds-for-senior-dogs',
  'best-waterproof-dog-bed': 'waterproof-orthopedic-dog-beds-guide',
  'dog-bed-size-guide': 'how-to-choose-the-right-dog-bed-size',
  'best-dog-leash-for-training': 'best-dog-training-leash-for-pullers',
  'best-anti-pull-dog-leash': 'best-no-pull-dog-harness-2026',
  'dog-harness-vs-collar': 'front-clip-vs-back-clip-harness',
  'best-airline-approved-dog-carrier': 'best-dog-carriers-for-travel',
  'best-interactive-cat-toys': 'best-interactive-cat-toys-that-work',
  'best-pet-carrier-for-travel': 'best-cat-carrier',

  // ── SEO Domination Map — short slug redirects ─────────────────
  'best-cat-litter-odor-control': 'best-cat-litter-for-odor-control',
  'best-cat-tree-large-cats': 'best-cat-trees-large-cats-2026',
  'best-cat-tree-small-apartment': 'best-cat-trees-small-apartments',
  'best-cat-toys-indoor-cats': 'best-toys-for-bored-indoor-cats',
  'best-automatic-cat-toys': 'best-automatic-cat-toy',
  'best-dog-bed-large-dogs': 'best-dog-beds-large-breeds-2026',
  'best-dog-bed-senior-dogs': 'orthopedic-dog-beds-for-senior-dogs',
  'best-dog-toys-aggressive-chewers': 'best-toys-for-aggressive-chewers',
  'best-dog-toys-boredom': 'best-toys-for-bored-dogs',
  'best-dog-training-leash': 'best-dog-training-leash-for-pullers',
  'best-dog-harness': 'best-no-pull-dog-harness-2026',
  'best-dog-carrier': 'best-dog-carriers-for-travel',
  'best-airline-approved-pet-carrier': 'best-dog-carriers-for-travel',
  'best-pet-car-seat': 'best-dog-car-seat',
  'best-cat-backpack-carrier': 'best-cat-carrier-backpack',
  'best-automatic-pet-feeder': 'best-automatic-cat-feeder',
  'best-pet-water-fountain': 'best-cat-water-fountain',
  'best-dog-grooming-tools': 'dog-grooming-essentials',
  'best-cat-grooming-tools': 'best-cat-grooming-brush',

  // ── Pillar page short slug redirects ──────────────────────────
  'cat-litter-guide': 'cat-litter-box-guide',
  'cat-litter-box-guide-2026': 'cat-litter-box-guide',
  'cat-tree-guide': 'cat-tree-buying-guide',
  'cat-toy-guide': 'cat-toy-buying-guide',
  'dog-bed-guide': 'dog-bed-buying-guide',
  'cat-bed-buying-guide': 'cat-bed-guide',
  'dog-toy-buying-guide': 'dog-toy-guide',
  'dog-toy-guide-2026': 'dog-toy-guide',
  'dog-harness-buying-guide': 'dog-harness-guide',
  'pet-carrier-buying-guide': 'pet-carrier-guide',
  'pet-grooming-buying-guide': 'pet-grooming-guide',
  'pet-feeding-buying-guide': 'pet-feeding-guide',
  'pet-home-guide': 'pet-home-products-guide',
  'dog-leash-buying-guide': 'dog-leash-guide',
  'pet-travel-buying-guide': 'pet-travel-guide',

  // ── Traffic Explosion alternate slug redirects ─────────────────
  'best-modern-cat-tree': 'modern-cat-trees-home-design',
  'tall-cat-tree-guide': 'how-tall-should-cat-tree-be',
  'cat-tree-vs-cat-condo': 'cat-condo-vs-cat-tree-2026',
  'best-automatic-litter-box': 'best-self-cleaning-litter-box-2026',
  'best-litter-box-small-apartment': 'best-litter-box-small-apartments',
  'best-litter-box-odor-control': 'best-odor-control-litter-box',
  'low-tracking-litter-box': 'best-low-tracking-litter-box',
  'best-dog-beds-large-dogs': 'best-dog-beds-for-large-dogs',
  'best-dog-bed-anxiety': 'calming-dog-bed-anxiety',
  'waterproof-dog-bed': 'waterproof-orthopedic-dog-beds-guide',
  'memory-foam-dog-bed': 'memory-foam-vs-egg-crate-dog-beds',
  'best-mental-stimulation-dog-toys': 'best-dog-toys-mental-stimulation',
  'best-pet-travel-carrier': 'best-dog-carriers-for-travel',

  // ── SEO Monopoly System — breed & intent slug redirects ─────────
  'best-cat-tree-multiple-cats': 'best-cat-tree-for-two-cats',
  'best-cat-tree-2-cats': 'best-cat-tree-for-two-cats',
  'best-cat-tree-bengals': 'best-cat-tree-for-bengal-cats',
  'bengal-cat-tree': 'best-cat-tree-for-bengal-cats',
  'best-litter-box-large-cats': 'best-cat-litter-box-for-large-cats',
  'best-litter-box-maine-coon': 'best-cat-litter-box-for-large-cats',
  'jumbo-litter-box': 'best-cat-litter-box-for-large-cats',
  'best-crate-bed-for-dogs': 'best-dog-bed-for-crate',
  'crate-dog-bed': 'best-dog-bed-for-crate',
  'best-dog-stroller-large': 'best-dog-stroller-for-large-dogs',
  'heavy-duty-dog-stroller': 'best-dog-stroller-for-large-dogs',
  'best-puppy-toys': 'best-dog-toy-for-puppies',
  'puppy-teething-toys': 'best-dog-toy-for-puppies',
  'best-dog-bed-golden-retriever': 'best-dog-bed-for-golden-retrievers',
  'golden-retriever-dog-bed': 'best-dog-bed-for-golden-retrievers',
  'brain-games-for-dogs': 'best-dog-toys-mental-stimulation',
  'dog-brain-toys': 'best-dog-toys-mental-stimulation',
  'best-dog-stroller': 'best-dog-stroller-for-large-dogs',
  'best-pet-stroller': 'best-dog-stroller-for-large-dogs',

  // ── SEO Traffic Machine — new guide slug redirects ─────────────
  'best-cat-condo': 'best-cat-condo-2026',
  'cat-condo-guide': 'best-cat-condo-2026',
  'best-cat-condos': 'best-cat-condo-2026',
  'cat-window-perch': 'best-cat-window-perch',
  'best-cat-window-seat': 'best-cat-window-perch',
  'cat-window-shelf': 'best-cat-window-perch',
  'best-cat-bowl': 'best-cat-food-bowls',
  'cat-food-bowl-guide': 'best-cat-food-bowls',
  'best-cat-bowls': 'best-cat-food-bowls',
  'whisker-fatigue-bowl': 'best-cat-food-bowls',
  'dog-travel-bowl': 'best-dog-travel-bowl',
  'collapsible-dog-bowl': 'best-dog-travel-bowl',
  'portable-dog-bowl': 'best-dog-travel-bowl',
  'best-litter-mat': 'best-cat-litter-mat',
  'cat-litter-mat': 'best-cat-litter-mat',
  'litter-tracking-mat': 'best-cat-litter-mat',
  'best-dog-blankets': 'best-dog-blanket',
  'waterproof-dog-blanket': 'best-dog-blanket',
  'dog-blanket-guide': 'best-dog-blanket',
  'dog-water-fountain': 'best-dog-water-fountain',
  'best-water-fountain-for-dogs': 'best-dog-water-fountain',
  'dog-slow-feeder': 'best-dog-slow-feeder',
  'slow-feeder-bowl': 'best-dog-slow-feeder',
  'anti-bloat-dog-bowl': 'best-dog-slow-feeder',
  'best-slow-feeder-dog-bowl': 'best-dog-slow-feeder',
  'cat-travel-carrier': 'best-cat-travel-carrier',
  'best-cat-carrier-for-travel': 'best-cat-travel-carrier',
  'airline-cat-carrier': 'best-cat-travel-carrier',

  // ── Dog Beds Hub broken slug redirects ─────────────────────
  'best-dog-beds-2026': 'best-dog-bed-2026',
  'best-orthopedic-dog-beds-for-large-dogs': 'best-orthopedic-dog-bed-large-dogs-2026',
  'elevated-dog-beds-canopy-outdoor-comfort-guide': 'best-elevated-dog-bed',
  'orthopedic-dog-beds-for-arthritis': 'do-orthopedic-dog-beds-help-arthritis',
  'memory-foam-dog-beds-for-senior-dogs': 'orthopedic-dog-beds-for-senior-dogs',
  'how-to-choose-perfect-dog-bed-guide': 'dog-bed-buying-guide',
  'washable-orthopedic-dog-bed-buying-guide': 'machine-washable-dog-bed-guide',

  // ── Trending strip broken slug redirects ───────────────────
  'best-dog-car-seat-safety': 'safest-dog-car-seat-for-travel',
  'best-dog-anxiety-solutions': 'calming-dog-bed-anxiety',
};

/** Set of slugs that should be redirected (for sitemap exclusion) */
export const REDIRECTED_GUIDE_SLUGS = new Set(Object.keys(GUIDE_REDIRECTS));

/** Check if a guide slug should redirect, returns target or null */
export function getGuideRedirectTarget(slug: string): string | null {
  return GUIDE_REDIRECTS[slug] ?? null;
}

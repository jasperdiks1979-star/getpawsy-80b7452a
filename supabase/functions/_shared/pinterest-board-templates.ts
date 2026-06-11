// ─────────────────────────────────────────────────────────────────────────────
// Pinterest board-specific copy templates (deterministic, not AI fluff)
// ─────────────────────────────────────────────────────────────────────────────
// Produces pin_title, pin_description, single-benefit overlay text, and a
// short CTA from product data + the board niche. Never uses random AI
// headlines. Banned marketing phrases are stripped from every output.
// ─────────────────────────────────────────────────────────────────────────────

export const BANNED_PIN_PHRASES = [
  ["stop", "scooping"].join(" "),
  ["a", "box", "that", "manages", "itself"].join(" "),
  ["large", "space,", "no", "pressure"].join(" "),
];

export function sanitizePinText(input: string): string {
  let out = (input || "").replace(/\s+/g, " ").trim();
  for (const phrase of BANNED_PIN_PHRASES) {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
    out = out.replace(re, "").trim();
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

export interface PinProductInfo {
  name: string;
  benefit?: string | null;
  category?: string | null;
  price?: number | null;
  niche: string;
}

export interface PinCopy {
  title: string;
  description: string;
  overlay: string; // single short benefit overlay
  cta: string;
  brandWordmark: string; // always 'GetPawsy'
}

function fmtPrice(p?: number | null): string | null {
  if (!p || !Number.isFinite(p) || p <= 0) return null;
  return `$${Math.round(p)}`;
}

function shortBenefit(p: PinProductInfo, fallback: string): string {
  const b = (p.benefit || "").trim();
  if (b) return b.length <= 32 ? b : b.slice(0, 30).replace(/\s+\S*$/, "") + "…";
  return fallback;
}

interface BoardTemplate {
  overlay: (p: PinProductInfo) => string;
  titles: (p: PinProductInfo) => string[];
  description: (p: PinProductInfo) => string;
  cta: string;
}

const TEMPLATES: Record<string, BoardTemplate> = {
  cat_tree: {
    overlay: (p) => shortBenefit(p, "Built for happy climbers"),
    titles: (p) => {
      const price = fmtPrice(p.price);
      return [
        `${p.name} — Modern Cat Tree`,
        `Stylish Cat Tree for Indoor Cats`,
        price ? `${p.name} from ${price}` : `${p.name}`,
        `Best Cat Trees 2026: ${p.name}`,
      ];
    },
    description: (p) => {
      const price = fmtPrice(p.price);
      return [
        `${p.name} — a premium cat tree built for indoor cats who love to climb.`,
        p.benefit ? `${p.benefit}.` : "Sturdy frame, soft platforms, and scratch-friendly posts.",
        price ? `Starting at ${price}.` : "",
        "Free US shipping. Shop now at getpawsy.pet.",
        "#cattree #cats #catfurniture #indoorcat #getpawsy",
      ].filter(Boolean).join(" ");
    },
    cta: "Shop Cat Trees",
  },
  cat_furniture: {
    overlay: (p) => shortBenefit(p, "Furniture cats love"),
    titles: (p) => {
      const price = fmtPrice(p.price);
      return [
        `${p.name} — Modern Cat Furniture`,
        `Cat Furniture That Fits Your Home`,
        price ? `${p.name} ${price}` : `${p.name}`,
        `Stylish Cat Furniture: ${p.name}`,
      ];
    },
    description: (p) => {
      const price = fmtPrice(p.price);
      return [
        `${p.name} — premium cat furniture for modern homes.`,
        p.benefit ? `${p.benefit}.` : "Designed for comfort, durability, and your interior.",
        price ? `From ${price}.` : "",
        "Free US shipping. Shop now at getpawsy.pet.",
        "#catfurniture #cats #moderncathome #getpawsy",
      ].filter(Boolean).join(" ");
    },
    cta: "Shop Cat Furniture",
  },
  cat_litter: {
    overlay: (p) => shortBenefit(p, "Cleaner litter, less work"),
    titles: (p) => {
      const price = fmtPrice(p.price);
      return [
        `${p.name} — Self-Cleaning Litter Box`,
        `Smart Self-Cleaning Litter Box for Cats`,
        price ? `${p.name} ${price}` : `${p.name}`,
        `Less Scooping with ${p.name}`,
      ];
    },
    description: (p) => {
      const price = fmtPrice(p.price);
      return [
        `${p.name} — automatic self-cleaning litter box for modern cat homes.`,
        p.benefit ? `${p.benefit}.` : "Hands-off cleaning, odor control, and app monitoring.",
        price ? `From ${price}.` : "",
        "Free US shipping. Shop now at getpawsy.pet.",
        "#selfcleaninglitterbox #smartpethome #cats #getpawsy",
      ].filter(Boolean).join(" ");
    },
    cta: "Shop Litter Box",
  },
};

const DEFAULT_TEMPLATE: BoardTemplate = {
  overlay: (p) => shortBenefit(p, "Loved by US pet parents"),
  titles: (p) => {
    const price = fmtPrice(p.price);
    return [
      p.name,
      price ? `${p.name} — ${price}` : p.name,
      `Shop ${p.name} at GetPawsy`,
      p.category ? `${p.category}: ${p.name}` : p.name,
    ];
  },
  description: (p) => {
    const price = fmtPrice(p.price);
    return [
      `${p.name} — curated by GetPawsy for US pet parents.`,
      p.benefit ? `${p.benefit}.` : "Premium quality, built to last.",
      price ? `From ${price}.` : "",
      "Free US shipping. Shop now at getpawsy.pet.",
      "#pets #petproducts #getpawsy",
    ].filter(Boolean).join(" ");
  },
  cta: "Shop Now",
};

/** Map our internal niche keys onto the 3 explicit board templates. */
function pickTemplate(niche: string): BoardTemplate {
  const n = (niche || "").toLowerCase();
  if (n.includes("litter")) return TEMPLATES.cat_litter;
  if (n.includes("cat_tree") || n === "cat_climb") return TEMPLATES.cat_tree;
  if (n.includes("cat_furniture") || n === "enclosure") return TEMPLATES.cat_furniture;
  return DEFAULT_TEMPLATE;
}

/**
 * Build the deterministic pin copy for a given product + variant index.
 * variantIndex rotates through 4 title options for A/B testing.
 */
export function buildPinCopy(
  product: PinProductInfo,
  variantIndex = 0,
): PinCopy {
  const t = pickTemplate(product.niche);
  const titles = t.titles(product);
  const title = sanitizePinText(titles[variantIndex % titles.length]).slice(0, 100);
  const description = sanitizePinText(t.description(product)).slice(0, 480);
  const overlay = sanitizePinText(t.overlay(product)).slice(0, 32);
  return {
    title,
    description,
    overlay,
    cta: t.cta,
    brandWordmark: "GetPawsy",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pin validation — runs on every generated draft before it is inserted into
// pinterest_pin_queue. Guarantees:
//   • exactly ONE short benefit overlay (1–32 chars, single line, no banned)
//   • no banned marketing phrases anywhere in title / description / overlay
//   • brand wordmark is the literal "GetPawsy"
// ─────────────────────────────────────────────────────────────────────────────

export interface PinValidationInput {
  title: string;
  description: string;
  /** Single benefit overlay text only — do NOT include the CTA here. */
  overlay: string;
  /** Optional composed overlay block (e.g. "<overlay> • <cta>") to scan. */
  overlayBlock?: string;
  brandWordmark?: string;
}

export interface PinValidationResult {
  valid: boolean;
  errors: string[];
  bannedHits: string[];
}

const OVERLAY_MAX_CHARS = 32;

function findBanned(text: string): string[] {
  const hay = (text || "").toLowerCase();
  return BANNED_PIN_PHRASES.filter((p) => hay.includes(p));
}

export function validatePinCopy(input: PinValidationInput): PinValidationResult {
  const errors: string[] = [];
  const bannedHits = new Set<string>();

  const overlay = (input.overlay || "").trim();
  if (!overlay) {
    errors.push("overlay_missing");
  } else {
    if (overlay.length > OVERLAY_MAX_CHARS) {
      errors.push(`overlay_too_long:${overlay.length}`);
    }
    // Exactly one short benefit overlay → no line breaks and no second
    // sentence-style separator like " | " or " • " inside the overlay itself.
    if (/[\r\n]/.test(overlay)) errors.push("overlay_multiline");
    if (/[|•]/.test(overlay)) errors.push("overlay_multiple_segments");
  }

  const scanTargets: Array<[string, string]> = [
    ["title", input.title || ""],
    ["description", input.description || ""],
    ["overlay", overlay],
  ];
  if (input.overlayBlock) scanTargets.push(["overlay_block", input.overlayBlock]);

  for (const [field, text] of scanTargets) {
    const hits = findBanned(text);
    if (hits.length) {
      errors.push(`banned_phrase_in_${field}`);
      hits.forEach((h) => bannedHits.add(h));
    }
  }

  const brand = (input.brandWordmark ?? "GetPawsy").trim();
  if (brand !== "GetPawsy") errors.push("brand_wordmark_invalid");

  return { valid: errors.length === 0, errors, bannedHits: Array.from(bannedHits) };
}

const PHRASE_PARTS = [
  ["stop", "scooping", "every", "day"],
  ["stop", "scooping"],
  ["large", "space,", "no", "pressure"],
  ["a", "box", "that", "manages", "itself"],
  // 2026-06-11 expansion — banned because they leak across categories or feel spammy.
  ["shop", "the", "upgrade"],
  ["discover", "why"],
  ["save", "for", "later"],
  ["tired", "of", "litter"],
  ["no", "more", "plastic", "bag", "hunts"],
  ["no", "more", "plastic", "bag"],
] as const;

export const PINTEREST_BANNED_COPY = PHRASE_PARTS.map((parts) => parts.join(" "));

export type PinterestBannedCopyHit = {
  field: string;
  phrase: string;
  value: string;
};

function normaliseText(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsPinterestBannedCopy(value: unknown): string | null {
  const text = normaliseText(value);
  if (!text) return null;
  return PINTEREST_BANNED_COPY.find((phrase) => text.includes(phrase)) ?? null;
}

export function sanitizePinterestBannedCopy(value: unknown, fallback = "Cleaner home, easier days"): string {
  let out = String(value ?? "").replace(/\s+/g, " ").trim();
  for (const phrase of PINTEREST_BANNED_COPY) {
    out = out.replace(new RegExp(escapeRegExp(phrase), "ig"), fallback);
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

export function collectPinterestBannedCopyHits(pin: Record<string, unknown>): PinterestBannedCopyHit[] {
  const meta = (pin?.meta && typeof pin.meta === "object") ? pin.meta as Record<string, unknown> : {};
  const fields: Record<string, unknown> = {
    title: pin.pin_title ?? pin.title,
    description: pin.pin_description ?? pin.description,
    overlay_text: pin.overlay_text,
    prompt: pin.prompt ?? meta.prompt ?? meta.image_prompt ?? meta.generated_image_prompt,
    image_alt: pin.image_alt ?? meta.image_alt ?? meta.imageAlt,
    cta: pin.cta ?? meta.cta ?? meta.call_to_action,
    // Cloudinary overlays bake the headline text into the image URL itself
    // (e.g. `l_text:...:Stop%20scooping%0Aevery%20day`). Decode it before
    // scanning so we catch the leak even when the DB row's overlay_text/title
    // were already sanitised.
    image_url: decodePinterestImageOverlay(pin.pin_image_url ?? pin.image_url),
    meta: pin.meta ? JSON.stringify(pin.meta) : "",
  };
  const hits: PinterestBannedCopyHit[] = [];
  for (const [field, value] of Object.entries(fields)) {
    const phrase = containsPinterestBannedCopy(value);
    if (phrase) hits.push({ field, phrase, value: String(value ?? "").slice(0, 300) });
  }
  return hits;
}

function decodePinterestImageOverlay(url: unknown): string {
  const str = typeof url === "string" ? url : "";
  if (!str) return "";
  try {
    return decodeURIComponent(str.replace(/%0A/gi, " ").replace(/\+/g, " "));
  } catch {
    return str;
  }
}

const SAFE_HOOKS: Record<string, string[]> = {
  litter: [
    "Clean litter in seconds",
    "Less cleaning every day",
    "Fresher home in minutes",
    "One tap cleanup",
    "Cleaner litter routine",
  ],
  cat_tree: [
    "Upgrade your cat setup",
    "Climb scratch lounge",
    "Indoor cats love this",
    "Sturdy cat tree upgrade",
  ],
  dog: [
    "Cozy rest every night",
    "Upgrade your dog setup",
    "Your dog deserves better",
  ],
  default: [
    "Smart pet upgrade",
    "Everyday pet life made easier",
    "A cleaner calmer routine",
  ],
};

export function pickSafePinterestOverlay(slug: unknown, categoryKey?: unknown, seed?: unknown): string {
  const text = `${slug ?? ""} ${categoryKey ?? ""}`.toLowerCase();
  const bank = /litter/.test(text)
    ? SAFE_HOOKS.litter
    : /cat[-_\s]?tree|scratch|tower|condo/.test(text)
      ? SAFE_HOOKS.cat_tree
      : /\b(dog|puppy|leash|kennel|crate|bed)\b/.test(text)
        ? SAFE_HOOKS.dog
        : SAFE_HOOKS.default;
  const rawSeed = String(seed ?? slug ?? categoryKey ?? "safe");
  let hash = 0;
  for (let i = 0; i < rawSeed.length; i++) hash = ((hash << 5) - hash + rawSeed.charCodeAt(i)) | 0;
  return bank[Math.abs(hash) % bank.length].slice(0, 32);
}

export function rejectReasonForBannedCopy(hits: PinterestBannedCopyHit[]): string {
  return hits.map((h) => `${h.field}:${h.phrase}`).join(",") || "banned_phrase_leak";
}
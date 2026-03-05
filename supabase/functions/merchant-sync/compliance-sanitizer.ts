/**
 * Google Merchant Compliance Sanitizer v2
 * 
 * Strips ALL promotional, marketing, shipping, trust, and exaggerated claims.
 * Generates factual fallback descriptions when sanitized text is too short.
 * Uses numeric Google taxonomy IDs only.
 */

// ── Banned phrase patterns (case-insensitive) ──────────────────────
const BANNED_PHRASES: RegExp[] = [
  /free\s*shipping/gi, /ships?\s*from/gi, /\d+[-–]\d+\s*business\s*days?/gi,
  /fast\s*delivery/gi, /express\s*shipping/gi, /us\s*warehouse/gi,
  /worldwide\s*shipping/gi, /delivery\s*time/gi, /ships?\s*quickly/gi,
  /same\s*day\s*shipping/gi, /next\s*day\s*delivery/gi, /domestic\s*shipping/gi,
  /international\s*shipping/gi, /flat\s*rate\s*shipping/gi, /free\s*us\s*shipping/gi,
  /ships?\s*from\s*us\s*fulfillment/gi, /us\s*fulfillment/gi,
  /\d+[-–]?\s*day\s*returns?/gi, /hassle[-\s]*free\s*returns?/gi, /money\s*back/gi,
  /satisfaction\s*guarantee[d]?/gi, /happiness\s*guarantee[d]?/gi, /full\s*refund/gi,
  /risk[-\s]*free/gi, /no\s*questions?\s*asked/gi, /easy\s*returns?/gi,
  /trusted\s*by/gi, /best\s*seller/gi, /bestseller/gi, /top[-\s]*rated/gi,
  /premium\s*quality/gi, /unbeatable/gi, /limited\s*(time\s*)?offer/gi,
  /shop\s*now/gi, /order\s*today/gi, /best\s*price/gi,
  /exclusive\s*(deal|offer|price)?/gi, /must[-\s]*have/gi, /your\s*pet\s*deserves/gi,
  /perfect\s*for/gi, /amazing/gi, /high[-\s]*quality\s*guarantee/gi,
  /incredible/gi, /unbelievable/gi, /guaranteed/gi, /act\s*now/gi,
  /don'?t\s*miss/gi, /hurry/gi, /while\s*supplies?\s*last/gi,
  /limited\s*stock/gi, /only\s*\d+\s*left/gi, /sale\s*ends?/gi,
  /save\s*\d+%/gi, /\d+%\s*off/gi, /buy\s*now/gi, /add\s*to\s*cart/gi,
  /\bnew\s*style\b/gi,
  /✔/g, /✓/g, /★+/g, /⭐+/g, /🏆/g, /🥇/g, /💯/g, /🔥/g, /✅/g, /🎉/g, /🚚/g, /📦/g,
  /we\s*love\s*pets?/gi, /pawsy\s*promise/gi, /join\s*\d+\s*happy/gi,
  /customers?\s*love/gi, /pet\s*parents?\s*agree/gi, /vet[-\s]*recommended/gi,
  /vet[-\s]*approved/gi,
];

const BANNED_TITLE_WORDS: RegExp[] = [
  /\bbest\b/gi, /\bpremium\b/gi,
  /\btop\b(?!\s*(load|mount|entry|zip|lid))/gi,
  /\b(amazing|incredible|unbelievable|fantastic|awesome|superb)\b/gi,
  /\bexclusive\b/gi, /\bluxury\b/gi, /\bultimate\b/gi,
  /\bprofessional\s*grade\b/gi, /\bmust[-\s]*have\b/gi,
  /\bnew\s*style\b/gi, /\bhot\s*sale\b/gi, /\b(free|gratis)\b/gi,
];

const EMOJI_RE = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{200D}\u{20E3}\u{FE0F}\u{E0020}-\u{E007F}]/gu;
const HTML_TAG_RE = /<\/?[a-z][^>]*>/gi;
const ALL_CAPS_MARKETING_RE = /\b[A-Z]{2,}(?:\s+[A-Z]{2,}){2,}\b/g;

// ── Google Product Category: NUMERIC IDs only ─────────────────────
// Source: https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt
const NUMERIC_CATEGORY_MAP: Record<string, number> = {
  // Dog
  "dog toys": 5004, "dog toy": 5004, "dog ball": 5004,
  "dog beds": 4985, "dog bed": 4985, "dog mat": 4985,
  "dog collar": 5001, "dog collars": 5001, "dog harness": 5001,
  "dog leash": 5002, "dog leashes": 5002, "dog lead": 5002,
  "dog food": 4989, "dog treat": 4989, "dog treats": 4989,
  "dog grooming": 4993, "dog brush": 4993, "dog shampoo": 4993,
  "dog clothing": 5003, "dog apparel": 5003, "dog sweater": 5003, "dog jacket": 5003,
  "dog bowl": 4997, "dog feeder": 4997,
  "dog crate": 6981, "dog kennel": 6981, "dog cage": 6981, "dog carrier": 6981,
  "dog training": 5005, "dog clicker": 5005,
  // Cat
  "cat toys": 5019, "cat toy": 5019,
  "cat beds": 5008, "cat bed": 5008, "cat mat": 5008,
  "cat collar": 5016, "cat collars": 5016, "cat harness": 5016,
  "cat food": 5013, "cat treat": 5013, "cat treats": 5013,
  "cat grooming": 5015, "cat brush": 5015,
  "cat litter": 5011, "litter box": 5010, "litter scoop": 5011,
  "cat tree": 5020, "cat tower": 5020, "cat scratcher": 5020, "scratching post": 5020,
  "cat carrier": 6983, "cat crate": 6983,
  "cat furniture": 5007, "cat shelf": 5007,
  "cat bowl": 5017, "cat feeder": 5017,
  // General pet
  "pet carrier": 6978, "pet carriers": 6978,
  "pet bowl": 8069, "pet bowls": 8069, "feeding": 8069, "water fountain": 8069,
  "pet bed": 4516, "pet mat": 4516,
  "pet grooming": 4523, "grooming": 4523,
  "pet clothing": 5597, "pet apparel": 5597,
  "pet tag": 6984, "id tag": 6984, "name tag": 6984,
  "aquarium": 5040, "fish tank": 5040, "fish": 5029,
  "bird": 5025, "bird cage": 5022, "bird toy": 5024, "bird feeder": 5023,
  "small animal": 5045, "hamster": 5045, "rabbit": 5045,
  "reptile": 5053, "terrarium": 5054,
  // Broad fallbacks
  "pet supplies": 2,  // "Animals & Pet Supplies"
  "pet": 2,
  "dog": 4985,
  "cat": 5007,
};

// ── Product type guesser for fallback descriptions ────────────────
const TYPE_PATTERNS: Array<[RegExp, string]> = [
  [/\b(collar|harness)\b/i, "collar/harness"],
  [/\b(leash|lead)\b/i, "leash"],
  [/\b(bed|mat|cushion|pillow)\b/i, "pet bed"],
  [/\b(toy|ball|chew|squeaky|plush)\b/i, "pet toy"],
  [/\b(bowl|feeder|fountain|dish)\b/i, "feeding accessory"],
  [/\b(brush|comb|grooming|nail\s*clipper|shampoo)\b/i, "grooming tool"],
  [/\b(carrier|crate|cage|kennel)\b/i, "pet carrier/crate"],
  [/\b(sweater|jacket|coat|vest|boot|shoe|bandana)\b/i, "pet apparel"],
  [/\b(tree|tower|scratcher|scratching\s*post|shelf)\b/i, "cat furniture"],
  [/\b(litter|scoop)\b/i, "litter accessory"],
  [/\b(treat|food|snack)\b/i, "pet food/treat"],
  [/\b(tag|id\s*tag)\b/i, "pet ID tag"],
  [/\b(training|clicker|whistle)\b/i, "training tool"],
];

function guessProductType(name: string): string {
  for (const [re, type] of TYPE_PATTERNS) {
    if (re.test(name)) return type;
  }
  return "pet accessory";
}

// ── Material guesser ──────────────────────────────────────────────
const MATERIAL_PATTERNS: Array<[RegExp, string]> = [
  [/\b(silicone)\b/i, "silicone"],
  [/\b(stainless\s*steel)\b/i, "stainless steel"],
  [/\b(nylon)\b/i, "nylon"],
  [/\b(polyester)\b/i, "polyester"],
  [/\b(cotton)\b/i, "cotton"],
  [/\b(leather)\b/i, "leather"],
  [/\b(rubber)\b/i, "rubber"],
  [/\b(plush)\b/i, "plush fabric"],
  [/\b(ceramic)\b/i, "ceramic"],
  [/\b(wood|wooden|bamboo)\b/i, "wood"],
  [/\b(plastic|pvc|abs)\b/i, "durable plastic"],
  [/\b(mesh)\b/i, "breathable mesh"],
  [/\b(fleece)\b/i, "fleece"],
  [/\b(canvas)\b/i, "canvas"],
  [/\b(oxford)\b/i, "Oxford fabric"],
];

function guessMaterial(text: string): string | null {
  for (const [re, mat] of MATERIAL_PATTERNS) {
    if (re.test(text)) return mat;
  }
  return null;
}

// ── Animal guesser ────────────────────────────────────────────────
function guessAnimal(text: string): string {
  if (/\bdog\b/i.test(text)) return "dogs";
  if (/\bcat\b/i.test(text)) return "cats";
  if (/\b(puppy|puppies)\b/i.test(text)) return "puppies";
  if (/\b(kitten|kittens)\b/i.test(text)) return "kittens";
  if (/\bbird\b/i.test(text)) return "birds";
  if (/\b(rabbit|bunny)\b/i.test(text)) return "rabbits";
  if (/\b(hamster|guinea\s*pig)\b/i.test(text)) return "small animals";
  if (/\b(fish|aquarium)\b/i.test(text)) return "fish";
  if (/\b(reptile|lizard|snake|turtle)\b/i.test(text)) return "reptiles";
  return "pets";
}

export interface ComplianceSanitizeResult {
  originalTitle: string;
  sanitizedTitle: string;
  originalDescription: string;
  sanitizedDescription: string;
  titleChanged: boolean;
  descriptionChanged: boolean;
  removedPhrases: string[];
  blocked: boolean;
  blockReason: string | null;
  googleProductCategory: number | null;
  descriptionFallbackGenerated: boolean;
}

export interface ComplianceSummary {
  total_products_processed: number;
  sanitized_titles_count: number;
  sanitized_descriptions_count: number;
  removed_promotional_phrases_count: number;
  products_blocked_for_compliance: number;
  blocked_reasons: Record<string, number>;
  final_export_count: number;
  descriptions_fallback_generated_count: number;
  products_still_blocked_count: number;
  google_category_set_count: number;
  google_category_omitted_count: number;
  google_category_invalid_prevented_count: number;
}

// ── Dropship title cleanup patterns ───────────────────────────────
const DROPSHIP_TITLE_PATTERNS: Array<[RegExp, (match: string, ...groups: string[]) => string]> = [
  // "Portable Pet Agility Pet Training Set Dog Obstacle Exercise" → "Dog Agility Training Set – Obstacle Course for Active Dogs"
  [/^(?:Portable\s+)?(?:Pet\s+)?(\w+)\s+(?:Pet\s+)?(\w+)\s+Set\s+(?:Dog|Cat|Pet)\s+(\w+)\s+(\w+)$/i,
    (_m, g1, g2, g3, _g4) => `Dog ${g1} ${g2} Set – ${g3} Course for Active Dogs`],
  // Remove repeated "Pet" in titles
  [/\bPet\s+(?=.*\bPet\b)/gi, () => ""],
  // "New Style Hot Sale XXX" → "XXX"
  [/^(?:New\s+Style\s+)?(?:Hot\s+Sale\s+)?/i, () => ""],
  // Collapse repeated product type words: "Dog Dog" → "Dog"
  [/\b(\w{3,})\s+\1\b/gi, (_m, w) => w],
];

export function sanitizeTitle(title: string): { sanitized: string; removed: string[] } {
  let result = title;
  const removed: string[] = [];

  const emojiMatches = result.match(EMOJI_RE);
  if (emojiMatches) { removed.push(...emojiMatches.map(e => `emoji:${e}`)); result = result.replace(EMOJI_RE, ""); }

  for (const re of BANNED_TITLE_WORDS) {
    const matches = result.match(re);
    if (matches) { removed.push(...matches.map(m => `title_word:${m.trim()}`)); result = result.replace(re, ""); }
  }

  for (const re of BANNED_PHRASES) {
    const matches = result.match(re);
    if (matches) { removed.push(...matches.map(m => `phrase:${m.trim()}`)); result = result.replace(re, ""); }
  }

  // Dropship-style title cleanup
  for (const [pattern, replacer] of DROPSHIP_TITLE_PATTERNS) {
    const before = result;
    result = result.replace(pattern, replacer as (...args: string[]) => string);
    if (result !== before) removed.push(`dropship_title_cleanup`);
  }

  result = result.replace(/\b([A-Z]{5,})\b/g, (match) => match.charAt(0) + match.slice(1).toLowerCase());
  result = result.replace(/\s{2,}/g, " ").trim();
  result = result.replace(/^[,.\-–—:;|]+\s*/, "").replace(/\s*[,.\-–—:;|]+$/, "");

  // Enforce 150 char limit
  if (result.length > 150) result = result.substring(0, 147) + "...";

  return { sanitized: result, removed };
}

// ── Cloudinary image URL rewriting ────────────────────────────────
export function rewriteCloudinaryUrl(url: string): { url: string; rewritten: boolean } {
  if (!url) return { url, rewritten: false };
  // Match Cloudinary transforms with small widths (w_100 to w_799)
  const smallWidthRe = /\/(?:w_[1-7]\d{0,2}|w_800)\b/;
  if (smallWidthRe.test(url)) {
    const newUrl = url.replace(/w_\d+/, "w_1000");
    return { url: newUrl, rewritten: true };
  }
  return { url, rewritten: false };
}

// ── Fallback description generator ───────────────────────────────
export function generateSafeDescription(productName: string): string {
  const animal = guessAnimal(productName);
  const productType = guessProductType(productName);
  const material = guessMaterial(productName);
  const materialStr = material ? ` Made from ${material}.` : "";
  return `${productName} is a ${productType} designed for everyday pet care and comfort. It supports routine use at home or while traveling. The design focuses on practical use and durability.${materialStr} Suitable for ${animal} depending on the selected option and size.`;
}

export function sanitizeDescription(description: string): { sanitized: string; removed: string[] } {
  let result = description;
  const removed: string[] = [];

  const htmlMatches = result.match(HTML_TAG_RE);
  if (htmlMatches) { removed.push(`html_tags:${htmlMatches.length}`); result = result.replace(HTML_TAG_RE, " "); }

  const emojiMatches = result.match(EMOJI_RE);
  if (emojiMatches) { removed.push(...emojiMatches.map(e => `emoji:${e}`)); result = result.replace(EMOJI_RE, ""); }

  const capsMatches = result.match(ALL_CAPS_MARKETING_RE);
  if (capsMatches) {
    for (const m of capsMatches) removed.push(`all_caps:${m.substring(0, 40)}`);
    result = result.replace(ALL_CAPS_MARKETING_RE, (match) => match.charAt(0) + match.slice(1).toLowerCase());
  }

  for (const re of BANNED_PHRASES) {
    const matches = result.match(re);
    if (matches) { removed.push(...matches.map(m => `phrase:${m.trim()}`)); result = result.replace(re, ""); }
  }

  result = result.replace(/[•●◦▪▸►➤➜→←↓↑⇒⇨※☆♦♥♠♣]/g, "");
  result = result.replace(/[✔✓✅☑]/g, "");
  result = result.replace(/\n{3,}/g, "\n\n");
  result = result.replace(/\s{2,}/g, " ");
  result = result.replace(/^\s+|\s+$/gm, "");
  result = result.trim();

  if (result.length > 5000) result = result.substring(0, 4997) + "...";

  return { sanitized: result, removed };
}

/**
 * Generate a factual fallback description when sanitized text is too short.
 */
function generateFallbackDescription(
  productName: string,
  originalDesc: string,
  weightKg?: number | null,
): string {
  const cleanName = sanitizeTitle(productName).sanitized;
  const productType = guessProductType(productName);
  const material = guessMaterial(productName + " " + originalDesc);
  const animal = guessAnimal(productName + " " + originalDesc);

  const sentences: string[] = [];

  sentences.push(`${cleanName} is a ${productType} designed for ${animal}.`);

  if (material) {
    sentences.push(`Constructed from ${material} for everyday use.`);
  }

  // Extract size-like info from name
  const sizeMatch = (productName + " " + originalDesc).match(/\b(\d+(?:\.\d+)?\s*(?:cm|mm|inch|in|ft|m|"|'))\b/i);
  if (sizeMatch) {
    sentences.push(`Approximate dimension: ${sizeMatch[1]}.`);
  }

  if (weightKg && weightKg > 0.1) {
    sentences.push(`Product weight: approximately ${weightKg} kg.`);
  }

  // Add generic functional sentences based on type
  const typeExtras: Record<string, string> = {
    "pet toy": "Suitable for interactive play and mental stimulation.",
    "pet bed": "Provides a comfortable resting area.",
    "collar/harness": "Designed for daily walks and outdoor use.",
    "leash": "Suitable for walking and training.",
    "feeding accessory": "For use during feeding time.",
    "grooming tool": "For regular grooming and coat maintenance.",
    "pet carrier/crate": "For safe transport of your pet.",
    "pet apparel": "Designed to fit comfortably during wear.",
    "cat furniture": "Provides a space for climbing, scratching, and resting.",
    "litter accessory": "For use with standard litter boxes.",
    "training tool": "Designed to assist with pet training routines.",
    "pet accessory": "A functional accessory for everyday pet care.",
  };

  if (typeExtras[productType]) {
    sentences.push(typeExtras[productType]);
  }

  sentences.push(`Compatible with standard ${animal} care setups.`);
  sentences.push(`Check product listing for available sizes and color options.`);

  return sentences.join(" ");
}

export function checkComplianceBlock(
  title: string,
  description: string
): { blocked: boolean; reason: string | null } {
  for (const re of BANNED_PHRASES) {
    if (re.test(title) || re.test(description)) {
      return { blocked: true, reason: "residual_banned_phrase" };
    }
  }
  if (EMOJI_RE.test(title) || EMOJI_RE.test(description)) return { blocked: true, reason: "residual_emoji" };
  if (HTML_TAG_RE.test(description)) return { blocked: true, reason: "residual_html" };
  if (!title || title.trim().length < 3) return { blocked: true, reason: "title_too_short_after_sanitize" };
  // Only block if description is completely empty after fallback
  if (!description || description.trim().length === 0) return { blocked: true, reason: "description_empty" };

  return { blocked: false, reason: null };
}

/**
 * Map internal category to numeric Google Product Category ID.
 * Returns null if no valid mapping found → field will be omitted.
 */
export function mapGoogleCategory(internalCategory: string | null, productName?: string | null): number | null {
  const sources = [internalCategory, productName].filter(Boolean) as string[];

  for (const source of sources) {
    const lower = source.toLowerCase().trim();

    // Direct match
    if (NUMERIC_CATEGORY_MAP[lower] !== undefined) return NUMERIC_CATEGORY_MAP[lower];

    // Partial match: check if any key appears in the source
    for (const [key, id] of Object.entries(NUMERIC_CATEGORY_MAP)) {
      if (lower.includes(key)) return id;
    }
  }

  return null;
}

/**
 * Full compliance sanitization for a single product.
 */
export function sanitizeProduct(product: {
  title: string;
  description: string;
  category?: string | null;
  weightKg?: number | null;
}): ComplianceSanitizeResult {
  const titleResult = sanitizeTitle(product.title);
  const descResult = sanitizeDescription(product.description);

  let finalDesc = descResult.sanitized;
  let fallbackGenerated = false;

  // If description too short after sanitize, generate factual fallback
  const wordCount = finalDesc.split(/\s+/).filter(Boolean).length;
  if (finalDesc.length < 140 || wordCount < 20) {
    finalDesc = generateFallbackDescription(
      product.title,
      product.description,
      product.weightKg,
    );
    fallbackGenerated = true;
  }

  const allRemoved = [...titleResult.removed, ...descResult.removed];
  const blockCheck = checkComplianceBlock(titleResult.sanitized, finalDesc);

  return {
    originalTitle: product.title,
    sanitizedTitle: titleResult.sanitized,
    originalDescription: product.description,
    sanitizedDescription: finalDesc,
    titleChanged: titleResult.sanitized !== product.title,
    descriptionChanged: finalDesc !== product.description,
    removedPhrases: allRemoved,
    blocked: blockCheck.blocked,
    blockReason: blockCheck.reason,
    googleProductCategory: mapGoogleCategory(product.category || null, product.title),
    descriptionFallbackGenerated: fallbackGenerated,
  };
}

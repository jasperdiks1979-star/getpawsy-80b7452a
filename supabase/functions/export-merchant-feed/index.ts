import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = "https://getpawsy.pet";
const BRAND = "GetPawsy";

// ── TOP 80 Google-Safe Primary Export Set ────────────────────────────
// Only these product IDs are exported in the primary "top80" feed mode.
// All others go to a holdout/review queue.
const MERCHANT_TOP80_IDS = new Set([
  // ── Original Top 50 ───────────────────────────────
  // Cat Litter Boxes (7)
  '31e46b70-cf1c-4d5b-99db-3350b12380db',
  '1a1302e7-939f-4c94-96b7-d4e0c9d34a37',
  '74e9c23c-d2d3-478a-82bd-e912e85bcc39',
  '501e9150-42e0-42d7-8031-a7225a718558',
  'f33ae4a9-347b-4a90-872d-597036e6e973',
  '32e50b79-e2bc-4895-a7c2-5534dd9095a0',
  'fe5ed2d6-0230-4c5a-8313-235a28ef4f21',
  // Cat Trees & Condos (8)
  '41e1a8e0-a059-4002-b3ab-0d4270030d93',
  'fdcb9c5f-8a50-46e7-9cb0-8ecf5a03b8bf',
  'e08f6c35-b3b1-4f2d-b78e-37fc107f4357',
  '133cdc48-0117-40d5-9aaf-1a81131ca9bb',
  '80ca3336-49a8-44a9-8b2d-fbfe1288cb28',
  '035a85cb-f867-4f64-94e8-a6c71ab16b18',
  '07507c96-a445-431f-9724-340ee01d818f',
  '0441e51b-d537-468b-8938-66b2dee6e6c9',
  // Dog Beds (5)
  '52b04c49-287f-478a-8d35-b7b048d9a844',
  'ecf613cb-2160-4842-9438-91d19b3a1967',
  '19390342-4534-47ef-a77d-2e3dcce6c737',
  'c7177ee4-5509-492f-965f-617402968f5c',
  '08856bd3-3842-4058-ba44-f1927ae59f2e',
  // Cat Scratching Posts (3)
  'a7ee6fb7-885a-4a5f-9dc9-df2231f9504b',
  '84b33906-87dd-4d91-b79b-667519248013',
  '112c4e1b-869d-4ed9-95c4-002d7425968d',
  // Dog Carriers (4)
  '530a4583-ce42-49d7-8d56-64aa0914256f',
  'a1c89f7f-a1d1-4607-a72a-d4f9da8b4ceb',
  '0381585e-8b6b-48a8-b541-c7298f99b0c9',
  '490014d4-0ab8-44c9-bd3a-fdc226020a11',
  // Cat Carriers (2)
  '020d9b4a-3ad2-4ed5-b1c0-d5183b93f425',
  'c6cc84bb-3990-4671-a06d-53dc283565b7',
  // Pet Carriers (1)
  '5ed1f216-9686-4d30-a6f9-9938a420d06e',
  // Cat Houses (2)
  '8cc4e183-430c-4ccd-9b5c-b6056bafd262',
  '3019dc01-9281-4d77-9383-af6453b93895',
  // Dog Collars & Leashes (3)
  '9204b6cb-d895-4b0d-8883-e43049fee3a1',
  '0139036c-d1b8-4b8a-996b-1ec8d5c0a908',
  '0e223939-77b4-417b-8bec-5da31de0a726',
  // Cat Bowls & Feeders (3)
  '685f7faf-7809-4962-b408-c2ced99dd178',
  'dcc0a412-adfe-49b3-8f26-ad8382f3a2d9',
  'b476d7d3-bf0f-4318-9968-606e0e3e0c3f',
  // Dog Grooming (3)
  '142f56ba-1326-4e3b-9d0c-0d79321f1671',
  'e71ba404-4aff-48a6-9681-e0297b727292',
  '3bfd8f1a-c2d5-4703-bfd7-1dfc5a07adf3',
  // Cat Furniture (2)
  '0b041496-f7a3-480c-83bb-fdba8ae840f3',
  'ca67d0d6-4ced-40ab-80ee-443b1021ab92',
  // Cat Grooming (1)
  '67f40a1b-595e-4fcf-a4b5-ab141b224ed7',
  // Dog Bowls & Feeders (2)
  '7b540a34-7048-4f10-8c91-118b86278571',
  '047dd523-57d3-46ca-82f3-0885b0fc1667',
  // Dog Feeding Supplies (2)
  '9aa33c0c-e455-4477-85f3-83873360c777',
  'ddf8f410-a77a-4bd0-89f1-36e1b04dec51',
  // Dog Crates & Kennels (1)
  'c43193ad-d4e0-4247-ad53-0d77fe038c9f',
  // Pet Houses (1)
  '7c77be17-e070-45d5-82a6-d14635693f31',

  // ── Expansion +30 (2026-03-25) ────────────────────
  // Cat Litter Boxes +5
  '128e0207-8a94-4d71-b428-5b7f5002528f',
  'e4474637-f447-4503-a342-5667c4c546a8',
  'e265e7fe-af60-4efc-b927-5c4f79fc1bf0',
  '156ed3db-e926-482c-951a-4c1fcb61779d',
  'dd22e0bb-2e11-4508-b56c-79221fc13bd0',
  // Cat Trees & Condos +8
  '74259a91-2759-4ae6-9dae-1c1423ec99f7',
  'b460b81e-d8d7-4adf-8263-a56c54f4a7ea',
  '11758292-6f06-492c-88a7-0acdeb5e417e',
  '352ddb8f-89f6-41b1-86b8-25af8ab1adb1',
  '5a5756d8-0ba2-40a3-bc69-ee5646dd566b',
  '7caac9df-339a-4c62-b240-940de7bc4149',
  '292d5788-3404-4ac3-87e9-faa1c4982a12',
  '62732903-ee38-467c-9518-33fb1b9ffc64',
  // Dog Beds +3
  'd964894c-9abc-4fd7-b4aa-bba910a64ae6',
  '2c67afc3-51bc-44bb-90fa-1229a82df579',
  '5a1c6f69-ef5d-4fb3-aee4-dd31dd569d58',
  // Dog Crates & Kennels +2
  'ecef0b61-7c26-40de-a493-21fbb097e5c1',
  '51c901f4-cd73-4a51-98ce-41f8f3759bf5',
  // Dog Carriers +2
  '18028997-901a-40b8-8790-9e7b3ec558bf',
  '39bb08f6-dfa6-40ec-8b5a-d929d6270842',
  // Cat Scratching Posts +2
  '3d009b65-2200-41fb-b229-cc73ae57a02d',
  '2a89050a-e339-4b6b-b831-e6c9136e49c8',
  // Cat Houses +1
  'f828d5b0-f583-4435-ab1e-27104da5fae6',
  // Dog Safety Gates +1
  'fe0003f6-33bd-4406-8697-3e50ca3f368c',
  // Dog Training +1
  'cbfd4540-cbb3-449d-aaa1-a3ebb5a8bef3',
  // Dog Bowls & Feeders +2
  '29d9d63f-8728-4ac1-a2f8-83a5b2b0f1c1',
  '62a59e26-a6dd-4ddf-80c9-af48da4d78ed',
  // Dog Toys +1
  '990120b5-7d3d-442e-bf2f-19d6845ab2d4',
  // Pet Houses +1
  'c955d810-9fff-4c6a-9fc4-1c38c90370f9',
  // Dog Feeding Supplies +1
  '2c9a5bfd-b2a0-4d0b-80ac-26ea19e3bca5',
  // Dog Collars & Leashes (added)
  '314fa804-996c-45f1-a073-f268833bbc43',
]);

// ── Product-specific overrides (hardcoded clean copy) ───────────────
// These override DB values during export to guarantee feed quality.
const PRODUCT_OVERRIDES: Record<string, { title?: string; description?: string; category?: string }> = {
  '047dd523-57d3-46ca-82f3-0885b0fc1667': {
    title: 'GetPawsy Tactical Dog Harness Set – Harness, Seat Belt, Bowl & Waste Bags',
    description: 'Dog harness set with adjustable vest, car seat belt, collapsible bowl, and waste bags. Designed for daily walks, car travel, and outdoor use. Practical bundle for active dog owners.',
    category: 'Dog Collars & Leashes',
  },
  '314fa804-996c-45f1-a073-f268833bbc43': {
    title: 'GetPawsy Adjustable Dog Car Safety Seat Belt – Nylon Travel Leash',
    description: 'Adjustable nylon dog safety seat belt designed to help keep dogs secure during car travel. Clips to a harness for controlled movement in the vehicle. Suitable for everyday travel use.',
    category: 'Dog Collars & Leashes',
  },
  '31e46b70-cf1c-4d5b-99db-3350b12380db': {
    description: 'Furniture-style cat litter box enclosure with barn door design and side cat entry. Helps conceal the litter area while providing privacy for indoor cats. Sturdy structure with a top surface suitable for home placement.',
  },
  '020d9b4a-3ad2-4ed5-b1c0-d5183b93f425': {
    description: 'Portable cat carrier trolley bag with shoulder straps and breathable design for everyday travel. Suitable for vet visits, outings, and short-distance transport. Designed to provide enclosed support and ventilation for cats.',
  },
  '292d5788-3404-4ac3-87e9-faa1c4982a12': {
    description: '4-level cat tree with moon and star design, jute scratching posts, and elevated platforms. Includes multiple rest and play areas for indoor cats. Stable structure with anti-tipping support.',
  },
  '41e1a8e0-a059-4002-b3ab-0d4270030d93': {
    description: '41-inch cat tree with water hyacinth elements, multiple levels, and sisal scratching posts. Designed for indoor cats that enjoy climbing, scratching, and resting. Suitable for everyday enrichment and activity.',
  },
  '39bb08f6-dfa6-40ec-8b5a-d929d6270842': {
    description: 'Aluminum pet transport case designed for dog travel and secure enclosed transport. Durable frame with ventilated construction for routine travel use. Suitable for car trips and practical pet handling.',
  },
  '3bfd8f1a-c2d5-4703-bfd7-1dfc5a07adf3': {
    description: 'Dog grooming brush with flexible massage-style surface for bathing and coat care. Helps remove loose hair and supports routine cleaning during wash sessions. Designed for regular home grooming use.',
  },
  '352ddb8f-89f6-41b1-86b8-25af8ab1adb1': {
    title: 'GetPawsy UFO Cat Tree Condo – 49 Inch Activity Center with Sisal Posts',
    description: '49-inch cat activity center with elevated perch, enclosed capsule-style rest area, hammock, and sisal scratching posts. Designed for climbing, scratching, and lounging indoors. Multi-level structure for active cats.',
  },
  '33ad17c0-b009-4df5-8e45-265fcb78bdbc': {
    title: 'GetPawsy Minimalist Dog Harness – Outdoor Adjustable Design',
    description: 'Adjustable dog harness with lightweight outdoor design and secure buckle closure. Built for daily walks and routine use. Suitable for dogs needing a simple vest-style harness.',
  },
  '0441e51b-d537-468b-8938-66b2dee6e6c9': {
    description: '44-inch cat tree with spacious perch, enclosed condo, hammock, and scratching areas. Designed for indoor cats that enjoy climbing, resting, and daily activity. Stable multi-level layout for home use.',
  },
  '32e50b79-e2bc-4895-a7c2-5534dd9095a0': {
    description: 'Top-entry enclosed cat litter box with odor-locking design and included litter mat. Built to help reduce litter scatter and provide privacy for indoor cats. Suitable for everyday home litter use.',
  },
};

// ── Hard-blocked product IDs (policy-sensitive) ─────────────────────
const BLOCKED_PRODUCT_IDS = new Set([
  "2bf9d939-bf2c-4382-a8e2-3c60c6795b72",
  "2233541f-b223-4a76-8572-272f971aacd2",
  "16f69eff-5135-4428-a2ac-fe93ca9c18e5",
  "2578d864-6fc6-432c-9834-c0dfb9237630",
  "cf85b323-66fd-4dd1-acb5-1c145b7a183b",
  "3aa3fe57-9c05-49ff-92de-3af0b924d5c6",
  "3eebf00e-d074-49f4-927c-9f68540de056",
  "46d3a6e0-4252-4480-bea3-2f179ffed8bb",
  "2de6f9bd-b9b9-4dd6-8f66-2a2654c418bc",
  "d578c6e1-eeb8-4129-8412-f5fbdae3479b",
  "b1f32db4-baa7-46df-aa74-2462974f74f5",
  "45b9c1dd-b459-458b-a78a-fe6b8fc7e179",
  "63b6933b-c43c-46fb-a41f-99304b42c083",
  "b29264c0-aab5-485f-844f-e649767dacda",
  "87725039-fcfd-4505-b8b8-660974478cae",
  "3587a2ea-4721-4ad1-8390-93b5a891261e",
  "8db4321c-896f-4341-aaca-80adc2241b1f",
  "274d17f0-2928-431d-9ff5-a1573cefe353",
  "b9a3b924-2683-4e76-8a8c-9c00410562a3",
  "58764079-8a5a-47f9-ba9e-772d412eb0a9",
  "eb8e67d1-06b9-48d9-a939-d76d50ce5633",
  "1cebc2d5-1e84-4002-a062-4b747c36cab4",
  "42823f27-f3ec-4494-a081-73c7fbc029e0",
  "303c9938-3c45-4ce7-b925-61786b69c5f7",
  "294e3350-430d-4191-acb3-05ee2e533d1d", // explosion-proof slug — excluded until slug is safe
]);

// ── Policy-unsafe keyword patterns ──────────────────────────────────
const POLICY_UNSAFE_PATTERNS = [
  /shock\s*(collar|training|correction|system|fence|boundary)?/i,
  /static\s*correction/i,
  /electric\s*(fence|collar|training|shock|boundary)/i,
  /boundary\s*shock/i,
  /e-shock/i,
  /bark\s*(shock|static)/i,
  /aversive\s*training/i,
  /wireless\s*fence/i,
  /training\s*collar/i,
  /electric\s*collar/i,
  /containment\s*system/i,
  /anti[-\s]*bark\s*(shock|static|electric)/i,
  /correction\s*collar/i,
  /pet\s*shock/i,
  /zap/i,
  /prong\s*collar/i,
  /choke\s*chain/i,
  /gps\s*fence/i,
  /stimulation\s*(chain|collar)/i,
  /explosion[-\s]*proof/i,
];

// ── Non-pet exclusion patterns (only cats & dogs allowed) ───────────
const NON_PET_PATTERNS = [
  /\b(bird|parrot|parakeet|cockatiel|canary|finch|budgie|macaw|aviary|bird\s*cage)\b/i,
  /\b(reptile|snake|lizard|gecko|iguana|turtle|tortoise|terrarium|vivarium)\b/i,
  /\b(chicken|poultry|hen|rooster|coop|egg\s*incubator)\b/i,
  /\b(hamster|gerbil|guinea\s*pig|chinchilla|ferret|rodent|hamster\s*cage|hamster\s*wheel)\b/i,
  /\b(fish\s*tank|aquarium|fish\s*food|fish\s*bowl|betta|goldfish)\b/i,
  /\b(rabbit\s*hutch|rabbit\s*cage|bunny\s*cage)\b/i,
  /\b(rabbit|bunny|rabbits)\b/i,
  /\b(sunglasses|nail\s*art|fashion\s*accessor|jewelry|bracelet|necklace|earring)\b/i,
];

function isNonPetProduct(name: string, desc: string): boolean {
  const text = `${name} ${desc}`.toLowerCase();
  return NON_PET_PATTERNS.some(p => p.test(text));
}

function isPolicySensitive(name: string, desc: string): boolean {
  const text = `${name} ${desc}`.toLowerCase();
  return POLICY_UNSAFE_PATTERNS.some(p => p.test(text));
}

// ── Title cleaning ──────────────────────────────────────────────────

const EMOJI_RE = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;
const HTML_TAG_RE = /<\/?[a-z][^>]*>/gi;
const MARKDOWN_RE = /\*{1,2}([^*]+)\*{1,2}/g;
const SMART_QUOTES_RE = /[""'']/g;

const TITLE_BANNED = [
  /\b(best|premium|amazing|incredible|fantastic|awesome|exclusive|luxury|ultimate|revolutionary|purr-?fect)\b/gi,
  /\b(hot\s*sale|free|gratis|limited\s*(time\s*)?(offer)?|buy\s*now|shop\s*now|order\s*(now|today)|click)\b/gi,
  /\b(top[-\s]*rated|must[-\s]*have|bestseller|best\s*seller|guaranteed)\b/gi,
  /\bfree\s*shipping\b/gi,
  /\bno\s*\d+\b/gi,
  /\d+%\s*off/gi,
  /sale\s*ends?/gi,
  /\bexplosion[-\s]*proof\b/gi,
  /\bstimulation\b/gi,
];

function sanitizeTitle(raw: string): string {
  let t = raw;
  t = t.replace(HTML_TAG_RE, " ");
  t = t.replace(MARKDOWN_RE, "$1");
  t = t.replace(EMOJI_RE, "");
  t = t.replace(SMART_QUOTES_RE, "");
  t = t.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "").replace(/&gt;/gi, "").replace(/&quot;/gi, "");

  for (const re of TITLE_BANNED) t = t.replace(re, "");

  // Fix duplicate consecutive words: "Dog Dog" → "Dog"
  t = t.replace(/\b(\w+)\s+\1\b/gi, "$1");

  // Fix partial-duplicate like "Ret retractable" (partial prefix then full word)
  t = t.replace(/\b([A-Z][a-z]{1,4})\s+([a-z]+)\b/g, (_match, prefix, full) => {
    if (full.toLowerCase().startsWith(prefix.toLowerCase())) return full;
    return `${prefix} ${full}`;
  });

  // Fix "Cat Stainless Steel Cat Litter Box" → "Stainless Steel Cat Litter Box"
  t = t.replace(/\bCat\s+(Stainless\s+Steel\s+Cat\b)/gi, "$1");

  // Remove duplicate "GetPawsy"
  t = t.replace(/GetPawsy\s+GetPawsy/gi, "GetPawsy");

  // Fix ALL CAPS words (5+ chars)
  t = t.replace(/\b([A-Z]{5,})\b/g, (m) => m.charAt(0) + m.slice(1).toLowerCase());

  // Clean up whitespace and trailing punctuation
  t = t.replace(/\s{2,}/g, " ").trim();
  t = t.replace(/^[,.\-–—:;|/]+\s*/, "").replace(/\s*[,.\-–—:;|/]+$/, "");
  t = t.replace(/\s*–\s*–\s*/g, " – ");

  // Brand prefix (only once, only if missing)
  if (!/^GetPawsy\b/i.test(t)) t = `GetPawsy ${t}`;

  // Hard cap at 120 chars
  if (t.length > 120) {
    t = t.substring(0, 117).replace(/\s+\S*$/, "") + "...";
  }

  return t.trim();
}

// ── Description cleaning ────────────────────────────────────────────

const DESC_STRIP_PHRASES: RegExp[] = [
  /please\s*note\b[^.]*\./gi,
  /click\s*here\b[^.]*\./gi,
  /order\s*(now|today)\b[^.]*\./gi,
  /if\s*you'?d\s*like\b[^.]*\./gi,
  /product\s*image\s*:?\s*/gi,
  /note\s*:\s*this\s*(category|product)\s*(was|is)\s*[^.]*\./gi,
  /\*\*[^*]+\*\*/g,
  /free\s*shipping\b[^.]*\./gi,
  /\d+[-–]\s*day\s*returns?\b[^.]*\./gi,
  /money[-\s]*back\s*guarantee\b[^.]*\./gi,
  /satisfaction\s*guarantee[d]?\b[^.]*\./gi,
  /risk[-\s]*free\b[^.]*\./gi,
  /no\s*questions?\s*asked\b[^.]*\./gi,
  /trusted\s*by\b[^.]*\./gi,
  /limited\s*(time\s*)?offer\b[^.]*\./gi,
  /act\s*now\b[^.]*\./gi,
  /don'?t\s*miss\b[^.]*\./gi,
  /hurry\b[^.]*\./gi,
  /while\s*supplies?\s*last\b[^.]*\./gi,
  /limited\s*stock\b[^.]*\./gi,
  /only\s*\d+\s*left\b[^.]*\./gi,
  /save\s*\d+%\b[^.]*\./gi,
  /add\s*to\s*cart\b[^.]*\./gi,
  /buy\s*now\b[^.]*\./gi,
  /vet[-\s]*(recommended|approved)\b[^.]*\./gi,
  /100%\s*automatic\b/gi,
  /fully\s*automatic\b/gi,
  /no\s*smell\s*guaranteed\b/gi,
  /no\s*scooping\s*ever\b/gi,
  /your\s*pet\s*deserves\b[^.]*\./gi,
  /tired\s*of\b[^.]*\?\s*/gi,
  /say\s*goodbye\s*to\b[^.]*\./gi,
  /introducing\b[^.]*\./gi,
];

const DESC_BANNED_CHARS = /[✔✓★⭐🏆🥇💯🔥✅🎉🚚📦•●◦▪▸►➤➜→←↓↑⇒⇨※☆♦♥♠♣☑]/g;

function sanitizeDescription(desc: string): string {
  let d = desc;
  d = d.replace(HTML_TAG_RE, " ");
  d = d.replace(MARKDOWN_RE, "$1");
  d = d.replace(/\*+/g, "");
  d = d.replace(EMOJI_RE, "");
  d = d.replace(DESC_BANNED_CHARS, "");
  d = d.replace(SMART_QUOTES_RE, '"');
  d = d.replace(/&nbsp;/gi, " ");
  d = d.replace(/&amp;/gi, "&");
  d = d.replace(/&lt;/gi, "<");
  d = d.replace(/&gt;/gi, ">");
  d = d.replace(/&quot;/gi, '"');
  d = d.replace(/&#\d+;/g, " ");

  for (const re of DESC_STRIP_PHRASES) d = d.replace(re, " ");
  d = d.replace(/\b(amazing|incredible|fantastic|awesome|exclusive|ultimate|luxury|premium)\b/gi, "");

  d = d.replace(/\n{3,}/g, "\n\n");
  d = d.replace(/\s{2,}/g, " ");
  d = d.trim();

  if (d.length > 1000) {
    d = d.substring(0, 997).replace(/\s+\S*$/, "") + "...";
  }

  return d;
}

// ── Auto-generate fallback description ──────────────────────────────

function guessAnimal(text: string): string {
  const t = text.toLowerCase();
  if (/\bdog\b/.test(t)) return "dogs";
  if (/\bcat\b/.test(t)) return "cats";
  if (/\b(bird|parrot)\b/.test(t)) return "birds";
  if (/\b(hamster|guinea\s*pig|rabbit)\b/.test(t)) return "small animals";
  if (/\b(fish|aquarium)\b/.test(t)) return "fish";
  return "pets";
}

function guessProductType(name: string): string {
  const n = name.toLowerCase();
  if (/\b(leash|lead|rope|traction)\b/.test(n)) return "leash";
  if (/\b(collar|harness)\b/.test(n)) return "collar/harness";
  if (/\b(bed|mat|cushion|pillow)\b/.test(n)) return "pet bed";
  if (/\b(toy|ball|chew|squeaky|laser|teaser)\b/.test(n)) return "toy";
  if (/\b(bowl|feeder|fountain|dispenser|water)\b/.test(n)) return "feeding accessory";
  if (/\b(brush|grooming|trimmer|grinder|comb|deshed|glove)\b/.test(n)) return "grooming tool";
  if (/\b(carrier|crate|cage|stroller|trolley|backpack)\b/.test(n)) return "carrier";
  if (/\b(sweater|jacket|coat|bandana|hood|apparel|vest|costume)\b/.test(n)) return "pet apparel";
  if (/\b(tree|tower|scratcher|condo|climbing)\b/.test(n)) return "cat tree";
  if (/\b(litter)\b/.test(n)) return "litter box";
  if (/\b(gate|barrier|fence)\b/.test(n)) return "pet gate";
  if (/\b(bag|waste|poop)\b/.test(n)) return "waste accessory";
  return "pet accessory";
}

function generateFallbackDescription(name: string): string {
  const animal = guessAnimal(name);
  const type = guessProductType(name);
  return `${name} – a ${type} designed for ${animal}. Built for everyday comfort and practical use. See product listing for available sizes and color options.`;
}

// ── Category correction engine ──────────────────────────────────────

import { classifyGoogleProductCategory as _gpcClassify } from "../_shared/google-product-category.ts";

function correctCategory(name: string, dbCategory: string | null): string {
  const n = name.toLowerCase();

  if (/\b(leash|lead|traction\s*rope)\b/.test(n)) return "Dog Collars & Leashes";
  if (/\bharness\b/.test(n)) return "Dog Collars & Leashes";
  if (/\bcollar\b/.test(n) && !/shock|electric|training/i.test(n)) return "Dog Collars & Leashes";
  if (/\b(cat\s*tree|cat\s*tower|cat\s*condo|scratching\s*post|cat\s*scratcher|climbing\s*frame)\b/.test(n)) return "Cat Trees & Condos";
  if (/\b(litter\s*box|litter\s*tray|cat\s*toilet|cat\s*litter)\b/.test(n)) return "Cat Litter Boxes";
  if (/\b(carrier|stroller|trolley|travel\s*bag|pet\s*backpack)\b/.test(n)) {
    if (/\bcat\b/.test(n)) return "Cat Carriers";
    if (/\bdog\b/.test(n)) return "Dog Carriers";
    return "Pet Carriers";
  }
  if (/\b(grooming|trimmer|brush|comb|deshed|nail\s*(grinder|clipper)|glove)\b/.test(n)) {
    if (/\bcat\b/.test(n)) return "Cat Grooming";
    return "Dog Grooming";
  }
  if (/\b(bed|mat|cushion|pillow|blanket)\b/.test(n)) {
    if (/\bcat\b/.test(n)) return "Cat Beds";
    return "Dog Beds";
  }
  if (/\b(toy|ball|squeaky|chew|teaser|laser|feather\s*wand)\b/.test(n)) {
    if (/\bcat\b/.test(n)) return "Cat Toys";
    return "Dog Toys";
  }
  if (/\b(bowl|feeder|fountain|water\s*dispenser|food\s*dispenser)\b/.test(n)) {
    if (/\bcat\b/.test(n)) return "Cat Bowls & Feeders";
    return "Dog Bowls & Feeders";
  }
  if (/\b(sweater|jacket|coat|bandana|vest|costume|raincoat|hoodie)\b/.test(n)) return "Dog Clothing";
  if (/\b(gate|barrier|playpen)\b/.test(n)) return "Dog Safety Gates";
  if (/\b(training\s*pad|potty|puppy\s*pad)\b/.test(n)) return "Dog Training";
  if (/\bcat\s*(house|hammock|shelf|perch|window)\b/.test(n)) return "Cat Furniture";
  if (/\b(poop|waste|bag\s*dispenser)\b/.test(n)) return "Dog Waste Management";

  if (dbCategory && GCAT[dbCategory]) return dbCategory;
  return "Pet Carriers";
}

// ── Google Product Category IDs ─────────────────────────────────────
const GCAT: Record<string, number> = {
  "Dog Beds": 4985,
  "Dog Toys": 5004,
  "Dog Collars & Leashes": 5001,
  "Dog Food & Treats": 4989,
  "Dog Grooming": 4993,
  "Dog Clothing": 5003,
  "Dog Bowls & Feeders": 4997,
  "Dog Carriers": 6981,
  "Dog Training": 5005,
  "Dog Houses": 6981,
  "Dog Crates & Kennels": 6981,
  "Dog Feeding Supplies": 4997,
  "Dog Waste Management": 8069,
  "Dog Safety Gates": 6383,
  "Pet Houses": 6981,
  "Pet Beds": 4516,
  "Pet Carriers": 6978,
  "Pet Feeding Supplies": 4997,
  "Cat Beds": 5008,
  "Cat Toys": 5019,
  "Cat Trees & Condos": 5020,
  "Cat Scratching Posts": 5020,
  "Cat Litter Boxes": 5010,
  "Cat Bowls & Feeders": 5017,
  "Cat Carriers": 6983,
  "Cat Grooming": 5015,
  "Cat Houses": 5007,
  "Cat Furniture": 5007,
  "Cat Hammocks": 5007,
  "Cat Collars & Accessories": 5016,
  "Cat Food & Treats": 5013,
  "Bird Cages": 5022,
  "Bird Toys": 5024,
  "Bird Bowls & Feeders": 5023,
  "Fish Tanks": 5040,
  "Small Pet Accessories": 5045,
  "Pet Training": 5005,
  "Pet Collars & Leashes": 5001,
  "Pet Bags": 6978,
};

// ── Consistency validation ──────────────────────────────────────────

function detectAnimalMismatch(title: string, description: string): boolean {
  const titleAnimal = guessAnimal(title);
  const descAnimal = guessAnimal(description);
  if (titleAnimal !== "pets" && descAnimal !== "pets" && titleAnimal !== descAnimal) {
    return true;
  }
  return false;
}

// ── Weight normalization ────────────────────────────────────────────

function normalizeWeight(grams: number | null): number {
  let g = grams ?? 0;
  if (!g || isNaN(g)) return 0.2;
  let kg = g > 50 ? g / 1000 : g;
  if (kg < 0.05) kg = 0.2;
  if (kg > 25) kg = 25;
  return Math.round(kg * 100) / 100;
}

// ── Central sanitizer ───────────────────────────────────────────────

interface RawProduct {
  id: string;
  name: string;
  slug: string | null;
  sku: string | null;
  category: string | null;
  price: number;
  compare_at_price: number | null;
  description: string | null;
  image_url: string | null;
  images: string[] | null;
  stock: number | null;
  weight: number | null;
  optimized_title: string | null;
  optimized_description: string | null;
}

interface SanitizedProduct {
  id: string;
  title: string;
  description: string;
  link: string;
  image_link: string;
  additional_image_link: string;
  availability: string;
  condition: string;
  price: string;
  sale_price: string;
  brand: string;
  google_product_category: number | string;
  product_type: string;
  identifier_exists: string;
  shipping_weight: string;
}

interface SanitizeResult {
  product: SanitizedProduct | null;
  excluded: boolean;
  reason: string | null;
  titleChanged: boolean;
  descGenerated: boolean;
  categoryOverridden: boolean;
}

function sanitizeProductForMerchant(p: RawProduct): SanitizeResult {
  const result: SanitizeResult = {
    product: null, excluded: false, reason: null,
    titleChanged: false, descGenerated: false, categoryOverridden: false,
  };

  // 1. Block by ID
  if (BLOCKED_PRODUCT_IDS.has(p.id)) {
    return { ...result, excluded: true, reason: "blocked_id" };
  }

  // 1b. Apply product-specific overrides before sanitization
  const override = PRODUCT_OVERRIDES[p.id];
  if (override) {
    if (override.title) p = { ...p, name: override.title };
    if (override.description) p = { ...p, description: override.description };
    if (override.category) p = { ...p, category: override.category };
  }

  // 2. Block by policy-unsafe keywords
  if (isPolicySensitive(p.name, p.description || "")) {
    return { ...result, excluded: true, reason: "policy_unsafe_keywords" };
  }

  // 2b. Block non-pet products (birds, reptiles, chickens, hamsters, fish)
  if (isNonPetProduct(p.name, p.description || "")) {
    return { ...result, excluded: true, reason: "non_pet_product" };
  }

  // 3. Required fields
  if (!p.slug || !p.slug.trim()) {
    return { ...result, excluded: true, reason: "missing_slug" };
  }
  if (!p.price || p.price <= 0) {
    return { ...result, excluded: true, reason: "missing_price" };
  }
  if (!p.image_url || !p.image_url.startsWith("http")) {
    return { ...result, excluded: true, reason: "missing_image" };
  }

  // 4. Sanitize title — prefer DB-optimized title
  const cleanTitle = p.optimized_title ? sanitizeTitle(p.optimized_title) : sanitizeTitle(p.name);
  result.titleChanged = cleanTitle !== p.name;

  // 5. Sanitize description — prefer DB-optimized, then override, then raw
  let cleanDesc: string;
  if (p.optimized_description) {
    cleanDesc = sanitizeDescription(p.optimized_description);
    if (cleanDesc.length < 80) {
      cleanDesc = generateFallbackDescription(p.name);
      result.descGenerated = true;
    }
  } else if (override?.description) {
    cleanDesc = override.description;
  } else {
    cleanDesc = sanitizeDescription(p.description || "");
    if (cleanDesc.length < 80) {
      cleanDesc = generateFallbackDescription(p.name);
      result.descGenerated = true;
    }
  }

  // 6. Correct category
  const correctedCategory = correctCategory(p.name, p.category);
  result.categoryOverridden = correctedCategory !== p.category;
  // Canonical GPC mapper takes priority (uses name + category + description).
  // Fall back to the legacy GCAT lookup only when the canonical mapper
  // cannot infer anything (e.g. returns the "pet_general" fallback id).
  const gpc = _gpcClassify(p.name, p.category, p.description);
  const legacyId = GCAT[correctedCategory];
  const gcatId = gpc.confident ? gpc.id : (legacyId || gpc.id);

  // 7. Consistency check: animal mismatch → auto-fix
  if (detectAnimalMismatch(cleanTitle, cleanDesc)) {
    cleanDesc = generateFallbackDescription(p.name);
    result.descGenerated = true;
  }

  // 8. Build canonical URL
  const link = `${BASE_URL}/product/${p.slug}`;

  // 9. Pricing
  const hasSale = p.compare_at_price !== null && p.compare_at_price > p.price;

  // 10. Additional images
  const additionalImgs = (p.images || [])
    .filter((img: string) => img && img !== p.image_url && img.startsWith("http"))
    .slice(0, 4);

  // 11. Weight
  const weightKg = normalizeWeight(p.weight);

  // 12. Product type path
  const productType = `Pet Supplies > ${correctedCategory}`;

  result.product = {
    id: `getpawsy_${p.id}`,
    title: cleanTitle,
    description: cleanDesc,
    link,
    image_link: p.image_url,
    additional_image_link: additionalImgs.join(","),
    availability: "in stock",
    condition: "new",
    price: hasSale ? `${p.compare_at_price!.toFixed(2)} USD` : `${p.price.toFixed(2)} USD`,
    sale_price: hasSale ? `${p.price.toFixed(2)} USD` : "",
    brand: BRAND,
    google_product_category: gcatId,
    product_type: productType,
    identifier_exists: "no",
    shipping_weight: `${weightKg} kg`,
  };

  return result;
}

// ── Main handler ────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer "))
      return Response.json({ error: "Auth required" }, { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user)
      return Response.json({ error: "Invalid auth" }, { status: 401, headers: corsHeaders });
    const { data: roleData } = await supabase.from("user_roles")
      .select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleData)
      return Response.json({ error: "Admin required" }, { status: 403, headers: corsHeaders });

    const url = new URL(req.url);
    const format = url.searchParams.get("format") || "json";
    // Feed mode: "top80" (default, Google-safe primary set) or "all" (full catalog)
    const feedMode = url.searchParams.get("mode") || "top80";

    // Fetch all active, non-duplicate, in-stock products
    const allProducts: RawProduct[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase.from("products")
        .select("id, name, slug, sku, category, price, compare_at_price, description, image_url, images, stock, weight, optimized_title, optimized_description")
        .eq("is_active", true).eq("is_duplicate", false).gt("stock", 0)
        .order("stock", { ascending: false }).range(from, from + 999);
      if (error) throw new Error(`DB: ${error.message}`);
      if (!data || data.length === 0) break;
      allProducts.push(...(data as RawProduct[]));
      if (data.length < 1000) break;
      from += 1000;
    }

    // ── Run every product through the sanitizer ──
    const audit = {
      feed_mode: feedMode,
      total_scanned: allProducts.length,
      total_sanitized: 0,
      included_in_feed: 0,
      excluded_policy: 0,
      excluded_quality: 0,
      excluded_not_top80: 0,
      holdout_review_queue: 0,
      exclusion_reasons: {} as Record<string, number>,
      titles_cleaned: 0,
      descriptions_generated: 0,
      categories_overridden: 0,
      with_sale_price: 0,
      avg_title_len: 0,
      avg_desc_len: 0,
      top80_ids: [] as string[],
      holdout_ids: [] as string[],
    };

    const feedItems: SanitizedProduct[] = [];
    const holdoutItems: SanitizedProduct[] = [];

    for (const p of allProducts) {
      const result = sanitizeProductForMerchant(p);

      if (result.excluded || !result.product) {
        const reason = result.reason || "unknown";
        audit.exclusion_reasons[reason] = (audit.exclusion_reasons[reason] || 0) + 1;
        if (reason === "policy_unsafe_keywords" || reason === "blocked_id") {
          audit.excluded_policy++;
        } else {
          audit.excluded_quality++;
        }
        continue;
      }

      audit.total_sanitized++;
      if (result.titleChanged) audit.titles_cleaned++;
      if (result.descGenerated) audit.descriptions_generated++;
      if (result.categoryOverridden) audit.categories_overridden++;
      if (result.product.sale_price) audit.with_sale_price++;

      // Top 80 gating
      if (feedMode === "top80") {
        if (MERCHANT_TOP80_IDS.has(p.id)) {
          feedItems.push(result.product);
          audit.included_in_feed++;
          audit.top80_ids.push(p.id);
        } else {
          holdoutItems.push(result.product);
          audit.holdout_review_queue++;
          audit.holdout_ids.push(p.id);
        }
      } else {
        // "all" mode — export everything that passes sanitization
        feedItems.push(result.product);
        audit.included_in_feed++;
      }
    }

    audit.excluded_not_top80 = audit.holdout_review_queue;

    // Compute averages
    if (feedItems.length > 0) {
      audit.avg_title_len = Math.round(feedItems.reduce((s, f) => s + f.title.length, 0) / feedItems.length);
      audit.avg_desc_len = Math.round(feedItems.reduce((s, f) => s + f.description.length, 0) / feedItems.length);
    }

    console.log(`[Merchant Feed] mode=${feedMode} scanned=${audit.total_scanned} sanitized=${audit.total_sanitized} exported=${audit.included_in_feed} holdout=${audit.holdout_review_queue} policy_excluded=${audit.excluded_policy} quality_excluded=${audit.excluded_quality}`);

    // ── CSV format ──
    if (format === "csv") {
      const cols: (keyof SanitizedProduct)[] = [
        "id", "title", "description", "link", "image_link", "additional_image_link",
        "availability", "condition", "price", "sale_price", "brand",
        "google_product_category", "product_type", "identifier_exists", "shipping_weight",
      ];
      const esc = (v: unknown) => {
        const s = String(v ?? "");
        return s.includes(",") || s.includes('"') || s.includes("\n") ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const lines = [cols.join(",")];
      for (const f of feedItems) lines.push(cols.map(c => esc(f[c])).join(","));
      return new Response("\uFEFF" + lines.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="getpawsy_merchant_feed_${feedMode}_${new Date().toISOString().split("T")[0]}.csv"`,
          "X-Feed-Total": String(feedItems.length),
          "X-Feed-Mode": feedMode,
          ...corsHeaders,
        },
      });
    }

    // ── Audit format ──
    if (format === "audit") {
      return Response.json({
        ok: true,
        audit,
        included_sample: feedItems.slice(0, 20).map(f => ({
          id: f.id, title: f.title, link: f.link, price: f.price,
          sale_price: f.sale_price, category: f.google_product_category,
          product_type: f.product_type,
          title_len: f.title.length,
          desc_len: f.description.length,
        })),
        holdout_sample: holdoutItems.slice(0, 10).map(f => ({
          id: f.id, title: f.title, link: f.link,
          category: f.google_product_category,
        })),
      }, { headers: corsHeaders });
    }

    // ── JSON feed (default) ──
    return Response.json({
      ok: true,
      feed_info: {
        brand: BRAND,
        feed_mode: feedMode,
        total_products: feedItems.length,
        holdout_count: holdoutItems.length,
        generated_at: new Date().toISOString(),
        target_country: "US",
        content_language: "en",
      },
      audit,
      products: feedItems,
    }, { headers: corsHeaders });

  } catch (err) {
    console.error("Feed export error:", err);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500, headers: corsHeaders });
  }
});

// Pinterest video metadata generator — merchant-safe pools, deterministic per (asset, attempt).
import type { VideoHook } from "./pinterest-video-hooks.ts";

// Banned terms (mirror of src/config/merchant-policy.ts BANNED_TERMS, plus ad-risk phrases)
const BANNED = [
  "vet approved","vet-approved","veterinarian","clinically proven","clinically tested",
  "scientifically proven","cures","heals","fda approved","medical grade","prescription",
  "doctor recommended","guaranteed","overnight","next day delivery","same day",
  "viral","trending now","limited time","act now","selling fast","only today",
  "best ever","#1","number one","miracle",
];

export function scrubBanned(text: string): string {
  let out = text;
  for (const t of BANNED) {
    const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
    out = out.replace(re, "");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

const TITLES: Record<VideoHook, string[]> = {
  smell: [
    "Self-Cleaning Litter Box for Odor Control",
    "Smart Litter Box That Helps Reduce Odor",
    "App-Controlled Litter Box for a Fresher Home",
  ],
  time: [
    "Hands-Free Cat Litter Box for Busy Owners",
    "Self-Cleaning Cat Litter Box You Can Forget About",
    "Smart Litter Box That Cleans Itself Daily",
  ],
  pain: [
    "Tired of Scooping? Try a Self-Cleaning Litter Box",
    "Self-Cleaning Litter Box for Easier Cat Care",
    "Automatic Cat Litter Box Built for Real Homes",
  ],
  transformation: [
    "Manual Scooping vs Self-Cleaning Litter Box",
    "Upgrade Your Cat Setup With a Smart Litter Box",
    "Why Cat Owners Are Switching to Automatic Boxes",
  ],
  social_proof: [
    "Cat Owners Share the Self-Cleaning Box They Use",
    "Indoor Cat Setup Featuring an Automatic Litter Box",
    "A Smart Litter Box Owners Actually Recommend",
  ],
  curiosity: [
    "The Cat Litter Box Hack Indoor Owners Love",
    "Why a Self-Cleaning Litter Box Changes Everything",
    "What Makes an App-Controlled Litter Box Different",
  ],
  direct: [
    "Shop the Self-Cleaning App-Controlled Litter Box",
    "Automatic Cat Litter Box — App Control Included",
    "Self-Cleaning Litter Box with Smart App Features",
  ],
  unknown: [
    "Self-Cleaning Cat Litter Box with App Control",
    "Smart Automatic Litter Box for Indoor Cats",
    "App-Controlled Self-Cleaning Cat Litter Box",
  ],
};

const DESCRIPTIONS: Record<VideoHook, string[]> = {
  smell: [
    "An app-controlled, self-cleaning cat litter box designed to help keep your home fresher with daily automatic cycles.",
    "Daily automatic cycles help reduce buildup so your space stays fresher between full litter changes.",
  ],
  time: [
    "Hands-free litter box that cycles automatically so you can spend less time scooping and more time with your cat.",
    "Set it once, monitor from your phone — designed for busy cat owners who want a simpler routine.",
  ],
  pain: [
    "Scooping every day gets old. This automatic litter box handles the daily cycle for you.",
    "Designed to make litter maintenance easier so caring for your cat feels lighter.",
  ],
  transformation: [
    "Compare a manual scoop routine to an app-controlled, self-cleaning setup that runs in the background.",
    "An upgrade for indoor cat households that want a calmer, simpler litter routine.",
  ],
  social_proof: [
    "An app-controlled, self-cleaning cat litter box that real cat owners use in their indoor setups.",
    "A smart litter box choice for indoor cat households looking for a more hands-off routine.",
  ],
  curiosity: [
    "See why indoor cat owners are exploring app-controlled, self-cleaning litter boxes for their setup.",
    "An automatic cat litter box that does the daily cycle for you — here's how it works.",
  ],
  direct: [
    "Shop the app-controlled, self-cleaning cat litter box on GetPawsy. Free shipping on eligible orders $35+.",
    "App-controlled self-cleaning litter box available now on GetPawsy with 30-day returns.",
  ],
  unknown: [
    "An app-controlled, self-cleaning cat litter box for modern indoor cat households.",
  ],
};

const HASHTAG_POOLS: Record<VideoHook, string[][]> = {
  smell: [["#catlitterbox","#odorcontrol","#smartlitterbox","#indoorcat"]],
  time: [["#selfcleaninglitterbox","#catowner","#smartlitterbox","#indoorcatlife"]],
  pain: [["#catparent","#litterbox","#automaticlitterbox","#indoorcat"]],
  transformation: [["#catupgrade","#smartcatgear","#selfcleaninglitterbox","#indoorcatlife"]],
  social_proof: [["#catowner","#indoorcat","#smartlitterbox","#catparents"]],
  curiosity: [["#catlitterbox","#cathacks","#smartcatgear","#indoorcatsetup"]],
  direct: [["#shopcat","#smartlitterbox","#catparent","#getpawsy"]],
  unknown: [["#catlitterbox","#smartlitterbox","#indoorcat","#catowner"]],
};

const CTAS = ["Shop on GetPawsy", "Tap to learn more", "See it on GetPawsy", "Discover more"];

function pick<T>(arr: T[], seed: number): T {
  if (!arr.length) return arr[0];
  return arr[Math.abs(seed) % arr.length];
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function buildVariationHash(parts: { title: string; description: string; hashtags: string[] }): string {
  return String(hashSeed([parts.title, parts.description, parts.hashtags.join(",")].join("|")));
}

export interface VideoMeta {
  title: string;
  description: string;
  hashtags: string[];
  cta_text: string;
  variation_hash: string;
}

export function generateVideoMeta(opts: {
  asset_id: string;
  hook: VideoHook;
  attempt: number;
}): VideoMeta {
  const seed = hashSeed(`${opts.asset_id}:${opts.attempt}`);
  const title = scrubBanned(pick(TITLES[opts.hook] || TITLES.unknown, seed)).slice(0, 100);
  const description = scrubBanned(pick(DESCRIPTIONS[opts.hook] || DESCRIPTIONS.unknown, seed >> 3)).slice(0, 500);
  const hashtags = pick(HASHTAG_POOLS[opts.hook] || HASHTAG_POOLS.unknown, seed >> 7);
  const cta_text = pick(CTAS, seed >> 11);
  const variation_hash = buildVariationHash({ title, description, hashtags });
  return { title, description, hashtags, cta_text, variation_hash };
}

export const DEFAULT_DESTINATION_URL =
  "https://getpawsy.pet/products/automatic-cat-litter-box-self-cleaning-app-control" +
  "?utm_source=pinterest&utm_medium=video_pin&utm_campaign=litterbox_video";
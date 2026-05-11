// Pinterest video hook classifier — pure string heuristics, no AI.
export type VideoHook =
  | "pain"
  | "smell"
  | "time"
  | "transformation"
  | "social_proof"
  | "curiosity"
  | "direct"
  | "unknown";

const RULES: Array<[VideoHook, RegExp]> = [
  ["smell", /(smell|odor|odour|stink|stench)/i],
  ["time", /(time[-_ ]?pain|busy|noTime|no[-_ ]time|saves?[-_ ]?time|24\/?7|hands?[-_ ]?free)/i],
  ["pain", /(pain|hate|gross|disgust|nasty|tired|sick[-_ ]?of)/i],
  ["transformation", /(before[-_ ]?after|transform|upgrade|switch|new[-_ ]vs[-_ ]old)/i],
  ["social_proof", /(review|testimonial|owner|customer|reaction|tiktok[-_ ]made|viral)/i],
  ["curiosity", /(secret|trick|hack|nobody|never[-_ ]knew|why|what)/i],
  ["direct", /(direct|buy|shop|deal|offer|cta|pdp|product)/i],
];

export function classifyHook(filename: string): VideoHook {
  const lower = (filename || "").toLowerCase();
  for (const [hook, re] of RULES) if (re.test(lower)) return hook;
  return "unknown";
}

export const ALL_HOOKS: VideoHook[] = [
  "pain","smell","time","transformation","social_proof","curiosity","direct","unknown",
];
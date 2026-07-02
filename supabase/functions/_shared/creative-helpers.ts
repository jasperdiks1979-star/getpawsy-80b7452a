import { createClient } from "npm:@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );
}

export function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

export async function sha1(s: string): Promise<string> {
  const data = new TextEncoder().encode(s.toLowerCase().trim());
  const buf = await crypto.subtle.digest("SHA-1", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const BANNED_PHRASES = [
  "stop scooping",
  "vet-approved",
  "vet approved",
  "eco-friendly",
  "never clean litter again",
  "shocking",
  "doctors hate",
  // duplicate-slop stems flagged by hero reject analysis (2026-07-02)
  "cleaner litter, less work",
  "tired of scooping",
  "tired of litter scooping",
  "tired of litter box chores",
  "tired of daily scooping",
  "cat parents love this",
  "cat owners love this",
  "cat owners love it",
  "what if you never scooped",
  "reclaim your time",
  // Round 2 (2026-07-02): overlay + description slop from hero reject sweep
  "read reviews",
  "see how it works",
  "cat parents rave",
  "cat parents praise",
  "are loving it",
  "viral find",
  "litter box chores",
  "litter box cleaning hassles",
  "clean smarter",
  "clean with ease",
  "made for cat",
  "cozy morning routine",
  "right at home in the living room",
  "tips for building a calmer",
  "cozier home for your pet",
];

export function isLocalImage(url: string | null | undefined): boolean {
  if (!url) return false;
  return /supabase\.co|getpawsy\.pet/.test(url) && !/cjdropshipping|cjpacket/.test(url);
}

export interface EligibleProduct {
  id: string;
  title: string;
  slug: string | null;
  price: number | null;
  category_slug: string | null;
  hero_image: string | null;
  in_stock: boolean;
}

export async function fetchEligibleProducts(sb: ReturnType<typeof admin>, limit = 500): Promise<EligibleProduct[]> {
  const { data, error } = await sb
    .from("products")
    .select("id,name,slug,price,category,image_url,effective_stock,is_active")
    .eq("is_active", true)
    .gt("price", 0)
    .not("slug", "is", null)
    .not("image_url", "is", null)
    .limit(limit);
  if (error) throw error;
  return (data ?? [])
    .filter((p: any) => isLocalImage(p.image_url) && (p.effective_stock ?? 1) > 0 && p.category)
    .map((p: any) => ({
      id: p.id,
      title: p.name ?? "Product",
      slug: p.slug,
      price: Number(p.price ?? 0),
      category_slug: p.category,
      hero_image: p.image_url,
      in_stock: true,
    }));
}

export function buildUtm(baseSlug: string, creativeId: string): string {
  const u = new URL(`https://getpawsy.pet/products/${baseSlug}`);
  u.searchParams.set("utm_source", "pinterest");
  u.searchParams.set("utm_medium", "social");
  u.searchParams.set("utm_campaign", "creative_v1");
  u.searchParams.set("cr_id", creativeId);
  return u.toString();
}

/** Pool of safe, on-brand hook templates — fully no-AI. */
export const HOOK_TEMPLATES: { type: string; templates: string[]; ctas: string[] }[] = [
  {
    type: "pinterest_static",
    templates: [
      "The cozy upgrade {category} parents love",
      "Built for happy {category} routines",
      "A calmer {category} corner starts here",
      "Small home? This {category} pick fits",
      "Make {category} time the easy part",
      "Quietly the best {category} we found",
      "Where comfort meets clever {category}",
      "Designed for daily {category} life",
    ],
    ctas: ["See details", "Shop the look", "View product", "Explore now"],
  },
];

export interface RotationRules {
  max_per_board_30d: number;
  max_per_category_30d: number;
  max_per_product_30d: number;
  max_hook_repeat_30d: number;
  max_per_product_per_day: number;
  banned_phrases: string[];
}

export async function loadRules(sb: ReturnType<typeof admin>): Promise<RotationRules> {
  const { data } = await sb.from("creative_rotation_rules").select("*").eq("id", 1).maybeSingle();
  return (data as RotationRules) ?? {
    max_per_board_30d: 30,
    max_per_category_30d: 50,
    max_per_product_30d: 6,
    max_hook_repeat_30d: 3,
    max_per_product_per_day: 4,
    banned_phrases: BANNED_PHRASES,
  };
}

export async function loadBudget(sb: ReturnType<typeof admin>) {
  const { data } = await sb.from("creative_budget_guardrails").select("*").eq("id", 1).maybeSingle();
  return data ?? {
    max_per_run: 20,
    max_usd_per_run: 15,
    per_product_per_day: 4,
    videos_per_product_per_week: 2,
    dry_run_default: true,
    auto_generate_enabled: false,
    hard_pause: false,
  };
}

interface GuardCandidate {
  product_id: string;
  category_slug: string;
  creative_type: string;
  hook: string;
  headline?: string;
  cta?: string;
}

export async function checkCandidate(sb: ReturnType<typeof admin>, c: GuardCandidate, rules: RotationRules) {
  const reasons: string[] = [];
  const text = `${c.hook ?? ""} ${c.headline ?? ""}`.toLowerCase();
  for (const phrase of rules.banned_phrases ?? []) {
    if (text.includes(String(phrase).toLowerCase())) reasons.push(`banned_phrase:${phrase}`);
  }
  const hookHash = await sha1(c.hook ?? "");
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const today = new Date(Date.now() - 86400_000).toISOString();
  const { count: hookCount } = await sb.from("creative_assets").select("id", { count: "exact", head: true }).eq("hook_hash", hookHash).gte("created_at", since);
  if ((hookCount ?? 0) >= rules.max_hook_repeat_30d) reasons.push("hook_repeated");
  const { count: prodCount } = await sb.from("creative_assets").select("id", { count: "exact", head: true }).eq("product_id", c.product_id).gte("created_at", since);
  if ((prodCount ?? 0) >= rules.max_per_product_30d) reasons.push("product_overfilled");
  const { count: dayCount } = await sb.from("creative_assets").select("id", { count: "exact", head: true }).eq("product_id", c.product_id).gte("created_at", today);
  if ((dayCount ?? 0) >= rules.max_per_product_per_day) reasons.push("product_daily_cap");
  const { count: catCount } = await sb.from("creative_assets").select("id", { count: "exact", head: true }).eq("category_slug", c.category_slug).gte("created_at", since);
  if ((catCount ?? 0) >= rules.max_per_category_30d) reasons.push("category_overfilled");
  return { ok: reasons.length === 0, reasons, hookHash };
}
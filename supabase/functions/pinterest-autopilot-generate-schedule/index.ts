/**
 * pinterest-autopilot-generate-schedule
 *
 * Picks 4–5 US-friendly time slots for today and assigns a distinct
 * high-quality product to each. Inserts planned rows into
 * pinterest_autopilot_schedule. Idempotent per US date (08:00–23:00 ET).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
const tid = () => `pap_gen_${crypto.randomUUID().slice(0, 8)}`;

// Anchor slots (in US Eastern hours, local clock). Jittered ± 25 min.
const ET_ANCHOR_HOURS = [9, 12, 15, 19, 21];

function etDateParts(now = new Date()) {
  // Format current time as America/New_York Y-M-D
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(now); // YYYY-MM-DD
}

function slotToUtc(dateStr: string, hour: number, jitterMin: number): Date {
  // Build an ISO string interpreted as ET, then convert to UTC by using
  // the offset reported for that wall-clock by Intl.
  const wall = new Date(`${dateStr}T${String(hour).padStart(2, "0")}:00:00`);
  // Determine ET offset for that day by formatting now in ET.
  const offsetMin = etOffsetMinutes(wall);
  const utcMs = wall.getTime() - offsetMin * 60 * 1000 + jitterMin * 60 * 1000;
  return new Date(utcMs);
}

function etOffsetMinutes(d: Date): number {
  // Compute the offset from UTC for America/New_York on that date (DST aware).
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = dtf.formatToParts(d).reduce<Record<string, string>>((a, p) => (p.type !== "literal" ? (a[p.type] = p.value, a) : a), {});
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - d.getTime()) / 60000);
}

function scoreProduct(p: any): number {
  let s = 0;
  const imgs = Array.isArray(p.images) ? p.images.filter((u: string) => typeof u === "string" && u.startsWith("http")) : [];
  s += Math.min(imgs.length, 6) * 8;       // up to 48
  if (p.image_url && String(p.image_url).startsWith("http")) s += 10;
  if (p.category) s += 6;
  if (p.primary_intent) s += 4;
  if (p.description && String(p.description).length > 120) s += 6;
  if (Number(p.price) >= 10) s += 4;
  if (p.stock == null || Number(p.stock) > 0) s += 4;
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = tid();
  try {
    // Allow either admin user or service via render-secret.
    const authHeader = req.headers.get("Authorization") ?? "";
    const secret = req.headers.get("x-render-secret") ?? "";
    const isService = WORKER_SECRET.length > 0 && secret === WORKER_SECRET;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    if (!isService) {
      if (!authHeader.startsWith("Bearer ")) return json({ ok: false, traceId, message: "unauthenticated" }, 401);
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: ud } = await userClient.auth.getUser();
      if (!ud?.user) return json({ ok: false, traceId, message: "unauthenticated" }, 401);
      const { data: role } = await admin.from("user_roles").select("role").eq("user_id", ud.user.id).eq("role", "admin").maybeSingle();
      if (!role) return json({ ok: false, traceId, message: "admin required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const force = Boolean(body.force);

    const { data: cfg } = await admin.from("pinterest_autopilot_config").select("*").eq("id", 1).maybeSingle();
    if (!cfg) return json({ ok: false, traceId, message: "config row missing" }, 500);

    const targetDate = etDateParts(new Date()); // today in ET
    if (!force && cfg.last_schedule_generated_for === targetDate) {
      const { data: existing } = await admin
        .from("pinterest_autopilot_schedule")
        .select("*").eq("scheduled_date", targetDate).order("scheduled_at");
      return json({ ok: true, traceId, message: "already generated", date: targetDate, schedule: existing ?? [] });
    }

    const target = Math.min(5, Math.max(1, Number(cfg.daily_post_target ?? 5)));

    // Pick distinct anchor hours, then jitter.
    const shuffled = [...ET_ANCHOR_HOURS].sort(() => Math.random() - 0.5).slice(0, target).sort((a, b) => a - b);
    const minGapMs = Math.max(60, Number(cfg.min_gap_minutes ?? 180)) * 60_000;
    const now = new Date();
    const slotTimes: Date[] = [];
    for (const h of shuffled) {
      const jitter = Math.floor((Math.random() - 0.5) * 50); // ±25 min
      let t = slotToUtc(targetDate, h, jitter);
      // Enforce min gap from previous slot
      if (slotTimes.length > 0 && t.getTime() - slotTimes[slotTimes.length - 1].getTime() < minGapMs) {
        t = new Date(slotTimes[slotTimes.length - 1].getTime() + minGapMs + 60_000);
      }
      // Don't schedule in the past — push to now + 5 min
      if (t.getTime() < now.getTime()) t = new Date(now.getTime() + 5 * 60_000 + slotTimes.length * minGapMs);
      slotTimes.push(t);
    }

    // Exclude products posted in last 7 days
    const sevenAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data: recent } = await admin
      .from("pinterest_autopilot_schedule")
      .select("product_id, product_slug")
      .gte("scheduled_at", sevenAgo);
    const recentIds = new Set((recent ?? []).map((r: any) => r.product_id).filter(Boolean));
    const recentSlugs = new Set((recent ?? []).map((r: any) => r.product_slug).filter(Boolean));

    const { data: products, error: prodErr } = await admin
      .from("products_public")
      .select("id, slug, name, image_url, images, description, category, primary_intent, primary_species, price, stock, is_active")
      .eq("is_active", true)
      .limit(500);
    if (prodErr) return json({ ok: false, traceId, message: prodErr.message }, 500);

    const candidates = (products ?? [])
      .filter((p: any) => p.slug && p.image_url && String(p.image_url).startsWith("http"))
      .filter((p: any) => !recentIds.has(p.id) && !recentSlugs.has(p.slug))
      .filter((p: any) => Array.isArray(p.images) ? p.images.length >= 1 : true)
      .map((p: any) => ({ p, score: scoreProduct(p) }))
      .sort((a, b) => b.score - a.score);

    if (candidates.length < slotTimes.length) {
      return json({ ok: false, traceId, message: `not enough eligible products (${candidates.length} available, ${slotTimes.length} slots needed)` }, 422);
    }

    const picks = candidates.slice(0, slotTimes.length);
    const rows = picks.map((c, i) => {
      const p = c.p;
      return {
        scheduled_at: slotTimes[i].toISOString(),
        scheduled_date: targetDate,
        product_slug: p.slug,
        product_id: p.id,
        product_name: p.name,
        product_image: p.image_url,
        product_url: `https://getpawsy.pet/products/${p.slug}`,
        status: "planned",
        notes: `score=${c.score}`,
      };
    });

    const { data: inserted, error: insErr } = await admin
      .from("pinterest_autopilot_schedule").insert(rows).select("*");
    if (insErr) return json({ ok: false, traceId, message: insErr.message }, 500);

    await admin.from("pinterest_autopilot_config").update({ last_schedule_generated_for: targetDate }).eq("id", 1);

    return json({ ok: true, traceId, message: `generated ${rows.length} planned posts for ${targetDate}`, date: targetDate, schedule: inserted });
  } catch (e) {
    return json({ ok: false, traceId, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});
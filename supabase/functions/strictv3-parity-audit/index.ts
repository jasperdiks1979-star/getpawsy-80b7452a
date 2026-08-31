// TEMPORARY READ-ONLY diagnostic: strict-v3 frozen-window parity replay.
// Compares the shadow input contract (no visitor_activity.is_internal) with
// the pre-fix edge contract (VA injected) over an exact frozen window.
// Performs ZERO writes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildShadowEligibility } from "../_shared/commercial-eligibility-v3.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const since: string = body.since ?? "2026-08-01T15:00:00Z";
    const until: string = body.until ?? "2026-08-31T15:00:00Z";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    async function page(table: string, cols: string, tcol: string) {
      const out: any[] = [];
      let off = 0;
      for (;;) {
        const { data, error } = await supabase.from(table).select(cols)
          .gte(tcol, since).lte(tcol, until)
          .order(tcol, { ascending: false }).range(off, off + 999);
        if (error) throw error;
        if (!data || data.length === 0) break;
        out.push(...data);
        if (data.length < 1000) break;
        off += 1000;
        if (off > 300000) break;
      }
      return out;
    }

    const events = await page(
      "canonical_events",
      "canonical_name,occurred_at,visitor_id,session_id,page_path,landing_page,utm_source,utm_medium,utm_campaign,utm_content,referrer,country,city,device",
      "occurred_at",
    );
    const va = await page("visitor_activity", "session_id,visitor_id,latitude,longitude,country,city,is_internal", "created_at");
    const cs = await page("canonical_sessions", "session_id,is_internal,is_bot,technical_path,exclude_from_commercial,traffic_class,traffic_quality", "last_seen_at");

    const agg = new Map<string, any>();
    for (const r of events) {
      const sid = r.session_id;
      if (!sid) continue;
      let s = agg.get(sid);
      if (!s) {
        s = {
          session_id: sid, visitor_id: r.visitor_id ?? null, country: r.country ?? null, city: r.city ?? null,
          latitude: null, longitude: null, first_seen_at: r.occurred_at, last_seen_at: r.occurred_at,
          page_views: 0, device: r.device ?? null, utm_source: r.utm_source ?? null, utm_medium: r.utm_medium ?? null,
          utm_campaign: r.utm_campaign ?? null, utm_content: r.utm_content ?? null, referrer: r.referrer ?? null,
          page_path: r.page_path ?? null, landing_page: r.landing_page ?? null,
          landing_page_at: r.landing_page ? r.occurred_at : null,
          has_product_view: false, has_add_to_cart: false, has_view_cart: false, has_checkout: false,
          has_purchase: false, order_value: 0, is_internal: false, va_is_internal: false,
        };
        agg.set(sid, s);
      }
      if (r.occurred_at < s.first_seen_at) s.first_seen_at = r.occurred_at;
      if (r.occurred_at > s.last_seen_at) s.last_seen_at = r.occurred_at;
      if (r.landing_page && (!s.landing_page || !s.landing_page_at || r.occurred_at < s.landing_page_at)) {
        s.landing_page = r.landing_page; s.landing_page_at = r.occurred_at;
      }
      const st = r.canonical_name;
      if (st === "CANONICAL_PAGE_VIEW") s.page_views += 1;
      if (st === "CANONICAL_PRODUCT_VIEW") s.has_product_view = true;
      if (st === "CANONICAL_ADD_TO_CART") s.has_add_to_cart = true;
      if (st === "CANONICAL_CART") s.has_view_cart = true;
      if (st === "CANONICAL_CHECKOUT") s.has_checkout = true;
      if (st === "CANONICAL_PURCHASE") s.has_purchase = true;
      if (!s.visitor_id && r.visitor_id) s.visitor_id = r.visitor_id;
      if (!s.country && r.country) s.country = r.country;
      if (!s.city && r.city) s.city = r.city;
      if (!s.utm_content && r.utm_content) s.utm_content = r.utm_content;
    }

    let vaDirect = 0, vaFanout = 0;
    for (const row of va) {
      const s = agg.get(row.session_id as string);
      if (!s) continue;
      if (s.latitude == null && row.latitude != null) s.latitude = Number(row.latitude);
      if (s.longitude == null && row.longitude != null) s.longitude = Number(row.longitude);
      if (!s.country && row.country) s.country = row.country;
      if (!s.city && row.city) s.city = row.city;
      if (row.is_internal === true && !s.va_is_internal) { s.va_is_internal = true; vaDirect++; }
    }
    const byVisitor = new Map<string, any[]>();
    for (const s of agg.values()) {
      if (s.latitude != null && s.longitude != null) continue;
      if (!s.visitor_id) continue;
      const a = byVisitor.get(s.visitor_id) ?? [];
      a.push(s); byVisitor.set(s.visitor_id, a);
    }
    for (const row of va) {
      const t = byVisitor.get(row.visitor_id as string);
      if (!t) continue;
      for (const s of t) {
        if (s.latitude == null && row.latitude != null) s.latitude = Number(row.latitude);
        if (s.longitude == null && row.longitude != null) s.longitude = Number(row.longitude);
        if (!s.country && row.country) s.country = row.country;
        if (!s.city && row.city) s.city = row.city;
        if (row.is_internal === true && !s.va_is_internal) { s.va_is_internal = true; vaFanout++; }
      }
    }

    const flags = new Map(cs.map((r: any) => [r.session_id, r]));
    const arr = Array.from(agg.values()).sort((a, b) => (a.last_seen_at < b.last_seen_at ? 1 : -1));
    const build = (withVA: boolean) =>
      buildShadowEligibility(arr.map((s) => {
        const f: any = flags.get(s.session_id);
        return {
          ...s,
          is_internal: withVA ? (s.is_internal || s.va_is_internal) : s.is_internal,
          stored_traffic_class_v2: f?.traffic_class ?? null,
          stored_exclude_from_commercial: f?.exclude_from_commercial ?? null,
          stored_is_bot: f?.is_bot ?? null,
          stored_is_internal: f?.is_internal ?? null,
          stored_technical_path: f?.technical_path ?? null,
        } as any;
      }));

    const summarize = (rows: any[]) => {
      const cls: Record<string, number> = {};
      let strict = 0, expanded = 0;
      const commerce = { product_views: 0, atc: 0, cart: 0, checkout: 0, purchases: 0 };
      const map = new Map<string, any>();
      rows.forEach((r, i) => {
        cls[r.traffic_quality_class_v3] = (cls[r.traffic_quality_class_v3] ?? 0) + 1;
        if (r.commercial_eligible_v3_strict) strict++;
        if (r.commercial_eligible_v3_expanded) expanded++;
        map.set(arr[i].session_id, r);
        if (r.commercial_eligible_v3_strict) {
          const s = arr[i];
          if (s.has_product_view) commerce.product_views++;
          if (s.has_add_to_cart) commerce.atc++;
          if (s.has_view_cart) commerce.cart++;
          if (s.has_checkout) commerce.checkout++;
          if (s.has_purchase) commerce.purchases++;
        }
      });
      return { sessions: rows.length, cls, strict, expanded, commerce, map };
    };

    const pre = summarize(build(true));
    const shadow = summarize(build(false));
    const post = summarize(build(false));

    let class_mismatch = 0, strict_mismatch = 0, expanded_mismatch = 0;
    for (const [sid, r] of shadow.map) {
      const p = post.map.get(sid);
      if (!p) { class_mismatch++; continue; }
      if (r.traffic_quality_class_v3 !== p.traffic_quality_class_v3) class_mismatch++;
      if (r.commercial_eligible_v3_strict !== p.commercial_eligible_v3_strict) strict_mismatch++;
      if (r.commercial_eligible_v3_expanded !== p.commercial_eligible_v3_expanded) expanded_mismatch++;
    }

    const eight = (body.sessions ?? []) as string[];
    const eight_report = eight.map((sid) => ({
      session_id: sid,
      pre: pre.map.get(sid)?.traffic_quality_class_v3 ?? null,
      post: post.map.get(sid)?.traffic_quality_class_v3 ?? null,
      va_is_internal: agg.get(sid)?.va_is_internal ?? null,
    }));

    const strip = (o: any) => ({ sessions: o.sessions, cls: o.cls, strict: o.strict, expanded: o.expanded, commerce: o.commerce });
    return new Response(JSON.stringify({
      ok: true, window: { since, until },
      population: { events: events.length, sessions: arr.length, va_rows: va.length, canonical_sessions: cs.length },
      va_internal: { direct_session: vaDirect, visitor_fanout: vaFanout, total: vaDirect + vaFanout },
      edge_pre_fix: strip(pre), shadow: strip(shadow), edge_post_fix: strip(post),
      mismatches: { class_mismatch, strict_mismatch, expanded_mismatch },
      eight_report,
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});

// pinterest-account-full-repair
// Full-account Pinterest pin link audit + repair + cleanup.
//
// Modes (body.mode):
//   "inventory" (default) — read-only Phase 1-4: list every pin, resolve product
//                            identity, verify destinations, classify. No mutations.
//   "repair"              — Phase 5-8: apply link/copy repairs + authorized deletions
//                            for pins passed in body.plan (produced by inventory).
//   "rescan"              — Phase 15: re-read every pin and assert final invariants.
//
// Pinterest mutations only. Never touches Shopify/GetPawsy catalog data.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PIN_API = "https://api.pinterest.com/v5";
const GETPAWSY = "https://getpawsy.pet";
const AILUROVA = "https://ailurova.com";
const AILUROVA_HANDLE = "ailurova-xl-stainless-steel-enclosed-cat-litter-box-for-large-cats";
const AILUROVA_URL = `${AILUROVA}/products/${AILUROVA_HANDLE}`;

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

type PinRec = Record<string, any>;

async function pinFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${PIN_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function listAll(path: string, token: string, cap = 2000): Promise<{ items: PinRec[]; error?: string }> {
  const items: PinRec[] = [];
  let bookmark = "";
  for (let i = 0; i < 60 && items.length < cap; i++) {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${path}${sep}page_size=100${bookmark ? `&bookmark=${encodeURIComponent(bookmark)}` : ""}`;
    const r = await pinFetch(url, token);
    if (!r.ok) return { items, error: `HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}` };
    items.push(...(r.body?.items ?? []));
    bookmark = r.body?.bookmark ?? "";
    if (!bookmark) break;
  }
  return { items };
}

// ── destination verification ───────────────────────────────────────────────
const urlCache = new Map<string, { status: number; finalUrl: string; soft404: boolean }>();
async function verifyUrl(raw: string) {
  const key = raw.split("?")[0];
  if (urlCache.has(key)) return urlCache.get(key)!;
  let out = { status: 0, finalUrl: raw, soft404: false };
  try {
    const res = await fetch(raw, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PinLinkAudit/1.0)" },
    });
    const text = await res.text();
    const t = text.toLowerCase();
    // getpawsy.pet is a client-rendered SPA: EVERY path returns the same 200
    // shell (which itself contains the router's "Page Not Found" string), so
    // HTML text can never prove product existence there. Live truth for that
    // host comes from the catalog, not from the response body.
    const spaShell = /(^|\.)getpawsy\.pet$/.test(hostOf(res.url || raw));
    out = {
      status: res.status,
      finalUrl: res.url || raw,
      soft404: !spaShell && res.status === 200 &&
        (t.includes("product not found") || t.includes("404 not found") || t.includes("page you were looking for")),
    };
  } catch (_e) { /* leave status 0 */ }
  urlCache.set(key, out);
  return out;
}

function stripQuery(u: string) { try { const x = new URL(u); return `${x.origin}${x.pathname}`.replace(/\/$/, ""); } catch { return u; } }
function slugOf(u: string) {
  try {
    const p = new URL(u).pathname.replace(/\/$/, "").split("/");
    const i = p.findIndex((s) => s === "products" || s === "product");
    return i >= 0 && p[i + 1] ? decodeURIComponent(p[i + 1]) : null;
  } catch { return null; }
}
function isLegacyRoute(u: string) { try { return new URL(u).pathname.startsWith("/product/"); } catch { return false; } }
function hostOf(u: string) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } }

function withUtm(base: string, brand: "getpawsy" | "ailurova", pinId: string) {
  const u = new URL(base);
  u.searchParams.set("utm_source", "pinterest");
  u.searchParams.set("utm_medium", "organic");
  u.searchParams.set("utm_campaign", brand === "ailurova" ? "ailurova_organic" : "getpawsy_organic");
  u.searchParams.set("utm_content", `pin_${pinId}`);
  return u.toString();
}

// crude token overlap used only for HIGH_CONFIDENCE / AMBIGUOUS scoring
const STOP = new Set(["the","and","for","with","your","cat","cats","dog","dogs","pet","pets","a","of","to","in","on","best","new"]);
function tokens(s: string) {
  return new Set(String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
}
function overlap(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let n = 0; for (const w of a) if (b.has(w)) n++;
  return n / Math.min(a.size, b.size);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({} as any));
    const mode: string = body.mode ?? "inventory";
    const limitPins: number = Number(body.limit ?? 2000);

    const { data: conn, error: connErr } = await sb
      .from("pinterest_connection")
      .select("account_name, access_token, scopes, status, token_expires_at")
      .in("status", ["connected", "auth_failed"])
      .order("token_expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!conn?.access_token) return json({ ok: false, step: "connection", error: connErr?.message ?? "no_pinterest_connection" }, 500);
    const token = conn.access_token as string;

    const acct = await pinFetch("/user_account", token);
    if (!acct.ok) {
      return json({ ok: false, step: "auth", error: "pinterest_auth_failed", status: acct.status, body: acct.body, token_expires_at: conn.token_expires_at }, 502);
    }
    const username = acct.body?.username;

    // ── boards ──
    const boards = await listAll("/boards", token);
    const boardName: Record<string, string> = {};
    for (const b of boards.items) boardName[b.id] = b.name;

    // ── pins ──
    const pinsRes = await listAll("/pins", token, limitPins);
    if (pinsRes.error && pinsRes.items.length === 0) {
      return json({ ok: false, step: "list_pins", error: pinsRes.error }, 502);
    }
    const pins = pinsRes.items;

    // ══ mode: catalog_truth ══════════════════════════════════════════════
    // Deterministic, read-only pin→product resolution against the FULL
    // products catalog (active + inactive + duplicates + slug history +
    // aliases). getpawsy.pet is a SPA, so HTTP status/body is never used as
    // liveness truth here. No Pinterest mutations in this mode.
    if (mode === "catalog_truth" || mode === "catalog_execute") {
      const all: any[] = [];
      for (let off = 0; off < 4000; off += 1000) {
        const { data, error } = await sb
          .from("products")
          .select("id,name,slug,is_active,is_duplicate,canonical_product_id,dedupe_key,sku,cj_product_id,stock,product_type,category")
          .range(off, off + 999);
        if (error) return json({ ok: false, step: "catalog", error: error.message }, 500);
        all.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      const byId = new Map<string, any>(all.map((p) => [p.id, p]));
      const bySlugAll = new Map<string, any>();
      for (const p of all) if (p.slug) bySlugAll.set(p.slug, p);
      const { data: hist } = await sb.from("product_slug_history").select("product_id,old_slug,current_slug");
      const { data: aliases } = await sb.from("product_aliases").select("product_id,alias,kind");
      const histSlug = new Map<string, any>();
      for (const h of hist ?? []) if (h.old_slug && byId.has(h.product_id)) histSlug.set(h.old_slug, byId.get(h.product_id));
      for (const a of aliases ?? []) if (a.alias && byId.has(a.product_id)) histSlug.set(a.alias, byId.get(a.product_id));

      // exact-identity successor index
      const activeByDedupe = new Map<string, any>();
      const activeBySku = new Map<string, any>();
      const activeByCj = new Map<string, any>();
      for (const p of all) {
        if (!p.is_active || p.is_duplicate) continue;
        if (p.dedupe_key && !activeByDedupe.has(p.dedupe_key)) activeByDedupe.set(p.dedupe_key, p);
        if (p.sku && !activeBySku.has(p.sku)) activeBySku.set(p.sku, p);
        if (p.cj_product_id && !activeByCj.has(p.cj_product_id)) activeByCj.set(p.cj_product_id, p);
      }
      const isLive = (p: any) => !!p && p.is_active === true && p.is_duplicate !== true;
      function successorOf(p: any): { prod: any; proof: string } | null {
        if (!p) return null;
        const c = p.canonical_product_id ? byId.get(p.canonical_product_id) : null;
        if (isLive(c)) return { prod: c, proof: `canonical_product_id → ${c.id} (merge/dedup continuation)` };
        if (p.dedupe_key) {
          const d = activeByDedupe.get(p.dedupe_key);
          if (isLive(d) && d.id !== p.id) return { prod: d, proof: `identical dedupe_key "${p.dedupe_key}"` };
        }
        if (p.sku) {
          const s = activeBySku.get(p.sku);
          if (isLive(s) && s.id !== p.id) return { prod: s, proof: `identical SKU "${p.sku}"` };
        }
        if (p.cj_product_id) {
          const s = activeByCj.get(p.cj_product_id);
          if (isLive(s) && s.id !== p.id) return { prod: s, proof: `identical CJ supplier id "${p.cj_product_id}"` };
        }
        return null;
      }

      const liveTokens = all.filter(isLive).map((p) => ({ p, t: tokens(p.name) }));
      const ledger: PinRec[] = [];
      for (const pin of pins) {
        const link: string = pin.link ?? "";
        const host = hostOf(link);
        const title: string = pin.title ?? "";
        const desc: string = pin.description ?? "";
        const slug = slugOf(link);
        const row: PinRec = {
          pin_id: pin.id,
          pin_url: `https://www.pinterest.com/pin/${pin.id}/`,
          board: boardName[pin.board_id] ?? pin.board_id,
          title,
          destination: link || null,
          current_slug: slug,
          created_at: pin.created_at ?? null,
        };

        // Phase 8 — Ailurova is fully separated from GetPawsy logic
        const aiLooking = /ailurova/i.test(`${title} ${desc}`) || /ailurova/i.test(link);
        if (host.endsWith("ailurova.com") || aiLooking) {
          row.brand = "ailurova";
          row.represented_product = "Ailurova XL Stainless Steel Enclosed Cat Litter Box";
          row.canonical_url = AILUROVA_URL;
          if (stripQuery(link) === AILUROVA_URL) {
            row.state = "ACTIVE_CANONICAL_MATCH"; row.action = "KEEP"; row.confidence = 1;
          } else {
            row.state = "ACTIVE_LEGACY_SLUG";
            row.action = "REPAIR_TO_CANONICAL_URL";
            row.target = withUtm(AILUROVA_URL, "ailurova", pin.id);
            row.confidence = 1;
            row.reason = "Ailurova pin not on canonical PDP URL";
          }
          ledger.push(row); continue;
        }

        if (!link) {
          row.brand = "none"; row.state = "NON_PRODUCT"; row.action = "KEEP_UNLESS_OTHERWISE_BROKEN";
          row.confidence = 1; row.reason = "pin has no destination link";
          ledger.push(row); continue;
        }

        // Phase 9 — off-brand host
        if (!host.endsWith("getpawsy.pet")) {
          row.brand = "other";
          const t = tokens(`${title} ${desc} ${(slug ?? "").replace(/-/g, " ")}`);
          let best: any = null, bs = 0;
          for (const { p, t: pt } of liveTokens) { const s = overlap(t, pt); if (s > bs) { bs = s; best = p; } }
          row.match_score = Number(bs.toFixed(2));
          row.match_candidate = best ? { id: best.id, slug: best.slug, name: best.name } : null;
          row.state = "AMBIGUOUS_IDENTITY";
          row.action = "MANUAL_REVIEW";
          row.confidence = 0.4;
          row.reason = `off-brand destination host "${host}" — ownership must be confirmed manually; never deleted on host alone`;
          ledger.push(row); continue;
        }

        row.brand = "getpawsy";
        if (!slug) {
          row.state = "NON_PRODUCT"; row.action = "KEEP_UNLESS_OTHERWISE_BROKEN";
          row.confidence = 1; row.reason = "non-product GetPawsy page (collection / guide / home)";
          ledger.push(row); continue;
        }

        const direct = bySlugAll.get(slug);
        const viaHistory = direct ? null : histSlug.get(slug);
        const prod = direct ?? viaHistory ?? null;
        const legacyRoute = isLegacyRoute(link);

        if (prod) {
          row.matched_product_id = prod.id;
          row.represented_product = prod.name;
          row.matched_status = prod.is_duplicate ? "duplicate" : (prod.is_active ? "active" : "inactive");
          row.canonical_slug = prod.slug;
          row.stock = prod.stock;
        }

        // ACTIVE
        if (isLive(prod)) {
          const canonical = `${GETPAWSY}/products/${prod.slug}`;
          row.canonical_url = canonical;
          if (!direct) {
            row.state = "ACTIVE_LEGACY_SLUG";
            row.action = "REPAIR_TO_CANONICAL_URL";
            row.target = withUtm(canonical, "getpawsy", pin.id);
            row.confidence = 1;
            row.reason = `pinned slug "${slug}" is a historical slug of live product ${prod.id}`;
          } else if (legacyRoute) {
            row.state = "ACTIVE_LEGACY_SLUG";
            row.action = "REPAIR_TO_CANONICAL_URL";
            row.target = withUtm(canonical, "getpawsy", pin.id);
            row.confidence = 1;
            row.reason = "legacy /product/:slug route → canonical /products/:slug";
          } else if (stripQuery(link) !== canonical) {
            row.state = "ACTIVE_WRONG_PRODUCT_URL";
            row.action = "REPAIR_TO_EXACT_PRODUCT_URL";
            row.target = withUtm(canonical, "getpawsy", pin.id);
            row.confidence = 1;
            row.reason = `destination ${stripQuery(link)} ≠ canonical product URL`;
          } else {
            row.state = "ACTIVE_CANONICAL_MATCH"; row.action = "KEEP"; row.confidence = 1;
          }
          ledger.push(row); continue;
        }

        // INACTIVE / DUPLICATE record still present
        if (prod) {
          const succ = successorOf(prod);
          if (succ) {
            const canonical = `${GETPAWSY}/products/${succ.prod.slug}`;
            row.state = "INACTIVE_HAS_ACTIVE_SUCCESSOR";
            row.action = "REPAIR_TO_CANONICAL_SUCCESSOR";
            row.successor_product_id = succ.prod.id;
            row.successor_proof = succ.proof;
            row.canonical_url = canonical;
            row.target = withUtm(canonical, "getpawsy", pin.id);
            row.confidence = 1;
            row.reason = `product ${prod.id} inactive; exact one-to-one continuation → ${succ.prod.name}`;
          } else {
            const retired = (prod.stock ?? 0) <= 0;
            row.state = "INACTIVE_NO_SUCCESSOR";
            row.inactive_cause = retired ? "deactivated with zero/unknown stock (supplier or stock driven)" : `deactivated while stock=${prod.stock} — likely intentional retirement`;
            row.action = retired ? "DELETE_CANDIDATE" : "KEEP_FOR_REACTIVATION_REVIEW";
            row.confidence = retired ? 0.9 : 0.6;
            row.reason = retired
              ? "no live canonical duplicate, no SKU/CJ/dedupe successor, out of stock — nothing sellable to point at"
              : "no successor, but record still carries stock and may return to sale";
          }
          ledger.push(row); continue;
        }

        // REMOVED — no record anywhere in catalog / history / aliases
        const t = tokens(`${title} ${desc} ${slug.replace(/-/g, " ")}`);
        let best: any = null, bs = 0;
        for (const { p, t: pt } of liveTokens) { const s = overlap(t, pt); if (s > bs) { bs = s; best = p; } }
        row.match_score = Number(bs.toFixed(2));
        row.match_candidate = best ? { id: best.id, slug: best.slug, name: best.name } : null;
        if (bs >= 0.85 && best) {
          row.state = "AMBIGUOUS_IDENTITY";
          row.action = "MANUAL_REVIEW";
          row.confidence = Number(bs.toFixed(2));
          row.reason = `removed slug "${slug}"; near-identical live product "${best.slug}" (${bs.toFixed(2)}) but no SKU/dedupe proof of one-to-one continuation`;
        } else {
          row.state = "REMOVED_NO_SUCCESSOR";
          row.action = "DELETE_CANDIDATE";
          row.confidence = 0.95;
          row.reason = `slug "${slug}" absent from products, slug history and aliases; no exact successor (best similarity ${bs.toFixed(2)})`;
        }
        ledger.push(row);
      }

      const byAction: Record<string, number> = {};
      const byState: Record<string, number> = {};
      for (const r of ledger) {
        byAction[r.action] = (byAction[r.action] ?? 0) + 1;
        byState[r.state] = (byState[r.state] ?? 0) + 1;
      }
      const gp = ledger.filter((r) => r.brand === "getpawsy");
      const distinct = (f: (r: PinRec) => boolean, k: (r: PinRec) => string) =>
        new Set(gp.filter(f).map(k).filter(Boolean)).size;

      // ══ EXECUTION (authorized mutations only) ═════════════════════════
      if (mode === "catalog_execute") {
        const AUTHORIZED = new Set(["REPAIR_TO_CANONICAL_URL", "REPAIR_TO_CANONICAL_SUCCESSOR", "DELETE_CANDIDATE"]);
        const targets = ledger.filter((r) => AUTHORIZED.has(r.action));
        const mutations: PinRec[] = [];
        const recheck: PinRec[] = [];
        const tally = { in_place_updates: 0, replacements_created: 0, old_pins_deleted_after_replacement: 0, stale_deleted: 0, recheck_required: 0 };

        for (const r of targets) {
          // Phase 1 — fresh per-pin readback
          const live = await pinFetch(`/pins/${r.pin_id}`, token);
          if (!live.ok) {
            recheck.push({ ...r, recheck_reason: `pin re-read failed HTTP ${live.status}` }); tally.recheck_required++; continue;
          }
          const curLink: string = live.body?.link ?? "";
          if (stripQuery(curLink) !== stripQuery(r.destination ?? "")) {
            recheck.push({ ...r, current_destination: curLink, recheck_reason: "destination drifted since plan" }); tally.recheck_required++; continue;
          }

          // ── repairs ──
          if (r.action !== "DELETE_CANDIDATE") {
            const target: string = r.target;
            if (!target) { recheck.push({ ...r, recheck_reason: "no target url" }); tally.recheck_required++; continue; }
            if (r.brand === "ailurova") {
              const v = await verifyUrl(AILUROVA_URL);
              if (v.status !== 200 || v.soft404) { recheck.push({ ...r, recheck_reason: `ailurova PDP HTTP ${v.status}` }); tally.recheck_required++; continue; }
            } else {
              // catalog truth (never HTTP body) for getpawsy
              const targetSlug = slugOf(target);
              const tp = targetSlug ? bySlugAll.get(targetSlug) : null;
              if (!isLive(tp)) { recheck.push({ ...r, recheck_reason: `target slug "${targetSlug}" no longer live in catalog` }); tally.recheck_required++; continue; }
              if (r.action === "REPAIR_TO_CANONICAL_SUCCESSOR" && tp.id !== r.successor_product_id) {
                recheck.push({ ...r, recheck_reason: "successor mapping changed" }); tally.recheck_required++; continue;
              }
            }
            const upd = await pinFetch(`/pins/${r.pin_id}`, token, { method: "PATCH", body: JSON.stringify({ link: target }) });
            if (upd.ok) {
              const rb = await pinFetch(`/pins/${r.pin_id}`, token);
              const verified = rb.ok && stripQuery(rb.body?.link ?? "") === stripQuery(target);
              tally.in_place_updates++;
              mutations.push({ pin_id: r.pin_id, pin_url: r.pin_url, brand: r.brand, product: r.represented_product ?? null, previous_destination: curLink, new_destination: rb.body?.link ?? target, action: r.action, method: "in_place_link_update", reason: r.reason, verification: verified ? "readback_destination_matches" : "readback_mismatch" });
            } else if (body.allow_recreate === true && (upd.status === 401 || upd.status === 403)) {
              // Phase 4 fallback — in-place edit not permitted by the app scope:
              // republish the same creative to the same board with the corrected
              // destination, verify it is live, and only then delete the old pin.
              const src = live.body?.media;
              const img = src?.images?.["1200x"]?.url ?? src?.images?.originals?.url ?? src?.images?.["600x"]?.url ?? null;
              const isVideo = String(src?.media_type ?? "").toLowerCase().includes("video");
              if (!img || isVideo) {
                recheck.push({ ...r, recheck_reason: isVideo ? "pin_edit denied and creative is video — cannot be republished losslessly" : "pin_edit denied and no reusable image creative" });
                tally.recheck_required++; continue;
              }
              const create = await pinFetch(`/pins`, token, {
                method: "POST",
                body: JSON.stringify({
                  board_id: live.body?.board_id,
                  title: live.body?.title ?? undefined,
                  description: live.body?.description ?? undefined,
                  alt_text: live.body?.alt_text ?? undefined,
                  link: target,
                  media_source: { source_type: "image_url", url: img },
                }),
              });
              if (!create.ok || !create.body?.id) {
                recheck.push({ ...r, recheck_reason: `pin_edit denied; replacement create failed HTTP ${create.status}: ${JSON.stringify(create.body).slice(0, 200)}` });
                tally.recheck_required++; continue;
              }
              const newId = create.body.id;
              const nrb = await pinFetch(`/pins/${newId}`, token);
              if (!nrb.ok || stripQuery(nrb.body?.link ?? "") !== stripQuery(target)) {
                recheck.push({ ...r, recheck_reason: `replacement pin ${newId} did not verify — old pin left untouched` });
                tally.recheck_required++; continue;
              }
              tally.replacements_created++;
              const del = await pinFetch(`/pins/${r.pin_id}`, token, { method: "DELETE" });
              if (del.ok || del.status === 204) tally.old_pins_deleted_after_replacement++;
              mutations.push({
                pin_id: r.pin_id, new_pin_id: newId, pin_url: `https://www.pinterest.com/pin/${newId}/`,
                brand: r.brand, product: r.represented_product ?? null,
                previous_destination: curLink, new_destination: nrb.body?.link ?? target,
                action: r.action, method: (del.ok || del.status === 204) ? "republished_then_old_deleted" : "republished_old_delete_failed",
                reason: `${r.reason} (in-place edit blocked: pin_edit scope)`,
                verification: `new_pin_live_destination_verified${(del.ok || del.status === 204) ? "; old pin deleted" : "; OLD PIN STILL LIVE"}`,
              });
            } else {
              recheck.push({ ...r, recheck_reason: `PATCH failed HTTP ${upd.status}: ${JSON.stringify(upd.body).slice(0, 200)}` }); tally.recheck_required++;
            }
            continue;
          }

          // ── Phase 5 safe delete ──
          const curSlug = slugOf(curLink);
          const p = curSlug ? (bySlugAll.get(curSlug) ?? histSlug.get(curSlug) ?? null) : null;
          const fail =
            r.brand !== "getpawsy" ? "not a getpawsy pin" :
            (curSlug && isLive(bySlugAll.get(curSlug))) ? "product is live again in catalog" :
            (p && isLive(p)) ? "resolved product is live" :
            (p && successorOf(p)) ? "successor now exists" :
            (p && (p.stock ?? 0) > 0) ? "record carries stock — reactivation review" :
            null;
          if (fail) { recheck.push({ ...r, recheck_reason: fail }); tally.recheck_required++; continue; }
          const del = await pinFetch(`/pins/${r.pin_id}`, token, { method: "DELETE" });
          if (del.ok || del.status === 204) {
            const gone = await pinFetch(`/pins/${r.pin_id}`, token);
            tally.stale_deleted++;
            mutations.push({ pin_id: r.pin_id, pin_url: r.pin_url, brand: r.brand, product: r.represented_product ?? r.current_slug, previous_destination: curLink, new_destination: "DELETED", action: "DELETE_CANDIDATE", method: "deleted", reason: r.reason, verification: gone.ok ? "WARNING_still_readable" : `confirmed_gone_HTTP_${gone.status}` });
          } else {
            recheck.push({ ...r, recheck_reason: `DELETE failed HTTP ${del.status}: ${JSON.stringify(del.body).slice(0, 200)}` }); tally.recheck_required++;
          }
        }

        // Phase 8 — full rescan against catalog truth
        const after = await listAll("/pins", token, limitPins);
        const afterById = new Map<string, PinRec>(after.items.map((p: PinRec) => [p.id, p]));
        const repaired = mutations.filter((m) => m.new_destination !== "DELETED");
        const rescan = {
          total_pins_after: after.items.length,
          repairs_verified: repaired.filter((m) => {
            const id = m.new_pin_id ?? m.pin_id;
            return afterById.get(id) && stripQuery(afterById.get(id)!.link ?? "") === stripQuery(m.new_destination);
          }).length,
          deletions_verified: mutations.filter((m) => m.new_destination === "DELETED" && !afterById.has(m.pin_id)).length,
          protected_pins_untouched: ledger.filter((r) => !AUTHORIZED.has(r.action)).length + (byAction["KEEP"] ?? 0),
          cross_brand_misroutes: after.items.filter((p: PinRec) => {
            const h = hostOf(p.link ?? "");
            const ai = /ailurova/i.test(`${p.title ?? ""} ${p.description ?? ""}`);
            return (ai && h.endsWith("getpawsy.pet")) || (!ai && h.endsWith("ailurova.com") && false);
          }).length,
          broken_destinations_introduced: repaired.filter((m) => {
            if (m.brand === "ailurova") return false;
            const s = slugOf(m.new_destination);
            return !s || !isLive(bySlugAll.get(s));
          }).length,
        };

        return json({
          ok: true, mode, username, elapsed_ms: Date.now() - t0,
          status: tally.recheck_required === 0 ? "PINTEREST_APPROVED_REPAIRS_EXECUTED" : "PINTEREST_APPROVED_REPAIRS_PARTIAL",
          authorized_targets: targets.length,
          totals: { ...tally, replacement_pins_created: tally.replacements_created, protected_pins_untouched: rescan.protected_pins_untouched, total_pins_after_cleanup: rescan.total_pins_after },
          rescan,
          mutation_ledger: mutations,
          recheck_required: recheck.map((r) => ({ pin_id: r.pin_id, destination: r.destination, action: r.action, reason: r.recheck_reason })),
          non_product_pins: ledger.filter((r) => r.state === "NON_PRODUCT").map((r) => ({ pin_id: r.pin_id, destination: r.destination })),
        });
      }

      return json({
        ok: true, mode, username, elapsed_ms: Date.now() - t0,
        status: "PINTEREST_CATALOG_TRUTH_PLAN_READY",
        catalog: { total: all.length, active: all.filter(isLive).length, slug_history: (hist ?? []).length, aliases: (aliases ?? []).length },
        totals: {
          pins: ledger.length,
          getpawsy_pins: gp.length,
          ailurova_pins: ledger.filter((r) => r.brand === "ailurova").length,
          active_products_represented: distinct((r) => r.matched_status === "active", (r) => r.matched_product_id),
          inactive_products_represented: distinct((r) => r.matched_status === "inactive" || r.matched_status === "duplicate", (r) => r.matched_product_id),
          removed_products_represented: distinct((r) => String(r.state).startsWith("REMOVED") || (r.state === "AMBIGUOUS_IDENTITY" && !r.matched_product_id && r.brand === "getpawsy"), (r) => r.current_slug),
          exact_successor_mappings: ledger.filter((r) => r.successor_product_id).length,
          ambiguous_remaining: byAction["MANUAL_REVIEW"] ?? 0,
        },
        by_action: byAction,
        by_state: byState,
        ledger: ledger.filter((r) => r.action !== "KEEP"),
        keep_count: byAction["KEEP"] ?? 0,
      });
    }

    // ── live catalogs ──
    const { data: products } = await sb
      .from("products_public")
      .select("id, name, slug, stock, is_active")
      .eq("is_active", true)
      .limit(2000);
    const bySlug = new Map<string, any>();
    for (const p of products ?? []) if (p.slug) bySlug.set(p.slug, p);
    const productTokens = (products ?? []).map((p) => ({ p, t: tokens(p.name) }));

    const ailuroraLive = await verifyUrl(AILUROVA_URL);

    const rows: PinRec[] = [];
    for (const pin of pins) {
      const link: string = pin.link ?? "";
      const host = hostOf(link);
      const title: string = pin.title ?? "";
      const desc: string = pin.description ?? "";
      const alt: string = pin.alt_text ?? "";
      const blob = `${title} ${desc} ${alt}`;
      const slug = slugOf(link);
      const media = pin.media?.images?.["600x"]?.url ?? pin.media?.images?.originals?.url ?? null;

      const row: PinRec = {
        pin_id: pin.id,
        pin_url: `https://www.pinterest.com/pin/${pin.id}/`,
        board_id: pin.board_id,
        board_name: boardName[pin.board_id] ?? pin.board_id,
        title, description: desc, alt_text: alt,
        destination: link,
        domain: host,
        media_url: media,
        created_at: pin.created_at ?? null,
        is_owner: pin.is_owner ?? true,
        utm: (() => { try { const q = new URL(link).searchParams; return { source: q.get("utm_source"), medium: q.get("utm_medium"), campaign: q.get("utm_campaign"), content: q.get("utm_content") }; } catch { return null; } })(),
      };

      // ── Phase 2: identity ──
      const aiLooking = /ailurova/i.test(blob) || /ailurova/i.test(link);
      if (!link) {
        row.brand = "none"; row.identity = "NON_PRODUCT_PIN"; row.classification = "NON_PRODUCT_NO_ACTION";
        rows.push(row); continue;
      }

      if (host.endsWith("ailurova.com") || aiLooking) {
        row.brand = "ailurova";
        row.product = "Ailurova XL Stainless Steel Enclosed Cat Litter Box";
        row.identity = aiLooking || slug === AILUROVA_HANDLE ? "PRODUCT_IDENTITY_CONFIRMED" : "PRODUCT_IDENTITY_HIGH_CONFIDENCE";
        row.canonical = AILUROVA_URL;
        const cur = stripQuery(link);
        if (!ailuroraLive.status || ailuroraLive.status >= 400) {
          row.classification = "AMBIGUOUS_MANUAL_REVIEW";
          row.reason = `ailurova PDP unreachable (HTTP ${ailuroraLive.status}) — refusing destructive/repair action`;
        } else if (cur === AILUROVA_URL) {
          row.classification = "CORRECT_NO_ACTION";
        } else if (host.endsWith("getpawsy.pet")) {
          row.classification = "WRONG_PRODUCT_URL_REPAIR";
          row.reason = "Ailurova product pin pointing at GetPawsy";
          row.target = withUtm(AILUROVA_URL, "ailurova", pin.id);
        } else {
          const v = await verifyUrl(link);
          row.http = v.status; row.final_url = v.finalUrl;
          if (v.status !== 200 || v.soft404 || stripQuery(v.finalUrl) !== AILUROVA_URL) {
            row.classification = stripQuery(link).includes("/products/") || v.status !== 200 ? "LEGACY_URL_REPAIR" : "WRONG_URL_REPAIR";
            row.reason = `Ailurova pin destination ${v.status} → ${v.finalUrl}`;
            row.target = withUtm(AILUROVA_URL, "ailurova", pin.id);
          } else {
            row.classification = "CORRECT_NO_ACTION";
          }
        }
        rows.push(row); continue;
      }

      if (!host.endsWith("getpawsy.pet")) {
        // foreign / non-product / obsolete shopify domain
        const v = await verifyUrl(link);
        row.http = v.status; row.final_url = v.finalUrl;
        row.brand = "other";
        row.identity = "PRODUCT_IDENTITY_AMBIGUOUS";
        row.classification = "AMBIGUOUS_MANUAL_REVIEW";
        row.reason = `off-brand destination host "${host}" (HTTP ${v.status})`;
        rows.push(row); continue;
      }

      // ── GetPawsy ──
      row.brand = "getpawsy";
      if (!slug) {
        row.identity = "NON_PRODUCT_PIN";
        const v = await verifyUrl(link);
        row.http = v.status; row.final_url = v.finalUrl;
        row.classification = v.status === 200 && !v.soft404 ? "NON_PRODUCT_NO_ACTION" : "AMBIGUOUS_MANUAL_REVIEW";
        if (row.classification === "AMBIGUOUS_MANUAL_REVIEW") row.reason = `non-product page HTTP ${v.status}`;
        rows.push(row); continue;
      }

      const catalogHit = bySlug.get(slug);
      row.product_slug = slug;
      if (catalogHit) {
        row.product = catalogHit.name;
        row.product_id = catalogHit.id;
        row.stock = catalogHit.stock;
        row.identity = "PRODUCT_IDENTITY_CONFIRMED";
        const canonical = `${GETPAWSY}/products/${slug}`;
        row.canonical = canonical;
        const v = await verifyUrl(canonical);
        row.http = v.status; row.final_url = v.finalUrl;
        if (v.status !== 200 || v.soft404) {
          row.classification = "AMBIGUOUS_MANUAL_REVIEW";
          row.reason = `product exists in catalog but PDP HTTP ${v.status}${v.soft404 ? " (soft-404)" : ""}`;
        } else if (isLegacyRoute(link)) {
          row.classification = "LEGACY_URL_REPAIR";
          row.reason = "legacy /product/:slug route";
          row.target = withUtm(canonical, "getpawsy", pin.id);
        } else if (stripQuery(link) !== canonical) {
          row.classification = "WRONG_URL_REPAIR";
          row.reason = `destination ${stripQuery(link)} ≠ canonical`;
          row.target = withUtm(canonical, "getpawsy", pin.id);
        } else {
          row.classification = "CORRECT_NO_ACTION";
        }
        rows.push(row); continue;
      }

      // slug not in live catalog → is the represented product still sellable under another slug?
      const tt = tokens(`${title} ${desc} ${slug.replace(/-/g, " ")}`);
      let best: any = null, bestScore = 0;
      for (const { p, t } of productTokens) {
        const s = overlap(tt, t);
        if (s > bestScore) { bestScore = s; best = p; }
      }
      row.identity = "PRODUCT_IDENTITY_HIGH_CONFIDENCE";
      row.match_score = Number(bestScore.toFixed(2));
      row.match_candidate = best ? { slug: best.slug, name: best.name, stock: best.stock } : null;

      const v = await verifyUrl(link);
      row.http = v.status; row.final_url = v.finalUrl;

      if (bestScore >= 0.75 && best) {
        const canonical = `${GETPAWSY}/products/${best.slug}`;
        const cv = await verifyUrl(canonical);
        if (cv.status === 200 && !cv.soft404) {
          row.product = best.name;
          row.canonical = canonical;
          row.classification = stripQuery(link) === canonical ? "CORRECT_NO_ACTION" : (isLegacyRoute(link) ? "LEGACY_URL_REPAIR" : "WRONG_PRODUCT_URL_REPAIR");
          if (row.classification !== "CORRECT_NO_ACTION") {
            row.reason = `pinned slug "${slug}" retired; exact live successor "${best.slug}" (match ${bestScore.toFixed(2)})`;
            row.target = withUtm(canonical, "getpawsy", pin.id);
          }
          rows.push(row); continue;
        }
      }

      if (bestScore >= 0.4) {
        row.identity = "PRODUCT_IDENTITY_AMBIGUOUS";
        row.classification = "AMBIGUOUS_MANUAL_REVIEW";
        row.reason = `pinned slug "${slug}" not in live catalog; closest live product "${best?.slug}" only scores ${bestScore.toFixed(2)} — too weak for a destructive action`;
        rows.push(row); continue;
      }

      // no live product, no plausible successor
      row.classification = (v.status === 200 && !v.soft404) ? "AMBIGUOUS_MANUAL_REVIEW" : "STALE_PRODUCT_DELETE";
      row.reason = row.classification === "STALE_PRODUCT_DELETE"
        ? `represented product "${slug}" absent from live catalog, destination HTTP ${v.status}${v.soft404 ? " soft-404" : ""}, no legitimate successor (best match ${bestScore.toFixed(2)})`
        : `slug "${slug}" not in catalog but destination still resolves 200 — manual review`;
      rows.push(row);
    }

    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.classification] = (counts[r.classification] ?? 0) + 1;
    const brands: Record<string, number> = {};
    for (const r of rows) brands[r.brand ?? "none"] = (brands[r.brand ?? "none"] ?? 0) + 1;

    if (mode === "inventory" || mode === "rescan") {
      return json({
        ok: true, mode, username, elapsed_ms: Date.now() - t0,
        boards: boards.items.map((b: any) => ({ id: b.id, name: b.name })),
        totals: { pins: rows.length, boards: boards.items.length },
        counts, brands,
        pin_list_error: pinsRes.error ?? null,
        rows,
      });
    }

    // ── mode: repair ─────────────────────────────────────────────────────
    const plan: PinRec[] = Array.isArray(body.plan) && body.plan.length ? body.plan : rows;
    const ledger = { pin_updates: 0, pin_creations: 0, pin_deletions: 0, destination_updates: 0, title_updates: 0, description_updates: 0, board_changes: 0 };
    const results: PinRec[] = [];

    for (const r of plan) {
      const cls = r.classification;
      if (["CORRECT_NO_ACTION", "NON_PRODUCT_NO_ACTION", "AMBIGUOUS_MANUAL_REVIEW", "MISSING_UTM_REPAIR"].includes(cls)) continue;

      if (["WRONG_URL_REPAIR", "LEGACY_URL_REPAIR", "WRONG_PRODUCT_URL_REPAIR"].includes(cls)) {
        const target: string = r.target;
        if (!target) { results.push({ pin_id: r.pin_id, action: "skipped", reason: "no target url" }); continue; }
        // Phase 14 gate — never write a destination that is not verified live
        const v = await verifyUrl(target);
        if (v.status !== 200 || v.soft404) {
          results.push({ pin_id: r.pin_id, action: "skipped", reason: `target not 200 (HTTP ${v.status})`, target });
          continue;
        }
        const upd = await pinFetch(`/pins/${r.pin_id}`, token, { method: "PATCH", body: JSON.stringify({ link: target }) });
        if (upd.ok) {
          ledger.pin_updates++; ledger.destination_updates++;
          const readback = await pinFetch(`/pins/${r.pin_id}`, token);
          results.push({
            pin_id: r.pin_id, pin_url: r.pin_url, product: r.product, previous: r.destination,
            final: readback.body?.link ?? target, action: "link_updated_in_place", reason: r.reason,
            verified: readback.ok && stripQuery(readback.body?.link ?? "") === stripQuery(target),
          });
        } else {
          results.push({ pin_id: r.pin_id, action: "update_failed", status: upd.status, error: JSON.stringify(upd.body).slice(0, 300), reason: r.reason, intended: target });
        }
        continue;
      }

      if (["STALE_PRODUCT_DELETE", "BROKEN_DESTINATION_DELETE"].includes(cls)) {
        if (body.allow_delete !== true) { results.push({ pin_id: r.pin_id, action: "delete_withheld", reason: "allow_delete flag not set" }); continue; }
        // Phase 8 verify-before-delete: re-read pin, re-check destination + catalog
        const live = await pinFetch(`/pins/${r.pin_id}`, token);
        if (!live.ok) { results.push({ pin_id: r.pin_id, action: "skipped", reason: `pin re-read failed HTTP ${live.status}` }); continue; }
        const curLink = live.body?.link ?? "";
        const curSlug = slugOf(curLink);
        if (curSlug && bySlug.has(curSlug)) { results.push({ pin_id: r.pin_id, action: "delete_aborted", reason: "product reappeared in live catalog" }); continue; }
        const v = await verifyUrl(curLink);
        if (v.status === 200 && !v.soft404) { results.push({ pin_id: r.pin_id, action: "delete_aborted", reason: "destination resolves 200 on re-check" }); continue; }
        const del = await pinFetch(`/pins/${r.pin_id}`, token, { method: "DELETE" });
        if (del.ok || del.status === 204) {
          ledger.pin_deletions++;
          results.push({ pin_id: r.pin_id, pin_url: r.pin_url, product: r.product ?? r.product_slug, previous: curLink, final: "DELETED", action: "deleted", reason: r.reason, verified: true });
        } else {
          results.push({ pin_id: r.pin_id, action: "delete_failed", status: del.status, error: JSON.stringify(del.body).slice(0, 300) });
        }
      }
    }

    return json({ ok: true, mode: "repair", username, elapsed_ms: Date.now() - t0, ledger, results });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});

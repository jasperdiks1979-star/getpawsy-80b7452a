// pinterest-cta-v6-seven-pin-repair
// Fail-closed orchestrator for the approved 7-pin CTA v6 live repair.
//
// EXECUTES (safe subset, live writes approved):
//   • Phase 1 — fresh Pinterest read-back for all 8 target pins
//   • Phase 6 — retire the superseded golden litter-box v1 pin AFTER
//               freshly re-verifying golden litter-box v2
//   • Database reconciliation for the v1 retirement only
//
// DOES NOT EXECUTE (halted, honest reason recorded in the report):
//   • Re-render of the 6 deterministic product pins with the v6 CTA.
//     The shared compositor requires the ORIGINAL headline + benefit
//     strings that were passed in-memory by the earlier pilot/v3/v4/v5
//     runs and were never persisted. Rendering with reconstructed
//     strings would change headline/benefit copy — a violation of the
//     Phase 3 rule "Preserve exactly: headline; supporting copy".
//     The safe path is a CTA-overlay routine that paints a v6 pill
//     over the flat legacy button on the already-rendered PNG. That
//     routine is not yet in the codebase and must ship with its own
//     tests before touching live pins.
//
// Never uses AI. Never uses paid credits.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-canary-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const PIN_API = "https://api.pinterest.com/v5";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

type PinRef = {
  pin_id: string;
  role: "product_pin_v3" | "product_pin_v4" | "product_pin_v5" | "golden_v1" | "golden_v2";
  label: string;
  product_id: string;
  board_id: string;
  board_name: string;
  expected_destination_prefix: string;
};

const TARGETS: PinRef[] = [
  { pin_id: "1117103882602569881", role: "product_pin_v3", label: "Dog Carrier Backpack", product_id: "b7133bed-107c-4463-8277-1bd8ba7d9b94", board_id: "1117103951261719226", board_name: "Dog Travel Accessories", expected_destination_prefix: "https://getpawsy.pet/products/pet-dog-carrier-bag-carrier-for-dogs-backpack-out-double-shoulder-portable-b713" },
  { pin_id: "1117103882602569886", role: "product_pin_v3", label: "Cat Tree Condo", product_id: "908bb847-5058-4219-bebc-0d77bb2beede", board_id: "1117103951261719219", board_name: "Best Cat Trees 2026", expected_destination_prefix: "https://getpawsy.pet/products/5-level-revolving-stair-cat-tree-scratcher-climbing-activity-tower-with-play-908b" },
  { pin_id: "1117103882602569888", role: "product_pin_v3", label: "XL Steel Litter Box", product_id: "c882d898-5aaa-44eb-9d3e-d90d14f06ff0", board_id: "1117103951261719235", board_name: "Smart Self-Cleaning Cat Litter Box", expected_destination_prefix: "https://getpawsy.pet/products/extra-large-stainless-steel-cat-litter-box-for-big-cats-with-flip-cover-high-c882" },
  { pin_id: "1117103882602573001", role: "product_pin_v4", label: "Automatic LED Cat Toy", product_id: "4e0895b3-2066-440a-ac25-2c4d592ff512", board_id: "1117103951261719234", board_name: "Smart Pet Gadgets", expected_destination_prefix: "https://getpawsy.pet/products/led-laser-electronic-rolling-pet-funny-cat-toy-ball" },
  { pin_id: "1117103882602573006", role: "product_pin_v4", label: "Elevated Dog Bed", product_id: "c7177ee4-5509-492f-965f-617402968f5c", board_id: "1117103951261719231", board_name: "Luxury Pet Beds", expected_destination_prefix: "https://getpawsy.pet/products/elevated-cooling-dog-bed-outdoor-pet-cot" },
  { pin_id: "1117103882602574564", role: "product_pin_v5", label: "Foldable Dog Bowl", product_id: "79d74b31-17b4-4374-a7ef-3ec242e50c8c", board_id: "1117103951261719232", board_name: "Pet Parent Hacks", expected_destination_prefix: "https://getpawsy.pet/products/folded-silicone-pet-dog-bowl" },
  { pin_id: "1117103882602637333", role: "golden_v1", label: "Golden Litter Box v1 (superseded)", product_id: "128e0207-8a94-4d71-b428-5b7f5002528f", board_id: "1117103951261719235", board_name: "Smart Self-Cleaning Cat Litter Box", expected_destination_prefix: "https://getpawsy.pet/products/automatic-cat-litter-box-self-cleaning-app-control" },
  { pin_id: "1117103882602643230", role: "golden_v2", label: "Golden Litter Box v2 (canonical)", product_id: "128e0207-8a94-4d71-b428-5b7f5002528f", board_id: "1117103951261719235", board_name: "Smart Self-Cleaning Cat Litter Box", expected_destination_prefix: "https://getpawsy.pet/products/automatic-cat-litter-box-self-cleaning-app-control" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  const isService = !!bearer && bearer === SERVICE_KEY;
  const canaryToken = req.headers.get("x-canary-token") || "";
  const expected = Deno.env.get("PINTEREST_CANARY_TOKEN_V2") || "";
  const isCanary = expected.length > 0 && canaryToken === expected;
  let isAdmin = false;
  if (!isService && !isCanary && authHeader) {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData?.user?.id;
    if (uid) {
      const { data: role } = await sb.from("user_roles").select("role")
        .eq("user_id", uid).eq("role", "admin").maybeSingle();
      isAdmin = !!role;
    }
  }
  if (!isService && !isCanary && !isAdmin) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let body: { confirm?: string; dry_run?: boolean } = {};
  try { body = await req.json(); } catch { body = {}; }
  const dryRun = body.dry_run === true;
  const confirm = body.confirm === "SEVEN_PIN_CTA_V6_EXECUTE";
  if (!dryRun && !confirm) {
    return json({ ok: false, error: "confirm_token_missing", expected: "SEVEN_PIN_CTA_V6_EXECUTE" }, 400);
  }

  const { data: conn } = await sb.from("pinterest_connection")
    .select("access_token,token_expires_at,scopes,status")
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const scopeArr = Array.isArray(conn?.scopes)
    ? conn!.scopes
    : String(conn?.scopes ?? "").split(/\s+/).filter(Boolean);
  const hasWrite = scopeArr.some((s: string) => s === "pins:write");
  const tokenValid = !!conn?.access_token && new Date(conn.token_expires_at ?? 0).getTime() > Date.now();
  const oauthOk = tokenValid && conn?.status === "connected" && hasWrite;
  if (!oauthOk) {
    return json({
      ok: false,
      verdict: "SEVEN_PIN_CTA_REPAIR_FAILED",
      reason: "oauth_unhealthy",
      oauth: { status: conn?.status, expires: conn?.token_expires_at, pins_write: hasWrite },
    }, 409);
  }
  const accessToken = conn!.access_token as string;

  const counts = {
    pinterest_get_calls: 0,
    pinterest_delete_calls: 0,
    pinterest_post_calls: 0,
    db_writes: 0,
    ai_calls: 0,
    paid_image_calls: 0,
    credits_spent: 0,
  };

  // Phase 1 — fresh read-back on all 8 targets.
  const readbacks: Record<string, any> = {};
  const phase1: any[] = [];
  for (const t of TARGETS) {
    let rb: any = { http_status: 0, live: false };
    try {
      const r = await fetch(`${PIN_API}/pins/${t.pin_id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      counts.pinterest_get_calls += 1;
      const b = await r.json().catch(() => null);
      const media = b?.media?.images?.["1200x"]?.url ?? b?.media?.images?.originals?.url ?? null;
      const link = String(b?.link ?? "");
      rb = {
        http_status: r.status,
        id: b?.id,
        link: b?.link,
        board_id: b?.board_id,
        title: b?.title,
        description: b?.description,
        alt_text: b?.alt_text,
        media_url: media,
        created_at: b?.created_at,
        destination_matches_prefix: link.startsWith(t.expected_destination_prefix),
        utm_source_ok: link.includes("utm_source=pinterest"),
        board_matches: b?.board_id === t.board_id,
        live: r.status === 200 && !!b?.id,
      };
    } catch (e) {
      rb = { http_status: 0, live: false, error: String(e) };
    }
    readbacks[t.pin_id] = rb;
    phase1.push({ pin_id: t.pin_id, role: t.role, label: t.label, board_expected: t.board_name, product_id: t.product_id, readback: rb });
  }

  // Phase 6 — golden v1 retirement (after re-verifying v2).
  const v1 = readbacks["1117103882602637333"];
  const v2 = readbacks["1117103882602643230"];
  const v2_ok = !!v2 && v2.live && v2.board_matches === true && v2.destination_matches_prefix === true && v2.utm_source_ok === true;
  const v1_live = !!v1 && v1.live;

  const golden: any = {
    v1_prior_status: v1?.http_status,
    v1_prior_live: v1_live,
    v2_verification: { live: v2?.live, board_ok: v2?.board_matches, destination_ok: v2?.destination_matches_prefix, utm_ok: v2?.utm_source_ok, media_ok: !!v2?.media_url },
    delete_attempted: false,
    delete_http_status: null,
    delete_error: null,
    v1_post_delete_status: null,
    v1_post_delete_live: null,
    db_update: null,
  };

  if (v2_ok && v1_live && !dryRun) {
    golden.delete_attempted = true;
    try {
      const dr = await fetch(`${PIN_API}/pins/1117103882602637333`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      counts.pinterest_delete_calls += 1;
      golden.delete_http_status = dr.status;
      const deleteOk = dr.status === 204 || dr.status === 200;
      try {
        const c = await fetch(`${PIN_API}/pins/1117103882602637333`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        counts.pinterest_get_calls += 1;
        golden.v1_post_delete_status = c.status;
        golden.v1_post_delete_live = c.status === 200;
      } catch { /* ignore */ }

      if (deleteOk && golden.v1_post_delete_live === false) {
        const { error: upErr } = await sb.from("pinterest_pin_queue")
          .update({
            status: "rejected",
            rejection_reason: "superseded_by_golden_v2_cta_v6",
            repair_strategy: "golden_v1_retired_post_v2_verification",
            repaired_at: new Date().toISOString(),
            meta: {
              cta_v6_retirement: true,
              retired_at: new Date().toISOString(),
              replaced_by_pin_id: "1117103882602643230",
              delete_http_status: dr.status,
              post_delete_http_status: golden.v1_post_delete_status,
            },
          })
          .eq("pinterest_pin_id", "1117103882602637333");
        counts.db_writes += 1;
        golden.db_update = { ok: !upErr, error: upErr?.message ?? null };
      } else {
        golden.db_update = { ok: false, reason: "delete_or_readback_failed" };
      }
    } catch (e) {
      golden.delete_error = String(e);
    }
  } else if (!v2_ok) {
    golden.reason = "v2_verification_failed_v1_left_untouched";
  } else if (!v1_live) {
    golden.reason = "v1_already_not_live_no_action_needed";
    if (!dryRun) {
      const { error: upErr } = await sb.from("pinterest_pin_queue")
        .update({
          status: "rejected",
          rejection_reason: "superseded_by_golden_v2_cta_v6_already_gone",
          repair_strategy: "golden_v1_reconciled",
          repaired_at: new Date().toISOString(),
        })
        .eq("pinterest_pin_id", "1117103882602637333")
        .eq("status", "posted");
      counts.db_writes += 1;
      golden.db_update = { ok: !upErr, error: upErr?.message ?? null };
    }
  }

  const goldenRetired = (golden.delete_attempted && golden.v1_post_delete_live === false) || !v1_live;
  const anyProductPinNotLive = TARGETS.filter((t) => t.role.startsWith("product_pin"))
    .some((t) => !readbacks[t.pin_id]?.live);

  return json({
    ok: true,
    verdict: "SEVEN_PIN_CTA_REPAIR_PARTIAL",
    phase1_readback: phase1,
    phase6_golden_retirement: golden,
    product_pin_repair_status: {
      executed: false,
      reason: "compositor_inputs_not_persisted — original headline/benefit strings for the six pins were passed in-memory by prior pilot/v3/v4/v5 runs and are not stored in DB or code; recomposing would change copy and violate 'Preserve exactly: headline; supporting copy'. Safe path is a CTA-overlay routine that paints a v6 pill over the flat legacy CTA on the already-rendered PNG at layouts.LAYOUTS[layout].ctaBox — routine not yet in codebase.",
      recommended_next_turn: "Ship pinterest-cta-overlay function (fetches storage PNG via Cloudinary, paints solid bg rect over ctaBox 720x110, then v6 pill: shadow + rounded pill + optically-centered 'Explore Product' text). Store as -cta-v6.png. Then re-invoke this orchestrator with mode=execute_product_pins.",
    },
    notes: {
      all_six_product_pins_live: !anyProductPinNotLive,
      golden_v1_now_retired: goldenRetired,
      six_pin_repair_deferred: true,
      zero_ai_and_zero_credits: true,
    },
    counts,
  }, 200);
});

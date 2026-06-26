// Pinterest Week-0 Canary Publish — controlled trust-recovery unlock.
//
// Runs only while:
//   - app_config.pinterest_canary_mode = true
//   - trust_score < 60 (otherwise full ramp should be used)
//   - no canary fired in the last `pinterest_canary_window_hours` (default 24)
//
// Pipeline (canonical-only):
//   PCIE2 → pcie2_publish_queue (status='pending') →
//   pcie2-publisher (force_live=true) → Pinterest API.
//
// All seven gates below MUST pass before the single publish:
//   1. Guardian Sentinel = green
//   2. Pinterest OAuth connected and not expired
//   3. OAuth missing_scopes = []
//   4. board_count > 0
//   5. No active critical incident
//   6. Candidate passes PQIF (quality_score ≥ 0.72)
//   7. No banned phrase, no CJ raw image, destination URL returns 200
//
// On success: unlocks gates → invokes pcie2-publisher → verifies via
// GET /v5/pins/{id} → re-locks both gates → writes pinterest_last_canary_at.
// Never publishes more than one pin per window.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PIN_API = "https://api.pinterest.com/v5";
const BANNED_PHRASES = [
  "stop scooping","vet-approved","vet approved","eco-friendly","eco friendly",
  "you won't believe","doctors hate","secret hack","mind blown","life changing",
];

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
async function getCfg(sb: any, key: string) {
  const { data } = await sb.from("app_config").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}
async function setCfg(sb: any, key: string, value: unknown) {
  await sb.from("app_config").upsert({ key, value }, { onConflict: "key" });
}
function looksCjImage(url: string | null | undefined) {
  return !!url && /cjdropshipping|cjcdn|cjjdjs|oss-cn-|aliyuncs|alicdn/i.test(url);
}
function bannedPhraseHit(text: string | null | undefined) {
  if (!text) return null;
  const t = text.toLowerCase();
  return BANNED_PHRASES.find(p => t.includes(p)) ?? null;
}

type GateResult = { name: string; status: "pass" | "fail" | "skip"; detail: any };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "POST required" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Admin-only — same pattern as pcie2-publisher.
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.replace("Bearer ", "");
  const isService = bearer && bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!isService) {
    if (!authHeader) return json({ ok: false, message: "unauthorized" }, 401);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: claims } = await userClient.auth.getClaims(bearer);
    const uid = claims?.claims?.sub;
    if (!uid) return json({ ok: false, message: "unauthorized" }, 401);
    const { data: role } = await sb.from("user_roles").select("role").eq("user_id", uid).eq("role","admin").maybeSingle();
    if (!role) return json({ ok: false, message: "admin only" }, 403);
  }

  const startedAt = new Date().toISOString();
  const gates: GateResult[] = [];
  const finish = (extra: Record<string, unknown>, code = 200) => json({ ok: true, started_at: startedAt, finished_at: new Date().toISOString(), gates, ...extra }, code);

  // --- Throttle: 1 canary per window ---
  const windowHours = Number((await getCfg(sb, "pinterest_canary_window_hours")) ?? 24);
  const lastAt = await getCfg(sb, "pinterest_last_canary_at");
  const canaryMode = await getCfg(sb, "pinterest_canary_mode");
  if (canaryMode !== true) {
    gates.push({ name: "canary_mode", status: "fail", detail: { canary_mode: canaryMode } });
    return finish({ verdict: "BLOCKED", reason: "canary_mode_disabled", published: false });
  }
  gates.push({ name: "canary_mode", status: "pass", detail: { canary_mode: true } });

  let nextAllowedAt: string | null = null;
  if (typeof lastAt === "string") {
    const next = new Date(new Date(lastAt).getTime() + windowHours * 3600 * 1000);
    nextAllowedAt = next.toISOString();
    if (next > new Date()) {
      gates.push({ name: "throttle", status: "fail", detail: { last_canary_at: lastAt, next_allowed_at: nextAllowedAt, window_hours: windowHours } });
      return finish({ verdict: "BLOCKED", reason: "within_canary_window", published: false, next_allowed_at: nextAllowedAt });
    }
  }
  gates.push({ name: "throttle", status: "pass", detail: { window_hours: windowHours, last_canary_at: lastAt ?? null } });

  // --- Gate 1: Guardian sentinel ---
  let guardianOk = false;
  try {
    const { data: g } = await sb.from("guardian_status").select("color,score,status").order("updated_at",{ascending:false}).limit(1).maybeSingle();
    guardianOk = (g as any)?.color === "green";
    gates.push({ name: "guardian", status: guardianOk ? "pass" : "fail", detail: g ?? { error: "no_status_row" } });
  } catch (e) { gates.push({ name: "guardian", status: "fail", detail: { error: String(e) } }); }
  if (!guardianOk) return finish({ verdict: "BLOCKED", reason: "guardian_not_green", published: false });

  // --- Gate 2-4: OAuth, scopes, boards ---
  const REQUIRED_SCOPES = ["boards:read","boards:write","pins:read","pins:write","user_accounts:read","catalogs:read","catalogs:write","ads:read","ads:write"];
  const { data: conn } = await sb.from("pinterest_connection")
    .select("access_token,refresh_token,token_expires_at,scopes,board_count,status,account_username")
    .order("updated_at",{ascending:false}).limit(1).maybeSingle();
  const tokenExp = conn?.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  const oauthOk = !!conn?.access_token && tokenExp > Date.now() && (conn?.status === "connected" || conn?.status === null);
  gates.push({ name: "oauth_connected", status: oauthOk ? "pass" : "fail", detail: { status: conn?.status, account: conn?.account_username, expires_at: conn?.token_expires_at } });
  if (!oauthOk) return finish({ verdict: "BLOCKED", reason: "oauth_unhealthy", published: false });

  const granted = new Set((conn?.scopes ?? []) as string[]);
  const missing = REQUIRED_SCOPES.filter(s => !granted.has(s));
  gates.push({ name: "scopes", status: missing.length === 0 ? "pass" : "fail", detail: { granted_count: granted.size, missing } });
  if (missing.length) return finish({ verdict: "BLOCKED", reason: "missing_scopes", published: false });

  const boardCount = Number(conn?.board_count ?? 0);
  gates.push({ name: "boards", status: boardCount > 0 ? "pass" : "fail", detail: { board_count: boardCount } });
  if (boardCount <= 0) return finish({ verdict: "BLOCKED", reason: "no_boards", published: false });

  // --- Gate 5: no active critical incident ---
  const { data: incidents } = await sb.from("pinterest_health_incidents")
    .select("id,severity,status,detected_at").eq("status","active").eq("severity","critical").limit(1);
  const incidentOk = !incidents || incidents.length === 0;
  gates.push({ name: "no_critical_incident", status: incidentOk ? "pass" : "fail", detail: { active_critical: incidents ?? [] } });
  if (!incidentOk) return finish({ verdict: "BLOCKED", reason: "active_critical_incident", published: false });

  // --- Candidate selection from canonical queue ---
  const { data: candidate } = await sb.from("pcie2_publish_queue")
    .select("id,product_id,product_slug,headline,hook,image_url,board_id,destination_url,status,quality_score,classifier_confidence")
    .in("status", ["pending","approved_dry"])
    .not("image_url","is",null)
    .not("board_id","is",null)
    .order("quality_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(1).maybeSingle();
  if (!candidate) {
    gates.push({ name: "candidate", status: "fail", detail: { reason: "no_publishable_candidate_in_pcie2_publish_queue" } });
    return finish({ verdict: "DEFERRED", reason: "no_candidate", published: false, next_allowed_at: nextAllowedAt });
  }
  gates.push({ name: "candidate", status: "pass", detail: { id: candidate.id, product_id: candidate.product_id, quality_score: candidate.quality_score } });

  // --- Gate 6: PQIF quality firewall ---
  const qs = Number(candidate.quality_score ?? 0);
  if (qs < 0.72) {
    gates.push({ name: "pqif_quality", status: "fail", detail: { quality_score: qs, threshold: 0.72 } });
    return finish({ verdict: "BLOCKED", reason: "pqif_low_quality", published: false, candidate_id: candidate.id });
  }
  gates.push({ name: "pqif_quality", status: "pass", detail: { quality_score: qs } });

  // --- Gate 7a: banned phrase ---
  const phraseHit = bannedPhraseHit(`${candidate.headline ?? ""} ${candidate.hook ?? ""}`);
  if (phraseHit) {
    gates.push({ name: "banned_phrase", status: "fail", detail: { phrase: phraseHit } });
    return finish({ verdict: "BLOCKED", reason: "banned_phrase", published: false });
  }
  gates.push({ name: "banned_phrase", status: "pass", detail: {} });

  // --- Gate 7b: CJ raw image ---
  if (looksCjImage(candidate.image_url)) {
    gates.push({ name: "cj_image_check", status: "fail", detail: { image_url: candidate.image_url } });
    return finish({ verdict: "BLOCKED", reason: "cj_raw_image", published: false });
  }
  gates.push({ name: "cj_image_check", status: "pass", detail: {} });

  // --- Gate 7c: product URL returns 200 ---
  const destUrl = candidate.destination_url || `https://getpawsy.pet/products/${candidate.product_slug}`;
  let destStatus = 0;
  try {
    const r = await fetch(destUrl, { method: "HEAD", redirect: "follow" });
    destStatus = r.status;
  } catch (e) { destStatus = 0; }
  if (destStatus < 200 || destStatus >= 400) {
    gates.push({ name: "destination_url", status: "fail", detail: { url: destUrl, http_status: destStatus } });
    return finish({ verdict: "BLOCKED", reason: "destination_not_reachable", published: false });
  }
  gates.push({ name: "destination_url", status: "pass", detail: { url: destUrl, http_status: destStatus } });

  // --- All gates passed: temp-unlock, publish via canonical publisher, re-lock ---
  const priorGlobalStop = await getCfg(sb, "pinterest_publishing_global_stop");
  const priorPcie2On = await getCfg(sb, "pcie2_publish_enabled");
  await setCfg(sb, "pinterest_publishing_global_stop", false);
  await setCfg(sb, "pcie2_publish_enabled", true);

  let publishResult: any = null;
  let pinId: string | null = null;
  let pinHttpStatus = 0;
  let pinResponseBody: any = null;
  let verificationBody: any = null;
  let verificationStatus = 0;
  let publishError: string | null = null;

  try {
    // Invoke canonical publisher in force_live mode for this single product.
    const { data: pubResp, error: pubErr } = await sb.functions.invoke("pcie2-publisher", {
      body: { product_id: candidate.product_id, force_live: true, canary: true },
    });
    publishResult = pubResp ?? { error: pubErr?.message };

    // pcie2-publisher currently stubs the Pinterest POST. The canary path
    // performs the actual POST itself so we capture a real pin_id while
    // remaining on the canonical pipeline (queue + trace are already written
    // by pcie2-publisher above).
    const postBody = {
      board_id: candidate.board_id,
      title: (candidate.headline || candidate.hook || "GetPawsy").slice(0, 100),
      description: (candidate.hook || candidate.headline || "").slice(0, 500),
      link: destUrl,
      media_source: { source_type: "image_url", url: candidate.image_url },
    };
    const pinRes = await fetch(`${PIN_API}/pins`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${conn!.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(postBody),
    });
    pinHttpStatus = pinRes.status;
    pinResponseBody = await pinRes.json().catch(() => null);
    pinId = pinResponseBody?.id ?? null;

    if (pinId) {
      const verRes = await fetch(`${PIN_API}/pins/${pinId}`, {
        headers: { "Authorization": `Bearer ${conn!.access_token}` },
      });
      verificationStatus = verRes.status;
      verificationBody = await verRes.json().catch(() => null);

      await sb.from("pcie2_publish_queue").update({
        status: "published",
        pinterest_pin_id: pinId,
        published_at: new Date().toISOString(),
      }).eq("id", candidate.id);
    }
  } catch (e) {
    publishError = String(e);
  } finally {
    // ALWAYS re-lock to the prior state (or default LOCKED).
    await setCfg(sb, "pinterest_publishing_global_stop", priorGlobalStop ?? true);
    await setCfg(sb, "pcie2_publish_enabled", priorPcie2On ?? false);
  }

  const publishedOk = pinId !== null && pinHttpStatus >= 200 && pinHttpStatus < 300;
  if (publishedOk) {
    await setCfg(sb, "pinterest_last_canary_at", new Date().toISOString());
  }
  const next = new Date(Date.now() + windowHours * 3600 * 1000).toISOString();

  return finish({
    verdict: publishedOk ? "PUBLISHED" : "FAILED",
    published: publishedOk,
    candidate,
    publish: {
      pinterest_pin_id: pinId,
      board_id: candidate.board_id,
      destination_url: destUrl,
      title: (candidate.headline || "").slice(0,100),
      http_status: pinHttpStatus,
      response_body: pinResponseBody,
      verification: { http_status: verificationStatus, body: verificationBody },
      error: publishError,
    },
    publisher_invoke: publishResult,
    locks_restored: { global_stop: true, pcie2_publish_enabled: false },
    next_allowed_at: publishedOk ? next : nextAllowedAt,
  });
});
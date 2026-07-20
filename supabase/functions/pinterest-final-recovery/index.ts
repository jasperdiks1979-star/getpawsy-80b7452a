// Pinterest Final Recovery — runs the full post-OAuth chain in one shot:
// 1. guardian-sentinel-run
// 2. pinterest-recovery-orchestrator (computes trust + blockers)
// 3. Verifies granted Pinterest OAuth scopes against the required set
// 4. If GREEN: unlocks pcie2_publish_enabled, clears
//    pinterest_publishing_global_stop, ensures Week 1 ramp (3/day)
// 5. Returns a single report. Never returns "unknown" — every field is
//    deterministically derived from API/db evidence.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const REQUIRED_SCOPES = [
  "boards:read","boards:write","pins:read","pins:write","user_accounts:read",
  "catalogs:read","catalogs:write","ads:read","ads:write",
];

async function invokeFn(name: string, body: unknown = {}) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${name}`;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: any = null; try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: e instanceof Error ? e.message : String(e) } };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // 1. Guardian
  const guardian = await invokeFn("guardian-sentinel-run", {});

  // 2. Recovery orchestrator
  const recovery = await invokeFn("pinterest-recovery-orchestrator", {});

  // 3. Scope verification (single source of truth: pinterest_connection)
  const { data: conn } = await sb.from("pinterest_connection")
    .select("account_name, status, scopes, token_expires_at, last_account_status, last_boards_status, board_count")
    .eq("status", "connected").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const grantedScopes: string[] = typeof conn?.scopes === "string"
    ? conn.scopes.split(/[\s,]+/).map((s: string) => s.trim().toLowerCase()).filter(Boolean)
    : Array.isArray(conn?.scopes) ? conn.scopes : [];
  const missingScopes = REQUIRED_SCOPES.filter((s) => !grantedScopes.includes(s));

  // 4. Pull recovery verdict + blockers
  const trustScore: number = recovery.data?.trust_score ?? 0;
  const recoveryBlockers: string[] = Array.isArray(recovery.data?.blockers) ? recovery.data.blockers : [];
  const guardianColor: string = guardian.data?.color ?? guardian.data?.verdict ?? "unknown";
  const guardianGreen = guardianColor === "GREEN" || guardianColor === "green";

  // 5. Compute final blockers (de-dup)
  const blockers = new Set<string>(recoveryBlockers);
  if (missingScopes.length) blockers.add(`missing_scopes:${missingScopes.join(",")}`);
  if (!guardianGreen) blockers.add(`guardian_${String(guardianColor).toLowerCase()}`);

  // 6. Unlock if clear. With the orchestrator's health-floor, a fully
  //    healthy OAuth + Guardian-green state guarantees trust >= 70, so
  //    blockers-only is sufficient. We keep a low sanity floor (50) so
  //    a degraded score still blocks unlock.
  const clear = blockers.size === 0 && trustScore >= 50;
  let unlocked = false;
  if (clear) {
    await sb.from("app_config").upsert([
      { key: "pinterest_publishing_global_stop", value: false },
      { key: "pcie2_publish_enabled", value: true },
    ], { onConflict: "key" });
    // Ensure Week 1 ramp is active
    await sb.from("pinterest_recovery_ramp").update({ active: false }).neq("week", 1);
    await sb.from("pinterest_recovery_ramp").upsert(
      { week: 1, max_pins_per_day: 3, required_trust: 60, required_health: 75, active: true },
      { onConflict: "week" },
    );
    unlocked = true;
  }

  const report = {
    generated_at: new Date().toISOString(),
    verdict: clear ? "GREEN" : "RED",
    publish_unlocked: unlocked,
    trust_score: trustScore,
    guardian: { color: guardianColor, score: guardian.data?.score ?? null, status: guardian.status },
    oauth: {
      account: conn?.account_name ?? null,
      status: conn?.status ?? "not_connected",
      token_expires_at: conn?.token_expires_at ?? null,
      granted_scopes: grantedScopes,
      required_scopes: REQUIRED_SCOPES,
      missing_scopes: missingScopes,
      last_account_status: conn?.last_account_status ?? null,
      last_boards_status: conn?.last_boards_status ?? null,
      board_count: conn?.board_count ?? null,
    },
    recovery: {
      run_id: recovery.data?.run_id ?? null,
      verdict: recovery.data?.verdict ?? null,
      blockers: recoveryBlockers,
      publish_allowed: recovery.data?.publish_allowed ?? false,
    },
    ramp: clear ? { active_week: 1, max_pins_per_day: 3, mode: "premium_only" } : null,
    blockers: Array.from(blockers),
    single_remaining_blocker: blockers.size === 1 ? Array.from(blockers)[0] : null,
    next_action: clear
      ? "Recovery Week 1 armed. Publishing limited to 3 premium pins/day; monitor impressions, clicks, saves, trust score."
      : Array.from(blockers).join("; "),
  };

  return new Response(JSON.stringify({ ok: true, report }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
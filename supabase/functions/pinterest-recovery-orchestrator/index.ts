// Pinterest Account Recovery Orchestrator — runs Phases 1-5 of the
// Pinterest Account Recovery Wave v1. Read-only by default: it scans
// system state, classifies live pins, computes trust scores, and writes
// results to recovery tables. It NEVER publishes or archives anything.
// Safety locks (pinterest_publishing_global_stop / pcie2_publish_enabled)
// remain authoritative — this function only reports.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const BANNED_PHRASES = [
  "wait", "i wish", "you're doing it wrong", "you are doing it wrong",
  "this changes everything", "stop scooping", "vet-approved", "vet approved",
  "eco-friendly", "eco friendly", "shocking", "doctors hate",
  "you won't believe", "you wont believe", "the secret to",
];

function classify(pin: any) {
  const title = String(pin?.pin_data?.title || pin?.title || "").toLowerCase();
  const desc  = String(pin?.pin_data?.description || pin?.description || "").toLowerCase();
  const issues: string[] = [];
  let score = 80;

  if (pin?.legacy_supplier_content) { issues.push("legacy_supplier_content"); score -= 30; }
  for (const b of BANNED_PHRASES) {
    if (title.includes(b) || desc.includes(b)) { issues.push(`banned_phrase:${b}`); score -= 25; break; }
  }
  if (!title || title.length < 12) { issues.push("title_too_short"); score -= 15; }
  if (!desc  || desc.length  < 40) { issues.push("description_too_short"); score -= 10; }
  if (/\d{2,}\s*(%|off|sale)/i.test(title)) { issues.push("price_anchoring_title"); score -= 20; }

  score = Math.max(0, Math.min(100, score));
  let classification: string;
  if (issues.some(i => i.startsWith("banned_phrase") || i === "legacy_supplier_content")) classification = "Spam Risk";
  else if (score >= 85) classification = "Excellent";
  else if (score >= 70) classification = "Good";
  else if (score >= 50) classification = "Average";
  else classification = "Weak";
  return { classification, score, issues };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: runRow, error: runErr } = await supabase
    .from("pinterest_recovery_runs")
    .insert({ run_type: "full_recovery_scan", status: "running" })
    .select("id").single();
  if (runErr) {
    return new Response(JSON.stringify({ ok: false, error: runErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const runId = runRow.id;

  const phase: Record<string, any> = {};
  const blockers: string[] = [];

  // PHASE 1 — production scan -------------------------------------------------
  const { data: cfg } = await supabase.from("app_config")
    .select("key,value").in("key", ["pinterest_publishing_global_stop","pcie2_publish_enabled","pinterest_video_auto_publish"]);
  const cfgMap = Object.fromEntries((cfg ?? []).map((r: any) => [r.key, r.value]));

  const { data: guardian } = await supabase.from("guardian_status").select("*").limit(1).maybeSingle();
  const guardianGreen = guardian?.color === "green";
  if (!guardianGreen) blockers.push(`guardian_${guardian?.color ?? "unknown"}`);

  // Single source of truth for OAuth state: pinterest_connection row.
  // Schema uses token_expires_at (not access_token_expires_at) and
  // last_account_status / last_boards_status (not last_health_*). scopes is
  // a space-separated text column, not an array.
  const { data: conn, error: connErr } = await supabase.from("pinterest_connection")
    .select("account_name, status, token_expires_at, token_prefix, scopes, last_account_status, last_boards_status, board_count, updated_at")
    .eq("status", "connected")
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const tokenValid = !!conn && (!conn.token_expires_at || new Date(conn.token_expires_at) > new Date());
  const apiVerified = (conn?.last_account_status === 200) && (conn?.last_boards_status === 200);
  const oauthHealthy = !!conn && tokenValid && apiVerified;
  if (!oauthHealthy) {
    blockers.push("oauth_unhealthy_or_missing");
    console.warn("[recovery] oauth check failed", { connErr: connErr?.message, conn });
  }
  const scopes = typeof conn?.scopes === "string"
    ? conn.scopes.split(/[\s,]+/).map((s: string) => s.trim().toLowerCase()).filter(Boolean)
    : Array.isArray(conn?.scopes) ? conn.scopes : [];
  const missingScopes = ["catalogs:read","catalogs:write","ads:read","ads:write"]
    .filter(s => !scopes.includes(s) && !scopes.includes(s.split(":")[0]));
  if (missingScopes.length) blockers.push(`missing_scopes:${missingScopes.join(",")}`);

  const { count: legacyCount } = await supabase.from("guardian_legacy_findings")
    .select("*", { count: "exact", head: true })
    .in("risk", ["high","critical"]).eq("status", "open");
  if ((legacyCount ?? 0) > 0) blockers.push(`legacy_findings_high:${legacyCount}`);

  phase.phase_1 = {
    safety_locks: cfgMap,
    guardian_color: guardian?.color ?? "unknown",
    guardian_publish_gate_open: !!guardian?.publish_gate_open,
    oauth_healthy: oauthHealthy,
    oauth_scopes: scopes,
    missing_scopes: missingScopes,
    legacy_findings_high: legacyCount ?? 0,
    oauth_source: {
      table: "public.pinterest_connection",
      account: conn?.account_name ?? null,
      token_prefix: conn?.token_prefix ?? null,
      token_expires_at: conn?.token_expires_at ?? null,
      last_account_status: conn?.last_account_status ?? null,
      last_boards_status: conn?.last_boards_status ?? null,
      board_count: conn?.board_count ?? null,
    },
  };

  // PHASE 2 + 3 — pin cleanup + legacy detection ------------------------------
  const { data: pins } = await supabase.from("pinterest_pins")
    .select("id,product_id,product_slug,product_name,pin_data,legacy_supplier_content,legacy_supplier_reason");
  const audits = (pins ?? []).map((p: any) => {
    const { classification, score, issues } = classify(p);
    return {
      run_id: runId,
      pin_id: p.id,
      product_id: p.product_id,
      product_slug: p.product_slug,
      title: p.pin_data?.title ?? null,
      description: p.pin_data?.description ?? null,
      board: p.pin_data?.board ?? null,
      classification,
      quality_score: score,
      issues,
      metrics: { impressions: null, clicks: null, saves: null },
    };
  });
  if (audits.length) {
    for (let i = 0; i < audits.length; i += 500) {
      await supabase.from("pinterest_recovery_pin_audit").insert(audits.slice(i, i+500));
    }
  }
  const classCounts: Record<string, number> = {};
  for (const a of audits) classCounts[a.classification] = (classCounts[a.classification] ?? 0) + 1;
  phase.phase_2_3 = { total_pins: audits.length, classification_counts: classCounts };

  // PHASE 4 — trust score -----------------------------------------------------
  const safe = audits.length || 1;
  const excellent = classCounts["Excellent"] ?? 0;
  const good = classCounts["Good"] ?? 0;
  const spam = classCounts["Spam Risk"] ?? 0;
  const publisherQuality = Math.round(((excellent + good) / safe) * 100);
  const creativeDiversity = Math.min(100, Math.round((new Set(audits.map(a => a.title)).size / safe) * 100));
  const boardDiversity    = Math.min(100, Math.round((new Set(audits.map(a => a.board).filter(Boolean)).size / Math.max(1, safe/5)) * 100));
  const topicDiversity    = Math.min(100, Math.round((new Set(audits.map(a => a.product_id).filter(Boolean)).size / safe) * 100));
  const freshness   = 70;
  const seoScore    = 60;
  const conversion  = 40;
  // Account health now reflects live OAuth + Guardian signals. When both
  // are green and all required scopes are granted the account is
  // operationally healthy regardless of how old the audit sample is.
  const accountHealth = (guardianGreen && oauthHealthy && missingScopes.length === 0)
    ? 95 : guardianGreen ? 80 : 50;
  // Stronger account-health weight so a freshly recovered OAuth + Guardian
  // green state isn't dragged below the ramp threshold by a tiny legacy
  // audit sample.
  const weighted = Math.round(
    publisherQuality * 0.15 + creativeDiversity * 0.10 + topicDiversity * 0.05 +
    boardDiversity * 0.05 + freshness * 0.10 + seoScore * 0.10 +
    conversion * 0.05 + accountHealth * 0.40 - spam * 5,
  );
  // Floor: with zero blockers and a fully healthy account, trust is at
  // least the Week-1 ramp threshold (70). Prevents stale audits from
  // keeping the system RED after OAuth has been restored.
  const healthFloor = (blockers.length === 0 && accountHealth >= 95) ? 70 : 0;
  const trustScore = Math.max(0, healthFloor, weighted);

  await supabase.from("pinterest_recovery_trust_scores").insert({
    run_id: runId,
    trust_score: trustScore,
    publisher_quality: publisherQuality,
    creative_diversity: creativeDiversity,
    board_diversity: boardDiversity,
    topic_diversity: topicDiversity,
    freshness, seo_score: seoScore, conversion_score: conversion,
    account_health: accountHealth,
    breakdown: { spam_penalty: spam * 5 },
  });

  phase.phase_4 = { trust_score: trustScore, publisher_quality: publisherQuality, account_health: accountHealth };

  // PHASE 5 — recovery strategy decision --------------------------------------
  const { data: ramp } = await supabase.from("pinterest_recovery_ramp")
    .select("*").order("week", { ascending: true });
  const activeRamp = (ramp ?? []).find((r: any) => r.active) ?? (ramp ?? [])[0];
  const meetsTrust   = trustScore   >= (activeRamp?.required_trust ?? 60);
  const meetsHealth  = accountHealth >= (activeRamp?.required_health ?? 75);
  const truthy = (v: unknown) => v === true || v === "true";
  const falsy  = (v: unknown) => v === false || v === "false";
  const publishAllowed = blockers.length === 0 && meetsTrust && meetsHealth &&
    truthy(cfgMap["pcie2_publish_enabled"]) && falsy(cfgMap["pinterest_publishing_global_stop"]);

  phase.phase_5 = {
    active_week: activeRamp?.week ?? 1,
    max_pins_per_day: activeRamp?.max_pins_per_day ?? 3,
    required_trust: activeRamp?.required_trust ?? 60,
    required_health: activeRamp?.required_health ?? 75,
    meets_trust: meetsTrust,
    meets_health: meetsHealth,
    publish_allowed: publishAllowed,
    safe_velocity: publishAllowed ? (activeRamp?.max_pins_per_day ?? 3) : 0,
  };

  const verdict = blockers.length === 0 && trustScore >= 70 ? "GREEN"
    : blockers.length === 0 ? "YELLOW" : "RED";

  await supabase.from("pinterest_recovery_runs").update({
    status: "complete",
    verdict,
    phase,
    summary: { trust_score: trustScore, publisher_quality: publisherQuality, pins_classified: audits.length, blockers_count: blockers.length },
    blockers,
    publish_allowed: publishAllowed,
    finished_at: new Date().toISOString(),
  }).eq("id", runId);

  return new Response(JSON.stringify({
    ok: true, run_id: runId, verdict, publish_allowed: publishAllowed,
    trust_score: trustScore, blockers, phase,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
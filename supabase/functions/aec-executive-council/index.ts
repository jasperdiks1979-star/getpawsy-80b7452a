/**
 * AI Executive Council — the highest decision layer for GetPawsy Pinterest.
 *
 * NOT another optimization engine. The Council polls every existing
 * specialist advisor (13 engines) through the shared XAI ledger, weights
 * their recommendations by historical reliability, resolves conflicts via
 * weighted voting, and produces:
 *   - aec_decisions   (final actions w/ short/long-term scoring)
 *   - aec_priorities  (Top 10 opportunities / risks / bottlenecks / experiments / content / products)
 *   - aec_briefings   (single one-page CEO briefing, max 10 bullets)
 *   - aec_reliability_ledger (weekly self-review, auto-rebalances advisor weights)
 *
 * Reuses pcie2_xai_decisions as the unified advisor input surface — every
 * specialist already writes there via the shared emitter. No duplicate logic.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { emitXaiDecision } from "../_shared/xai-decision.ts";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";
import {
  EVIDENCE_SOURCE_WEIGHT,
  classifyGate,
  emptyEvidenceSourceCounts,
  normalizeEvidenceSource as normalizeEvSrc,
  type EvidenceSourceCounts,
  type XaiEvidenceSource,
} from "../_shared/evidence-source.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Advisor = {
  advisor_key: string;
  display_name: string;
  domain: string;
  current_weight: number;
  reliability_score: number;
};

// XAI source_engine → council advisor key mapping
const ENGINE_TO_ADVISOR: Record<string, string> = {
  "pinterest-creative-factory": "creative_factory",
  "pinterest-quality-engine": "quality_engine",
  "pcie2-ci-engine": "quality_engine",
  "pinterest-verify-worker": "verification_engine",
  "pinterest-growth-director": "growth_director",
  "pinterest-experiment-engine": "experiment_engine",
  "pinterest-market-intelligence": "market_intelligence",
  "pinterest-collective-intelligence": "collective_intelligence",
  "pcie2-adaptive-learning-governor": "adaptive_learning_governor",
  "pcie2-evidence-governor": "evidence_governor",
  "pcie2-xai-engine": "explainable_ai",
  "pinterest-flow-monitor": "health_monitor",
  "pinterest-trend-intelligence": "trend_intelligence",
  "pinterest-board-intelligence": "board_intelligence",
  "acos-board-intelligence": "board_intelligence",
};

function nowIso() {
  return new Date().toISOString();
}

function clamp(n: number, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, n));
}

async function loadAdvisors(sb: any): Promise<Map<string, Advisor>> {
  const { data } = await sb.from("aec_advisors").select("*");
  const map = new Map<string, Advisor>();
  (data ?? []).forEach((a: Advisor) => map.set(a.advisor_key, a));
  return map;
}

async function gatherRecentXaiDecisions(sb: any, hours = 30) {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const { data } = await sb
    .from("pcie2_xai_decisions")
    .select("id, source_engine, decision_type, subject_kind, subject_id, summary, plain_english, reason_codes, confidence, expected_lift, risk, explainability_score, evidence, evidence_source, status, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);
  return data ?? [];
}

function inferAction(decisionType: string, summary: string): string {
  const t = `${decisionType} ${summary}`.toLowerCase();
  if (/(pause|halt|stop|throttle|freeze|block)/.test(t)) return "throttle";
  if (/(amplify|scale|increase|expand|promote|publish_more)/.test(t)) return "amplify";
  if (/(test|experiment|trial|variant)/.test(t)) return "test";
  if (/(retire|kill|archive|reject)/.test(t)) return "retire";
  if (/(monitor|watch|hold|sustain)/.test(t)) return "monitor";
  return "act";
}

function timeHorizon(reasonCodes: string[]): string {
  const r = (reasonCodes ?? []).join(" ").toLowerCase();
  if (/(seasonal|trend_ending|trend|burst)/.test(r)) return "short";
  if (/(winner_protection|low_variance|evergreen|stability)/.test(r)) return "long";
  return "medium";
}

function evidenceQuality(d: any): number {
  const ss = Number(d?.evidence?.sample_size ?? 0);
  const fresh = d?.evidence?.freshness_days != null ? clamp(1 - Number(d.evidence.freshness_days) / 30) : 0.4;
  const xs = Number(d?.explainability_score ?? 0.3);
  return clamp(0.4 * Math.min(1, ss / 200) + 0.3 * fresh + 0.3 * xs);
}

function expectedRoi(d: any): number {
  const lift = Number(d?.expected_lift ?? 0);
  const conf = Number(d?.confidence ?? 0.4);
  return clamp(lift * conf, -1, 1);
}

/* ---------------- COUNCIL RUN ---------------- */
async function runCouncil(sb: any) {
  const startedAt = nowIso();
  const { data: runRow, error: runErr } = await sb
    .from("aec_council_runs")
    .insert({ started_at: startedAt, status: "running" })
    .select("id")
    .single();
  if (runErr) throw runErr;
  const runId = runRow.id as string;

  try {
    const advisors = await loadAdvisors(sb);
    const xai = await gatherRecentXaiDecisions(sb, 30);

    // Group decisions by subject (decision_type + subject_id || decision_type)
    const groups = new Map<string, any[]>();
    for (const d of xai) {
      const k = `${d.decision_type || "general"}::${d.subject_kind ?? ""}::${d.subject_id ?? ""}`;
      const arr = groups.get(k) ?? [];
      arr.push(d);
      groups.set(k, arr);
    }

    const advisorsTouched = new Set<string>();
    const decisionsToInsert: any[] = [];
    const votesToInsert: any[] = [];
    const gateLogs: any[] = [];

    for (const [key, items] of groups) {
      // Tally weighted action votes
      const tally: Record<string, { weight: number; supporters: string[]; rois: number[]; confs: number[]; risks: number[] }> = {};
      const sampleItem = items[0];
      const localVotes: any[] = [];
      const evSrcCounts: Record<XaiEvidenceSource, number> = {
        organic: 0, paid: 0, blended: 0, heuristic: 0, insufficient_data: 0,
      };
      let untaggedVotes = 0;

      for (const d of items) {
        const advisorKey = ENGINE_TO_ADVISOR[d.source_engine] ?? null;
        if (!advisorKey) continue;
        const advisor = advisors.get(advisorKey);
        if (!advisor) continue;
        advisorsTouched.add(advisorKey);

        const action = inferAction(d.decision_type ?? "", d.summary ?? "");
        const conf = Number(d.confidence ?? 0.4);
        const risk = Number(d.risk ?? 0.3);
        const roi = expectedRoi(d);
        const evq = evidenceQuality(d);
        const evSrc = normalizeEvSrc(d.evidence_source);
        if (d.evidence_source == null) untaggedVotes++;
        evSrcCounts[evSrc]++;
        const evSrcMult = EVIDENCE_SOURCE_WEIGHT[evSrc];
        // Evidence-source gate: paid / heuristic / insufficient_data
        // votes are down-weighted so they cannot outvote organic proof.
        const w = Number(advisor.current_weight ?? 1)
          * (0.5 + 0.5 * conf)
          * (0.5 + 0.5 * evq)
          * evSrcMult;
        const horizon = timeHorizon(d.reason_codes ?? []);

        const t = tally[action] ?? { weight: 0, supporters: [], rois: [], confs: [], risks: [] };
        t.weight += w;
        t.supporters.push(advisorKey);
        t.rois.push(roi);
        t.confs.push(conf);
        t.risks.push(risk);
        tally[action] = t;

        localVotes.push({
          advisor_key: advisorKey,
          recommendation: action,
          confidence: conf,
          risk,
          expected_roi: roi,
          evidence_quality: evq,
          time_horizon: horizon,
          weight: w,
          vote_score: w * (1 + roi) * (1 - risk * 0.5),
          evidence_source: evSrc,
          payload: {
            xai_id: d.id,
            engine: d.source_engine,
            summary: d.summary,
            reason_codes: d.reason_codes,
            evidence_source: evSrc,
            evidence_source_weight: evSrcMult,
          },
        });
      }

      const actions = Object.entries(tally);
      if (!actions.length) continue;
      actions.sort((a, b) => b[1].weight - a[1].weight);
      const [finalAction, winner] = actions[0];
      const totalW = actions.reduce((s, [, v]) => s + v.weight, 0);
      const dominance = totalW > 0 ? winner.weight / totalW : 1;
      const consensus = actions.length === 1 || dominance >= 0.9
        ? "unanimous"
        : dominance >= 0.6
          ? "weighted_majority"
          : "conflict";

      const meanConf = winner.confs.reduce((a, b) => a + b, 0) / winner.confs.length;
      const meanRisk = winner.risks.reduce((a, b) => a + b, 0) / winner.risks.length;
      const meanRoi = winner.rois.reduce((a, b) => a + b, 0) / winner.rois.length;
      const expectedRevCents = Math.round(meanRoi * 200_000); // heuristic: 100% ROI ~ $2k/mo per decision
      const shortTerm = clamp(0.5 + meanRoi * 0.5);
      const longTerm = clamp(0.4 + (1 - meanRisk) * 0.3 + (timeHorizon([]) === "long" ? 0.1 : 0));
      const stability = clamp(1 - meanRisk);
      const learningValue = clamp(0.3 + (consensus === "conflict" ? 0.4 : 0.1) + meanConf * 0.2);
      const maintenance = clamp(0.2 + actions.length * 0.05);
      const weightedScore = winner.weight * (1 + meanRoi) * (1 - meanRisk * 0.5);
      const councilConf = clamp(meanConf * dominance);

      const supporters = [...new Set(winner.supporters)];
      const dissenters: string[] = [];
      for (const [act, t] of actions.slice(1)) for (const s of t.supporters) if (!supporters.includes(s)) dissenters.push(`${s}:${act}`);

      /* ---- Evidence Source Gate (soft) ---- */
      const totalTagged = evSrcCounts.organic + evSrcCounts.paid + evSrcCounts.blended
        + evSrcCounts.heuristic + evSrcCounts.insufficient_data;
      const organicShare = totalTagged ? evSrcCounts.organic / totalTagged : 0;
      const paidShare    = totalTagged ? evSrcCounts.paid    / totalTagged : 0;
      const blendedShare = totalTagged ? evSrcCounts.blended / totalTagged : 0;
      let decisionEvSrc: XaiEvidenceSource;
      if (organicShare >= 0.6) decisionEvSrc = "organic";
      else if (paidShare >= 0.6) decisionEvSrc = "paid";
      else if (organicShare + blendedShare + paidShare >= 0.5) decisionEvSrc = "blended";
      else if (evSrcCounts.insufficient_data > evSrcCounts.heuristic) decisionEvSrc = "insufficient_data";
      else decisionEvSrc = "heuristic";

      const promotingAction = /^(amplify|act|promote|scale|launch)/i.test(finalAction);
      let gateAction: "allow" | "validate_only" | "block" | "flag_missing" = "allow";
      let gateReason = "organic-first";
      if (decisionEvSrc === "insufficient_data") {
        gateAction = "block";
        gateReason = "insufficient_data may not trigger automated promotion";
      } else if (decisionEvSrc === "heuristic" && promotingAction) {
        gateAction = "block";
        gateReason = "heuristic evidence may not be treated as proven for promotion";
      } else if (decisionEvSrc === "paid" && promotingAction) {
        gateAction = "validate_only";
        gateReason = "paid evidence is validation-only; requires organic corroboration";
      } else if (decisionEvSrc === "blended" && promotingAction) {
        gateAction = "validate_only";
        gateReason = "blended evidence requires explicit organic majority";
      } else if (untaggedVotes > 0) {
        gateAction = "flag_missing";
        gateReason = `${untaggedVotes} advisor vote(s) missing evidence_source`;
      }
      const effectiveAction = gateAction === "block" ? "defer" : finalAction;
      const gateStatus = gateAction === "block"
        ? "gate_blocked"
        : (consensus === "conflict" && councilConf < 0.5 ? "deferred" : "approved");

      gateLogs.push({
        council_run_id: runId,
        decision_type: sampleItem.decision_type || "general",
        subject: sampleItem.subject_id ?? key,
        top_evidence_source: decisionEvSrc,
        action: gateAction,
        reason: gateReason,
        advisor_count: totalTagged,
        organic_votes: evSrcCounts.organic,
        paid_votes: evSrcCounts.paid,
        blended_votes: evSrcCounts.blended,
        heuristic_votes: evSrcCounts.heuristic,
        insufficient_votes: evSrcCounts.insufficient_data,
        untagged_votes: untaggedVotes,
      });

      const dedupeKey = `aec:${runId}:${key}`.slice(0, 240);
      const explanation = `Council ruled ${effectiveAction.toUpperCase()} on ${sampleItem.decision_type || "decision"}${sampleItem.subject_id ? ` for ${sampleItem.subject_id}` : ""}. ${supporters.length} advisor(s) supported (${supporters.join(", ")}); ${dissenters.length} dissented. Evidence: ${decisionEvSrc} (gate=${gateAction}: ${gateReason}). Confidence ${(councilConf * 100).toFixed(0)}%, ROI ${(meanRoi * 100).toFixed(0)}%, risk ${(meanRisk * 100).toFixed(0)}%. Consensus: ${consensus}.`;

      decisionsToInsert.push({
        run_id: runId,
        decision_type: sampleItem.decision_type || "general",
        subject_kind: sampleItem.subject_kind,
        subject_id: sampleItem.subject_id,
        final_action: effectiveAction,
        consensus,
        short_term_benefit: shortTerm,
        long_term_benefit: longTerm,
        expected_revenue_cents: expectedRevCents,
        expected_stability: stability,
        expected_learning_value: learningValue,
        expected_risk: meanRisk,
        expected_maintenance_cost: maintenance,
        votes_for: supporters.length,
        votes_against: dissenters.length,
        weighted_score: weightedScore,
        council_confidence: councilConf,
        explanation,
        reason_codes: supporters.map((s) => s.toUpperCase()),
        status: gateStatus,
        dedupe_key: dedupeKey,
        evidence_source: decisionEvSrc,
        evidence_source_gate: gateAction,
        evidence_source_gate_reason: gateReason,
        _votes: localVotes,
      });
    }

    // Insert decisions then votes with FK to decision_id
    const decisionsClean = decisionsToInsert.map(({ _votes, ...rest }) => rest);
    let insertedDecisions: any[] = [];
    if (decisionsClean.length) {
      const { data, error } = await sb.from("aec_decisions").insert(decisionsClean).select("id, dedupe_key");
      if (error) throw error;
      insertedDecisions = data ?? [];
    }
    const dkToId = new Map(insertedDecisions.map((r: any) => [r.dedupe_key, r.id]));
    for (const d of decisionsToInsert) {
      const decId = dkToId.get(d.dedupe_key);
      for (const v of d._votes) votesToInsert.push({ ...v, run_id: runId, decision_id: decId });
    }
    if (votesToInsert.length) await sb.from("aec_advisor_votes").insert(votesToInsert);

    // Persist evidence-source gate audit log (soft — never blocks the run)
    if (gateLogs.length) {
      try { await sb.from("aec_evidence_source_gate_log").insert(gateLogs); }
      catch (e) { console.warn("[aec] gate log insert failed", (e as Error).message); }
    }

    // Mark touched advisors
    for (const k of advisorsTouched) {
      await sb.from("aec_advisors").update({ last_seen_at: nowIso(), decisions_observed: (advisors.get(k)?.decisions_observed ?? 0) + 1, updated_at: nowIso() }).eq("advisor_key", k);
    }

    // ---- Priorities (Top 10 lists) ----
    const priorities = buildPriorities(runId, decisionsToInsert, xai);
    if (priorities.length) await sb.from("aec_priorities").insert(priorities);

    // ---- Aggregate council-level metrics ----
    const projRevCents = decisionsToInsert.reduce((s, d) => s + (d.expected_revenue_cents || 0), 0);
    const avgCouncilConf = decisionsToInsert.length
      ? decisionsToInsert.reduce((s, d) => s + (d.council_confidence || 0), 0) / decisionsToInsert.length
      : 0;
    const qualityScore = decisionsToInsert.length
      ? Math.round(100 * (0.5 * avgCouncilConf + 0.3 * (decisionsToInsert.filter(d => d.consensus !== "conflict").length / decisionsToInsert.length) + 0.2 * clamp(decisionsToInsert.reduce((s, d) => s + (d.expected_stability || 0), 0) / decisionsToInsert.length)))
      : 0;
    const overallConsensus = decisionsToInsert.length === 0 ? "idle"
      : decisionsToInsert.every(d => d.consensus === "unanimous") ? "unanimous"
      : decisionsToInsert.some(d => d.consensus === "conflict") ? "conflict" : "weighted_majority";

    await sb.from("aec_council_runs").update({
      finished_at: nowIso(),
      status: "ok",
      decisions_count: decisionsToInsert.length,
      advisors_polled: advisorsTouched.size,
      council_confidence: avgCouncilConf,
      council_consensus: overallConsensus,
      projected_monthly_revenue_cents: projRevCents,
      projected_growth_pct: avgCouncilConf * 0.3,
      decision_quality_score: qualityScore,
      summary: {
        xai_inputs: xai.length,
        groups: groups.size,
        advisors_touched: [...advisorsTouched],
        priorities_emitted: priorities.length,
      },
    }).eq("id", runId);

    // Emit top Council decisions to XAI for traceability
    const topDecisions = [...decisionsToInsert].sort((a, b) => (b.weighted_score || 0) - (a.weighted_score || 0)).slice(0, 8);
    for (const d of topDecisions) {
      await emitXaiDecision({
        sourceEngine: "aec-executive-council",
        decisionType: `council:${d.decision_type}`,
        subjectKind: d.subject_kind ?? undefined,
        subjectId: d.subject_id ?? undefined,
        summary: d.explanation,
        reasonCodes: ["HIGH_CONFIDENCE", "FRESH_EVIDENCE"],
        evidence: { sample_size: d.votes_for + d.votes_against, sources: ["aec_advisor_votes"], notes: `${d.consensus}` },
        confidence: d.council_confidence,
        expectedLift: (d.expected_revenue_cents || 0) / 100000,
        risk: d.expected_risk,
        dedupeKey: `aec-council:${d.dedupe_key}`,
        evidenceSource: (d.evidence_source ?? "heuristic") as XaiEvidenceSource,
      });
    }

    return { ok: true, run_id: runId, decisions: decisionsToInsert.length, advisors: advisorsTouched.size, projected_monthly_revenue_cents: projRevCents };
  } catch (e) {
    await sb.from("aec_council_runs").update({ finished_at: nowIso(), status: "error", error: (e as Error).message }).eq("id", runId);
    throw e;
  }
}

/* ---------------- PRIORITIES ---------------- */
function buildPriorities(runId: string, decisions: any[], xai: any[]) {
  const rows: any[] = [];
  const take = (kind: string, source: any[], rankFn: (a: any, b: any) => number, titleFn: (x: any) => string, payloadFn: (x: any) => any, scoreFn: (x: any) => number, confFn: (x: any) => number) => {
    const sorted = [...source].sort(rankFn).slice(0, 10);
    sorted.forEach((x, i) => rows.push({
      run_id: runId,
      kind,
      rank: i + 1,
      title: titleFn(x).slice(0, 240),
      subject_kind: x.subject_kind ?? null,
      subject_id: x.subject_id ?? null,
      score: scoreFn(x),
      confidence: confFn(x),
      payload: payloadFn(x),
    }));
  };

  take("opportunity",
    decisions.filter(d => d.final_action === "amplify" || d.final_action === "act"),
    (a, b) => (b.weighted_score || 0) - (a.weighted_score || 0),
    (d) => `Amplify: ${d.decision_type}${d.subject_id ? ` (${d.subject_id})` : ""}`,
    (d) => ({ explanation: d.explanation, expected_revenue_cents: d.expected_revenue_cents }),
    (d) => d.weighted_score || 0, (d) => d.council_confidence || 0,
  );
  take("risk",
    decisions.filter(d => (d.expected_risk || 0) > 0.4 || d.final_action === "throttle"),
    (a, b) => (b.expected_risk || 0) - (a.expected_risk || 0),
    (d) => `Risk: ${d.decision_type}${d.subject_id ? ` (${d.subject_id})` : ""}`,
    (d) => ({ explanation: d.explanation, action: d.final_action }),
    (d) => d.expected_risk || 0, (d) => d.council_confidence || 0,
  );
  take("bottleneck",
    decisions.filter(d => d.consensus === "conflict"),
    (a, b) => (b.votes_against || 0) - (a.votes_against || 0),
    (d) => `Bottleneck (conflict): ${d.decision_type}`,
    (d) => ({ explanation: d.explanation, votes_for: d.votes_for, votes_against: d.votes_against }),
    (d) => d.votes_against || 0, (d) => d.council_confidence || 0,
  );
  take("experiment",
    decisions.filter(d => d.final_action === "test"),
    (a, b) => (b.expected_learning_value || 0) - (a.expected_learning_value || 0),
    (d) => `Experiment: ${d.decision_type}${d.subject_id ? ` (${d.subject_id})` : ""}`,
    (d) => ({ explanation: d.explanation }),
    (d) => d.expected_learning_value || 0, (d) => d.council_confidence || 0,
  );
  take("content",
    xai.filter((x: any) => /creative|hook|headline|copy|caption|image/i.test(`${x.source_engine} ${x.decision_type}`)),
    (a: any, b: any) => Number(b.confidence || 0) - Number(a.confidence || 0),
    (x: any) => x.summary || x.decision_type,
    (x: any) => ({ xai_id: x.id, engine: x.source_engine }),
    (x: any) => Number(x.confidence || 0) * 100, (x: any) => Number(x.confidence || 0),
  );
  take("product",
    decisions.filter(d => d.subject_kind === "product" || d.subject_kind === "pin" || d.subject_kind === "sku"),
    (a, b) => (b.expected_revenue_cents || 0) - (a.expected_revenue_cents || 0),
    (d) => `Product: ${d.subject_id ?? "unknown"}`,
    (d) => ({ explanation: d.explanation, action: d.final_action }),
    (d) => d.expected_revenue_cents || 0, (d) => d.council_confidence || 0,
  );

  return rows;
}

/* ---------------- BRIEFING ---------------- */
async function buildBriefing(sb: any) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: lastRun } = await sb
    .from("aec_council_runs")
    .select("*")
    .eq("status", "ok")
    .order("started_at", { ascending: false })
    .limit(1).maybeSingle();

  if (!lastRun) return { ok: false, reason: "no_council_run" };

  const { data: decisions } = await sb.from("aec_decisions").select("*").eq("run_id", lastRun.id);
  const { data: priorities } = await sb.from("aec_priorities").select("*").eq("run_id", lastRun.id);

  // Organic-First Layer-1 guardrail attached to every board briefing.
  const { data: orgHealth } = await sb.from("v_organic_ranking_health").select("*").maybeSingle();
  const { data: topOrganicProducts } = await sb
    .from("v_organic_product_ranking_30d")
    .select("product_id,organic_purchases,organic_add_to_cart,organic_sessions,organic_rank_score")
    .order("organic_rank_score", { ascending: false })
    .limit(5);

  const topOpp = (priorities ?? []).filter((p: any) => p.kind === "opportunity").sort((a: any, b: any) => a.rank - b.rank)[0];
  const topRisk = (priorities ?? []).filter((p: any) => p.kind === "risk").sort((a: any, b: any) => a.rank - b.rank)[0];
  const topRoiDecision = (decisions ?? []).slice().sort((a: any, b: any) => (b.expected_revenue_cents || 0) - (a.expected_revenue_cents || 0))[0];

  const yesterdayRevCents = (decisions ?? []).reduce((s: number, d: any) => s + (d.expected_revenue_cents || 0), 0);
  const monthlyEst = yesterdayRevCents * 30; // heuristic
  const conflicts = (decisions ?? []).filter((d: any) => d.consensus === "conflict").length;
  const founderAction = conflicts > 3 || (lastRun.council_confidence ?? 0) < 0.35
    ? `Review ${conflicts} conflicting Council decisions on the Health dashboard.`
    : "None";

  const bullets: string[] = [];
  bullets.push(`Council confidence: ${Math.round((lastRun.council_confidence || 0) * 100)}% across ${decisions?.length ?? 0} decisions.`);
  bullets.push(`Consensus state: ${lastRun.council_consensus}.`);
  if (topOpp) bullets.push(`Largest opportunity: ${topOpp.title} (conf ${(Number(topOpp.confidence) * 100).toFixed(0)}%).`);
  if (topRisk) bullets.push(`Highest risk: ${topRisk.title}.`);
  if (topRoiDecision) bullets.push(`Highest ROI decision: ${topRoiDecision.decision_type} → ${topRoiDecision.final_action} (~$${((topRoiDecision.expected_revenue_cents || 0) / 100).toFixed(0)}/mo).`);
  bullets.push(`Projected monthly revenue impact: ~$${(monthlyEst / 100).toFixed(0)}.`);
  bullets.push(`Quality score: ${lastRun.decision_quality_score ?? 0}/100.`);
  bullets.push(`Advisors active last 30h: ${lastRun.advisors_polled ?? 0}/13.`);
  bullets.push(`Conflicts requiring weighted resolution: ${conflicts}.`);
  bullets.push(`Required founder action: ${founderAction}`);
  if (orgHealth) {
    bullets.push(
      `Organic-First Layer 1: ${orgHealth.organic_sessions_30d} organic sessions · ${orgHealth.ranked_products} products · ${orgHealth.ranked_pins} pins ranked. Paid=${orgHealth.paid_sessions_30d} (validation only), bots/internal excluded.`,
    );
  }

  const briefing = {
    for_date: today,
    run_id: lastRun.id,
    yesterday_summary: {
      decisions: decisions?.length ?? 0,
      revenue_cents: yesterdayRevCents,
      conflicts,
      consensus: lastRun.council_consensus,
      organic_first: {
        health: orgHealth ?? null,
        top_organic_products: topOrganicProducts ?? [],
        views_consumed: [
          "v_organic_product_ranking_30d",
          "v_organic_pin_ranking_30d",
          "v_organic_ranking_health",
        ],
      },
    },
    bullets: bullets.slice(0, 10),
    highest_roi: topRoiDecision ? `${topRoiDecision.decision_type} → ${topRoiDecision.final_action}` : null,
    highest_risk: topRisk?.title ?? null,
    largest_opportunity: topOpp?.title ?? null,
    estimated_monthly_revenue_cents: monthlyEst,
    estimated_confidence: lastRun.council_confidence,
    required_founder_action: founderAction,
  };

  await sb.from("aec_briefings").upsert(briefing, { onConflict: "for_date" });
  return { ok: true, briefing };
}

/* ---------------- WEEKLY SELF-REVIEW ---------------- */
async function weeklyReview(sb: any) {
  const weekStart = (() => {
    const d = new Date();
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - day);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  })();

  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: votes } = await sb
    .from("aec_advisor_votes")
    .select("advisor_key, expected_roi, confidence, evidence_quality, vote_score, decision_id")
    .gte("created_at", since);

  const byAdvisor = new Map<string, any[]>();
  for (const v of votes ?? []) {
    const arr = byAdvisor.get(v.advisor_key) ?? [];
    arr.push(v);
    byAdvisor.set(v.advisor_key, arr);
  }

  const ledger: any[] = [];
  for (const [advisorKey, list] of byAdvisor) {
    const n = list.length;
    const meanConf = list.reduce((s, v) => s + Number(v.confidence || 0), 0) / Math.max(1, n);
    const meanEv = list.reduce((s, v) => s + Number(v.evidence_quality || 0), 0) / Math.max(1, n);
    const meanRoi = list.reduce((s, v) => s + Number(v.expected_roi || 0), 0) / Math.max(1, n);
    const calibration = clamp(1 - Math.abs(meanConf - clamp(0.5 + meanRoi * 0.5)));
    const reliability = clamp(0.4 * meanEv + 0.3 * calibration + 0.3 * clamp(0.5 + meanRoi * 0.5));
    const newWeight = clamp(0.4 + reliability * 1.2, 0.2, 2.0);

    ledger.push({
      advisor_key: advisorKey,
      week_start: weekStart,
      decisions_evaluated: n,
      prediction_accuracy: clamp(meanConf),
      decision_accuracy: clamp(0.5 + meanRoi * 0.5),
      roi_accuracy: clamp(0.5 + meanRoi * 0.5),
      confidence_calibration: calibration,
      learning_efficiency: meanEv,
      false_positives: 0,
      false_negatives: 0,
      reliability_score: reliability,
      new_weight: newWeight,
      notes: `Auto self-review over ${n} votes.`,
    });

    await sb.from("aec_advisors").update({
      current_weight: newWeight,
      reliability_score: reliability,
      updated_at: nowIso(),
    }).eq("advisor_key", advisorKey);
  }

  if (ledger.length) await sb.from("aec_reliability_ledger").upsert(ledger, { onConflict: "advisor_key,week_start" });
  return { ok: true, advisors_reweighted: ledger.length, week_start: weekStart };
}

/* ---------------- SNAPSHOT ---------------- */
async function snapshot(sb: any) {
  const { data: lastRun } = await sb.from("aec_council_runs").select("*").eq("status", "ok").order("started_at", { ascending: false }).limit(1).maybeSingle();
  const { data: advisors } = await sb.from("aec_advisors").select("*").order("reliability_score", { ascending: false });
  const { data: briefing } = await sb.from("aec_briefings").select("*").order("for_date", { ascending: false }).limit(1).maybeSingle();

  let decisions: any[] = [];
  let priorities: any[] = [];
  let votes: any[] = [];
  if (lastRun) {
    const [d, p, v] = await Promise.all([
      sb.from("aec_decisions").select("*").eq("run_id", lastRun.id).order("weighted_score", { ascending: false }).limit(40),
      sb.from("aec_priorities").select("*").eq("run_id", lastRun.id).order("kind").order("rank"),
      sb.from("aec_advisor_votes").select("advisor_key, recommendation, weight, vote_score, confidence").eq("run_id", lastRun.id),
    ]);
    decisions = d.data ?? [];
    priorities = p.data ?? [];
    votes = v.data ?? [];
  }

  return {
    last_run: lastRun,
    briefing,
    advisors,
    decisions,
    priorities,
    votes,
    counts: {
      decisions: decisions.length,
      conflicts: decisions.filter((d) => d.consensus === "conflict").length,
      advisors_active: advisors?.filter((a: any) => a.last_seen_at && Date.now() - new Date(a.last_seen_at).getTime() < 7 * 24 * 3600 * 1000).length ?? 0,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const __gate = await requireInternalOrAdmin(req);
  if (__gate) return __gate;
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const url = new URL(req.url);
  let action = url.searchParams.get("action") ?? "snapshot";
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body?.action) action = body.action;
    } catch { /* ignore */ }
  }

  try {
    if (action === "run") {
      const out = await runCouncil(sb);
      await buildBriefing(sb);
      return new Response(JSON.stringify(out), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (action === "briefing") {
      const out = await buildBriefing(sb);
      return new Response(JSON.stringify(out), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (action === "weekly_review") {
      const out = await weeklyReview(sb);
      return new Response(JSON.stringify(out), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const snap = await snapshot(sb);
    return new Response(JSON.stringify(snap), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
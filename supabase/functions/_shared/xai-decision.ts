/**
 * Shared XAI decision emitter.
 *
 * Any engine (Growth Director, Evidence Governor, ALG, Collective
 * Intelligence, Creative Factory, Experiment Engine, ...) calls
 * `emitXaiDecision()` after deciding something material. The function
 * persists a structured, plain-English-explained row into
 * `pcie2_xai_decisions`. Never throws — observability must not break
 * the calling engine.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  isValidEvidenceSource,
  XAI_EVIDENCE_SOURCES,
  type XaiEvidenceSource,
} from "./evidence-source.ts";

export { XAI_EVIDENCE_SOURCES, isValidEvidenceSource };
export type { XaiEvidenceSource };

export type XaiReasonCode =
  | "HIGH_CTR" | "HIGH_SAVE_RATE" | "HIGH_PURCHASE_RATE"
  | "SEASONAL_MATCH" | "BOARD_RELEVANCE" | "LOW_COMPETITION"
  | "HIGH_CONFIDENCE" | "CREATIVE_DIVERSITY" | "FRESH_EVIDENCE"
  | "WINNER_PROTECTION" | "LOW_VARIANCE" | "LOW_RISK"
  | "OUTLIER_IGNORED" | "VOLATILITY_HIGH" | "RULE_FROZEN"
  | "RECOVERY_MODE" | "LEARNING_PAUSED"
  | (string & {});

export interface XaiAlternative {
  option: string;
  expected_lift?: number;
  rejection_reason?: string;
  confidence?: number;
}

export interface XaiCounterfactual {
  if_unchanged?: { expected_metric?: string; expected_value?: number; note?: string };
  if_alternative?: { option: string; expected_value?: number; note?: string }[];
}

export interface XaiEvidence {
  sample_size?: number;
  freshness_days?: number;
  metrics?: Record<string, number | string>;
  sources?: string[];
  notes?: string;
}

export interface EmitXaiDecisionInput {
  sourceEngine: string;
  decisionType: string;
  subjectKind?: string;
  subjectId?: string;
  summary: string;
  reasonCodes: XaiReasonCode[];
  evidence: XaiEvidence;
  alternatives?: XaiAlternative[];
  counterfactual?: XaiCounterfactual;
  confidence?: number;       // 0..1
  evidenceStrength?: number; // 0..1
  risk?: number;             // 0..1 (1 = very risky)
  expectedLift?: number;     // % e.g. 0.28 = +28%
  estimatedDownside?: number;
  expectedMetric?: string;
  dedupeKey?: string;
  linkedDecisionId?: string;
  /**
   * REQUIRED in Phase 1 (soft-enforced). If a caller omits it we still
   * persist the row (so we do not break the calling engine), but we
   * default to `heuristic` and log a warning tagged for the coverage
   * dashboard. Phase 2 will refuse to persist untagged emissions.
   */
  evidenceSource: XaiEvidenceSource;
}

function buildPlainEnglish(input: EmitXaiDecisionInput): string {
  const ss = input.evidence?.sample_size;
  const fresh = input.evidence?.freshness_days;
  const conf = input.confidence != null ? `${Math.round(input.confidence * 100)}%` : null;
  const lift = input.expectedLift != null ? `${(input.expectedLift * 100).toFixed(1)}%` : null;
  const risk = input.risk != null
    ? (input.risk < 0.2 ? "low" : input.risk < 0.5 ? "moderate" : "high")
    : null;

  const parts: string[] = [input.summary.trim().replace(/\.$/, "") + "."];
  if (ss != null) {
    parts.push(`Based on ${ss} comparable signals${fresh != null ? ` from the last ${fresh} days` : ""}.`);
  }
  if (lift) parts.push(`Expected lift ${lift}.`);
  if (conf) parts.push(`Confidence ${conf}.`);
  if (risk) parts.push(`Risk is ${risk}.`);
  if (input.reasonCodes?.length) {
    parts.push(`Key drivers: ${input.reasonCodes.slice(0, 6).join(", ").toLowerCase().replace(/_/g, " ")}.`);
  }
  return parts.join(" ");
}

function explainabilityScore(input: EmitXaiDecisionInput): number {
  let s = 0;
  if (input.reasonCodes?.length) s += 0.25;
  if (input.evidence?.sample_size && input.evidence.sample_size > 0) s += 0.2;
  if (input.evidence?.freshness_days != null) s += 0.1;
  if (input.confidence != null) s += 0.15;
  if (input.expectedLift != null) s += 0.1;
  if (input.alternatives && input.alternatives.length > 0) s += 0.1;
  if (input.counterfactual && Object.keys(input.counterfactual).length > 0) s += 0.1;
  return Math.min(1, s);
}

export async function emitXaiDecision(
  input: EmitXaiDecisionInput,
): Promise<{ id: string | null }> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return { id: null };
    const sb = createClient(url, key);

    // Soft-enforce evidenceSource. Missing / invalid -> default heuristic,
    // log a warning that the coverage view picks up.
    let evidenceSource: XaiEvidenceSource;
    if (isValidEvidenceSource(input.evidenceSource)) {
      evidenceSource = input.evidenceSource;
    } else {
      evidenceSource = "heuristic";
      console.warn(
        `[xai] MISSING evidence_source (defaulted to 'heuristic') engine=${input.sourceEngine} type=${input.decisionType} subject=${input.subjectId ?? "-"}`,
      );
    }

    const row = {
      source_engine: input.sourceEngine,
      decision_type: input.decisionType,
      subject_kind: input.subjectKind ?? null,
      subject_id: input.subjectId ?? null,
      summary: input.summary,
      plain_english: buildPlainEnglish(input),
      reason_codes: input.reasonCodes ?? [],
      evidence: input.evidence ?? {},
      alternatives: input.alternatives ?? [],
      counterfactual: input.counterfactual ?? {},
      confidence: input.confidence ?? null,
      evidence_strength: input.evidenceStrength ?? null,
      risk: input.risk ?? null,
      expected_lift: input.expectedLift ?? null,
      estimated_downside: input.estimatedDownside ?? null,
      expected_metric: input.expectedMetric ?? null,
      evidence_sample_size: input.evidence?.sample_size ?? null,
      evidence_freshness_days: input.evidence?.freshness_days ?? null,
      explainability_score: explainabilityScore(input),
      status: "pending",
      linked_decision_id: input.linkedDecisionId ?? null,
      dedupe_key: input.dedupeKey ?? null,
      evidence_source: evidenceSource,
    };

    const { data, error } = await sb
      .from("pcie2_xai_decisions")
      .upsert(row, { onConflict: "dedupe_key", ignoreDuplicates: false })
      .select("id")
      .maybeSingle();
    if (error) {
      console.warn("[xai] emit failed", error.message);
      return { id: null };
    }
    return { id: (data as { id?: string } | null)?.id ?? null };
  } catch (e) {
    console.warn("[xai] emit exception", (e as Error)?.message);
    return { id: null };
  }
}
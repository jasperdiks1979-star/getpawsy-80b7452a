/**
 * Shared risk vocabulary for operational admin actions (Batch E).
 *
 * Every admin action that can destroy data, spend money, or reach an external
 * system (Pinterest, TikTok, Google, CJ, Stripe) must be classified here and
 * confirmed through the shared dialog. Components must NOT invent their own
 * `window.confirm` wording — that produced inconsistent, under-specified
 * warnings and no fail-closed behaviour.
 */

export type RiskLevel = 'safe' | 'destructive' | 'external' | 'financial';

export interface RiskMeta {
  id: RiskLevel;
  label: string;
  description: string;
  tone: 'neutral' | 'caution' | 'danger';
  /** Typed confirmation required before the action can run. */
  requiresTypedConfirmation: boolean;
}

export const RISK_LEVELS: Record<RiskLevel, RiskMeta> = {
  safe: {
    id: 'safe',
    label: 'SAFE',
    description: 'Read-only or fully reversible. No data is destroyed and nothing leaves this system.',
    tone: 'neutral',
    requiresTypedConfirmation: false,
  },
  destructive: {
    id: 'destructive',
    label: 'DESTRUCTIVE',
    description: 'Deletes or overwrites stored data. This cannot be undone from this screen.',
    tone: 'caution',
    requiresTypedConfirmation: true,
  },
  external: {
    id: 'external',
    label: 'EXTERNAL / LIVE',
    description:
      'Reaches a third-party system (Pinterest, TikTok, Google, CJ). The effect is visible outside GetPawsy and may not be reversible.',
    tone: 'danger',
    requiresTypedConfirmation: true,
  },
  financial: {
    id: 'financial',
    label: 'FINANCIAL',
    description: 'Moves real money or credits (payments, refunds, paid API usage). Irreversible.',
    tone: 'danger',
    requiresTypedConfirmation: true,
  },
};

export const CONFIRM_PHRASE: Record<RiskLevel, string> = {
  safe: '',
  destructive: 'DELETE',
  external: 'PUBLISH LIVE',
  financial: 'CONFIRM MONEY',
};

export interface PreconditionState {
  /** Human label of the precondition, e.g. "Pinterest connection verified". */
  label: string;
  /** true = satisfied, false = failed, null/undefined = unknown (fail closed). */
  satisfied: boolean | null | undefined;
}

export type GateReason = 'ok' | 'precondition_failed' | 'precondition_unknown' | 'confirmation_missing';

export interface GateResult {
  allowed: boolean;
  reason: GateReason;
  /** Preconditions blocking the action, in declaration order. */
  blocking: PreconditionState[];
  message: string;
}

/**
 * Fail-closed gate. An unknown precondition NEVER counts as satisfied — an
 * admin action must not fire because a health check failed to answer.
 */
export function evaluateActionGate(opts: {
  risk: RiskLevel;
  preconditions?: PreconditionState[];
  typedConfirmation?: string;
}): GateResult {
  const meta = RISK_LEVELS[opts.risk];
  const preconditions = opts.preconditions ?? [];

  const failed = preconditions.filter((p) => p.satisfied === false);
  if (failed.length) {
    return {
      allowed: false,
      reason: 'precondition_failed',
      blocking: failed,
      message: `Blocked — ${failed.map((p) => p.label).join(', ')} not satisfied.`,
    };
  }

  const unknown = preconditions.filter((p) => p.satisfied !== true);
  if (unknown.length) {
    return {
      allowed: false,
      reason: 'precondition_unknown',
      blocking: unknown,
      message: `Blocked — could not confirm ${unknown
        .map((p) => p.label)
        .join(', ')}. Unknown state is treated as unsafe.`,
    };
  }

  if (meta.requiresTypedConfirmation) {
    const expected = CONFIRM_PHRASE[opts.risk];
    if ((opts.typedConfirmation ?? '').trim().toUpperCase() !== expected) {
      return {
        allowed: false,
        reason: 'confirmation_missing',
        blocking: [],
        message: `Type ${expected} to confirm this ${meta.label} action.`,
      };
    }
  }

  return { allowed: true, reason: 'ok', blocking: [], message: 'Ready to run.' };
}

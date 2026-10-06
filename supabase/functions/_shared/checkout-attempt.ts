export interface CheckoutAttemptOrder {
  id: string;
  payment_status: string | null;
}

export interface CheckoutAttemptLookup {
  data: CheckoutAttemptOrder | null;
  error: unknown;
}

export interface ResolvedCheckoutAttempt {
  attemptId: string;
  reusableOrder: CheckoutAttemptOrder | null;
}

type LookupAttempt = (attemptId: string) => Promise<CheckoutAttemptLookup>;
type DigestAttempt = (payload: unknown) => Promise<string>;

/**
 * Resolve the durable identity for a checkout request.
 *
 * An unpaid row is the same in-flight attempt and is safe to reuse. Every
 * other state is terminal for attempt reuse: paid, expired, failed, refunded,
 * cancelled, and unknown future states all advance to a new deterministic id.
 */
export async function resolveCheckoutAttempt(
  baseAttemptId: string,
  lookupAttempt: LookupAttempt,
  digestAttempt: DigestAttempt,
  maxGenerations = 100,
): Promise<ResolvedCheckoutAttempt> {
  let attemptId = baseAttemptId;

  for (let generation = 0; generation < maxGenerations; generation++) {
    const lookup = await lookupAttempt(attemptId);
    if (lookup.error) throw lookup.error;
    if (!lookup.data) return { attemptId, reusableOrder: null };
    if (lookup.data.payment_status === "unpaid") {
      return { attemptId, reusableOrder: lookup.data };
    }

    attemptId = await digestAttempt({
      prior_attempt_id: attemptId,
      settled_order_id: lookup.data.id,
    });
  }

  throw new Error("checkout_attempt_chain_limit");
}
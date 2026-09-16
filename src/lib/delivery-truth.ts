/**
 * Delivery truth.
 *
 * There is no measured delivery data for this catalog: no per-destination
 * carrier feed, and the per-product `shipping_time` column has mixed
 * provenance (some values came from supplier files, some from hardcoded
 * importer defaults, some are legacy cross-border defaults). It is therefore
 * NOT authoritative and must never be shown as a promise.
 *
 * The only per-product delivery fact we can evidence is the fulfilment origin:
 * `supplier_warehouse`, which comes from the supplier warehouse records.
 *
 * Rules:
 *  - US warehouse proven  -> state the origin as fact, the transit time only
 *                            as an estimate, and point at checkout for the
 *                            binding answer.
 *  - Origin not proven    -> no speed claim at all. Checkout is the only
 *                            place a delivery answer is given.
 *
 * Nothing here invents a number: the estimate is the single sitewide policy
 * estimate, always labelled as an estimate, never as a guaranteed date.
 */
import { DELIVERY_TIME_STANDARD, PROCESSING_TIME } from '@/lib/shipping-constants';

export type DeliveryEvidence = 'us_warehouse_verified' | 'origin_unverified';

export interface DeliveryTruth {
  evidence: DeliveryEvidence;
  /** True only when we can evidence where the product ships from. */
  originProven: boolean;
  /** Short line for the buy box. */
  line: string;
  /** Longer line for the shipping/FAQ block. */
  detail: string;
}

const US_WAREHOUSES = new Set(['us', 'usa', 'us-west', 'us-east', 'united states']);

export function hasProvenUsOrigin(warehouse?: string | null): boolean {
  if (!warehouse) return false;
  return US_WAREHOUSES.has(warehouse.trim().toLowerCase());
}

/**
 * @param warehouse the product's `supplier_warehouse` value
 */
export function getDeliveryTruth(warehouse?: string | null): DeliveryTruth {
  if (hasProvenUsOrigin(warehouse)) {
    return {
      evidence: 'us_warehouse_verified',
      originProven: true,
      line: `Ships from a US warehouse · orders processed within ${PROCESSING_TIME}`,
      detail:
        `Ships from a US warehouse. Orders are processed within ${PROCESSING_TIME}. ` +
        `Estimated delivery is ${DELIVERY_TIME_STANDARD} after dispatch — your exact ` +
        `shipping option and cost are confirmed at checkout.`,
    };
  }

  return {
    evidence: 'origin_unverified',
    originProven: false,
    line: `Orders processed within ${PROCESSING_TIME} · delivery time confirmed at checkout`,
    detail:
      `Orders are processed within ${PROCESSING_TIME}. We do not have a verified ` +
      `delivery window for this item, so the delivery time and cost are calculated ` +
      `and confirmed at checkout before you pay.`,
  };
}

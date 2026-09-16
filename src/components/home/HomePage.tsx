/**
 * Compatibility export for older imports and rollback references.
 *
 * There is intentionally one homepage implementation. Keeping a separate
 * legacy tree allowed stale dog-first, ranking and delivery copy to return
 * through alternate builds or future route changes.
 */
export { V2HomePage as default } from '@/components/v2/storefront/V2HomePage';
// Canonical list of edge functions that MUST be gated by
// `requireInternalOrAdmin` from ./admin-guard.ts.
//
// The auth integration test iterates this list and asserts that each
// deployed function rejects unauthenticated calls with 401 (and rejects
// a wrong `x-internal-secret` header the same way). Add a new entry here
// whenever you protect another function with the shared guard.
export const GUARDED_EDGE_FUNCTIONS = [
  "aec-executive-council",
  "aee-api",
  "agal-auditor",
  "agd-growth-director",
  "ai-ceo-loop",
  "aos-orchestrator",
  "cmdr-orchestrator",
  "ede-api",
  "gad-api",
  "gbd-api",
  "gcd-api",
  "gcp-api",
  "gkg-api",
  "gmd-api",
  "gpd-api",
  "gpi-api",
  "growth-intelligence-orchestrator",
  "mil-meta-intelligence",
  "pga-overview-sync",
  "roe-api",
  "spe-api",
] as const;

export type GuardedEdgeFunction = (typeof GUARDED_EDGE_FUNCTIONS)[number];
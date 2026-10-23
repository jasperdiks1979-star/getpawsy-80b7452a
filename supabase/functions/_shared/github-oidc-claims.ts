/**
 * Pure claim policy for GitHub Actions OIDC tokens accepted by the
 * Genesis Golden Customer monitor. No shared secret: GitHub signs the token,
 * we only accept this repo's main-branch Production Validation workflow.
 */
export const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
export const GOLDEN_CUSTOMER_AUDIENCE = "getpawsy-golden-customer";
export const ALLOWED_REPOSITORY = "jasperdiks1979-star/getpawsy-80b7452a";
export const ALLOWED_WORKFLOW_PATH = ".github/workflows/production-validation.yml";
export const ALLOWED_REF = "refs/heads/main";

export function isAllowedGoldenCustomerClaims(c: Record<string, unknown>): boolean {
  const aud = c.aud;
  const audOk = Array.isArray(aud) ? aud.includes(GOLDEN_CUSTOMER_AUDIENCE) : aud === GOLDEN_CUSTOMER_AUDIENCE;
  return (
    c.iss === GITHUB_OIDC_ISSUER &&
    audOk &&
    c.repository === ALLOWED_REPOSITORY &&
    c.ref === ALLOWED_REF &&
    typeof c.workflow_ref === "string" &&
    c.workflow_ref === `${ALLOWED_REPOSITORY}/${ALLOWED_WORKFLOW_PATH}@${ALLOWED_REF}`
  );
}

// Analytics Truth Parity probe: separate audience and workflow so a token
// minted for one CI gate can never be replayed against the other.
export const ANALYTICS_PARITY_AUDIENCE = "getpawsy-analytics-truth-parity";
export const ANALYTICS_PARITY_WORKFLOW_PATH = ".github/workflows/analytics-truth-parity.yml";

export function isAllowedAnalyticsParityClaims(c: Record<string, unknown>): boolean {
  const aud = c.aud;
  const audOk = Array.isArray(aud) ? aud.includes(ANALYTICS_PARITY_AUDIENCE) : aud === ANALYTICS_PARITY_AUDIENCE;
  return (
    c.iss === GITHUB_OIDC_ISSUER &&
    audOk &&
    c.repository === ALLOWED_REPOSITORY &&
    c.ref === ALLOWED_REF &&
    typeof c.workflow_ref === "string" &&
    c.workflow_ref === `${ALLOWED_REPOSITORY}/${ANALYTICS_PARITY_WORKFLOW_PATH}@${ALLOWED_REF}`
  );
}

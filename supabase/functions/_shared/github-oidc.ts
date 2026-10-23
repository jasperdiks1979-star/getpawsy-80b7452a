import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.9.6";
import {
  ANALYTICS_PARITY_AUDIENCE,
  GITHUB_OIDC_ISSUER,
  GOLDEN_CUSTOMER_AUDIENCE,
  isAllowedAnalyticsParityClaims,
  isAllowedGoldenCustomerClaims,
} from "./github-oidc-claims.ts";

const JWKS = createRemoteJWKSet(new URL(`${GITHUB_OIDC_ISSUER}/.well-known/jwks`));

/** True only for a valid GitHub-signed token from the allowed workflow. */
export async function isGoldenCustomerCiCaller(req: Request): Promise<boolean> {
  const token = req.headers.get("x-github-oidc") ?? "";
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: GITHUB_OIDC_ISSUER,
      audience: GOLDEN_CUSTOMER_AUDIENCE,
    });
    return isAllowedGoldenCustomerClaims(payload as Record<string, unknown>);
  } catch {
    return false;
  }
}

/** True only for a valid GitHub-signed token from the Analytics Truth Parity workflow. */
export async function isAnalyticsParityCiCaller(req: Request): Promise<boolean> {
  const token = req.headers.get("x-github-oidc") ?? "";
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: GITHUB_OIDC_ISSUER,
      audience: ANALYTICS_PARITY_AUDIENCE,
    });
    return isAllowedAnalyticsParityClaims(payload as Record<string, unknown>);
  } catch {
    return false;
  }
}

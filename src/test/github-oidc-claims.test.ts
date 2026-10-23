import { describe, it, expect } from 'vitest';
import {
  isAllowedGoldenCustomerClaims,
  isAllowedAnalyticsParityClaims,
} from '../../supabase/functions/_shared/github-oidc-claims';

const ok = {
  iss: 'https://token.actions.githubusercontent.com',
  aud: 'getpawsy-golden-customer',
  repository: 'jasperdiks1979-star/getpawsy-80b7452a',
  ref: 'refs/heads/main',
  workflow_ref: 'jasperdiks1979-star/getpawsy-80b7452a/.github/workflows/production-validation.yml@refs/heads/main',
};

describe('golden customer GitHub OIDC claims', () => {
  it('accepts the main-branch Production Validation workflow', () => {
    expect(isAllowedGoldenCustomerClaims(ok)).toBe(true);
  });
  it('rejects another repository (fork)', () => {
    expect(isAllowedGoldenCustomerClaims({ ...ok, repository: 'evil/getpawsy-80b7452a' })).toBe(false);
  });
  it('rejects another branch', () => {
    expect(isAllowedGoldenCustomerClaims({ ...ok, ref: 'refs/heads/feature' })).toBe(false);
  });
  it('rejects another workflow in the same repo', () => {
    expect(isAllowedGoldenCustomerClaims({ ...ok, workflow_ref: 'jasperdiks1979-star/getpawsy-80b7452a/.github/workflows/other.yml@refs/heads/main' })).toBe(false);
  });
  it('rejects wrong audience', () => {
    expect(isAllowedGoldenCustomerClaims({ ...ok, aud: 'sts.amazonaws.com' })).toBe(false);
  });
});

const parityOk = {
  iss: 'https://token.actions.githubusercontent.com',
  aud: 'getpawsy-analytics-truth-parity',
  repository: 'jasperdiks1979-star/getpawsy-80b7452a',
  ref: 'refs/heads/main',
  workflow_ref: 'jasperdiks1979-star/getpawsy-80b7452a/.github/workflows/analytics-truth-parity.yml@refs/heads/main',
};

describe('analytics truth parity GitHub OIDC claims', () => {
  it('accepts the main-branch Analytics Truth Parity workflow', () => {
    expect(isAllowedAnalyticsParityClaims(parityOk)).toBe(true);
  });
  it('rejects a token scoped to the Golden Customer audience (no cross-gate replay)', () => {
    expect(isAllowedAnalyticsParityClaims({ ...parityOk, aud: 'getpawsy-golden-customer' })).toBe(false);
  });
  it('rejects a Golden Customer workflow token with the parity audience (wrong workflow)', () => {
    expect(
      isAllowedAnalyticsParityClaims({
        ...parityOk,
        workflow_ref: 'jasperdiks1979-star/getpawsy-80b7452a/.github/workflows/production-validation.yml@refs/heads/main',
      }),
    ).toBe(false);
  });
  it('rejects another repository (fork)', () => {
    expect(isAllowedAnalyticsParityClaims({ ...parityOk, repository: 'evil/getpawsy-80b7452a' })).toBe(false);
  });
  it('rejects another branch', () => {
    expect(isAllowedAnalyticsParityClaims({ ...parityOk, ref: 'refs/heads/feature' })).toBe(false);
  });
  it('rejects a pull-request ref', () => {
    expect(
      isAllowedAnalyticsParityClaims({
        ...parityOk,
        ref: 'refs/pull/7/merge',
        workflow_ref: 'jasperdiks1979-star/getpawsy-80b7452a/.github/workflows/analytics-truth-parity.yml@refs/pull/7/merge',
      }),
    ).toBe(false);
  });
  it('rejects a forged issuer', () => {
    expect(isAllowedAnalyticsParityClaims({ ...parityOk, iss: 'https://evil.example.com' })).toBe(false);
  });
  it('rejects missing claims (empty object)', () => {
    expect(isAllowedAnalyticsParityClaims({})).toBe(false);
  });
  it('rejects a missing workflow_ref', () => {
    const { workflow_ref, ...rest } = parityOk;
    expect(isAllowedAnalyticsParityClaims(rest)).toBe(false);
  });
});

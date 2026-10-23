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

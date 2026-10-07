import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

// ── Issue 1 — analytics load shedding ───────────────────────────────────────
describe('analytics DB load shedding', () => {
  const canonical = read('supabase/functions/analytics-canonical/index.ts');

  it('runs every scheduled table scan under a compute budget', () => {
    expect(canonical).toContain('const COMPUTE_BUDGET_MS');
    expect(canonical).toContain('const budgetSpent =');
    // shared ingest scanner (events + visitor_activity) and canonical_sessions loop
    expect(canonical).toMatch(/if \(o\.budgetSpent\(\)\)/);
    const guards = canonical.match(/if \(budgetSpent\(\)\)/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(1);
  });

  it('caps scan concurrency so analytics cannot monopolise the pool', () => {
    expect(canonical).toContain('const SCAN_WAVE = 3');
    expect(canonical).not.toMatch(/const (PAGE_WAVE|VA_WAVE|CS_WAVE) = 6/);
  });

  it('every heavy scan stays bounded by the requested window', () => {
    const idx = canonical.indexOf('.from("canonical_sessions")');
    expect(idx).toBeGreaterThan(-1);
    expect(canonical.slice(idx, idx + 400)).toMatch(/\.gte\(/);
    // chunkable ingest scanner: every page is window-bounded on both sides
    expect(canonical).toMatch(/supabase\.from\(table\)\.select\(cols\)\.gte\(tsCol, since\)/);
    expect(canonical).toMatch(/closed \? q\.lte\(tsCol, until\) : q\.lt\(tsCol, until\)/);
    expect(canonical).toContain('await scan("canonical_events"');
    expect(canonical).toContain('"visitor_activity",');
  });

  it('reports truncated scans instead of silently shrinking the window', () => {
    expect(canonical).toContain('truncated_scans');
  });

  it('health probe never asks for an exact count on hot tables', () => {
    const probe = read('supabase/functions/analytics-health-probe/index.ts')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(probe).not.toContain('count: "exact"');
  });
});

// ── Issues 2 + 4 — variant-safe cart, enforced centrally ────────────────────
describe('central variant-safe cart guard', () => {
  const ctx = read('src/contexts/CartContext.tsx');

  it('guards every addItem caller inside the cart context', () => {
    expect(ctx).toContain('enforceVariantSafety');
    expect(ctx).toContain('void enforceVariantSafety(newItem)');
    expect(ctx).toContain('cartLineNeedsVariantChoice');
  });

  it('removes the malformed line and routes to the product page only on proof', () => {
    const fn = ctx.slice(ctx.indexOf('const enforceVariantSafety'), ctx.indexOf('const addItem'));
    expect(fn.match(/setItems\(prev => prev\.filter/g)?.length).toBe(1);
    expect(fn).toContain('quickAddProductUrl');
    expect(fn).toContain('Choose an option to continue');
  });

  it('a transient verification failure keeps the line (checkout re-verifies)', () => {
    const fn = ctx.slice(ctx.indexOf('const enforceVariantSafety'), ctx.indexOf('const addItem'));
    expect(fn).toContain('line kept, checkout re-verifies');
    expect(fn).not.toContain("throw error ?? new Error('Option metadata unavailable')");
  });

  it('keeps cart and checkout recovery paths wired', () => {
    expect(read('src/pages/Cart.tsx')).toContain('useCartVariantIssues');
    expect(read('src/pages/Checkout.tsx')).toContain('useCartVariantIssues');
  });
});

// ── Issue 3 — AOS / ARIE schema contract ────────────────────────────────────
describe('AOS incident schema contract', () => {
  const files = [
    'supabase/functions/aos-orchestrator/index.ts',
    'supabase/functions/aos-engine-integrator/index.ts',
  ];

  it('never queries the non-existent title/status columns', () => {
    for (const f of files) {
      const src = read(f);
      const selects = src.match(/from\("arie_incidents"\)[\s\S]{0,200}/g) ?? [];
      expect(selects.length, f).toBeGreaterThan(0);
      for (const s of selects) {
        expect(s, f).not.toMatch(/\btitle\b/);
        expect(s, f).not.toMatch(/eq\("status"/);
      }
    }
  });

  it('treats resolved_at IS NULL as the open-incident filter', () => {
    expect(read(files[0])).toContain('.is("resolved_at", null)');
  });

  it('does not report a failed incident read as perfect health', () => {
    const src = read(files[0]);
    expect(src).toContain('arieErr ? 0.5');
    expect(read(files[1])).toContain('degraded');
  });
});

describe('ARIE incident shared contract', () => {
  it('derives title and category from real columns', async () => {
    const mod = await import('../../supabase/functions/_shared/arieIncidents.ts');
    expect(mod.ARIE_INCIDENT_COLUMNS).not.toContain('title');
    expect(mod.ARIE_INCIDENT_COLUMNS.split(',')).not.toContain('status');
    expect(mod.incidentTitle({ type: 'revenue_drop', root_cause: 'checkout 500s' }))
      .toBe('revenue_drop: checkout 500s');
    expect(mod.incidentCategory({ type: 'checkout_failure', root_cause: null }))
      .toBe('checkout_broken');
    expect(mod.incidentCategory({ type: 'pixel_gap', root_cause: 'tracking lost' }))
      .toBe('tracking_failure');
    expect(mod.isOpenIncident({ resolved_at: null })).toBe(true);
    expect(mod.isOpenIncident({ resolved_at: '2026-01-01T00:00:00Z' })).toBe(false);
  });
});

describe('AOS integrator opportunity/product-score schema contract', () => {
  const src = read('supabase/functions/aos-engine-integrator/index.ts');
  it('reads revenue snapshots by the current daily-rollup schema and reports query failures', () => {
    const start = src.indexOf('from("pcie_v2_revenue_snapshots")');
    const s = src.slice(start, start + 700);
    expect(s).toContain('snapshot_date, revenue_per_style, roas_per_family, totals, created_at');
    expect(s).not.toContain('creative_id, revenue_cents, roas');
    expect(s).toContain('if (error) throw error');
    expect(s).toContain('"revenue_intelligence"');
  });
  it('reads agd_opportunities by business_value_score, not a missing score column', () => {
    const s = src.slice(src.indexOf('from("agd_opportunities")'), src.indexOf('from("agd_opportunities")') + 220);
    expect(s).toContain('business_value_score');
    expect(s).not.toMatch(/"id, title, score/);
  });
  it('reads pie_product_scores by computed_at, not a missing updated_at column', () => {
    const s = src.slice(src.indexOf('from("pie_product_scores")'), src.indexOf('from("pie_product_scores")') + 220);
    expect(s).toContain('computed_at');
    expect(s).not.toContain('updated_at');
  });
});

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_NAV_ITEMS, ADMIN_NAV_SECTIONS } from '@/components/admin/admin-nav';
import { evaluateActionGate, RISK_LEVELS, CONFIRM_PHRASE } from '@/lib/riskyActions';
import { evaluateFreshness, healthWording, CADENCES } from '@/lib/freshness';

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const appSrc = read('src/App.tsx');
const routePaths = new Set(
  [...appSrc.matchAll(/path="([^"]+)"/g)].map((m) => m[1].replace(/^\//, '')),
);

describe('D — admin navigation / information architecture', () => {
  it('every sidebar link appears exactly once across all sections', () => {
    const seen = ADMIN_NAV_ITEMS.map((i) => i.to);
    const dupes = seen.filter((t, i) => seen.indexOf(t) !== i);
    expect(dupes).toEqual([]);
  });

  it('every section has a title and at least one item', () => {
    for (const s of ADMIN_NAV_SECTIONS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.items.length).toBeGreaterThan(0);
    }
  });

  it('section ids are unique', () => {
    const ids = ADMIN_NAV_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every sidebar link resolves to a registered route', () => {
    const missing = ADMIN_NAV_ITEMS.filter((item) => {
      if (item.to === '/admin') return false;
      const rel = item.to.replace(/^\/admin\/?/, '');
      return !(routePaths.has(rel) || routePaths.has(item.to.replace(/^\//, '')));
    }).map((i) => i.to);
    expect(missing).toEqual([]);
  });

  it('AdminLayout renders the shared section config, not an inline list', () => {
    const layout = read('src/components/admin/AdminLayout.tsx');
    expect(layout).toContain('ADMIN_NAV_SECTIONS');
    expect(layout).not.toContain('const navItems = [');
  });

  it('nav labels carry no decorative star prefixes', () => {
    expect(ADMIN_NAV_ITEMS.some((i) => i.label.includes('★'))).toBe(false);
  });
});

describe('E — operational write-safety gate', () => {
  it('safe actions need no typed confirmation', () => {
    expect(RISK_LEVELS.safe.requiresTypedConfirmation).toBe(false);
    expect(evaluateActionGate({ risk: 'safe' }).allowed).toBe(true);
  });

  it.each(['destructive', 'external', 'financial'] as const)(
    '%s actions require the exact typed phrase',
    (risk) => {
      expect(evaluateActionGate({ risk }).allowed).toBe(false);
      expect(evaluateActionGate({ risk, typedConfirmation: 'yes' }).reason).toBe('confirmation_missing');
      expect(evaluateActionGate({ risk, typedConfirmation: CONFIRM_PHRASE[risk] }).allowed).toBe(true);
      // case-insensitive but content-exact
      expect(
        evaluateActionGate({ risk, typedConfirmation: CONFIRM_PHRASE[risk].toLowerCase() }).allowed,
      ).toBe(true);
    },
  );

  it('fails closed when a precondition is unknown', () => {
    const gate = evaluateActionGate({
      risk: 'external',
      preconditions: [{ label: 'Pinterest connection verified', satisfied: undefined }],
      typedConfirmation: CONFIRM_PHRASE.external,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe('precondition_unknown');
  });

  it('blocks on a failed precondition before asking for confirmation', () => {
    const gate = evaluateActionGate({
      risk: 'destructive',
      preconditions: [{ label: 'Backup present', satisfied: false }],
      typedConfirmation: CONFIRM_PHRASE.destructive,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe('precondition_failed');
  });

  it('allows only when every precondition is explicitly satisfied', () => {
    const gate = evaluateActionGate({
      risk: 'external',
      preconditions: [{ label: 'Job safe to publish', satisfied: true }],
      typedConfirmation: CONFIRM_PHRASE.external,
    });
    expect(gate.allowed).toBe(true);
  });

  it('live-publish and destructive admin surfaces use the shared dialog, not window.confirm', () => {
    const files = [
      'src/components/admin/cinematic/CinematicAdsSafetyPanel.tsx',
      'src/pages/admin/PinterestLivePinRepair.tsx',
      'src/components/admin/MerchantCleanupDiagnostics.tsx',
    ];
    for (const f of files) {
      const src = read(f);
      expect(src).toContain('RiskyActionButton');
    }
    expect(read('src/pages/admin/PinterestLivePinRepair.tsx')).not.toMatch(/confirm\(\s*"Publish 25/);
    expect(read('src/components/admin/cinematic/CinematicAdsSafetyPanel.tsx')).not.toMatch(
      /confirm\(\s*"Publish this pin/,
    );
  });
});

describe('F — cadence-aware freshness', () => {
  const now = Date.UTC(2026, 8, 16, 12, 0, 0);
  const minutesAgo = (m: number) => new Date(now - m * 60000).toISOString();

  it('missing timestamp is unknown and may never claim live', () => {
    const f = evaluateFreshness(null, CADENCES.hourly, now);
    expect(f.state).toBe('unknown');
    expect(f.canClaimLive).toBe(false);
  });

  it('unreadable timestamp is unknown', () => {
    expect(evaluateFreshness('not-a-date', CADENCES.hourly, now).state).toBe('unknown');
  });

  it('same age is fresh for a nightly job and expired for a 5-minute monitor', () => {
    const twentyHours = minutesAgo(20 * 60);
    expect(evaluateFreshness(twentyHours, CADENCES.nightly, now).state).toBe('fresh');
    expect(evaluateFreshness(twentyHours, CADENCES.realtime, now).state).toBe('expired');
  });

  it('grades aging, stale and expired by cadence multiples', () => {
    expect(evaluateFreshness(minutesAgo(30), CADENCES.hourly, now).state).toBe('fresh');
    expect(evaluateFreshness(minutesAgo(90), CADENCES.hourly, now).state).toBe('aging');
    expect(evaluateFreshness(minutesAgo(240), CADENCES.hourly, now).state).toBe('stale');
    expect(evaluateFreshness(minutesAgo(600), CADENCES.hourly, now).state).toBe('expired');
  });

  it('only fresh data may claim live', () => {
    for (const m of [90, 240, 600]) {
      expect(evaluateFreshness(minutesAgo(m), CADENCES.hourly, now).canClaimLive).toBe(false);
    }
    expect(evaluateFreshness(minutesAgo(5), CADENCES.hourly, now).canClaimLive).toBe(true);
  });

  it('never says "healthy" from stale data', () => {
    const stale = evaluateFreshness(minutesAgo(600), CADENCES.hourly, now);
    const w = healthWording({ passed: true, freshness: stale, subject: 'Ingestion' });
    expect(w.label).not.toContain('healthy');
    expect(w.label).toContain('last known result');

    const fresh = evaluateFreshness(minutesAgo(5), CADENCES.hourly, now);
    expect(healthWording({ passed: true, freshness: fresh, subject: 'Ingestion' }).label).toContain('healthy');
    expect(healthWording({ passed: false, freshness: fresh, subject: 'Ingestion' }).label).toContain('failing');
    expect(healthWording({ passed: null, freshness: fresh, subject: 'Ingestion' }).label).toContain('no verdict');
  });

  it('Analytics Health gates its status pill on freshness', () => {
    const src = read('src/pages/admin/AnalyticsHealthPage.tsx');
    expect(src).toContain('evaluateFreshness');
    expect(src).toContain('last known');
  });
});

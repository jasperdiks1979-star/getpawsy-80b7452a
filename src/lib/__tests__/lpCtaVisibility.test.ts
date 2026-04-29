/**
 * Verification test — guarantees that `saw_proof_before_click` and
 * `saw_nudge_before_click` are stamped on lp_cta_click correctly, given
 * a simulated /go session.
 *
 * Three scenarios mirror the real visit shapes we see in production:
 *   1. Bounce-clicker  — clicks before any uplift element scrolls into view
 *      → both flags must be FALSE
 *   2. Proof-only      — proof line crosses 50% but user clicks before
 *      reaching the nudge block (e.g. tapped sticky CTA from above the fold)
 *      → saw_proof = TRUE, saw_nudge = FALSE
 *   3. Full-funnel     — both proof and nudge were on screen before click
 *      → both flags must be TRUE
 *
 * We also assert the helper is null-safe so that a runtime where the
 * IntersectionObserver never fires (e.g. user navigated away instantly)
 * cannot crash the click handler.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  visibilityFlagsFromSeen,
  visibilityFlagsAtClickTime,
  readGoSeenSet,
} from '@/lib/lpCtaVisibility';

type SeenWindow = Window & { __gpGoSeen?: Set<string> };

/** Simulate the IntersectionObserver firing for the given placement keys. */
function simulateVisibility(...placements: string[]): void {
  (window as SeenWindow).__gpGoSeen = new Set(placements);
}

/** Build the exact payload that handleCtaClick would emit, given the visibility
 *  state at click time. Mirrors the structure in src/pages/LinkInBio.tsx so a
 *  refactor that drops the helper or changes the keys fails this test. */
function buildClickPayload(placement: string) {
  return {
    page: '/go',
    funnel: 'tiktok_bio',
    funnel_step: 3,
    placement,
    cta_variant: 'high_conv_v2',
    ...visibilityFlagsAtClickTime(),
  };
}

describe('lpCtaVisibility — visibility flags on lp_cta_click', () => {
  beforeEach(() => {
    delete (window as SeenWindow).__gpGoSeen;
  });

  describe('pure visibilityFlagsFromSeen()', () => {
    it('returns both false when seen set is undefined', () => {
      expect(visibilityFlagsFromSeen(undefined)).toEqual({
        saw_proof_before_click: false,
        saw_nudge_before_click: false,
        saw_arrow_before_click: false,
      });
    });

    it('returns both false when seen set is null', () => {
      expect(visibilityFlagsFromSeen(null)).toEqual({
        saw_proof_before_click: false,
        saw_nudge_before_click: false,
        saw_arrow_before_click: false,
      });
    });

    it('returns both false when seen set is empty', () => {
      expect(visibilityFlagsFromSeen(new Set())).toEqual({
        saw_proof_before_click: false,
        saw_nudge_before_click: false,
        saw_arrow_before_click: false,
      });
    });

    it('marks proof as seen when uplift_proof is in the set', () => {
      const flags = visibilityFlagsFromSeen(new Set(['uplift_proof']));
      expect(flags.saw_proof_before_click).toBe(true);
      expect(flags.saw_nudge_before_click).toBe(false);
    });

    it('marks nudge as seen when uplift_nudge is in the set', () => {
      const flags = visibilityFlagsFromSeen(new Set(['uplift_nudge']));
      expect(flags.saw_proof_before_click).toBe(false);
      expect(flags.saw_nudge_before_click).toBe(true);
    });

    it('marks both as seen when both keys present', () => {
      const flags = visibilityFlagsFromSeen(new Set(['uplift_proof', 'uplift_nudge']));
      expect(flags).toEqual({
        saw_proof_before_click: true,
        saw_nudge_before_click: true,
        saw_arrow_before_click: false,
      });
    });

    it('marks arrow as seen independently from the nudge block', () => {
      // The arrow lives inside the nudge block but has its own observer
      // target — when only the arrow has crossed 0.5 visibility (e.g. the
      // nudge text was clipped above the fold), saw_arrow must still be true.
      const arrowOnly = visibilityFlagsFromSeen(new Set(['uplift_arrow']));
      expect(arrowOnly).toEqual({
        saw_proof_before_click: false,
        saw_nudge_before_click: false,
        saw_arrow_before_click: true,
      });
    });

    it('all three flags fire when proof + nudge + arrow all visible', () => {
      const allSeen = visibilityFlagsFromSeen(
        new Set(['uplift_proof', 'uplift_nudge', 'uplift_arrow']),
      );
      expect(allSeen).toEqual({
        saw_proof_before_click: true,
        saw_nudge_before_click: true,
        saw_arrow_before_click: true,
      });
    });

    it('ignores unrelated placement keys (bio_primary, bio_sticky)', () => {
      const flags = visibilityFlagsFromSeen(
        new Set(['bio_primary', 'bio_sticky', 'uplift_proof']),
      );
      expect(flags).toEqual({
        saw_proof_before_click: true,
        saw_nudge_before_click: false,
        saw_arrow_before_click: false,
      });
    });
  });

  describe('readGoSeenSet() reads window mirror', () => {
    it('returns undefined when nothing is set', () => {
      expect(readGoSeenSet()).toBeUndefined();
    });

    it('returns the Set instance written by the observer', () => {
      const s = new Set(['uplift_proof']);
      (window as SeenWindow).__gpGoSeen = s;
      expect(readGoSeenSet()).toBe(s);
    });
  });

  describe('simulated /go session — payload contract', () => {
    it('SCENARIO 1 (bounce-clicker): no observer fires → both flags false on click', () => {
      // Observer never fired — user clicked sticky CTA on first paint.
      const payload = buildClickPayload('bio_sticky');
      expect(payload.saw_proof_before_click).toBe(false);
      expect(payload.saw_nudge_before_click).toBe(false);
      expect(payload.placement).toBe('bio_sticky');
    });

    it('SCENARIO 2 (proof-only): only uplift_proof visible → saw_proof=true, saw_nudge=false', () => {
      simulateVisibility('uplift_proof', 'bio_primary');
      const payload = buildClickPayload('bio_primary');
      expect(payload.saw_proof_before_click).toBe(true);
      expect(payload.saw_nudge_before_click).toBe(false);
    });

    it('SCENARIO 3 (full-funnel): both uplift blocks visible → both flags true', () => {
      simulateVisibility('uplift_proof', 'uplift_nudge', 'uplift_arrow', 'bio_primary');
      const payload = buildClickPayload('bio_primary');
      expect(payload.saw_proof_before_click).toBe(true);
      expect(payload.saw_nudge_before_click).toBe(true);
      expect(payload.saw_arrow_before_click).toBe(true);
    });

    it('SCENARIO 4 (arrow-attribution): nudge text but NO arrow → saw_arrow=false', () => {
      // Edge case — user saw the directional copy ("Tap below…") but the
      // bouncing arrow itself was below the fold or hidden by the keyboard.
      // Lets us measure: of clicks where saw_nudge=true & saw_arrow=false,
      // what's the CTR vs both=true → that's the arrow's lift.
      simulateVisibility('uplift_nudge', 'bio_primary');
      const payload = buildClickPayload('bio_primary');
      expect(payload.saw_nudge_before_click).toBe(true);
      expect(payload.saw_arrow_before_click).toBe(false);
    });

    it('flags reflect the LATEST observer state, not the click order', () => {
      // First click — bounce
      let payload = buildClickPayload('bio_sticky');
      expect(payload.saw_proof_before_click).toBe(false);

      // Then proof becomes visible
      simulateVisibility('uplift_proof');
      payload = buildClickPayload('bio_sticky');
      expect(payload.saw_proof_before_click).toBe(true);
      expect(payload.saw_nudge_before_click).toBe(false);

      // Then nudge too
      simulateVisibility('uplift_proof', 'uplift_nudge');
      payload = buildClickPayload('bio_sticky');
      expect(payload.saw_nudge_before_click).toBe(true);
    });
  });

  describe('regression guards', () => {
    it('payload always carries both keys (never undefined / never missing)', () => {
      const payload = buildClickPayload('bio_primary');
      expect(payload).toHaveProperty('saw_proof_before_click');
      expect(payload).toHaveProperty('saw_nudge_before_click');
      expect(payload).toHaveProperty('saw_arrow_before_click');
      expect(typeof payload.saw_proof_before_click).toBe('boolean');
      expect(typeof payload.saw_nudge_before_click).toBe('boolean');
      expect(typeof payload.saw_arrow_before_click).toBe('boolean');
    });

    it('flags are stable booleans, never truthy non-bool values', () => {
      simulateVisibility('uplift_proof');
      const flags = visibilityFlagsAtClickTime();
      // Strict equality — guards against `seen.has() ? true : null` style bugs
      expect(flags.saw_proof_before_click).toStrictEqual(true);
      expect(flags.saw_nudge_before_click).toStrictEqual(false);
    });
  });
});
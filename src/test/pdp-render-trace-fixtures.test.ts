import { describe, it, expect } from 'vitest';
import {
  CANONICAL_GOLDEN_EXAMPLES,
  DEFAULT_RENDER_DURATIONS,
  GOOGLEBOT_UA,
  PDP_RENDER_STATES,
  buildPdpRenderTracePageUrl,
  buildPdpRenderTracePayload,
  buildPdpRenderTraceUaSuffix,
  buildPdpRenderTraceUserAgent,
  extractPdpRenderTraceState,
  pdpRenderTraceUaTagRegex,
} from './fixtures/pdpRenderTraceTags';

/**
 * Self-tests for the pdp-render-trace fixture builders + a parity check
 * against the Deno mirror that the edge-function tests use.
 *
 * If a future format tweak makes the two diverge, this suite fails fast
 * with a clear diff rather than letting the runtimes silently disagree.
 */
describe('pdp-render-trace fixture builders', () => {
  describe('canonical golden examples', () => {
    for (const state of PDP_RENDER_STATES) {
      it(`re-derives the ${state} golden UA suffix and pageUrl`, () => {
        const golden = CANONICAL_GOLDEN_EXAMPLES[state];
        expect(buildPdpRenderTraceUaSuffix(state, golden.durations)).toBe(
          golden.expectedUaSuffix,
        );
        expect(
          buildPdpRenderTracePageUrl(golden.slug, state, golden.durations),
        ).toBe(golden.expectedPageUrl);
      });
    }
  });

  describe('shell-specific shape rules', () => {
    it('shell suffix omits t_shell entirely', () => {
      const ua = buildPdpRenderTraceUaSuffix('shell', { tMountMs: 0 });
      expect(ua).toBe('[pdp-render-trace:shell t_mount=0ms]');
      expect(ua).not.toContain('t_shell=');
    });

    it('throws if shell is given a stray tSinceShellMs', () => {
      expect(() =>
        buildPdpRenderTraceUaSuffix('shell', { tMountMs: 0, tSinceShellMs: 50 }),
      ).toThrow(/must NOT carry tSinceShellMs/);
    });

    it('throws if rendered/timeout is missing tSinceShellMs', () => {
      for (const state of ['rendered', 'timeout'] as const) {
        expect(() =>
          buildPdpRenderTraceUaSuffix(state, { tMountMs: 100 }),
        ).toThrow(/requires tSinceShellMs/);
      }
    });
  });

  describe('numeric clamping & rounding (mirrors hook behaviour)', () => {
    it('clamps negatives to zero and rounds floats', () => {
      const suffix = buildPdpRenderTraceUaSuffix('rendered', {
        tMountMs: -42.7,
        tSinceShellMs: 119.6,
      });
      expect(suffix).toBe('[pdp-render-trace:rendered t_mount=0ms t_shell=120ms]');
    });

    it('treats non-finite values as zero rather than emitting NaN', () => {
      const suffix = buildPdpRenderTraceUaSuffix('shell', {
        tMountMs: Number.NaN,
      });
      expect(suffix).toBe('[pdp-render-trace:shell t_mount=0ms]');
    });
  });

  describe('full payload + assertion helpers', () => {
    it('builds a payload that satisfies its own state-specific regex', () => {
      for (const state of PDP_RENDER_STATES) {
        const payload = buildPdpRenderTracePayload(
          'helper-slug',
          state,
          DEFAULT_RENDER_DURATIONS[state],
        );
        expect(payload.userAgent).toMatch(pdpRenderTraceUaTagRegex(state));
        // Cross-contamination guard: a state-specific regex must not match
        // any of the other states.
        for (const other of PDP_RENDER_STATES) {
          if (other === state) continue;
          expect(payload.userAgent).not.toMatch(
            pdpRenderTraceUaTagRegex(other),
          );
        }
        expect(payload.pageUrl).toContain(`/product/helper-slug`);
        expect(payload.pageUrl).toContain(`_render=${state}`);
      }
    });

    it('extractPdpRenderTraceState round-trips through buildPdpRenderTraceUserAgent', () => {
      for (const state of PDP_RENDER_STATES) {
        const ua = buildPdpRenderTraceUserAgent(
          state,
          DEFAULT_RENDER_DURATIONS[state],
        );
        expect(extractPdpRenderTraceState(ua)).toBe(state);
      }
    });

    it('extractor returns null for an unrelated UA', () => {
      expect(extractPdpRenderTraceState(GOOGLEBOT_UA)).toBeNull();
    });
  });

  describe('parity with the Deno-side mirror', () => {
    // The Deno fixture exports the SAME `CANONICAL_GOLDEN_EXAMPLES` constant.
    // We re-import it here through a dynamic require so this test fails if
    // the file ever drifts. Vitest runs in node so a synchronous require()
    // works for plain .ts re-exports.
    it('shares identical canonical golden examples with the Deno mirror', async () => {
      const denoMirror = await import(
        '../../supabase/functions/log-crawler-visit/_fixtures/pdp_render_trace_tags'
      );
      expect(denoMirror.CANONICAL_GOLDEN_EXAMPLES).toEqual(
        CANONICAL_GOLDEN_EXAMPLES,
      );
    });
  });
});
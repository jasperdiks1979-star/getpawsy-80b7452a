/**
 * CLS / reflow guard for the bouncing arrow on /go.
 *
 * The arrow lives directly above the primary CTA. If its animation ever
 * mutates a layout-affecting property (height, width, margin, padding,
 * font-size, top/bottom, etc.) the CTA below it would jump on every
 * keyframe — that's a Cumulative Layout Shift event on every visit.
 *
 * This test parses src/index.css and asserts:
 *   1. `.gp-arrow-bounce` reserves a fixed inline-block box (display +
 *      width + height + line-height) so the surrounding flex column
 *      cannot collapse around it during animation.
 *   2. The `gp-arrow-bounce` @keyframes only ever touches `transform`
 *      and `opacity` — both of which are composited by the browser and
 *      are guaranteed not to trigger layout.
 *   3. The `prefers-reduced-motion` fallback uses a static `transform`
 *      offset (not `top` / `margin`) so it cannot shift siblings either.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS_PATH = resolve(__dirname, '../../index.css');
const css = readFileSync(CSS_PATH, 'utf8');

/** Extract the body of a `@keyframes <name> { ... }` block. */
function extractKeyframes(name: string): string {
  const re = new RegExp(`@keyframes\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm');
  const match = css.match(re);
  if (!match) throw new Error(`@keyframes ${name} not found in index.css`);
  return match[1];
}

/** Extract the body of a top-level rule like `.foo { ... }` (first match). */
function extractRule(selector: string): string {
  // Escape `.` for the regex.
  const escaped = selector.replace(/\./g, '\\.');
  const re = new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm');
  const match = css.match(re);
  if (!match) throw new Error(`Rule ${selector} not found in index.css`);
  return match[1];
}

/** Pull every `property: value;` declaration out of a rule body. */
function declarations(body: string): Array<{ prop: string; value: string }> {
  return body
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d.length > 0 && !d.startsWith('/*'))
    .map((d) => {
      const idx = d.indexOf(':');
      return {
        prop: d.slice(0, idx).trim().toLowerCase(),
        value: d.slice(idx + 1).trim(),
      };
    });
}

/**
 * Properties that, when animated/transitioned, force the browser to
 * recompute layout for the element AND its siblings. This is the
 * non-exhaustive-but-conservative blocklist for keyframes.
 */
const LAYOUT_AFFECTING = new Set([
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'top',
  'right',
  'bottom',
  'left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border',
  'border-width',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'font-size',
  'line-height',
  'display',
  'position',
  'float',
  'flex',
  'flex-basis',
  'gap',
]);

describe('gp-arrow-bounce — CLS / reflow guard', () => {
  it('reserves a fixed inline-block box so animation cannot reflow neighbors', () => {
    const body = extractRule('.gp-arrow-bounce');
    const decls = declarations(body);
    const map = new Map(decls.map((d) => [d.prop, d.value]));

    // Inline-block ensures the box participates in the flex column with a
    // deterministic size — `inline` would let the glyph's metrics change
    // the line box height during animation.
    expect(map.get('display')).toBe('inline-block');

    // A fixed width + height (in em or px, doesn't matter) means transform
    // changes never resize the parent flex item.
    expect(map.has('width')).toBe(true);
    expect(map.has('height')).toBe(true);
    expect(map.has('line-height')).toBe(true);

    // `will-change: transform, opacity` is a strong signal to the browser
    // to promote the arrow to its own compositor layer — without it some
    // engines fall back to repainting the parent on each frame.
    expect(map.get('will-change')).toMatch(/transform/);
    expect(map.get('will-change')).toMatch(/opacity/);
  });

  it('only animates transform + opacity — never a layout-affecting property', () => {
    const body = extractKeyframes('gp-arrow-bounce');

    // Every declaration inside every keyframe step must be transform or
    // opacity. We collect them all and assert the set.
    const decls = declarations(
      // Strip the keyframe selectors (`0%`, `45%`, etc.) and their braces
      // so `declarations()` sees a flat list of property:value pairs.
      body.replace(/[0-9.%,\s]+\{/g, '').replace(/\}/g, ''),
    );

    expect(decls.length).toBeGreaterThan(0);

    for (const { prop } of decls) {
      expect(['transform', 'opacity']).toContain(prop);
      expect(LAYOUT_AFFECTING.has(prop)).toBe(false);
    }
  });

  it('reduced-motion fallback offsets via transform, not top/margin', () => {
    // Grab the prefers-reduced-motion media block in full so we can
    // inspect the .gp-arrow-bounce override inside it.
    const mediaMatch = css.match(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/m,
    );
    expect(mediaMatch).not.toBeNull();
    const mediaBody = mediaMatch![1];

    const arrowMatch = mediaBody.match(/\.gp-arrow-bounce\s*\{([\s\S]*?)\n\s*\}/);
    expect(arrowMatch).not.toBeNull();
    const decls = declarations(arrowMatch![1]);

    // Animation must be explicitly cancelled.
    const animation = decls.find((d) => d.prop === 'animation');
    expect(animation?.value).toBe('none');

    // The visual nudge toward the CTA is allowed via `transform`, but
    // never via positional/box properties that would shove the CTA down.
    for (const { prop } of decls) {
      if (prop === 'transform') continue; // explicitly allowed
      expect(['top', 'bottom', 'margin', 'margin-top', 'margin-bottom']).not.toContain(prop);
    }
  });
});
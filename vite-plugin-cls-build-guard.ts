/**
 * Vite Build Guard — prevents shipping broken performance configurations.
 *
 * Checks at build time:
 * 1. VITE_IMAGE_OPTIMIZER_PROVIDER is not "none"
 * 2. index.html contains a hero image preload
 * 3. JS chunk sizes within budget
 */
import type { Plugin } from 'vite';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const JS_TOTAL_BUDGET_KB = 220;
const LARGEST_CHUNK_BUDGET_KB = 120;

export default function clsBuildGuard(): Plugin {
  return {
    name: 'cls-build-guard',
    enforce: 'pre',
    buildStart() {
      if (process.env.NODE_ENV !== 'production') return;

      const provider = process.env.VITE_IMAGE_OPTIMIZER_PROVIDER;
      if (provider === 'none') {
        this.error(
          '[BUILD-GUARD] VITE_IMAGE_OPTIMIZER_PROVIDER is "none" — ' +
          'this will cause LCP regressions. Set to "cloudinary" or remove the variable.'
        );
      }

      try {
        const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8');
        if (!html.includes('rel="preload"') || !html.includes('as="image"')) {
          this.warn(
            '[BUILD-GUARD] No image preload found in index.html — ' +
            'hero LCP image should have a <link rel="preload"> tag.'
          );
        }
      } catch {
        // non-fatal
      }
    },
    generateBundle(_options, bundle) {
      if (process.env.NODE_ENV !== 'production') return;

      let totalJS = 0;
      let largestChunk = 0;
      let largestName = '';

      for (const [name, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk') {
          const sizeKB = Buffer.byteLength(chunk.code, 'utf-8') / 1024;
          totalJS += sizeKB;
          if (sizeKB > largestChunk) {
            largestChunk = sizeKB;
            largestName = name;
          }
        }
      }

      if (largestChunk > LARGEST_CHUNK_BUDGET_KB) {
        this.warn(
          `[BUILD-GUARD] Largest JS chunk "${largestName}" is ${Math.round(largestChunk)}KB ` +
          `(budget: ${LARGEST_CHUNK_BUDGET_KB}KB). Consider code-splitting.`
        );
      }

      if (totalJS > JS_TOTAL_BUDGET_KB) {
        this.warn(
          `[BUILD-GUARD] Total JS size ${Math.round(totalJS)}KB exceeds budget ${JS_TOTAL_BUDGET_KB}KB.`
        );
      }
    },
  };
}

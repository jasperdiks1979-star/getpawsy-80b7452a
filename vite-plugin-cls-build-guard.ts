/**
 * Vite Build Guard — prevents shipping broken CLS configurations.
 *
 * Checks at build time:
 * 1. VITE_IMAGE_OPTIMIZER_PROVIDER is not "none"
 * 2. index.html contains a hero image preload
 */
import type { Plugin } from 'vite';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export default function clsBuildGuard(): Plugin {
  return {
    name: 'cls-build-guard',
    enforce: 'pre',
    buildStart() {
      // Only run in production builds
      if (process.env.NODE_ENV !== 'production') return;

      // Check image optimizer provider
      const provider = process.env.VITE_IMAGE_OPTIMIZER_PROVIDER;
      if (provider === 'none') {
        this.error(
          '[CLS-BUILD-GUARD] VITE_IMAGE_OPTIMIZER_PROVIDER is "none" — ' +
          'this will cause LCP regressions. Set to "cloudinary" or remove the variable.'
        );
      }

      // Check hero preload exists in index.html
      try {
        const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8');
        if (!html.includes('rel="preload"') || !html.includes('as="image"')) {
          this.warn(
            '[CLS-BUILD-GUARD] No image preload found in index.html — ' +
            'hero LCP image should have a <link rel="preload"> tag.'
          );
        }
      } catch {
        // index.html read failed — non-fatal
      }
    },
  };
}

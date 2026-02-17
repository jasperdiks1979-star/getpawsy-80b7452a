/**
 * Vite plugin that generates a unique BUILD_ID at build time and:
 * 1. Writes public/build.txt with the ID
 * 2. Writes public/healthz.json with build metadata
 * 3. Replaces __BUILD_ID__ and __BUILD_TS__ tokens in JS
 */
import type { Plugin } from 'vite';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export default function buildIdPlugin(): Plugin {
  const buildId = `build-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const buildTs = new Date().toISOString();

  return {
    name: 'build-id',
    apply: 'build',

    // Replace tokens in JS source
    transform(code, id) {
      if (id.includes('boot-diagnostics')) {
        return code
          .replace(/__BUILD_ID__/g, buildId)
          .replace(/__BUILD_TS__/g, buildTs);
      }
      return undefined;
    },

    // Write static files after build
    closeBundle() {
      try {
        const distDir = join(process.cwd(), 'dist');
        mkdirSync(distDir, { recursive: true });

        // build.txt — simple build ID for integrity checks
        writeFileSync(join(distDir, 'build.txt'), buildId, 'utf-8');

        // healthz.json — health check endpoint
        writeFileSync(
          join(distDir, 'healthz.json'),
          JSON.stringify({
            ok: true,
            build: buildId,
            ts: buildTs,
            version: '1.0.0',
          }, null, 2),
          'utf-8'
        );

        console.log(`[build-id] Generated BUILD_ID: ${buildId}`);
      } catch (err) {
        console.error('[build-id] Failed to write build files:', err);
      }
    },
  };
}

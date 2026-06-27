import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';

describe('Performance Integrity Tests', () => {
  it('App.tsx lazy-loads the Products page for homepage LCP', () => {
    // Intentional regression flip: Products was switched to lazyWithRetry to keep
    // the homepage critical bundle small. Locked here so we don't accidentally
    // re-eager-import it. See: App.tsx header comment "lazy for homepage LCP".
    const code = fs.readFileSync('src/App.tsx', 'utf-8');
    expect(code).not.toContain('import Products from "./pages/Products"');
    expect(code).toMatch(
      /const\s+Products\s*=\s*lazyWithRetry\(\(\)\s*=>\s*import\(['"]\.\/pages\/Products['"]\)\)/,
    );
  });

  it('App.tsx does NOT have paint-blocking loading screen', () => {
    const code = fs.readFileSync('src/App.tsx', 'utf-8');
    expect(code).not.toContain('<LoadingScreen');
    expect(code).not.toContain('const [isLoading');
  });

  it('PageTransition is a zero-cost passthrough (no framer-motion)', () => {
    // Intentional: the framer-motion wrapper added ~2s to LCP and was replaced
    // with a plain <div>. Lock in the passthrough so animation can't sneak back.
    const code = fs.readFileSync('src/components/ui/page-transition.tsx', 'utf-8');
    expect(code).not.toMatch(/framer-motion/);
    expect(code).not.toMatch(/<motion\./);
    expect(code).toMatch(/<div className={className}>/);
  });

  it('useCategoryProducts uses optimized cache settings', () => {
    const code = fs.readFileSync('src/hooks/useCategoryProducts.ts', 'utf-8');
    expect(code).toContain('staleTime:');
    expect(code).toContain('refetchOnMount: false');
  });
});

describe('Build Integrity Tests', () => {
  it('index.html contains script tag for main entry', () => {
    const html = fs.readFileSync('index.html', 'utf-8');
    expect(html).toContain('<script type="module" src="/src/main.tsx"');
  });

  it('index.html has complete head section', () => {
    const html = fs.readFileSync('index.html', 'utf-8');
    expect(html).toContain('<head>');
    expect(html).toContain('</head>');
    expect(html).toContain('<meta charset="UTF-8"');
    expect(html).toContain('<title>');
  });

  it('index.html has recovery UI with boot watchdog', () => {
    const html = fs.readFileSync('index.html', 'utf-8');
    expect(html).toContain('boot-recovery');
    expect(html).toContain('hard-reload-btn');
    // copy-diag-btn was removed when the banner was minimised; the watchdog now
    // tracks __BOOT_FATAL_ERRORS__ instead of the old BOOT_FAIL flag.
    expect(html).toContain('__BOOT_FATAL_ERRORS__');
    expect(html).toContain('__BOOT_OK__');
  });

  it('vite.config.ts wires the active sitemaps plugin', () => {
    // The legacy `sitemapPlugin()` was retired in favour of the multi-file
    // `sitemapsPlugin()` (sitemap-pages / sitemap-collections / sitemap-blog).
    // Lock the new wiring in.
    const config = fs.readFileSync('vite.config.ts', 'utf-8');
    expect(config).toContain('import sitemapsPlugin from "./vite-plugin-sitemaps"');
    expect(config).toMatch(/^\s*sitemapsPlugin\(\),/m);
    expect(config).not.toMatch(/^\s*sitemapPlugin\(\),/m);
  });

  it('vite.config.ts includes buildIdPlugin', () => {
    const config = fs.readFileSync('vite.config.ts', 'utf-8');
    expect(config).toContain('buildIdPlugin()');
    expect(config).toContain("import buildIdPlugin from");
  });

  it('main.tsx has boot diagnostics', () => {
    const code = fs.readFileSync('src/main.tsx', 'utf-8');
    expect(code).toContain('initBootDiagnostics');
    expect(code).toContain('installBootErrorHandlers');
    expect(code).toContain('validateEnv');
    expect(code).toContain('markMounted');
  });

  it('healthz.json exists in public', () => {
    const healthz = fs.readFileSync('public/healthz.json', 'utf-8');
    const data = JSON.parse(healthz);
    expect(data.ok).toBe(true);
  });

  it('boot-diagnostics.ts has BUILD_ID placeholder', () => {
    const code = fs.readFileSync('src/lib/boot-diagnostics.ts', 'utf-8');
    expect(code).toContain("'__BUILD_ID__'");
    expect(code).toContain('verifyBuildIntegrity');
    expect(code).toContain('handleChunkFailure');
  });
});

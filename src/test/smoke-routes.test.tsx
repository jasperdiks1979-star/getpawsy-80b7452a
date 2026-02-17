import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';

describe('Performance Integrity Tests', () => {
  it('App.tsx does NOT use lazy for Products page', () => {
    const code = fs.readFileSync('src/App.tsx', 'utf-8');
    expect(code).toContain('import Products from "./pages/Products"');
    const lazyMatch = code.match(/lazyWithRetry\(\(\)\s*=>\s*import\(['"]\.\/pages\/Products['"]\)\)/);
    expect(lazyMatch).toBeNull();
  });

  it('App.tsx does NOT have paint-blocking loading screen', () => {
    const code = fs.readFileSync('src/App.tsx', 'utf-8');
    expect(code).not.toContain('<LoadingScreen');
    expect(code).not.toContain('const [isLoading');
  });

  it('PageTransition initial state is visible', () => {
    const code = fs.readFileSync('src/components/ui/page-transition.tsx', 'utf-8');
    expect(code).toContain('opacity: 1');
    expect(code).toContain('y: 0');
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
    expect(html).toContain('copy-diag-btn');
    expect(html).toContain('BOOT_FAIL');
  });

  it('vite.config.ts has sitemap plugin DISABLED', () => {
    const config = fs.readFileSync('vite.config.ts', 'utf-8');
    expect(config).not.toMatch(/^\s*sitemapPlugin\(\)/m);
    expect(config).toContain('// sitemapPlugin()');
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

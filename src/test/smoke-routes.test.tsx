import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';

describe('Performance Integrity Tests', () => {
  it('App.tsx does NOT use lazy for Products page', () => {
    const code = fs.readFileSync('src/App.tsx', 'utf-8');
    // Check for eager import
    expect(code).toContain('import Products from "./pages/Products"');
    // Ensure no lazy call for Products exists (avoid matching comments)
    const lazyMatch = code.match(/lazyWithRetry\(\(\)\s*=>\s*import\(['"]\.\/pages\/Products['"]\)\)/);
    expect(lazyMatch).toBeNull();
  });

  it('App.tsx does NOT have paint-blocking loading screen', () => {
    const code = fs.readFileSync('src/App.tsx', 'utf-8');
    // Ensure the component is not used
    expect(code).not.toContain('<LoadingScreen');
    // Ensure no isLoading gate
    expect(code).not.toContain('const [isLoading');
  });

  it('PageTransition initial state is visible', () => {
    const code = fs.readFileSync('src/components/ui/page-transition.tsx', 'utf-8');
    expect(code).toContain('opacity: 1');
    expect(code).toContain('y: 0');
  });

  it('useCategoryProducts uses optimized cache settings', () => {
    const code = fs.readFileSync('src/hooks/useCategoryProducts.ts', 'utf-8');
    expect(code).toContain('staleTime: 60 * 1000');
    expect(code).toContain('refetchOnMount: false');
  });
});

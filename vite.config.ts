import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import buildIdPlugin from "./vite-plugin-build-id";
import sitemapsPlugin from "./vite-plugin-sitemaps";
import clsBuildGuard from "./vite-plugin-cls-build-guard";
import prerenderGuidesPlugin from "./vite-plugin-prerender-guides";
import prerenderProductsPlugin from "./vite-plugin-prerender-products";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  build: {
    minify: 'esbuild',
    target: 'es2020',
    chunkSizeWarningLimit: 500,
    cssMinify: true,
    cssCodeSplit: true,
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // ── node_modules splitting ───────────────────────────────────────
          if (id.includes('node_modules')) {
            // Core React runtime — smallest possible critical chunk
            if (id.includes('react-dom') || id.includes('react/')) return 'react-vendor';
            if (id.includes('react-router')) return 'router';
            if (id.includes('@tanstack/react-query')) return 'query';
            if (id.includes('@supabase')) return 'supabase';

            // NOTE: @radix-ui intentionally NOT chunked — TDZ crash in Safari 18.
            // Radix packages share internal primitives; manual splitting creates
            // circular init errors identical to the d3/recharts incident.
            // Let Vite naturally code-split these. See: P0 incident 2026-02-21

            if (id.includes('embla-carousel')) return 'carousel';

            // Animation — keep isolated so pages without it don't pay the cost
            if (id.includes('framer-motion')) return 'animations';

            // Icons — individual icon modules cached together but separate from barrel
            // Per-icon deep imports (lucide-react/dist/esm/icons/*) land here automatically
            if (id.includes('lucide-react')) return 'icons';

            // Heavy utilities — never in initial bundle
            if (id.includes('mapbox-gl')) return 'mapbox';
            if (id.includes('@tiptap') || id.includes('prosemirror')) return 'editor';
            if (id.includes('zod') || id.includes('react-hook-form') || id.includes('@hookform')) return 'forms';
            if (id.includes('date-fns')) return 'date-utils';
            if (id.includes('sonner')) return 'notifications';
            if (id.includes('canvas-confetti')) return 'confetti';
            if (id.includes('dompurify')) return 'sanitize';

            // NOTE: recharts/d3 intentionally NOT chunked — Safari 18 TDZ crash.
            // Let Vite naturally code-split these. See: P0 incident 2026-02-19
          }

          // ── App-level splits ─────────────────────────────────────────────
          // NOTE: admin-dashboard intentionally NOT manually chunked.
          // Vite naturally code-splits via lazy(() => import('./pages/Admin')).
          // Manual chunking pulled shared Radix/utility code INTO admin-dashboard,
          // forcing the main entry to depend on a 3.6MB chunk. See: perf audit 2026-04-03

          // Heavy SEO engines — admin-only, never on public pages
          if (
            id.includes('/lib/seo-agent') ||
            id.includes('/lib/seo-command-center') ||
            id.includes('/lib/seo-decision-engine') ||
            id.includes('/lib/seo-growth-engine') ||
            id.includes('/lib/seo-auto-optimizer') ||
            id.includes('/lib/seo-autonomous-engine') ||
            id.includes('/lib/seo-revenue-scaling') ||
            id.includes('/lib/seo-monitoring') ||
            id.includes('/lib/seo-evaluation-framework') ||
            id.includes('/lib/seo-content-clusters') ||
            id.includes('/lib/seo-content-prompts') ||
            id.includes('/lib/seo-optimization-log') ||
            id.includes('/lib/seo-monthly-optimization-routine')
          ) return 'seo-engine';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    sourcemap: false,
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
    ],
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    buildIdPlugin(),
    sitemapsPlugin(),
    clsBuildGuard(),
    prerenderGuidesPlugin(),
    prerenderProductsPlugin(),
    mode === "production" && visualizer({
      filename: 'audits/bundle-report.html',
      gzipSize: true,
      brotliSize: true,
      open: false,
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import buildIdPlugin from "./vite-plugin-build-id";

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

            // UI component libraries — split into critical vs deferred
            // radix-core: only primitives needed for initial paint (Slot, Tooltip)
            if (
              id.includes('@radix-ui/react-slot') ||
              id.includes('@radix-ui/react-tooltip')
            ) return 'radix-core';
            // radix-interactive: loaded on first user interaction (menus, dialogs, sheets)
            if (
              id.includes('@radix-ui/react-dialog') ||
              id.includes('@radix-ui/react-dropdown-menu') ||
              id.includes('@radix-ui/react-popover') ||
              id.includes('@radix-ui/react-scroll-area') ||
              id.includes('@radix-ui/react-navigation-menu')
            ) return 'radix-interactive';
            // radix-forms: only loaded on form/admin pages
            if (
              id.includes('@radix-ui/react-select') ||
              id.includes('@radix-ui/react-checkbox') ||
              id.includes('@radix-ui/react-radio-group') ||
              id.includes('@radix-ui/react-switch') ||
              id.includes('@radix-ui/react-slider') ||
              id.includes('@radix-ui/react-label')
            ) return 'radix-forms';
            // everything else radix: accordion, tabs, collapsible, etc.
            if (id.includes('@radix-ui')) return 'radix-ui';
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
          if (id.includes('/pages/admin/') || id.includes('/components/admin/')) return 'admin-dashboard';

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
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

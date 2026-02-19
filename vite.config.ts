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
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || id.includes('react/')) {
              return 'react-vendor';
            }
            if (id.includes('react-router')) {
              return 'router';
            }
            if (id.includes('@radix-ui')) {
              return 'radix-ui';
            }
            if (id.includes('framer-motion')) {
              return 'animations';
            }
            if (id.includes('@tanstack/react-query')) {
              return 'query';
            }
            if (id.includes('lucide-react')) {
              return 'icons';
            }
            if (id.includes('embla-carousel')) {
              return 'carousel';
            }
            if (id.includes('@supabase')) {
              return 'supabase';
            }
            if (id.includes('recharts') || id.includes('d3-')) {
              return 'charts';
            }
            if (id.includes('mapbox-gl')) {
              return 'mapbox';
            }
            if (id.includes('@tiptap') || id.includes('prosemirror')) {
              return 'editor';
            }
            if (id.includes('zod') || id.includes('react-hook-form') || id.includes('@hookform')) {
              return 'forms';
            }
            if (id.includes('date-fns')) {
              return 'date-utils';
            }
            if (id.includes('sonner') || id.includes('canvas-confetti')) {
              return 'notifications';
            }
          }
          // App-level splits: admin & SEO dashboards into separate chunks
          if (id.includes('/pages/admin/') || id.includes('/components/admin/')) {
            return 'admin-dashboard';
          }
          // SEO schema components (small, used by product/category pages) stay in default chunks
          // Only heavy admin-only SEO engines go into the seo-engine chunk
          // IMPORTANT: /lib/seo-keywords is a pure data file — must NOT be in seo-engine
          // to avoid pulling the entire chunk into Index.tsx at bootstrap
          if (
            (id.includes('/lib/seo-agent') ||
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
             id.includes('/lib/seo-monthly-optimization-routine'))
          ) {
            return 'seo-engine';
          }
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

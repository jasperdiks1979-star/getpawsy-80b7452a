import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import buildIdPlugin from "./vite-plugin-build-id";
// PERMANENTLY DISABLED: sitemap plugin was corrupting production builds
// import sitemapPlugin from "./vite-plugin-sitemaps";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  // Build optimizations for faster loading
  build: {
    // Enable minification with esbuild (faster than terser)
    minify: 'esbuild',
    // Target modern browsers for smaller bundles
    target: 'es2020',
    // Chunk size warning threshold
    chunkSizeWarningLimit: 500,
    // Optimize CSS
    cssMinify: true,
    // Rollup options for code splitting
    rollupOptions: {
      output: {
        // Use function-based chunking to avoid default export issues
        manualChunks(id) {
          // Vendor chunks for better caching
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
            // REMOVED: recharts/d3 manual chunk — d3 circular deps cause TDZ crash on iOS Safari
            // Recharts is only used in lazy-loaded admin pages, so Vite will
            // naturally code-split it into async chunks that load on demand.
          }
        },
        // Optimize chunk file names for caching
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // Disabled for production — reduces bundle size significantly
    sourcemap: false,
  },
  // Optimize dependency pre-bundling
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      'framer-motion',
      // REMOVED: recharts & mapbox-gl — these are lazy-loaded and must NOT
      // be pre-bundled/eagerly evaluated (d3 TDZ crash on iOS Safari)
    ],
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    buildIdPlugin(),
    // sitemapPlugin(), // PERMANENTLY DISABLED — was corrupting builds
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

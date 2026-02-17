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
            // Recharts + d3 only used in admin/dashboard (lazy-loaded)
            if (id.includes('recharts') || id.includes('d3-')) {
              return 'recharts-vendor';
            }
          }
        },
        // Optimize chunk file names for caching
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // Enable source maps only in development
    sourcemap: mode === 'development',
  },
  // Optimize dependency pre-bundling
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      'framer-motion',
      'recharts',
      'mapbox-gl',
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

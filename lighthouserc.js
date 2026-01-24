module.exports = {
  ci: {
    collect: {
      numberOfRuns: 3,
      startServerCommand: 'npm run preview',
      startServerReadyPattern: 'Local',
      startServerReadyTimeout: 30000,
      url: [
        'http://localhost:4173/',
        'http://localhost:4173/products',
        'http://localhost:4173/cart',
      ],
      settings: {
        preset: 'desktop',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        throttling: {
          cpuSlowdownMultiplier: 1,
        },
      },
    },
    assert: {
      assertions: {
        // Performance Score
        'categories:performance': ['warn', { minScore: 0.7 }],
        'categories:accessibility': ['error', { minScore: 0.8 }],
        'categories:best-practices': ['warn', { minScore: 0.8 }],
        'categories:seo': ['warn', { minScore: 0.8 }],
        
        // Core Web Vitals - LCP (should be < 2.5s good, < 4s needs improvement)
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
        
        // Core Web Vitals - TBT as proxy for FID (should be < 300ms)
        'total-blocking-time': ['warn', { maxNumericValue: 300 }],
        
        // Core Web Vitals - CLS (should be < 0.1 good, < 0.25 needs improvement)
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        
        // FCP (should be < 1.8s good)
        'first-contentful-paint': ['warn', { maxNumericValue: 1800 }],
        
        // TTI (should be < 3.8s)
        'interactive': ['warn', { maxNumericValue: 3800 }],
        
        // Speed Index (should be < 3.4s)
        'speed-index': ['warn', { maxNumericValue: 3400 }],
        
        // Resource budgets
        'resource-summary:script:size': ['warn', { maxNumericValue: 500000 }],
        'resource-summary:stylesheet:size': ['warn', { maxNumericValue: 100000 }],
        'resource-summary:image:size': ['warn', { maxNumericValue: 1000000 }],
        'resource-summary:total:size': ['warn', { maxNumericValue: 3000000 }],
        
        // Server and main thread
        'server-response-time': ['warn', { maxNumericValue: 600 }],
        'mainthread-work-breakdown': ['warn', { maxNumericValue: 4000 }],
        'bootup-time': ['warn', { maxNumericValue: 3500 }],
        'dom-size': ['warn', { maxNumericValue: 1500 }],
        
        // Accessibility
        'color-contrast': 'warn',
        'image-alt': 'error',
        'label': 'error',
        'button-name': 'error',
        
        // Best practices
        'no-vulnerable-libraries': 'warn',
        'deprecations': 'warn',
        'errors-in-console': 'warn',
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};

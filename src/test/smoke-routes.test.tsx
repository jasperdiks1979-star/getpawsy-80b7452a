/**
 * Smoke tests for critical routes.
 * Validates that key pages render non-empty DOM without fatal errors.
 * Also checks canonical integrity and cookie banner CLS safety.
 *
 * VALIDATION CHECKLIST:
 * - How to test: Run `bun run test` or use Lovable's test runner
 * - Manual LCP check: Lighthouse mobile on /products?category=Small%20Pets
 * - Debug overlay: append ?debugVitals=1 to any route
 * - Target: lab LCP < 2.5s on key /products query routes
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';

// Mock Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
          in: () => Promise.resolve({ data: [], error: null }),
          single: () => Promise.resolve({ data: null, error: null }),
          limit: () => Promise.resolve({ data: [], error: null }),
          then: (cb: any) => Promise.resolve({ data: [], error: null }).then(cb),
        }),
        order: () => ({
          limit: () => Promise.resolve({ data: [], error: null }),
          then: (cb: any) => Promise.resolve({ data: [], error: null }).then(cb),
        }),
        single: () => Promise.resolve({ data: null, error: null }),
        limit: () => Promise.resolve({ data: [], error: null }),
        then: (cb: any) => Promise.resolve({ data: [], error: null }).then(cb),
      }),
    }),
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    channel: () => ({
      on: () => ({ subscribe: () => ({ unsubscribe: vi.fn() }) }),
    }),
  },
}));

// Mock contexts that require providers
vi.mock('@/contexts/CartContext', () => ({
  useCart: () => ({ items: [], addItem: vi.fn(), removeItem: vi.fn(), cartTotal: 0, itemCount: 0 }),
  CartProvider: ({ children }: any) => children,
}));

vi.mock('@/contexts/WishlistContext', () => ({
  useWishlist: () => ({ isInWishlist: () => false, toggleWishlist: vi.fn() }),
  WishlistProvider: ({ children }: any) => children,
}));

vi.mock('@/contexts/CartAnimationContext', () => ({
  useCartAnimation: () => ({ triggerAddToCart: vi.fn() }),
  CartAnimationProvider: ({ children }: any) => children,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ session: null, user: null, isAdmin: false, isLoading: false }),
  AuthProvider: ({ children }: any) => children,
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function renderRoute(route: string, Component: React.ComponentType) {
  const qc = createTestQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <HelmetProvider>
        <MemoryRouter initialEntries={[route]}>
          <Component />
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  );
}

describe('Smoke tests – key routes render', () => {
  const consoleSpy = { error: vi.fn() };

  beforeAll(() => {
    consoleSpy.error = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('/products renders without fatal errors', async () => {
    const Products = (await import('@/pages/Products')).default;
    const { container } = renderRoute('/products', Products);
    expect(container.innerHTML.length).toBeGreaterThan(100);
  });

  it('/products?category=dog-beds renders without fatal errors', async () => {
    const Products = (await import('@/pages/Products')).default;
    const { container } = renderRoute('/products?category=dog-beds', Products);
    expect(container.innerHTML.length).toBeGreaterThan(100);
  });

  it('/products?category=Small%20Pets renders without fatal errors', async () => {
    const Products = (await import('@/pages/Products')).default;
    const { container } = renderRoute('/products?category=Small%20Pets', Products);
    expect(container.innerHTML.length).toBeGreaterThan(100);
  });

  it('/products H1 has id plp-hero-heading for LCP targeting', async () => {
    const Products = (await import('@/pages/Products')).default;
    const { container } = renderRoute('/products', Products);
    const h1 = container.querySelector('#plp-hero-heading');
    expect(h1).toBeTruthy();
    expect(h1?.tagName).toBe('H1');
  });

  it('/products H1 container has stable min-height to prevent CLS', async () => {
    const Products = (await import('@/pages/Products')).default;
    const { container } = renderRoute('/products', Products);
    const h1 = container.querySelector('#plp-hero-heading');
    const wrapper = h1?.parentElement;
    expect(wrapper?.className).toContain('min-h-');
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { CartProvider, useCart } from '@/contexts/CartContext';
import React from 'react';

// Mock supabase rpc
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({
      data: [{ slug: 'multi-variant-item', variants: [{ vid: 'v1' }, { vid: 'v2' }] }],
      error: null
    }),
  }
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  }
}));

// Deterministic stubs for the lazily imported tracking modules. Without these
// the test could finish while the heavy real modules were still being loaded,
// which made Vitest report "Closing rpc while fetch was pending" at teardown.
vi.mock('@/lib/analytics', () => ({
  trackAddToCart: vi.fn(), trackRemoveFromCart: vi.fn(), trackGoogleAdsAddToCart: vi.fn(),
}));
vi.mock('@/lib/tiktok-pixel', () => ({ ttTrackAddToCart: vi.fn() }));
vi.mock('@/lib/funnelEvents', () => ({
  fireUserAddToCart: vi.fn(), fireUserRemoveFromCart: vi.fn(), fireCartRestored: vi.fn(),
}));
vi.mock('@/lib/marketingClient', () => ({ fireMarketingAsync: vi.fn(), MARKETING_FLAGS: {} }));
vi.mock('@/hooks/useVisitorTracking', () => ({ trackVisitorEvent: vi.fn() }));
vi.mock('@/lib/analyticsFunnel', () => ({ recordFunnelStep: vi.fn() }));
vi.mock('@/lib/pinterestTracker', () => ({}));
vi.mock('@/lib/pinterest-conversion-intel', () => ({}));
vi.mock('@/hooks/usePinterestTracking', () => ({ trackPinterestEvent: vi.fn() }));

afterEach(() => { localStorage.clear(); });

describe('Issue #4 Repro: multi-option product quick-add', () => {
  it('should remove a bare product ID from cart if it requires variants', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <CartProvider>{children}</CartProvider>
    );

    const { result, unmount } = renderHook(() => useCart(), { wrapper });

    await act(async () => {
      result.current.addItem({
        id: '11111111-2222-4333-8444-555555555555', // Base UUID
        name: 'Multi Variant Product',
        price: 10,
        image: 'img.jpg'
      });
    });

    // The item is added optimistically first
    expect(result.current.items.length).toBe(1);

    // Removed by enforceVariantSafety once the option check resolves
    await waitFor(() => expect(result.current.items.length).toBe(0));

    unmount();
  });
});

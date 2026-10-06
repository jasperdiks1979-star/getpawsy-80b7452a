import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
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

describe('Issue #4 Repro: multi-option product quick-add', () => {
  it('should remove a bare product ID from cart if it requires variants', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <CartProvider>{children}</CartProvider>
    );
    
    const { result } = renderHook(() => useCart(), { wrapper });

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

    // Wait for the async enforceVariantSafety to run
    // We need to wait for the next tick/microtask
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // It should be removed by enforceVariantSafety
    expect(result.current.items.length).toBe(0);
  });
});

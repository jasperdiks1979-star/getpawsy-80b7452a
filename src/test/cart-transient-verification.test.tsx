import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const PID = '11111111-2222-4333-8444-555555555555';
const item = { id: PID, name: 'P', price: 10, image: 'i.jpg' };

async function addAndSettle() {
  const { CartProvider, useCart } = await import('@/contexts/CartContext');
  const wrapper = ({ children }: { children: React.ReactNode }) => <CartProvider>{children}</CartProvider>;
  const { result } = renderHook(() => useCart(), { wrapper });
  await act(async () => { result.current.addItem(item); });
  await act(async () => { await new Promise((r) => setTimeout(r, 1200)); });
  return result;
}

describe('cart add survives transient option-verification failures', () => {
  beforeEach(() => { rpc.mockReset(); localStorage.clear(); });

  it('network timeout after add keeps the line', async () => {
    rpc.mockRejectedValue(new Error('timeout'));
    const r = await addAndSettle();
    expect(r.current.items.map((i) => i.id)).toEqual([PID]);
  });

  it('backend error response keeps the line', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: '522' } });
    const r = await addAndSettle();
    expect(r.current.items.length).toBe(1);
  });

  it('product without selectable options is kept', async () => {
    rpc.mockResolvedValue({ data: [{ slug: 's', variants: [] }], error: null });
    const r = await addAndSettle();
    expect(r.current.items.length).toBe(1);
  });

  it('proven missing required option is removed', async () => {
    rpc.mockResolvedValue({ data: [{ slug: 's', variants: [{ vid: 'a' }, { vid: 'b' }] }], error: null });
    const r = await addAndSettle();
    expect(r.current.items.length).toBe(0);
  });
});

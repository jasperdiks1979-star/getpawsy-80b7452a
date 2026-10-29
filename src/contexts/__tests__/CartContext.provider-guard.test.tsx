import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCart } from '../CartContext';

describe('useCart provider safety', () => {
  it('throws instead of returning inert cart methods without CartProvider', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useCart())).toThrow(
        /useCart must be used within a CartProvider/,
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});

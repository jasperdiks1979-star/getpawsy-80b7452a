import { describe, it, expect } from 'vitest';
import { stripMarkdown } from '@/lib/strip-markdown';

describe('stripMarkdown (crawler meta descriptions)', () => {
  it('removes bold markers but keeps the text', () => {
    expect(stripMarkdown('our **Stainless Steel Cat Litter Box with Lid**!')).toBe(
      'our Stainless Steel Cat Litter Box with Lid!',
    );
  });

  it('removes italic and underscore emphasis', () => {
    expect(stripMarkdown('a *soft* and __durable__ bed')).toBe('a soft and durable bed');
  });

  it('removes heading hashes', () => {
    expect(stripMarkdown('## Why cats love it\nBecause it is quiet')).toBe(
      'Why cats love it Because it is quiet',
    );
  });

  it('keeps link text and drops URLs', () => {
    expect(stripMarkdown('see the [size guide](https://getpawsy.pet/guides/x)')).toBe(
      'see the size guide',
    );
  });

  it('handles empty input', () => {
    expect(stripMarkdown(null)).toBe('');
    expect(stripMarkdown(undefined)).toBe('');
    expect(stripMarkdown('')).toBe('');
  });

  it('leaves plain text untouched', () => {
    expect(stripMarkdown('Free shipping over $35, 30-day returns.')).toBe(
      'Free shipping over $35, 30-day returns.',
    );
  });
});

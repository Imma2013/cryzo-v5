import { describe, expect, it } from 'vitest';
import { ensureToolkitArray } from './apps.data';
import { shouldRenderToolkitLogo } from './apps.utils';

describe('shouldRenderToolkitLogo', () => {
  it('renders the image when a logo URL exists and it has not failed', () => {
    expect(shouldRenderToolkitLogo('/api/connections/logo?slug=github', false)).toBe(true);
  });

  it('falls back when the logo URL is missing or broken', () => {
    expect(shouldRenderToolkitLogo(undefined, false)).toBe(false);
    expect(shouldRenderToolkitLogo('/api/connections/logo?slug=github', true)).toBe(false);
  });
});

describe('ensureToolkitArray', () => {
  it('returns only valid toolkit records', () => {
    expect(
      ensureToolkitArray([
        { slug: 'github', name: 'GitHub', isConnected: true, isAvailable: true },
        null,
        { slug: 'broken', name: 'Broken' },
      ]),
    ).toEqual([{ slug: 'github', name: 'GitHub', isConnected: true, isAvailable: true }]);
    expect(ensureToolkitArray({})).toEqual([]);
  });
});

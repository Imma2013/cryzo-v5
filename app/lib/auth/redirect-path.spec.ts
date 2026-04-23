// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildGoogleAuthRedirectTo, sanitizeRelativeRedirectPath } from './redirect-path';

describe('sanitizeRelativeRedirectPath', () => {
  it('preserves safe relative paths', () => {
    expect(sanitizeRelativeRedirectPath('/chat/123?tab=settings#models')).toBe('/chat/123?tab=settings#models');
  });

  it('falls back for absolute or malformed paths', () => {
    expect(sanitizeRelativeRedirectPath('https://example.com/evil')).toBe('/');
    expect(sanitizeRelativeRedirectPath('//example.com/evil')).toBe('/');
    expect(sanitizeRelativeRedirectPath('/\\example.com/evil')).toBe('/');
    expect(sanitizeRelativeRedirectPath('javascript:alert(1)')).toBe('/');
  });

  it('blocks callback-loop paths', () => {
    expect(sanitizeRelativeRedirectPath('/auth/callback')).toBe('/');
    expect(sanitizeRelativeRedirectPath('/auth/callback?next=%2Fchat')).toBe('/');
  });
});

describe('buildGoogleAuthRedirectTo', () => {
  it('builds a callback URL and includes a safe next path', () => {
    const redirectTo = buildGoogleAuthRedirectTo('/chat/abc?foo=bar#hash');

    expect(redirectTo).toContain('/auth/callback?');
    expect(redirectTo).toContain('next=%2Fchat%2Fabc%3Ffoo%3Dbar%23hash');
  });
});

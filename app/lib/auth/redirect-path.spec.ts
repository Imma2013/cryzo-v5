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

  it('strips auth callback params from next paths', () => {
    expect(sanitizeRelativeRedirectPath('/?code=abc123&state=xyz')).toBe('/');
    expect(sanitizeRelativeRedirectPath('/chat?tab=settings&code=abc123&state=xyz')).toBe('/chat?tab=settings');
  });
});

describe('buildGoogleAuthRedirectTo', () => {
  it('builds a callback URL and includes a safe next path', () => {
    const redirectTo = buildGoogleAuthRedirectTo('/chat/abc?foo=bar#hash');

    expect(redirectTo).toContain('/auth/callback?');
    expect(redirectTo).toContain('next=%2Fchat%2Fabc%3Ffoo%3Dbar%23hash');
  });

  it('does not forward stale auth callback params from the current location', () => {
    window.history.replaceState({}, '', '/?code=stale-code&state=abc');

    const redirectTo = buildGoogleAuthRedirectTo();

    expect(redirectTo).toContain('/auth/callback?');
    expect(redirectTo).toContain('next=%2F');
    expect(redirectTo).not.toContain('code%3Dstale-code');
  });
});

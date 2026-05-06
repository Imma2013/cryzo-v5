import { describe, expect, it } from 'vitest';
import {
  getDefaultGoogleImageModel,
  getGoogleChatModels,
  getGoogleImageModels,
  isSupportedGoogleChatModel,
  isSupportedGoogleImageModel,
  normalizeGoogleChatModel,
  normalizeGoogleImageModel,
} from './google-catalog';

describe('google-catalog', () => {
  it('returns the curated Gemini chat models', () => {
    expect(getGoogleChatModels().map((model) => model.name)).toEqual([
      'gemini-3-flash-preview',
      'gemini-3.1-pro-preview',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
    ]);
  });

  it('returns the curated Gemini image model and default', () => {
    expect(getGoogleImageModels().map((model) => model.id)).toEqual(['gemini-3.1-flash-image-preview']);
    expect(getDefaultGoogleImageModel().id).toBe('gemini-3.1-flash-image-preview');
  });

  it('validates supported Google image models', () => {
    expect(isSupportedGoogleChatModel('gemini-3.1-pro-preview')).toBe(true);
    expect(isSupportedGoogleChatModel('gemini-1.5-pro')).toBe(false);
    expect(isSupportedGoogleImageModel('gemini-2.5-flash-image')).toBe(false);
    expect(isSupportedGoogleImageModel('gemini-3.1-flash-image-preview')).toBe(true);
    expect(isSupportedGoogleImageModel(undefined)).toBe(false);
  });

  it('uses Gemini Flash first for chat fallback and normalizes stale image models to the image default', () => {
    expect(normalizeGoogleChatModel(undefined)).toBe('gemini-3-flash-preview');
    expect(normalizeGoogleImageModel('gemini-2.5-flash-preview-image')).toBe('gemini-3.1-flash-image-preview');
    expect(normalizeGoogleImageModel('gemini-3-pro-image-preview')).toBe('gemini-3.1-flash-image-preview');
    expect(normalizeGoogleImageModel('gemini-3.1-flash-image-preview')).toBe('gemini-3.1-flash-image-preview');
    expect(normalizeGoogleImageModel('unknown-image-model')).toBe('gemini-3.1-flash-image-preview');
  });
});

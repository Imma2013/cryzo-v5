import { describe, expect, it } from 'vitest';
import {
  getDefaultGoogleImageModel,
  getGoogleChatModels,
  getGoogleImageModels,
  isSupportedGoogleImageModel,
} from './google-catalog';

describe('google-catalog', () => {
  it('returns the curated Gemini chat models', () => {
    expect(getGoogleChatModels().map((model) => model.name)).toEqual([
      'gemini-3.1-pro-preview',
      'gemini-3-flash-preview',
      'gemini-2.5-pro',
      'gemini-flash-latest',
    ]);
  });

  it('returns the curated Nano Banana models and default', () => {
    expect(getGoogleImageModels().map((model) => model.id)).toEqual([
      'gemini-2.5-flash-image',
      'gemini-3-pro-image-preview',
    ]);
    expect(getDefaultGoogleImageModel().id).toBe('gemini-2.5-flash-image');
  });

  it('validates supported Google image models', () => {
    expect(isSupportedGoogleImageModel('gemini-2.5-flash-image')).toBe(true);
    expect(isSupportedGoogleImageModel('gemini-3.1-flash-image-preview')).toBe(false);
    expect(isSupportedGoogleImageModel(undefined)).toBe(false);
  });
});

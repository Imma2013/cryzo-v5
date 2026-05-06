import { describe, expect, it } from 'vitest';
import { IMAGE_ROUTING_GUIDANCE } from './image-guidance';
import { getFineTunedPrompt } from './new-prompt';
import optimized from './optimized';
import { getSystemPrompt } from './prompts';

const oldAutomaticImageGenerationMarkers = [
  'gemini-3.1-flash-image-preview',
  '<boltAction type="image"',
  'Stock-photo URLs are invalid',
];

function expectBoltStyleImagePolicy(prompt: string) {
  expect(prompt).toContain('Pexels');
  expect(prompt).toContain('direct');
  expect(prompt).toContain('Do not call automatic image generation for website builds');

  for (const marker of oldAutomaticImageGenerationMarkers) {
    expect(prompt).not.toContain(marker);
  }
}

describe('image routing prompt guidance', () => {
  it('uses Bolt-style linked Pexels images for automatic website builds', () => {
    expectBoltStyleImagePolicy(IMAGE_ROUTING_GUIDANCE);
    expect(IMAGE_ROUTING_GUIDANCE).toContain('Bolt NEVER downloads the images');
  });

  it('injects stock-photo guidance into the main prompt variants', () => {
    const promptOptions = {
      allowedHtmlElements: [],
      cwd: '/home/project',
      modificationTagName: 'bolt_file_modifications',
    };

    for (const prompt of [
      getSystemPrompt('/home/project'),
      getFineTunedPrompt('/home/project'),
      optimized(promptOptions),
    ]) {
      expectBoltStyleImagePolicy(prompt);
    }
  });
});

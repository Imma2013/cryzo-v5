import { describe, expect, it } from 'vitest';
import { getBuildWithToolsSystemPrompt, getExternalToolSystemPrompt, resolveAssistantMode } from './external-tool-mode';

describe('resolveAssistantMode', () => {
  it('routes personal app requests into external-tool mode', () => {
    expect(resolveAssistantMode('build', 'check my 5 newest gmails please')).toBe('external-tool');
    expect(resolveAssistantMode('build', 'summarize my emails from today')).toBe('external-tool');
    expect(resolveAssistantMode('build', "what's on my calendar this week?")).toBe('external-tool');
    expect(resolveAssistantMode('build', 'create a GitHub issue in my repo')).toBe('external-tool');
  });

  it('preserves normal build and discuss routing for non-tool prompts', () => {
    expect(resolveAssistantMode('build', 'build a Gmail dashboard UI in React')).toBe('build');
    expect(resolveAssistantMode('discuss', 'explain how this auth flow works')).toBe('discuss');
  });

  it('routes mixed builder-plus-app prompts into build-with-tools mode', () => {
    expect(resolveAssistantMode('build', 'build me a dog website and connect to my Gmail')).toBe('build-with-tools');
    expect(resolveAssistantMode('build', 'make a CRM dashboard and create a GitHub issue in my repo')).toBe(
      'build-with-tools',
    );
  });
});

describe('getExternalToolSystemPrompt', () => {
  it('forbids UI-building fallback for external app requests', () => {
    const prompt = getExternalToolSystemPrompt({
      composioConfigured: false,
      hasComposioIdentity: true,
      toolsAvailable: false,
    });

    expect(prompt).toContain('Do not propose building a dashboard');
    expect(prompt).toContain('instead of offering to build UI');
  });

  it('treats missing identity differently from runtime tool-resolution failures', () => {
    const missingIdentityPrompt = getExternalToolSystemPrompt({
      composioConfigured: true,
      hasComposioIdentity: false,
      toolsAvailable: false,
    });
    const resolutionFailurePrompt = getExternalToolSystemPrompt({
      composioConfigured: true,
      hasComposioIdentity: true,
      toolResolutionError: 'Composio session.tools() failed',
      toolsAvailable: false,
    });

    expect(missingIdentityPrompt).toContain('open the Apps tab');
    expect(missingIdentityPrompt).not.toContain('temporarily unavailable');
    expect(resolutionFailurePrompt).toContain('temporarily unavailable');
    expect(resolutionFailurePrompt).toContain('runtime problem');
  });
});

describe('getBuildWithToolsSystemPrompt', () => {
  it('keeps builder behavior while allowing connected-app actions', () => {
    const prompt = getBuildWithToolsSystemPrompt({
      composioConfigured: true,
      hasComposioIdentity: true,
      toolsAvailable: true,
    });

    expect(prompt).toContain('still acting as the web builder');
    expect(prompt).toContain('Keep the builder task as the main responsibility');
    expect(prompt).toContain('Use connected-app tools only');
  });

  it('does not require sign-in wording when a guest identity already exists', () => {
    const prompt = getBuildWithToolsSystemPrompt({
      composioConfigured: true,
      hasComposioIdentity: true,
      toolsAvailable: false,
    });

    expect(prompt).not.toContain('not signed in');
    expect(prompt).toContain('connect the required app');
  });
});

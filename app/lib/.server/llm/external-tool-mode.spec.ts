import { describe, expect, it } from 'vitest';
import {
  getBuildWithToolsSystemPrompt,
  getExternalToolSystemPrompt,
  resolveAssistantMode,
  shouldUseGoogleRuntimeForAssistantMode,
} from './external-tool-mode';

describe('resolveAssistantMode', () => {
  it('routes personal app requests into external-tool mode', () => {
    expect(resolveAssistantMode('build', 'check my 5 newest gmails please')).toBe('external-tool');
    expect(resolveAssistantMode('build', 'summarize my emails from today')).toBe('external-tool');
    expect(resolveAssistantMode('build', "what's on my calendar this week?")).toBe('external-tool');
    expect(resolveAssistantMode('build', 'create a GitHub issue in my repo')).toBe('external-tool');
    expect(resolveAssistantMode('build', 'redeploy my Vercel project through Composio')).toBe('external-tool');
    expect(resolveAssistantMode('build', 'list my Supabase projects')).toBe('external-tool');
    expect(resolveAssistantMode('build', 'show my Linear issues')).toBe('external-tool');
  });

  it('preserves normal build and discuss routing for non-tool prompts', () => {
    expect(resolveAssistantMode('build', 'hello')).toBe('discuss');
    expect(resolveAssistantMode('build', 'build a Gmail dashboard UI in React')).toBe('build');
    expect(resolveAssistantMode('discuss', 'explain how this auth flow works')).toBe('discuss');
  });

  it('routes mixed builder-plus-app prompts into build-with-tools mode', () => {
    expect(resolveAssistantMode('build', 'build me a dog website and connect to my Gmail')).toBe('build-with-tools');
    expect(resolveAssistantMode('build', 'make a CRM dashboard and create a GitHub issue in my repo')).toBe(
      'build-with-tools',
    );
    expect(resolveAssistantMode('build', 'build a deployment dashboard and list my Vercel deployments')).toBe(
      'build-with-tools',
    );
  });
});

describe('shouldUseGoogleRuntimeForAssistantMode', () => {
  it('enables the Gemini runtime for external or mixed app requests', () => {
    expect(shouldUseGoogleRuntimeForAssistantMode('external-tool')).toBe(true);
    expect(shouldUseGoogleRuntimeForAssistantMode('build-with-tools')).toBe(true);
  });

  it('does not force the Gemini runtime for pure build or discuss requests', () => {
    expect(shouldUseGoogleRuntimeForAssistantMode('build')).toBe(false);
    expect(shouldUseGoogleRuntimeForAssistantMode('discuss')).toBe(false);
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

  it('forbids generic connect prose when a real tool path is available', () => {
    const prompt = getExternalToolSystemPrompt({
      composioConfigured: true,
      hasComposioIdentity: true,
      toolsAvailable: true,
    });

    expect(prompt).toContain('must start by using a Composio tool');
    expect(prompt).toContain('Do not invent auth links');
    expect(prompt).toContain('Do not tell the user to connect the app in the Apps tab unless the tool runtime is unavailable');
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

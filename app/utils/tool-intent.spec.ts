import { describe, expect, it } from 'vitest';
import { getExternalAppIntentKind, isExternalAppToolIntent, isMixedExternalAppToolIntent } from './tool-intent';

describe('isExternalAppToolIntent', () => {
  it('detects Composio and personal app-action prompts', () => {
    expect(isExternalAppToolIntent('hello can u use composio and check my gmails')).toBe(true);
    expect(isExternalAppToolIntent("What's on my calendar this week?")).toBe(true);
    expect(isExternalAppToolIntent('Create a GitHub issue in my repo')).toBe(true);
    expect(isExternalAppToolIntent('Gmail inbox viewer with Composio')).toBe(true);
    expect(isExternalAppToolIntent('check my gmail inbox')).toBe(true);
    expect(isExternalAppToolIntent('check my 5 newest gmails please')).toBe(true);
    expect(isExternalAppToolIntent('summarize my emails from today')).toBe(true);
  });

  it('does not treat normal build prompts as external app requests', () => {
    expect(isExternalAppToolIntent('Build me a SaaS landing page with 3D cards')).toBe(false);
    expect(isExternalAppToolIntent('Create a Gmail-style dashboard UI in React')).toBe(false);
    expect(isExternalAppToolIntent('make a Slack-inspired landing page')).toBe(false);
  });

  it('detects mixed builder-plus-app prompts separately', () => {
    expect(getExternalAppIntentKind('Build me a dog website and connect to my Gmail')).toBe('mixed');
    expect(isMixedExternalAppToolIntent('Make a CRM dashboard and summarize my emails from today')).toBe(true);
    expect(getExternalAppIntentKind('Create a Slack-inspired landing page')).toBe('none');
  });
});

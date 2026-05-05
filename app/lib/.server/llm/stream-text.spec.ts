import type { ToolSet } from 'ai';
import { describe, expect, it } from 'vitest';
import {
  buildAssistantSystemPrompt,
  buildGoogleCoreMessages,
  getExternalToolRuntimeErrorMessage,
  getAssistantToolRuntimeSettings,
  getGoogleProviderOptions,
} from './stream-text';

describe('getGoogleProviderOptions', () => {
  it('forces includeThoughts while preserving existing Google options', () => {
    const providerOptions = getGoogleProviderOptions({
      google: {
        responseModalities: ['TEXT'],
        thinkingConfig: {
          thinkingBudget: 128,
        },
      },
    } as any);

    expect(providerOptions).toEqual({
      google: {
        responseModalities: ['TEXT'],
        thinkingConfig: {
          thinkingBudget: 128,
          includeThoughts: true,
        },
      },
    });
  });
});

describe('buildGoogleCoreMessages', () => {
  it('replays Google thought signatures on reconstructed tool calls', () => {
    const tools: ToolSet = {
      COMPOSIO_SEARCH_TOOLS: {
        description: 'Search tools',
        parameters: {
          jsonSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
          },
        },
      } as ToolSet[string],
    };

    const coreMessages = buildGoogleCoreMessages(
      [
        {
          role: 'user',
          content: 'hello use composio',
        },
        {
          role: 'assistant',
          content: '',
          annotations: [
            {
              type: 'googleToolCallMetadata',
              toolCallId: 'call-1',
              providerMetadata: {
                google: {
                  thoughtSignature: 'sig-1',
                },
              },
            },
          ],
          parts: [
            {
              type: 'text',
              text: 'Checking tools',
            },
            {
              type: 'tool-invocation',
              toolInvocation: {
                state: 'result',
                step: 0,
                toolCallId: 'call-1',
                toolName: 'COMPOSIO_SEARCH_TOOLS',
                args: {
                  query: 'newest emails',
                },
                result: {
                  items: [],
                },
              },
            },
          ],
        },
      ] as any,
      tools,
    );

    expect(coreMessages).toHaveLength(3);
    expect(coreMessages[1]).toMatchObject({
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'Checking tools',
        },
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'COMPOSIO_SEARCH_TOOLS',
          args: {
            query: 'newest emails',
          },
          providerMetadata: {
            google: {
              thoughtSignature: 'sig-1',
            },
          },
          experimental_providerMetadata: {
            google: {
              thoughtSignature: 'sig-1',
            },
          },
        },
      ],
    });
    expect(coreMessages[2]).toMatchObject({
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'COMPOSIO_SEARCH_TOOLS',
          result: {
            items: [],
          },
        },
      ],
    });
  });
});

describe('buildAssistantSystemPrompt', () => {
  it('uses the strict external-tool prompt for pure app-action requests', () => {
    const prompt = buildAssistantSystemPrompt({
      assistantMode: 'external-tool',
      systemPrompt: 'base builder prompt',
      composioConfigured: true,
      hasComposioIdentity: true,
      toolsAvailable: true,
    });

    expect(prompt).toContain('external-app assistant');
    expect(prompt).not.toContain('base builder prompt');
  });

  it('keeps the builder prompt and appends connected-app guidance for mixed requests', () => {
    const prompt = buildAssistantSystemPrompt({
      assistantMode: 'build-with-tools',
      systemPrompt: 'base builder prompt',
      composioConfigured: true,
      hasComposioIdentity: true,
      toolsAvailable: true,
    });

    expect(prompt).toContain('base builder prompt');
    expect(prompt).toContain('still acting as the web builder');
    expect(prompt).toContain('connected-app action');
  });

  it('uses guest identity status instead of sign-in state for external app fallback guidance', () => {
    const prompt = buildAssistantSystemPrompt({
      assistantMode: 'external-tool',
      systemPrompt: 'base builder prompt',
      composioConfigured: true,
      hasComposioIdentity: true,
      toolsAvailable: false,
    });

    expect(prompt).not.toContain('sign in if they want a persistent account');
    expect(prompt).toContain('connected-app identity exists');
  });

  it('surfaces tool resolution failures instead of generic connect prompts', () => {
    const prompt = buildAssistantSystemPrompt({
      assistantMode: 'external-tool',
      systemPrompt: 'base builder prompt',
      composioConfigured: true,
      hasComposioIdentity: true,
      toolResolutionError: 'session.tools() failed',
      toolsAvailable: false,
    });

    expect(prompt).toContain('temporarily unavailable');
    expect(prompt).toContain('session.tools() failed');
  });

  it('forces real tool usage before fallback for external-tool requests with tools available', () => {
    const prompt = buildAssistantSystemPrompt({
      assistantMode: 'external-tool',
      systemPrompt: 'base builder prompt',
      composioConfigured: true,
      hasComposioIdentity: true,
      toolsAvailable: true,
    });

    expect(prompt).toContain('must start by using a Composio tool');
    expect(prompt).toContain('Do not invent auth links');
    expect(prompt).toContain('If tools are available, call a Composio tool before any fallback explanation');
  });
});

describe('getAssistantToolRuntimeSettings', () => {
  it('requires a tool call and enables multi-step execution for pure external-tool requests', () => {
    expect(
      getAssistantToolRuntimeSettings({
        assistantMode: 'external-tool',
        toolsAvailable: true,
      }),
    ).toEqual({
      maxSteps: 10,
      toolChoice: 'required',
    });
  });

  it('enables multi-step execution without forcing tool choice for mixed builder requests', () => {
    expect(
      getAssistantToolRuntimeSettings({
        assistantMode: 'build-with-tools',
        toolsAvailable: true,
      }),
    ).toEqual({
      maxSteps: 8,
    });
  });

  it('leaves normal build and discuss flows unchanged', () => {
    expect(
      getAssistantToolRuntimeSettings({
        assistantMode: 'build',
        toolsAvailable: true,
      }),
    ).toEqual({});

    expect(
      getAssistantToolRuntimeSettings({
        assistantMode: 'external-tool',
        toolsAvailable: false,
      }),
    ).toEqual({});
  });
});

describe('getExternalToolRuntimeErrorMessage', () => {
  it('returns explicit setup messaging when the Composio API key is missing', () => {
    expect(
      getExternalToolRuntimeErrorMessage({
        assistantMode: 'external-tool',
        composioToolResolution: {
          status: 'missing_api_key',
        },
        providerName: 'OpenAI',
      }),
    ).toContain('COMPOSIO_API_KEY');
  });

  it('returns explicit provider messaging when the selected provider cannot call tools', () => {
    expect(
      getExternalToolRuntimeErrorMessage({
        assistantMode: 'external-tool',
        composioToolResolution: {
          status: 'unsupported_provider',
        },
        providerName: 'Ollama',
      }),
    ).toContain('Selected provider "Ollama" does not support external app tool calling');
  });

  it('does not turn mixed builder requests into hard runtime errors', () => {
    expect(
      getExternalToolRuntimeErrorMessage({
        assistantMode: 'build-with-tools',
        composioToolResolution: {
          status: 'missing_api_key',
        },
        providerName: 'OpenAI',
      }),
    ).toBeUndefined();
  });
});

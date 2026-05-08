import { parseDataStreamPart, type ToolSet } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BUILD_IMAGE_SOURCE_GUIDANCE,
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
    expect(prompt).toContain('Do not include raw runtime or transport error details');
    expect(prompt).not.toContain('session.tools() failed');
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

describe('BUILD_IMAGE_SOURCE_GUIDANCE', () => {
  it('allows linked stock photos instead of automatic generated image actions', () => {
    expect(BUILD_IMAGE_SOURCE_GUIDANCE).toContain('Stock-photo URLs are valid output');
    expect(BUILD_IMAGE_SOURCE_GUIDANCE).toContain('Prefer valid Pexels URLs');
    expect(BUILD_IMAGE_SOURCE_GUIDANCE).toContain('Do not download, store, or auto-generate image files');
    expect(BUILD_IMAGE_SOURCE_GUIDANCE).not.toContain('gemini-3.1-flash-image-preview');
    expect(BUILD_IMAGE_SOURCE_GUIDANCE).not.toContain('<boltAction type="image"');
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
    ).toContain('COMPOSIO_MCP_SERVER_URL or COMPOSIO_MCP_API_KEY');
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

describe('streamText Composio and stream compatibility routing', () => {
  afterEach(() => {
    vi.doUnmock('ai');
    vi.doUnmock('./composio');
    vi.resetModules();
  });

  async function importStreamTextWithMocks({
    generateTextResult,
    nativeStreamError,
    nativeStreamResult = {
      mergeIntoDataStream: vi.fn(),
      textStream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      }),
    },
  }: {
    generateTextResult?: any;
    nativeStreamError?: Error;
    nativeStreamResult?: any;
  }) {
    vi.resetModules();

    const getComposioTools = vi.fn();
    const generateText = vi.fn().mockResolvedValue(
      generateTextResult ?? {
        files: [],
        finishReason: 'stop',
        providerMetadata: {},
        reasoning: [],
        request: { body: '{}' },
        response: { id: 'resp-compat' },
        sources: [],
        steps: [],
        text: 'hello from compatibility',
        toolCalls: [],
        toolResults: [],
        usage: {
          completionTokens: 3,
          promptTokens: 4,
          totalTokens: 7,
        },
        warnings: [],
      },
    );
    const nativeStreamText = nativeStreamError
      ? vi.fn().mockRejectedValue(nativeStreamError)
      : vi.fn().mockResolvedValue(nativeStreamResult);

    vi.doMock('ai', async () => {
      const actual = await vi.importActual<typeof import('ai')>('ai');

      return {
        ...actual,
        generateText,
        streamText: nativeStreamText,
      };
    });

    vi.doMock('./composio', () => {
      return {
        getComposioTools,
      };
    });

    const module = await import('./stream-text');

    return {
      generateText,
      getComposioTools,
      nativeStreamResult,
      nativeStreamText,
      streamText: module.streamText,
    };
  }

  function createReadableStreamFormatError() {
    const error = new Error('Failed to process successful response');
    (error as any).cause = new TypeError("First parameter has member 'readable' that is not a ReadableStream.");

    return error;
  }

  it('does not resolve Composio tools for a plain hello prompt', async () => {
    const { getComposioTools, nativeStreamResult, nativeStreamText, streamText } = await importStreamTextWithMocks({});

    const result = await streamText({
      chatMode: 'build',
      env: {
        OPENAI_API_KEY: 'test-openai-key',
      } as any,
      messages: [
        {
          content: 'hello',
          role: 'user',
        },
      ],
      options: {},
    });

    expect(result).toBe(nativeStreamResult);
    expect(getComposioTools).not.toHaveBeenCalled();
    expect(nativeStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: {},
      }),
    );
  });

  it('retries successful-response stream format failures through generateText compatibility packaging', async () => {
    const nativeStreamError = createReadableStreamFormatError();
    const { generateText, nativeStreamText, streamText } = await importStreamTextWithMocks({ nativeStreamError });

    const result = await streamText({
      chatMode: 'discuss',
      env: {
        OPENAI_API_KEY: 'test-openai-key',
      } as any,
      messages: [
        {
          content: 'hello',
          role: 'user',
        },
      ],
      options: {},
    });

    expect(nativeStreamText).toHaveBeenCalledTimes(1);
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(await new Response(result.textStream).text()).toBe('hello from compatibility');
  });

  it('retries merge-time successful-response stream format failures through generateText compatibility packaging', async () => {
    const nativeMerge = vi.fn(() => {
      throw createReadableStreamFormatError();
    });
    const nativeStreamResult = {
      mergeIntoDataStream: nativeMerge,
      textStream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      }),
    };
    const { generateText, getComposioTools, nativeStreamText, streamText } = await importStreamTextWithMocks({
      nativeStreamResult,
    });

    const result = await streamText({
      chatMode: 'build',
      env: {
        OPENAI_API_KEY: 'test-openai-key',
      } as any,
      messages: [
        {
          content: 'hello',
          role: 'user',
        },
      ],
      options: {},
    });

    const writes: string[] = [];
    await result.mergeIntoDataStream({
      write(chunk: string) {
        writes.push(chunk);
      },
    });

    const parsedParts = writes.map((chunk) => parseDataStreamPart(chunk));

    expect(nativeStreamText).toHaveBeenCalledTimes(1);
    expect(nativeMerge).toHaveBeenCalledTimes(1);
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(getComposioTools).not.toHaveBeenCalled();
    expect(parsedParts).toEqual(
      expect.arrayContaining([
        {
          type: 'text',
          value: 'hello from compatibility',
        },
      ]),
    );
  });

  it('does not append compatibility output after native merge has already written chunks', async () => {
    const nativeMerge = vi.fn((writer: { write: (chunk: string) => void }) => {
      writer.write('native-start');
      throw createReadableStreamFormatError();
    });
    const nativeStreamResult = {
      mergeIntoDataStream: nativeMerge,
      textStream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      }),
    };
    const { generateText, streamText } = await importStreamTextWithMocks({
      nativeStreamResult,
    });

    const result = await streamText({
      chatMode: 'discuss',
      env: {
        OPENAI_API_KEY: 'test-openai-key',
      } as any,
      messages: [
        {
          content: 'hello',
          role: 'user',
        },
      ],
      options: {},
    });

    const writes: string[] = [];
    let caughtError: unknown;

    try {
      await result.mergeIntoDataStream({
        write(chunk: string) {
          writes.push(chunk);
        },
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toEqual(expect.any(Error));
    expect((caughtError as Error).message).toBe(
      'The AI provider returned a response this app could not stream. Please retry in a moment.',
    );
    expect(generateText).not.toHaveBeenCalled();
    expect(writes).toEqual(['native-start']);
  });
});

import { generateText, parseDataStreamPart } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');

  return {
    ...actual,
    generateText: vi.fn(),
  };
});

import { createGoogleGenerateFallbackResult } from './stream-text';

describe('createGoogleGenerateFallbackResult', () => {
  const mockedGenerateText = vi.mocked(generateText);

  beforeEach(() => {
    mockedGenerateText.mockReset();
  });

  it('packages Google generateText output into the chat data-stream format', async () => {
    const onFinish = vi.fn();

    mockedGenerateText.mockResolvedValue({
      files: [],
      finishReason: 'stop',
      providerMetadata: {
        google: {
          groundingMetadata: null,
        },
      },
      reasoning: [],
      request: { body: '{}' },
      response: { id: 'resp-1' },
      sources: [],
      steps: [],
      text: 'hello from google',
      toolCalls: [],
      toolResults: [],
      usage: {
        completionTokens: 7,
        promptTokens: 5,
        totalTokens: 12,
      },
      warnings: [],
    } as any);

    const result = await createGoogleGenerateFallbackResult({
      onFinish,
      streamParams: { model: {} as any },
    });

    const writes: string[] = [];
    result.mergeIntoDataStream({
      write(chunk: string) {
        writes.push(chunk);
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockedGenerateText).toHaveBeenCalledWith({ model: {} });
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({
        finishReason: 'stop',
        text: 'hello from google',
        usage: {
          completionTokens: 7,
          promptTokens: 5,
          totalTokens: 12,
        },
      }),
    );

    const parsedParts = writes.map((chunk) => parseDataStreamPart(chunk));

    expect(parsedParts).toHaveLength(4);
    expect(parsedParts[0]).toMatchObject({
      type: 'start_step',
      value: { messageId: 'msg-google-compat' },
    });
    expect(parsedParts[1]).toMatchObject({
      type: 'text',
      value: 'hello from google',
    });
    expect(parsedParts[2]).toMatchObject({
      type: 'finish_step',
      value: {
        finishReason: 'stop',
        isContinued: false,
        usage: {
          completionTokens: 7,
          promptTokens: 5,
        },
      },
    });
    expect(parsedParts[3]).toMatchObject({
      type: 'finish_message',
      value: {
        finishReason: 'stop',
        usage: {
          completionTokens: 7,
          promptTokens: 5,
        },
      },
    });

    expect(await new Response(result.textStream).text()).toBe('hello from google');

    const fullStreamParts: Array<Record<string, unknown>> = [];

    for await (const part of result.fullStream) {
      fullStreamParts.push(part as Record<string, unknown>);
    }

    expect(fullStreamParts).toEqual([
      {
        textDelta: 'hello from google',
        type: 'text-delta',
      },
      expect.objectContaining({
        finishReason: 'stop',
        type: 'finish',
        usage: {
          completionTokens: 7,
          promptTokens: 5,
          totalTokens: 12,
        },
      }),
    ]);
  });

  it('emits tool calls, tool results, and Google metadata annotations into the chat data stream', async () => {
    mockedGenerateText.mockResolvedValue({
      files: [],
      finishReason: 'stop',
      providerMetadata: {
        google: {
          groundingMetadata: null,
        },
      },
      reasoning: [],
      request: { body: '{}' },
      response: {
        id: 'resp-2',
        messages: [
          {
            content: [
              {
                text: 'Checking Stripe',
                type: 'text',
              },
              {
                args: { query: 'connect stripe' },
                experimental_providerMetadata: {
                  google: {
                    thoughtSignature: 'sig-1',
                  },
                },
                toolCallId: 'call-1',
                toolName: 'COMPOSIO_SEARCH_TOOLS',
                type: 'tool-call',
              },
            ],
            id: 'assistant-msg-1',
            role: 'assistant',
          },
          {
            content: [
              {
                result: {
                  items: [{ slug: 'STRIPE_CREATE_PRODUCT' }],
                },
                toolCallId: 'call-1',
                toolName: 'COMPOSIO_SEARCH_TOOLS',
                type: 'tool-result',
              },
            ],
            id: 'tool-msg-1',
            role: 'tool',
          },
        ],
      },
      sources: [],
      steps: [
        {
          finishReason: 'tool-calls',
          response: {
            messages: [
              {
                content: [
                  {
                    text: 'Checking Stripe',
                    type: 'text',
                  },
                  {
                    args: { query: 'connect stripe' },
                    providerMetadata: {
                      google: {
                        thoughtSignature: 'sig-1',
                      },
                    },
                    toolCallId: 'call-1',
                    toolName: 'COMPOSIO_SEARCH_TOOLS',
                    type: 'tool-call',
                  },
                ],
                id: 'assistant-msg-1',
                role: 'assistant',
              },
              {
                content: [
                  {
                    result: {
                      items: [{ slug: 'STRIPE_CREATE_PRODUCT' }],
                    },
                    toolCallId: 'call-1',
                    toolName: 'COMPOSIO_SEARCH_TOOLS',
                    type: 'tool-result',
                  },
                ],
                id: 'tool-msg-1',
                role: 'tool',
              },
            ],
          },
          text: 'Checking Stripe',
          toolCalls: [
            {
              args: { query: 'connect stripe' },
              toolCallId: 'call-1',
              toolName: 'COMPOSIO_SEARCH_TOOLS',
            },
          ],
          toolResults: [
            {
              result: {
                items: [{ slug: 'STRIPE_CREATE_PRODUCT' }],
              },
              toolCallId: 'call-1',
              toolName: 'COMPOSIO_SEARCH_TOOLS',
            },
          ],
          usage: {
            completionTokens: 4,
            promptTokens: 3,
            totalTokens: 7,
          },
        },
      ],
      text: 'Checking Stripe',
      toolCalls: [
        {
          args: { query: 'connect stripe' },
          toolCallId: 'call-1',
          toolName: 'COMPOSIO_SEARCH_TOOLS',
        },
      ],
      toolResults: [
        {
          result: {
            items: [{ slug: 'STRIPE_CREATE_PRODUCT' }],
          },
          toolCallId: 'call-1',
          toolName: 'COMPOSIO_SEARCH_TOOLS',
        },
      ],
      usage: {
        completionTokens: 4,
        promptTokens: 3,
        totalTokens: 7,
      },
      warnings: [],
    } as any);

    const result = await createGoogleGenerateFallbackResult({
      streamParams: { model: {} as any },
    });

    const writes: string[] = [];
    result.mergeIntoDataStream({
      write(chunk: string) {
        writes.push(chunk);
      },
    });

    const parsedParts = writes.map((chunk) => parseDataStreamPart(chunk));

    expect(parsedParts).toEqual([
      {
        type: 'start_step',
        value: { messageId: 'assistant-msg-1' },
      },
      {
        type: 'message_annotations',
        value: [
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
      },
      {
        type: 'text',
        value: 'Checking Stripe',
      },
      {
        type: 'tool_call',
        value: {
          args: { query: 'connect stripe' },
          toolCallId: 'call-1',
          toolName: 'COMPOSIO_SEARCH_TOOLS',
        },
      },
      {
        type: 'tool_result',
        value: {
          result: {
            items: [{ slug: 'STRIPE_CREATE_PRODUCT' }],
          },
          toolCallId: 'call-1',
        },
      },
      {
        type: 'finish_step',
        value: {
          finishReason: 'tool-calls',
          isContinued: false,
          usage: {
            completionTokens: 4,
            promptTokens: 3,
          },
        },
      },
      {
        type: 'finish_message',
        value: {
          finishReason: 'stop',
          usage: {
            completionTokens: 4,
            promptTokens: 3,
          },
        },
      },
    ]);
  });
});

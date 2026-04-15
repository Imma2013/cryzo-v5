import { describe, expect, it } from 'vitest';
import {
  summarizeGoogleHistoryForDiagnostics,
  summarizeGoogleRequestBodyForDiagnostics,
  validateGoogleRequestThoughtSignatures,
} from './google-tool-runtime';

describe('summarizeGoogleHistoryForDiagnostics', () => {
  it('summarizes replayed tool calls without logging message bodies', () => {
    const summary = summarizeGoogleHistoryForDiagnostics([
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'hidden',
          },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'COMPOSIO_SEARCH_TOOLS',
            providerMetadata: {
              google: {
                thoughtSignature: 'sig-1',
              },
            },
          },
        ],
      },
    ]);

    expect(summary).toEqual([
      {
        index: 0,
        toolCalls: [
          {
            toolCallId: 'call-1',
            toolName: 'COMPOSIO_SEARCH_TOOLS',
            hasThoughtSignature: true,
            hasExperimentalThoughtSignature: false,
          },
        ],
      },
    ]);
  });
});

describe('google request thought-signature validation', () => {
  it('summarizes outgoing function calls', () => {
    const summary = summarizeGoogleRequestBodyForDiagnostics(
      JSON.stringify({
        contents: [
          {
            role: 'model',
            parts: [
              {
                functionCall: {
                  name: 'COMPOSIO_SEARCH_TOOLS',
                },
                thoughtSignature: 'sig-1',
              },
            ],
          },
        ],
      }),
    );

    expect(summary).toEqual({
      contents: [
        {
          index: 0,
          role: 'model',
          functionCalls: [
            {
              toolName: 'COMPOSIO_SEARCH_TOOLS',
              hasThoughtSignature: true,
            },
          ],
        },
      ],
    });
  });

  it('throws a clear error when an outgoing function call is missing a thought signature', () => {
    expect(() =>
      validateGoogleRequestThoughtSignatures(
        JSON.stringify({
          contents: [
            {
              role: 'model',
              parts: [
                {
                  functionCall: {
                    name: 'COMPOSIO_SEARCH_TOOLS',
                  },
                },
              ],
            },
          ],
        }),
      ),
    ).toThrow(/missing thought signatures/i);
  });
});

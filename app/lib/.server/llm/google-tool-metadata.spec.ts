import { describe, expect, it, vi } from 'vitest';
import { writeGoogleToolMetadataAnnotations } from './google-tool-metadata';

describe('writeGoogleToolMetadataAnnotations', () => {
  it('emits annotations for tool calls with provider metadata', () => {
    const writeMessageAnnotation = vi.fn();

    writeGoogleToolMetadataAnnotations(
      {
        response: {
          messages: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 'call-1',
                  providerMetadata: {
                    google: {
                      thoughtSignature: 'sig-1',
                    },
                  },
                },
                {
                  type: 'tool-call',
                  toolCallId: 'call-2',
                  experimental_providerMetadata: {
                    google: {
                      thoughtSignature: 'sig-2',
                    },
                  },
                },
                {
                  type: 'tool-call',
                  toolCallId: 'call-3',
                },
              ],
            },
          ],
        },
      },
      { writeMessageAnnotation } as any,
    );

    expect(writeMessageAnnotation).toHaveBeenCalledTimes(2);
    expect(writeMessageAnnotation).toHaveBeenNthCalledWith(1, {
      type: 'googleToolCallMetadata',
      toolCallId: 'call-1',
      providerMetadata: {
        google: {
          thoughtSignature: 'sig-1',
        },
      },
    });
    expect(writeMessageAnnotation).toHaveBeenNthCalledWith(2, {
      type: 'googleToolCallMetadata',
      toolCallId: 'call-2',
      providerMetadata: {
        google: {
          thoughtSignature: 'sig-2',
        },
      },
    });
  });
});

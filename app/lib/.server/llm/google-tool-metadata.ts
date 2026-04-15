import type { DataStreamWriter } from 'ai';
import type { GoogleToolCallMetadataAnnotation } from '~/types/context';

export function writeGoogleToolMetadataAnnotations(stepResult: any, dataStream: DataStreamWriter) {
  const responseMessages = stepResult?.response?.messages;

  if (!Array.isArray(responseMessages)) {
    return;
  }

  for (const message of responseMessages) {
    if (message?.role !== 'assistant' || !Array.isArray(message.content)) {
      continue;
    }

    for (const part of message.content) {
      if (part?.type !== 'tool-call') {
        continue;
      }

      const providerMetadata = part.providerMetadata ?? part.experimental_providerMetadata;

      if (!providerMetadata || typeof providerMetadata !== 'object' || Object.keys(providerMetadata).length === 0) {
        continue;
      }

      dataStream.writeMessageAnnotation({
        type: 'googleToolCallMetadata',
        toolCallId: part.toolCallId,
        providerMetadata,
      } satisfies GoogleToolCallMetadataAnnotation);
    }
  }
}

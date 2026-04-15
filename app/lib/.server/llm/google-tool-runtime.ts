type GoogleContentPart = {
  functionCall?: {
    name?: string;
  };
  thoughtSignature?: unknown;
};

type GoogleRequestBody = {
  contents?: Array<{
    role?: string;
    parts?: GoogleContentPart[];
  }>;
};

export function summarizeGoogleHistoryForDiagnostics(messages: unknown[]) {
  return (messages || [])
    .map((message, index) => {
      if (!message || typeof message !== 'object') {
        return null;
      }

      const content = (message as any).content;

      if (!Array.isArray(content)) {
        return null;
      }

      const toolCalls = content.filter((part) => part?.type === 'tool-call');

      if (toolCalls.length === 0) {
        return null;
      }

      return {
        index,
        toolCalls: toolCalls.map((part) => ({
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          hasThoughtSignature: Boolean(part.providerMetadata?.google?.thoughtSignature),
          hasExperimentalThoughtSignature: Boolean(part.experimental_providerMetadata?.google?.thoughtSignature),
        })),
      };
    })
    .filter(Boolean);
}

export function summarizeGoogleRequestBodyForDiagnostics(body: string) {
  const parsed = JSON.parse(body) as GoogleRequestBody;

  return {
    contents: (parsed.contents || [])
      .map((entry, index) => {
        const functionCalls = (entry.parts || []).filter((part) => part?.functionCall);

        if (functionCalls.length === 0) {
          return null;
        }

        return {
          index,
          role: entry.role || 'unknown',
          functionCalls: functionCalls.map((part) => ({
            toolName: part.functionCall?.name,
            hasThoughtSignature: Boolean(part.thoughtSignature),
          })),
        };
      })
      .filter(Boolean),
  };
}

export function validateGoogleRequestThoughtSignatures(body: string) {
  const summary = summarizeGoogleRequestBodyForDiagnostics(body);
  const invalidCalls = summary.contents.flatMap((entry: any) =>
    entry.functionCalls.filter((call: any) => !call.hasThoughtSignature).map((call: any) => call.toolName || 'unknown'),
  );

  if (invalidCalls.length === 0) {
    return summary;
  }

  throw new Error(
    `Google tool-call serialization is missing thought signatures for: ${invalidCalls.join(
      ', ',
    )}. Restart the dev server so the patched @ai-sdk/google serializer loads, or switch to a non-Google provider for MCP chats.`,
  );
}

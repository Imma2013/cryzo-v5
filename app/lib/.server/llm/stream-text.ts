import {
  convertToCoreMessages,
  formatDataStreamPart,
  generateText,
  streamText as _streamText,
  type CoreMessage,
  type Message,
} from 'ai';
import { MAX_TOKENS, PROVIDER_COMPLETION_LIMITS, isReasoningModel, type FileMap } from './constants';
import { getSystemPrompt } from '~/lib/common/prompts/prompts';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, MODIFICATIONS_TAG_NAME, WORK_DIR } from '~/utils/constants';
import type { IProviderSetting } from '~/types/model';
import { PromptLibrary } from '~/lib/common/prompt-library';
import { allowedHTMLElements } from '~/utils/markdown';
import { LLMManager } from '~/lib/modules/llm/manager';
import { createScopedLogger } from '~/utils/logger';
import { createFilesContext, extractPropertiesFromMessage } from './utils';
import { discussPrompt } from '~/lib/common/prompts/discuss-prompt';
import type { DesignScheme } from '~/types/design-scheme';
import {
  CANONICAL_DESIGN_LIBRARY_PATH,
  type DesignReferenceDoc,
  getDesignReferenceLibrary,
  routeDesignReferences,
} from '~/lib/.server/design-system';
import { buildCanonicalDesignPreamble, buildCompiledReferenceBlock } from '~/lib/common/prompts/design-guidance';
import type { GoogleToolCallMetadataAnnotation } from '~/types/context';
import { summarizeGoogleHistoryForDiagnostics } from './google-tool-runtime';
import { writeGoogleToolMetadataAnnotations } from './google-tool-metadata';
import { getComposioTools } from './composio';
import {
  getBuildWithToolsSystemPrompt,
  getExternalToolSystemPrompt,
  resolveAssistantMode,
} from './external-tool-mode';
import {
  getGoogleChatModels,
  getGoogleTextModelFallbackOrder,
  isSupportedGoogleChatModel,
  normalizeGoogleChatModel,
} from '~/lib/llm/google-catalog';
import { buildDesignAuditSystemPrompt, buildDesignAuditUserPrompt, parseBuildDesignAudit } from './design-audit';
import {
  buildDesignLayoutPlanBlock,
  buildDesignLayoutPlanSystemPrompt,
  buildDesignLayoutPlanUserPrompt,
  parseDesignLayoutPlan,
} from './design-layout-plan';

export type Messages = Message[];

export interface StreamingOptions extends Omit<Parameters<typeof _streamText>[0], 'model'> {
  supabaseConnection?: {
    isConnected: boolean;
    hasSelectedProject: boolean;
    credentials?: {
      anonKey?: string;
      supabaseUrl?: string;
    };
  };
}

const logger = createScopedLogger('stream-text');

export const BUILD_IMAGE_SOURCE_GUIDANCE = `
    <image_source_guidance>
      - Stock-photo URLs are valid output for website and app builds when photos are appropriate.
      - Prefer valid Pexels URLs and link to them directly in generated project files.
      - Do not download, store, or auto-generate image files for normal website builds.
      - Use CSS, SVG, icons, canvas, or 3D code when stock photos are not appropriate.
    </image_source_guidance>`;

function logTiming(event: string, startedAt: number, details: Record<string, unknown> = {}) {
  logger.info(
    event,
    JSON.stringify({
      ...details,
      elapsedMs: Date.now() - startedAt,
    }),
  );
}

function withFirstOutputTiming<T extends Record<string, any>>(result: T, details: Record<string, unknown>): T {
  if (typeof result.mergeIntoDataStream !== 'function') {
    return result;
  }

  const originalMergeIntoDataStream = result.mergeIntoDataStream.bind(result);
  const startedAt = Date.now();
  let firstOutputLogged = false;

  (result as any).mergeIntoDataStream = (writer: { write: (chunk: string) => void }) => {
    return originalMergeIntoDataStream({
      ...(writer as any),
      write(chunk: string) {
        if (!firstOutputLogged && chunk.length > 0) {
          firstOutputLogged = true;
          logTiming('First chat stream output', startedAt, details);
        }

        writer.write(chunk);
      },
    });
  };

  return result;
}

function getAuthorPrompt(messages: Omit<Message, 'id'>[]) {
  return messages
    .filter(
      (message) =>
        message.role === 'user' && !(Array.isArray(message.annotations) && message.annotations.includes('hidden')),
    )
    .map((message) => message.content)
    .join('\n')
    .trim();
}

function collectGoogleToolSchemaDiagnostics(tools: StreamingOptions['tools']) {
  return Object.entries(tools || {}).map(([toolName, tool]) => {
    const jsonSchema = (tool as any)?.parameters?.jsonSchema;
    const nestedToolsItemsRequired =
      jsonSchema && typeof jsonSchema === 'object' && (jsonSchema as any).properties?.tools?.items?.required;

    return {
      toolName,
      hasParameters: !!(tool as any)?.parameters,
      topLevelRequired: Array.isArray((jsonSchema as any)?.required) ? (jsonSchema as any).required : undefined,
      nestedToolsItemsRequired: Array.isArray(nestedToolsItemsRequired) ? nestedToolsItemsRequired : undefined,
    };
  });
}

function getCompletionTokenLimit(modelDetails: any): number {
  // 1. If model specifies completion tokens, use that
  if (modelDetails.maxCompletionTokens && modelDetails.maxCompletionTokens > 0) {
    return modelDetails.maxCompletionTokens;
  }

  // 2. Use provider-specific default
  const providerDefault = PROVIDER_COMPLETION_LIMITS[modelDetails.provider];

  if (providerDefault) {
    return providerDefault;
  }

  // 3. Final fallback to MAX_TOKENS, but cap at reasonable limit for safety
  return Math.min(MAX_TOKENS, 16384);
}

function sanitizeText(text: string): string {
  let sanitized = text.replace(/<div class=\\"__boltThought__\\">.*?<\/div>/s, '');
  sanitized = sanitized.replace(/<think>.*?<\/think>/s, '');
  sanitized = sanitized.replace(/<boltAction type="file" filePath="package-lock\.json">[\s\S]*?<\/boltAction>/g, '');

  return sanitized.trim();
}

function createEncodedTextStream(text: string) {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (text.length > 0) {
        controller.enqueue(encoder.encode(text));
      }

      controller.close();
    },
  });
}

function createSinglePartObjectStream<T>(parts: T[]) {
  return new ReadableStream<T>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
      }

      controller.close();
    },
  });
}

function buildGenerateTextCompatStepResults(result: Awaited<ReturnType<typeof generateText>>) {
  if (Array.isArray(result.steps) && result.steps.length > 0) {
    return result.steps;
  }

  return [
    {
      finishReason: result.finishReason ?? 'stop',
      response: result.response,
      text: result.text,
      toolCalls: result.toolCalls,
      toolResults: result.toolResults,
      usage: result.usage,
    },
  ];
}

function buildGenerateTextCompatFullStreamParts(result: Awaited<ReturnType<typeof generateText>>, finishReason: string, usage: any) {
  const parts: any[] = [];
  const stepResults = buildGenerateTextCompatStepResults(result);

  for (const step of stepResults) {
    const responseMessages = Array.isArray(step?.response?.messages) ? step.response.messages : [];
    let emittedContent = false;

    for (const message of responseMessages) {
      if (!Array.isArray(message?.content)) {
        continue;
      }

      if (message.role === 'assistant') {
        for (const part of message.content) {
          if (part?.type === 'text' && typeof part.text === 'string' && part.text.length > 0) {
            emittedContent = true;
            parts.push({
              textDelta: part.text,
              type: 'text-delta',
            });
          }

          if (part?.type === 'tool-call') {
            emittedContent = true;
            parts.push({
              args: part.args,
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              type: 'tool-call',
            });
          }
        }
      }

      if (message.role === 'tool') {
        for (const part of message.content) {
          if (part?.type === 'tool-result') {
            emittedContent = true;
            parts.push({
              result: part.result,
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              type: 'tool-result',
            });
          }
        }
      }
    }

    if (!emittedContent && typeof step?.text === 'string' && step.text.length > 0) {
      parts.push({
        textDelta: step.text,
        type: 'text-delta',
      });
    }
  }

  parts.push({
    finishReason,
    providerMetadata: result.providerMetadata,
    response: result.response,
    type: 'finish',
    usage,
  });

  return parts;
}

export function createGenerateTextCompatResult({
  result,
  onFinish,
}: {
  result: Awaited<ReturnType<typeof generateText>>;
  onFinish?: StreamingOptions['onFinish'];
}) {
  const finishReason = result.finishReason ?? 'stop';
  const usage = {
    completionTokens: result.usage.completionTokens,
    promptTokens: result.usage.promptTokens,
    totalTokens:
      result.usage.totalTokens ?? (result.usage.promptTokens || 0) + (result.usage.completionTokens || 0),
  };
  const compatStepResults = buildGenerateTextCompatStepResults(result);
  const messageId =
    compatStepResults
      .flatMap((step) => (Array.isArray(step?.response?.messages) ? step.response.messages : []))
      .find((message) => message?.role === 'assistant' && typeof message?.id === 'string')?.id || 'msg-google-compat';
  let finishTriggered = false;

  const runOnFinish = async () => {
    if (finishTriggered || !onFinish) {
      return;
    }

    finishTriggered = true;
    await onFinish({
      finishReason,
      text: result.text,
      usage,
    } as any);
  };

  return {
    experimental_providerMetadata: Promise.resolve(result.providerMetadata),
    files: Promise.resolve(result.files),
    finishReason: Promise.resolve(finishReason),
    fullStream: createSinglePartObjectStream<any>(buildGenerateTextCompatFullStreamParts(result, finishReason, usage)),
    mergeIntoDataStream(writer: {
      write: (chunk: string) => void;
    }) {
      for (const [index, step] of compatStepResults.entries()) {
        const responseMessages = Array.isArray(step?.response?.messages) ? step.response.messages : [];
        const stepMessageId =
          responseMessages.find((message) => message?.role === 'assistant' && typeof message?.id === 'string')?.id ||
          (index === 0 ? messageId : `${messageId}-${index}`);

        writer.write(formatDataStreamPart('start_step', { messageId: stepMessageId }));

        writeGoogleToolMetadataAnnotations(step, {
          writeMessageAnnotation(annotation: any) {
            writer.write(formatDataStreamPart('message_annotations', [annotation]));
          },
        } as any);

        let emittedContent = false;

        for (const responseMessage of responseMessages) {
          if (!Array.isArray(responseMessage?.content)) {
            continue;
          }

          if (responseMessage.role === 'assistant') {
            for (const part of responseMessage.content) {
              if (part?.type === 'text' && typeof part.text === 'string' && part.text.length > 0) {
                emittedContent = true;
                writer.write(formatDataStreamPart('text', part.text));
              }

              if (part?.type === 'tool-call') {
                emittedContent = true;
                writer.write(
                  formatDataStreamPart('tool_call', {
                    args: part.args,
                    toolCallId: part.toolCallId,
                    toolName: part.toolName,
                  }),
                );
              }
            }
          }

          if (responseMessage.role === 'tool') {
            for (const part of responseMessage.content) {
              if (part?.type === 'tool-result') {
                emittedContent = true;
                writer.write(
                  formatDataStreamPart('tool_result', {
                    result: part.result,
                    toolCallId: part.toolCallId,
                  }),
                );
              }
            }
          }
        }

        if (!emittedContent && typeof step?.text === 'string' && step.text.length > 0) {
          writer.write(formatDataStreamPart('text', step.text));
        }

        writer.write(
          formatDataStreamPart('finish_step', {
            finishReason:
              typeof step?.finishReason === 'string' && step.finishReason.length > 0 ? step.finishReason : finishReason,
            isContinued: false,
            usage: {
              completionTokens: step?.usage?.completionTokens ?? usage.completionTokens,
              promptTokens: step?.usage?.promptTokens ?? usage.promptTokens,
            },
          }),
        );
      }

      writer.write(
        formatDataStreamPart('finish_message', {
          finishReason,
          usage: {
            completionTokens: usage.completionTokens,
            promptTokens: usage.promptTokens,
          },
        }),
      );

      void runOnFinish();
    },
    providerMetadata: Promise.resolve(result.providerMetadata),
    reasoning: Promise.resolve(result.reasoning),
    request: Promise.resolve(result.request),
    response: Promise.resolve(result.response),
    sources: Promise.resolve(result.sources),
    steps: Promise.resolve(result.steps),
    text: Promise.resolve(result.text),
    textStream: createEncodedTextStream(result.text),
    toolCalls: Promise.resolve(result.toolCalls),
    toolResults: Promise.resolve(result.toolResults),
    usage: Promise.resolve(usage),
    warnings: Promise.resolve(result.warnings),
  } as any;
}

function hasUsableGenerateTextOutput(result: Awaited<ReturnType<typeof generateText>>) {
  if (typeof result.text === 'string' && result.text.trim().length > 0) {
    return true;
  }

  if ((result.toolCalls?.length || 0) > 0 || (result.toolResults?.length || 0) > 0) {
    return true;
  }

  return (result.response?.messages || []).some((message: any) =>
    Array.isArray(message?.content)
      ? message.content.some((part: any) => {
          if (part?.type === 'text') {
            return typeof part.text === 'string' && part.text.trim().length > 0;
          }

          return part?.type === 'tool-call' || part?.type === 'tool-result';
        })
      : false,
  );
}

function assertUsableGenerateTextOutput(result: Awaited<ReturnType<typeof generateText>>, modelName?: string) {
  if (!hasUsableGenerateTextOutput(result)) {
    throw new Error(`Google model ${modelName || 'unknown'} returned an empty response`);
  }
}

async function createGenerateTextCompatResultFromParams({
  streamParams,
  onFinish,
}: {
  streamParams: Parameters<typeof generateText>[0];
  onFinish?: StreamingOptions['onFinish'];
}) {
  const result = await generateText(streamParams);
  assertUsableGenerateTextOutput(result, (streamParams.model as any)?.modelId || (streamParams.model as any)?.modelName);

  return createGenerateTextCompatResult({
    result,
    onFinish,
  });
}

export async function createGoogleGenerateFallbackResult({
  streamParams,
  onFinish,
}: {
  streamParams: Parameters<typeof generateText>[0];
  onFinish?: StreamingOptions['onFinish'];
}) {
  return createGenerateTextCompatResultFromParams({
    streamParams,
    onFinish,
  });
}

function compactGeneratedDraft(text: string, maxLength = 16000) {
  return text.trim().slice(0, maxLength);
}

function appendRetryAuditBlock(systemPrompt: string, critique: string[]) {
  if (critique.length === 0) {
    return systemPrompt;
  }

  return `${systemPrompt}

<design_audit_retry>
The previous draft drifted away from the selected reference and must be corrected before returning.
Fix these issues in the next draft:
${critique.map((item) => `- ${item}`).join('\n')}
Do not return the same generic structure again. Rebuild the output so it feels unmistakably aligned with the selected reference.
</design_audit_retry>`;
}

async function auditBuildDraft({
  generatedText,
  executionPacket,
  layoutPlan,
  primaryReference,
  userPrompt,
  model,
  isReasoning,
}: {
  generatedText: string;
  executionPacket: string;
  layoutPlan: string;
  primaryReference: DesignReferenceDoc;
  userPrompt: string;
  model: Parameters<typeof generateText>[0]['model'];
  isReasoning: boolean;
}) {
  const auditPrompt = buildDesignAuditUserPrompt({
    generatedText: compactGeneratedDraft(generatedText),
    executionPacket,
    layoutPlan,
    primarySlug: primaryReference.slug,
    userPrompt,
  });

  const auditResult = await generateText({
    model,
    system: buildDesignAuditSystemPrompt(),
    messages: [
      {
        role: 'user',
        content: auditPrompt,
      },
    ],
    ...(isReasoning ? { maxCompletionTokens: 1024, temperature: 1 } : { maxTokens: 1024, temperature: 0 }),
  });

  return parseBuildDesignAudit(auditResult.text);
}

async function buildLockedLayoutPlan({
  executionPacket,
  primaryReference,
  userPrompt,
  model,
  isReasoning,
}: {
  executionPacket: string;
  primaryReference: DesignReferenceDoc;
  userPrompt: string;
  model: Parameters<typeof generateText>[0]['model'];
  isReasoning: boolean;
}) {
  const layoutPlanResult = await generateText({
    model,
    system: buildDesignLayoutPlanSystemPrompt(),
    messages: [
      {
        role: 'user',
        content: buildDesignLayoutPlanUserPrompt({
          executionPacket,
          primarySlug: primaryReference.slug,
          userPrompt,
        }),
      },
    ],
    ...(isReasoning ? { maxCompletionTokens: 1400, temperature: 1 } : { maxTokens: 1400, temperature: 0 }),
  });

  return parseDesignLayoutPlan(layoutPlanResult.text);
}

export function getGoogleProviderOptions(
  existingProviderOptions?: StreamingOptions['providerOptions'],
): StreamingOptions['providerOptions'] {
  return {
    ...(existingProviderOptions || {}),
    google: {
      ...(((existingProviderOptions || {}).google as Record<string, any> | undefined) || {}),
      thinkingConfig: {
        ...((((existingProviderOptions || {}).google as Record<string, any> | undefined)?.thinkingConfig as
          | Record<string, any>
          | undefined) || {}),
        includeThoughts: true,
      },
    },
  };
}

export function getGoogleToolMetadataById(message: Omit<Message, 'id'>): Map<string, Record<string, any>> {
  const annotations = Array.isArray(message.annotations) ? message.annotations : [];
  const metadataEntries = annotations.filter((annotation) => {
    return (
      !!annotation &&
      typeof annotation === 'object' &&
      'type' in annotation &&
      (annotation as any).type === 'googleToolCallMetadata' &&
      'toolCallId' in annotation &&
      'providerMetadata' in annotation
    );
  }) as GoogleToolCallMetadataAnnotation[];

  return new Map(metadataEntries.map((entry) => [entry.toolCallId, entry.providerMetadata]));
}

export function buildAssistantSystemPrompt({
  assistantMode,
  systemPrompt,
  composioConfigured,
  hasComposioIdentity,
  toolResolutionError,
  toolsAvailable,
}: {
  assistantMode: 'build' | 'discuss' | 'external-tool' | 'build-with-tools';
  systemPrompt: string;
  composioConfigured: boolean;
  hasComposioIdentity: boolean;
  toolResolutionError?: string;
  toolsAvailable: boolean;
}) {
  if (assistantMode === 'external-tool') {
    return getExternalToolSystemPrompt({
      composioConfigured,
      hasComposioIdentity,
      toolResolutionError,
      toolsAvailable,
    });
  }

  if (assistantMode === 'build-with-tools') {
    return `${systemPrompt}

${getBuildWithToolsSystemPrompt({
  composioConfigured,
  hasComposioIdentity,
  toolResolutionError,
  toolsAvailable,
})}`;
  }

  return systemPrompt;
}

export function getAssistantToolRuntimeSettings({
  assistantMode,
  toolsAvailable,
}: {
  assistantMode: 'build' | 'discuss' | 'external-tool' | 'build-with-tools';
  toolsAvailable: boolean;
}) {
  if (!toolsAvailable) {
    return {};
  }

  if (assistantMode === 'external-tool') {
    return {
      maxSteps: 10,
      toolChoice: 'required' as const,
    };
  }

  if (assistantMode === 'build-with-tools') {
    return {
      maxSteps: 8,
    };
  }

  return {};
}

export function getExternalToolRuntimeErrorMessage({
  assistantMode,
  providerName,
  composioToolResolution,
}: {
  assistantMode: 'build' | 'discuss' | 'external-tool' | 'build-with-tools';
  providerName: string;
  composioToolResolution: {
    errorMessage?: string;
    status:
      | 'available'
      | 'disabled'
      | 'missing_api_key'
      | 'unsupported_provider'
      | 'missing_identity'
      | 'resolution_failed';
  };
}) {
  if (assistantMode !== 'external-tool') {
    return undefined;
  }

  switch (composioToolResolution.status) {
    case 'missing_api_key':
      return 'External app tools are not configured: COMPOSIO_API_KEY is missing on the server. Add it to the Vercel project environment variables and redeploy before retrying.';
    case 'unsupported_provider':
      return `Selected provider "${providerName}" does not support external app tool calling. Switch to a tool-capable provider and retry.`;
    case 'resolution_failed':
      return composioToolResolution.errorMessage
        ? `External app tools are temporarily unavailable: ${composioToolResolution.errorMessage}`
        : 'External app tools are temporarily unavailable right now. Retry in a moment.';
    default:
      return undefined;
  }
}

export function buildGoogleCoreMessages(
  messages: Omit<Message, 'id'>[],
  tools: StreamingOptions['tools'],
): CoreMessage[] {
  const coreMessages: CoreMessage[] = [];

  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    const isLastMessage = index === messages.length - 1;

    switch (message.role) {
      case 'system': {
        coreMessages.push({
          role: 'system',
          content: message.content,
        });
        break;
      }
      case 'user': {
        if (!message.parts) {
          coreMessages.push({
            role: 'user',
            content: message.content,
          });
          break;
        }

        coreMessages.push({
          role: 'user',
          content: message.parts
            .filter(
              (part): part is Extract<(typeof message.parts)[number], { type: 'text' | 'file' }> =>
                part.type === 'text' || part.type === 'file',
            )
            .map((part) =>
              part.type === 'text'
                ? {
                    type: 'text' as const,
                    text: sanitizeText(part.text),
                  }
                : {
                    type: 'file' as const,
                    data: part.data,
                    mimeType: part.mimeType,
                  },
            ),
        });
        break;
      }
      case 'assistant': {
        if (!message.parts) {
          coreMessages.push({
            role: 'assistant',
            content: sanitizeText(message.content),
          });
          break;
        }

        const toolMetadataById = getGoogleToolMetadataById(message);
        let currentStep = 0;
        let blockHasToolInvocations = false;
        let block: any[] = [];

        const flushBlock = () => {
          if (block.length === 0) {
            return;
          }

          const assistantContent: any[] = [];
          const toolInvocations: any[] = [];

          for (const part of block) {
            switch (part.type) {
              case 'text': {
                assistantContent.push({
                  type: 'text',
                  text: sanitizeText(part.text),
                } as any);
                break;
              }
              case 'file': {
                assistantContent.push({
                  type: 'file',
                  data: part.data,
                  mimeType: part.mimeType,
                } as any);
                break;
              }
              case 'reasoning': {
                for (const detail of part.details) {
                  if (detail.type === 'text') {
                    assistantContent.push({
                      type: 'reasoning',
                      text: detail.text,
                      signature: detail.signature,
                    } as any);
                  } else if (detail.type === 'redacted') {
                    assistantContent.push({
                      type: 'redacted-reasoning',
                      data: detail.data,
                    } as any);
                  }
                }
                break;
              }
              case 'tool-invocation': {
                const providerMetadata = toolMetadataById.get(part.toolInvocation.toolCallId);

                assistantContent.push({
                  type: 'tool-call',
                  toolCallId: part.toolInvocation.toolCallId,
                  toolName: part.toolInvocation.toolName,
                  args: part.toolInvocation.args,
                  providerMetadata,
                  experimental_providerMetadata: providerMetadata,
                } as any);
                toolInvocations.push(part.toolInvocation);
                break;
              }
              default:
                break;
            }
          }

          coreMessages.push({
            role: 'assistant',
            content: assistantContent as any,
          });

          if (toolInvocations.length > 0) {
            coreMessages.push({
              role: 'tool',
              content: toolInvocations.map((toolInvocation) => {
                if (!('result' in toolInvocation)) {
                  throw new Error(`ToolInvocation must have a result: ${JSON.stringify(toolInvocation)}`);
                }

                const { toolCallId, toolName, result } = toolInvocation;
                const tool = tools?.[toolName];

                return tool?.experimental_toToolResultContent
                  ? {
                      type: 'tool-result' as const,
                      toolCallId,
                      toolName,
                      result: tool.experimental_toToolResultContent(result),
                      experimental_content: tool.experimental_toToolResultContent(result),
                    }
                  : {
                      type: 'tool-result' as const,
                      toolCallId,
                      toolName,
                      result,
                    };
              }) as any,
            });
          }

          block = [];
          blockHasToolInvocations = false;
          currentStep++;
        };

        for (const part of message.parts) {
          switch (part.type) {
            case 'text': {
              if (blockHasToolInvocations) {
                flushBlock();
              }

              block.push(part);
              break;
            }
            case 'file':
            case 'reasoning': {
              block.push(part);
              break;
            }
            case 'tool-invocation': {
              if ((part.toolInvocation.step ?? 0) !== currentStep) {
                flushBlock();
              }

              block.push(part);
              blockHasToolInvocations = true;
              break;
            }
            default:
              break;
          }
        }

        flushBlock();

        if (!isLastMessage && message.content && !message.parts.some((part) => part.type === 'text')) {
          coreMessages.push({
            role: 'assistant',
            content: sanitizeText(message.content),
          });
        }

        break;
      }
      case 'data':
        break;
      default:
        break;
    }
  }

  return coreMessages;
}

export async function streamText(props: {
  messages: Omit<Message, 'id'>[];
  env?: Env;
  options?: StreamingOptions;
  apiKeys?: Record<string, string>;
  files?: FileMap;
  providerSettings?: Record<string, IProviderSetting>;
  promptId?: string;
  contextOptimization?: boolean;
  contextFiles?: FileMap;
  summary?: string;
  messageSliceId?: number;
  chatMode?: 'discuss' | 'build';
  designScheme?: DesignScheme;
  requestOrigin?: string;
  user?: {
    composioUserId?: string;
    email?: string;
    hasComposioIdentity?: boolean;
    isAuthenticated: boolean;
    isSignedIn?: boolean;
    uid?: string;
  };
}) {
  const {
    messages,
    env: serverEnv,
    options,
    apiKeys,
    files,
    providerSettings,
    promptId,
    contextOptimization,
    contextFiles,
    summary,
    chatMode,
    designScheme,
    requestOrigin,
    user,
  } = props;
  let currentModel = DEFAULT_MODEL;
  let currentProvider = DEFAULT_PROVIDER.name;
  const requestedTools = options?.tools || {};
  let processedMessages = messages.map((message) => {
    const newMessage = { ...message };

    if (message.role === 'user') {
      const { model, provider, content } = extractPropertiesFromMessage(message);
      void provider;
      currentModel = model || DEFAULT_MODEL;
      currentProvider = DEFAULT_PROVIDER.name;
      newMessage.content = sanitizeText(content);
    } else if (message.role == 'assistant') {
      newMessage.content = sanitizeText(message.content);
    }

    // Sanitize all text parts in parts array, if present
    if (Array.isArray(message.parts)) {
      newMessage.parts = message.parts.map((part) =>
        part.type === 'text' ? { ...part, text: sanitizeText(part.text) } : part,
      );
    }

    return newMessage;
  });
  const latestUserPrompt = getAuthorPrompt(processedMessages);
  const assistantMode = resolveAssistantMode(chatMode, latestUserPrompt);
  const shouldInjectComposioTools = assistantMode === 'external-tool' || assistantMode === 'build-with-tools';

  const llmManager = LLMManager.getInstance(serverEnv as any);
  const provider = llmManager.getProvider(DEFAULT_PROVIDER.name);

  if (!provider) {
    throw new Error(`Provider ${currentProvider} not found`);
  }

  const effectiveModelName = currentProvider === 'Google' ? normalizeGoogleChatModel(currentModel) : currentModel;
  const staticModels = llmManager.getStaticModelListFromProvider(provider);
  let modelDetails = staticModels.find((m) => m.name === effectiveModelName);

  if (!modelDetails) {
    const modelsList = [
      ...(provider.staticModels || []),
      ...(await llmManager.getModelListFromProvider(provider, {
        apiKeys,
        providerSettings,
        serverEnv: serverEnv as any,
      })),
    ];

    if (!modelsList.length) {
      throw new Error(`No models found for provider ${provider.name}`);
    }

    modelDetails = modelsList.find((m) => m.name === effectiveModelName);

    if (!modelDetails) {
      if (provider.name === 'Google' && !isSupportedGoogleChatModel(effectiveModelName)) {
        const allowedModels = getGoogleChatModels()
          .map((model) => model.name)
          .join(', ');

        throw new Error(
          `Model "${effectiveModelName}" is not an allowed Google model. Allowed Gemini models: ${allowedModels}.`,
        );
      }

      if (provider.name === 'Google') {
        throw new Error(
          `Model "${effectiveModelName}" is unavailable for Google right now. Allowed Gemini models: ${getGoogleTextModelFallbackOrder().join(', ')}.`,
        );
      }

      // Fallback to first model with warning
      logger.warn(
        `MODEL [${currentModel}] not found in provider [${provider.name}]. Falling back to first model. ${modelsList[0].name}`,
      );
      modelDetails = modelsList[0];
    }
  }

  const dynamicMaxTokens = modelDetails ? getCompletionTokenLimit(modelDetails) : Math.min(MAX_TOKENS, 16384);
  const designReferenceLibrary =
    assistantMode === 'build' || assistantMode === 'build-with-tools' ? getDesignReferenceLibrary() : [];
  const designRouting =
    assistantMode === 'build' || assistantMode === 'build-with-tools'
      ? routeDesignReferences(latestUserPrompt, 1)
      : undefined;
  const selectedPrimaryReference = designRouting?.primary;
  const compiledReferenceBrief = selectedPrimaryReference
    ? buildCompiledReferenceBlock({
        slug: selectedPrimaryReference.slug,
        relativePath: selectedPrimaryReference.relativePath,
        excerpt: selectedPrimaryReference.excerpt,
        markdown: selectedPrimaryReference.markdown,
        profile: selectedPrimaryReference.profile,
        source: selectedPrimaryReference.source,
      })
    : '';

  // Use model-specific limits directly - no artificial cap needed
  const safeMaxTokens = dynamicMaxTokens;

  logger.info(
    `Token limits for model ${modelDetails.name}: maxTokens=${safeMaxTokens}, maxTokenAllowed=${modelDetails.maxTokenAllowed}, maxCompletionTokens=${modelDetails.maxCompletionTokens}`,
  );

  let systemPrompt =
    PromptLibrary.getPropmtFromLibrary(promptId || 'default', {
      cwd: WORK_DIR,
      allowedHtmlElements: allowedHTMLElements,
      modificationTagName: MODIFICATIONS_TAG_NAME,
      designScheme,
      canonicalDesignActive: Boolean(selectedPrimaryReference),
      supabase: {
        isConnected: options?.supabaseConnection?.isConnected || false,
        hasSelectedProject: options?.supabaseConnection?.hasSelectedProject || false,
        credentials: options?.supabaseConnection?.credentials || undefined,
      },
    }) ?? getSystemPrompt();

  if (assistantMode === 'build' || assistantMode === 'build-with-tools') {
    const selectionSource = designRouting?.selectionSource;
    const canonicalDesignPreamble = buildCanonicalDesignPreamble({
      libraryPath: designReferenceLibrary.length > 0 ? CANONICAL_DESIGN_LIBRARY_PATH : undefined,
      availableReferences: designReferenceLibrary.map((reference) => reference.slug),
      selectedReferences: [selectedPrimaryReference]
        .filter((reference): reference is NonNullable<typeof reference> => !!reference)
        .map((reference) => ({
          slug: reference.slug,
          relativePath: reference.relativePath,
          excerpt: reference.excerpt,
          markdown: reference.markdown,
          profile: reference.profile,
          source: reference.source,
        })),
      selectionSource,
      designScheme,
    });

    if (canonicalDesignPreamble) {
      systemPrompt = `${canonicalDesignPreamble}\n\n${systemPrompt}`;
    } else if (designReferenceLibrary.length > 0) {
      logger.warn('Design reference library is available but no canonical design preamble was generated');
    }

    logger.info(
      `Design prompt diagnostics: mode=${assistantMode} primary=${selectedPrimaryReference?.slug ?? 'none'} source=${selectionSource ?? 'unknown'} hiddenFilteredPromptLength=${latestUserPrompt.length} preambleInjected=${canonicalDesignPreamble ? 'yes' : 'no'} compiledBrief=${compiledReferenceBrief ? 'yes' : 'no'}`,
    );
  }

  if ((assistantMode === 'build' || assistantMode === 'build-with-tools') && contextFiles && contextOptimization) {
    const codeContext = createFilesContext(contextFiles, true);

    systemPrompt = `${systemPrompt}

    Below is the artifact containing the context loaded into context buffer for you to have knowledge of and might need changes to fullfill current user request.
    CONTEXT BUFFER:
    ---
    ${codeContext}
    ---
    `;

    if (summary) {
      systemPrompt = `${systemPrompt}
      below is the chat history till now
      CHAT SUMMARY:
      ---
      ${props.summary}
      ---
      `;

      if (props.messageSliceId) {
        processedMessages = processedMessages.slice(props.messageSliceId);
      } else {
        const lastMessage = processedMessages.pop();

        if (lastMessage) {
          processedMessages = [lastMessage];
        }
      }
    }
  }

  const effectiveLockedFilePaths = new Set<string>();

  if (files) {
    for (const [filePath, fileDetails] of Object.entries(files)) {
      if (fileDetails?.isLocked) {
        effectiveLockedFilePaths.add(filePath);
      }
    }
  }

  if (effectiveLockedFilePaths.size > 0) {
    const lockedFilesListString = Array.from(effectiveLockedFilePaths)
      .map((filePath) => `- ${filePath}`)
      .join('\n');
    systemPrompt = `${systemPrompt}

    IMPORTANT: The following files are locked and MUST NOT be modified in any way. Do not suggest or make any changes to these files. You can proceed with the request but DO NOT make any changes to these files specifically:
    ${lockedFilesListString}
    ---
    `;
  } else {
    console.log('No locked files found from any source for prompt.');
  }

  logger.info(`Sending llm call to ${provider.name} with model ${modelDetails.name}`);

  // Log reasoning model detection and token parameters
  const isReasoning = isReasoningModel(modelDetails.name);
  logger.info(
    `Model "${modelDetails.name}" is reasoning model: ${isReasoning}, using ${isReasoning ? 'maxCompletionTokens' : 'maxTokens'}: ${safeMaxTokens}`,
  );

  // Validate token limits before API call
  if (safeMaxTokens > (modelDetails.maxTokenAllowed || 128000)) {
    logger.warn(
      `Token limit warning: requesting ${safeMaxTokens} tokens but model supports max ${modelDetails.maxTokenAllowed || 128000}`,
    );
  }

  // Use maxCompletionTokens for reasoning models (o1, GPT-5), maxTokens for traditional models
  const tokenParams = isReasoning ? { maxCompletionTokens: safeMaxTokens } : { maxTokens: safeMaxTokens };

  // Filter out unsupported parameters for reasoning models
  const filteredOptions =
    isReasoning && options
      ? Object.fromEntries(
          Object.entries(options).filter(
            ([key]) =>
              ![
                'temperature',
                'topP',
                'presencePenalty',
                'frequencyPenalty',
                'logprobs',
                'topLogprobs',
                'logitBias',
              ].includes(key),
          ),
        )
      : options || {};
  const composioToolResolution = shouldInjectComposioTools
    ? await getComposioTools({
        env: serverEnv as unknown as Record<string, string | undefined>,
        providerName: provider.name,
        requestOrigin,
        user,
        userPrompt: latestUserPrompt || undefined,
      })
    : {
        configured: false,
        hasIdentity: Boolean(user?.uid || user?.composioUserId),
        resolvedUserId: user?.uid || user?.composioUserId,
        status: 'disabled' as const,
        tools: {},
      };
  const composioTools = composioToolResolution.tools;
  const composioToolCount = Object.keys(composioTools).length;
  let composioCleanedUp = false;
  const cleanupComposioTools = async (reason: string) => {
    if (composioCleanedUp || typeof composioToolResolution.cleanup !== 'function') {
      return;
    }

    composioCleanedUp = true;

    try {
      await composioToolResolution.cleanup();
      logger.info(
        'Composio cleanup complete',
        JSON.stringify({
          assistantMode,
          reason,
          resolvedUserId: composioToolResolution.resolvedUserId,
          toolCount: composioToolCount,
        }),
      );
    } catch (error) {
      logger.warn(
        'Composio cleanup failed',
        JSON.stringify({
          assistantMode,
          errorMessage: error instanceof Error ? error.message : String(error),
          reason,
          resolvedUserId: composioToolResolution.resolvedUserId,
          toolCount: composioToolCount,
        }),
      );
    }
  };
  logger.info(
    'Composio resolution',
    JSON.stringify({
      assistantMode,
      errorMessage: composioToolResolution.errorMessage,
      hasIdentity: composioToolResolution.hasIdentity,
      provider: provider.name,
      resolvedUserId: composioToolResolution.resolvedUserId,
      status: composioToolResolution.status,
      toolCount: composioToolCount,
    }),
  );

  if ((assistantMode === 'external-tool' || assistantMode === 'build-with-tools') && shouldInjectComposioTools) {
    if (!composioToolResolution.configured || composioToolCount === 0) {
      logger.warn(
        'Composio chat tools unavailable for tool-intent request',
        JSON.stringify({
          assistantMode,
          configured: composioToolResolution.configured,
          errorMessage: composioToolResolution.errorMessage,
          hasIdentity: composioToolResolution.hasIdentity,
          provider: provider.name,
          resolvedUserId: composioToolResolution.resolvedUserId,
          status: composioToolResolution.status,
          toolCount: composioToolCount,
        }),
      );
    }
  }

  const externalToolRuntimeError = getExternalToolRuntimeErrorMessage({
    assistantMode,
    composioToolResolution,
    providerName: provider.name,
  });

  if (externalToolRuntimeError) {
    throw new Error(externalToolRuntimeError);
  }

  const tools = {
    ...(filteredOptions.tools || {}),
    ...composioTools,
  };
  const hasTools = Object.keys(tools).length > 0;
  const assistantToolRuntimeSettings = getAssistantToolRuntimeSettings({
    assistantMode,
    toolsAvailable: composioToolCount > 0,
  });
  const providerOptions =
    provider.name === 'Google' && hasTools
      ? getGoogleProviderOptions(filteredOptions.providerOptions)
      : filteredOptions.providerOptions;

  if (provider.name === 'Google' && hasTools) {
    logger.info(
      'Google tool schema diagnostics',
      JSON.stringify(
        collectGoogleToolSchemaDiagnostics(tools).filter(
          (entry) => entry.nestedToolsItemsRequired || entry.toolName.includes('COMPOSIO'),
        ),
      ),
    );
  }

  if (assistantMode === 'build') {
    systemPrompt = `${systemPrompt}

${BUILD_IMAGE_SOURCE_GUIDANCE}`;
  }

  // DEBUG: Log filtered options
  logger.info(
    `DEBUG STREAM: Options filtering for model "${modelDetails.name}":`,
    JSON.stringify(
      {
        isReasoning,
        originalOptions: options || {},
        filteredOptions,
        originalOptionsKeys: options ? Object.keys(options) : [],
        filteredOptionsKeys: Object.keys(filteredOptions),
        removedParams: options ? Object.keys(options).filter((key) => !(key in filteredOptions)) : [],
      },
      null,
      2,
    ),
  );

  const historyMessages =
    provider.name === 'Google' ? buildGoogleCoreMessages(processedMessages, tools) : processedMessages;

  const { onFinish: userOnFinish, onStepFinish: userOnStepFinish, ...restFilteredOptions } = filteredOptions as typeof filteredOptions & {
    onFinish?: StreamingOptions['onFinish'];
    onStepFinish?: ((step: any) => void | Promise<void>) | undefined;
  };
  let usedToolCall = false;

  const instrumentedOnStepFinish = async (step: any) => {
    const toolCalls = Array.isArray(step?.toolCalls) ? step.toolCalls : [];

    if ((assistantMode === 'external-tool' || assistantMode === 'build-with-tools') && toolCalls.length > 0) {
      usedToolCall = true;
      logger.info(
        'Composio tool step finished',
        JSON.stringify({
          assistantMode,
          finishReason: step?.finishReason,
          toolCallCount: toolCalls.length,
          toolNames: toolCalls.map((toolCall: any) => toolCall?.toolName).filter(Boolean),
        }),
      );
    }

    if (typeof userOnStepFinish === 'function') {
      await userOnStepFinish(step);
    }
  };

  const instrumentedOnFinish = async (event: any) => {
    try {
      if (assistantMode === 'external-tool' && composioToolCount > 0 && !usedToolCall) {
        logger.warn(
          'Composio tools were available but the model did not invoke them',
          JSON.stringify({
            assistantMode,
            provider: provider.name,
            resolvedUserId: composioToolResolution.resolvedUserId,
            status: composioToolResolution.status,
            toolCount: composioToolCount,
          }),
        );
      }

      if (typeof userOnFinish === 'function') {
        await userOnFinish(event);
      }
    } finally {
      await cleanupComposioTools('finish');
    }
  };

  if (provider.name === 'Google' && hasTools) {
    logger.info(
      'Google reconstructed tool-call diagnostics',
      JSON.stringify(summarizeGoogleHistoryForDiagnostics(historyMessages as unknown[])),
    );
  }

  const streamParams = {
    model: provider.getModelInstance({
      model: modelDetails.name,
      serverEnv,
      apiKeys,
      providerSettings,
    }),
    system:
      assistantMode === 'discuss'
        ? discussPrompt()
        : buildAssistantSystemPrompt({
            assistantMode,
            systemPrompt,
            composioConfigured: composioToolResolution.configured,
            hasComposioIdentity: composioToolResolution.hasIdentity,
            toolResolutionError: composioToolResolution.errorMessage,
            toolsAvailable: Object.keys(composioTools).length > 0,
          }),
    ...tokenParams,
    messages:
      provider.name === 'Google'
        ? (historyMessages as CoreMessage[])
        : convertToCoreMessages(historyMessages as any, { tools }),
    ...restFilteredOptions,
    ...assistantToolRuntimeSettings,
    onFinish: instrumentedOnFinish,
    onStepFinish: instrumentedOnStepFinish,
    providerOptions,
    tools,

    // Set temperature to 1 for reasoning models (required by OpenAI API)
    ...(isReasoning ? { temperature: 1 } : {}),
  };

  // DEBUG: Log final streaming parameters
  logger.info(
    `DEBUG STREAM: Final streaming params for model "${modelDetails.name}":`,
    JSON.stringify(
      {
        hasTemperature: 'temperature' in streamParams,
        hasMaxTokens: 'maxTokens' in streamParams,
        hasMaxCompletionTokens: 'maxCompletionTokens' in streamParams,
        paramKeys: Object.keys(streamParams).filter((key) => !['model', 'messages', 'system'].includes(key)),
        streamParams: Object.fromEntries(
          Object.entries(streamParams).filter(([key]) => !['model', 'messages', 'system'].includes(key)),
        ),
      },
      null,
      2,
    ),
  );

  const googleFallbackModels = getGoogleTextModelFallbackOrder();
  const modelsToTry = provider.name === 'Google' ? googleFallbackModels : [modelDetails.name];

  let lastError: any;

  for (const modelName of modelsToTry) {
    const attemptStartedAt = Date.now();

    try {
      logger.info(
        'Starting Gemini response attempt',
        JSON.stringify({
          assistantMode,
          hasTools,
          model: modelName,
          qualityPass: assistantMode === 'build' && Boolean(selectedPrimaryReference && compiledReferenceBrief),
        }),
      );

      streamParams.model = provider.getModelInstance({
        model: modelName,
        serverEnv,
        apiKeys,
        providerSettings,
      });

      if (assistantMode === 'build' && selectedPrimaryReference && compiledReferenceBrief) {
        const { onFinish, ...nonStreamingStreamParams } = streamParams as typeof streamParams & {
          onFinish?: StreamingOptions['onFinish'];
        };

        let layoutPlanBlock = '';
        let layoutPlanGenerated = false;
        let layoutPlanDegraded = false;
        let firstDraftSystemPrompt = String(nonStreamingStreamParams.system);

        try {
          const phaseStartedAt = Date.now();
          const layoutPlan = await buildLockedLayoutPlan({
            executionPacket: compiledReferenceBrief,
            primaryReference: selectedPrimaryReference,
            userPrompt: latestUserPrompt,
            model: nonStreamingStreamParams.model,
            isReasoning,
          });

          logTiming('Build layout-plan generation finished', phaseStartedAt, {
            model: modelName,
            primary: selectedPrimaryReference.slug,
          });

          if (layoutPlan) {
            layoutPlanBlock = buildDesignLayoutPlanBlock(layoutPlan);
            firstDraftSystemPrompt = `${firstDraftSystemPrompt}\n\n${layoutPlanBlock}`;
            layoutPlanGenerated = true;
          } else {
            layoutPlanDegraded = true;
          }
        } catch (error) {
          layoutPlanDegraded = true;
          logger.warn(`Build layout-plan generation degraded for ${selectedPrimaryReference.slug}: ${String(error)}`);
        }

        const firstDraftStartedAt = Date.now();
        const firstDraft = await generateText({
          ...nonStreamingStreamParams,
          system: firstDraftSystemPrompt,
        });
        logTiming('Build first draft generation finished', firstDraftStartedAt, {
          model: modelName,
          primary: selectedPrimaryReference.slug,
        });
        assertUsableGenerateTextOutput(firstDraft, modelName);
        let finalDraft = firstDraft;
        let auditVerdict = 'skipped';
        let auditRetryCount = 0;
        let auditDegraded = false;

        if (firstDraft.text?.trim()) {
          try {
            const auditStartedAt = Date.now();
            const audit = await auditBuildDraft({
              generatedText: firstDraft.text,
              executionPacket: compiledReferenceBrief,
              layoutPlan:
                layoutPlanBlock || '<design_layout_lock status="degraded">No locked layout plan was available.</design_layout_lock>',
              primaryReference: selectedPrimaryReference,
              userPrompt: latestUserPrompt,
              model: nonStreamingStreamParams.model,
              isReasoning,
            });
            logTiming('Build design audit finished', auditStartedAt, {
              model: modelName,
              primary: selectedPrimaryReference.slug,
            });

            if (audit) {
              auditVerdict = audit.verdict;

              if (audit.verdict === 'retry' && audit.critique.length > 0) {
                auditRetryCount = 1;
                const retryStartedAt = Date.now();
                finalDraft = await generateText({
                  ...nonStreamingStreamParams,
                  system: appendRetryAuditBlock(firstDraftSystemPrompt, audit.critique),
                });
                logTiming('Build audit retry generation finished', retryStartedAt, {
                  model: modelName,
                  primary: selectedPrimaryReference.slug,
                });
                assertUsableGenerateTextOutput(finalDraft, modelName);
              }
            } else {
              auditVerdict = 'degraded';
              auditDegraded = true;
            }
          } catch (error) {
            auditVerdict = 'degraded';
            auditDegraded = true;
            logger.warn(`Build design audit degraded for ${selectedPrimaryReference.slug}: ${String(error)}`);
          }
        }

        logger.info(
          `Build design audit diagnostics: primary=${selectedPrimaryReference?.slug ?? 'none'} layoutPlan=${layoutPlanGenerated ? 'yes' : 'no'} layoutPlanDegraded=${layoutPlanDegraded ? 'yes' : 'no'} verdict=${auditVerdict} retryCount=${auditRetryCount} degraded=${auditDegraded ? 'yes' : 'no'}`,
        );

        const result = createGenerateTextCompatResult({
          result: finalDraft,
          onFinish,
        });

        logTiming('Build quality-pass response ready', attemptStartedAt, {
          model: modelName,
          primary: selectedPrimaryReference.slug,
        });

        return withFirstOutputTiming(result, {
          assistantMode,
          model: modelName,
          path: 'build-quality-pass',
        });
      }

      if (provider.name === 'Google') {
        logger.warn(
          'google-compat: Google provider compatibility fallback enabled: using generateText result packaging instead of native streaming',
        );

        const { onFinish, ...nonStreamingStreamParams } = streamParams as typeof streamParams & {
          onFinish?: StreamingOptions['onFinish'];
        };

        const result = await createGenerateTextCompatResultFromParams({
          onFinish,
          streamParams: nonStreamingStreamParams,
        });

        logTiming('Gemini compatibility response ready', attemptStartedAt, {
          assistantMode,
          model: modelName,
        });

        return withFirstOutputTiming(result, {
          assistantMode,
          model: modelName,
          path: 'google-compat',
        });
      }

      const result = await _streamText(streamParams);
      logTiming('Native streaming response initialized', attemptStartedAt, {
        assistantMode,
        model: modelName,
        provider: provider.name,
      });

      return withFirstOutputTiming(result, {
        assistantMode,
        model: modelName,
        path: provider.name === 'Google' ? 'google-native' : 'native',
      });
    } catch (error) {
      lastError = error;
      logger.warn(`Model ${modelName} failed, trying next model if available. Error: ${error}`);
    }
  }

  await cleanupComposioTools('stream-setup-error');
  throw lastError;
}

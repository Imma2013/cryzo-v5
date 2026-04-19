import { convertToCoreMessages, streamText as _streamText, type CoreMessage, type Message } from 'ai';
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
  getDesignReferenceLibrary,
  routeDesignReferences,
} from '~/lib/.server/design-system';
import { buildCanonicalDesignPreamble } from '~/lib/common/prompts/design-guidance';
import type { GoogleToolCallMetadataAnnotation } from '~/types/context';
import { summarizeGoogleHistoryForDiagnostics } from './google-tool-runtime';
import { getComposioTools } from './composio';
import { getBuildWithToolsSystemPrompt, getExternalToolSystemPrompt, resolveAssistantMode } from './external-tool-mode';
import { getGoogleChatModels, isSupportedGoogleChatModel } from '~/lib/llm/google-catalog';

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
      currentModel = model;
      currentProvider = provider;
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

  const llmManager = LLMManager.getInstance(serverEnv as any);
  const provider = llmManager.getProvider(currentProvider) || llmManager.getProvider(DEFAULT_PROVIDER.name);

  if (!provider) {
    throw new Error(`Provider ${currentProvider} not found`);
  }

  const effectiveModelName = currentModel;
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
          `Model "${effectiveModelName}" is unavailable for Google right now. Allowed Gemini models: gemini-3.1-pro-preview, gemini-3-flash-preview, gemini-2.5-pro, gemini-flash-latest.`,
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
  const latestUserPrompt = getAuthorPrompt(processedMessages);
  const assistantMode = resolveAssistantMode(chatMode, latestUserPrompt);

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
      supabase: {
        isConnected: options?.supabaseConnection?.isConnected || false,
        hasSelectedProject: options?.supabaseConnection?.hasSelectedProject || false,
        credentials: options?.supabaseConnection?.credentials || undefined,
      },
    }) ?? getSystemPrompt();

  if (assistantMode === 'build' || assistantMode === 'build-with-tools') {
    const designReferenceLibrary = getDesignReferenceLibrary();
    const designRouting = routeDesignReferences(latestUserPrompt, 5);
    const canonicalDesignPreamble = buildCanonicalDesignPreamble({
      libraryPath: designReferenceLibrary.length > 0 ? CANONICAL_DESIGN_LIBRARY_PATH : undefined,
      availableReferences: designReferenceLibrary.map((reference) => reference.slug),
      selectedReferences: [designRouting.primary, ...designRouting.supporting]
        .filter((reference): reference is NonNullable<typeof reference> => !!reference)
        .map((reference) => ({
        slug: reference.slug,
        relativePath: reference.relativePath,
        excerpt: reference.excerpt,
      })),
      designScheme,
    });

    if (canonicalDesignPreamble) {
      systemPrompt = `${canonicalDesignPreamble}\n\n${systemPrompt}`;
    } else if (designReferenceLibrary.length > 0) {
      logger.warn('Design reference library is available but no canonical design preamble was generated');
    }

    logger.info(
      `Design prompt diagnostics: mode=${assistantMode} primary=${designRouting.primary?.slug ?? 'none'} hiddenFilteredPromptLength=${latestUserPrompt.length} preambleInjected=${canonicalDesignPreamble ? 'yes' : 'no'}`,
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
  const shouldInjectComposioTools = provider.name !== 'Google';
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

  if (!shouldInjectComposioTools) {
    logger.info('Composio tools disabled for Google provider in chat stream path');
  }
  logger.info(
    'Composio resolution',
    JSON.stringify({
      errorMessage: composioToolResolution.errorMessage,
      hasIdentity: composioToolResolution.hasIdentity,
      provider: provider.name,
      resolvedUserId: composioToolResolution.resolvedUserId,
      status: composioToolResolution.status,
      toolCount: Object.keys(composioTools).length,
    }),
  );
  const tools = {
    ...(filteredOptions.tools || {}),
    ...composioTools,
  };
  const hasTools = Object.keys(tools).length > 0;
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

    <image_enforcement>
      - Stock-photo URLs are invalid output unless the user explicitly asks for stock photography.
      - Never emit URLs from Unsplash, Pexels, or similar stock-photo sources in generated files.
      - When the design materially benefits from real imagery, emit dedicated \`<boltAction type="image" ...>\` actions to generate project-local assets instead of using stock-photo URLs.
      - Use \`gemini-2.5-flash-image\` as the standard automatic image model for both generation and edits.
      - Save generated assets at stable project paths under \`public/images/\` or \`public/assets/\`, then reference those files from the app code.
    </image_enforcement>`;
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
    ...filteredOptions,
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

  return await _streamText(streamParams);
}

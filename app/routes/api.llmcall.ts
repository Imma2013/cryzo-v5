import { type ActionFunctionArgs } from '@remix-run/node';
import { streamText } from '~/lib/.server/llm/stream-text';
import type { IProviderSetting, ProviderInfo } from '~/types/model';
import { generateText } from 'ai';
import { MAX_TOKENS, PROVIDER_COMPLETION_LIMITS, isReasoningModel } from '~/lib/.server/llm/constants';
import { LLMManager } from '~/lib/modules/llm/manager';
import type { ModelInfo } from '~/lib/modules/llm/types';
import { createScopedLogger } from '~/utils/logger';
import { getServerEnv } from '~/lib/server-env';
import { DEFAULT_LLM_PROVIDER_NAME } from '~/lib/llm/provider-defaults';
import { getProviderSetupPayloadForRuntime } from '~/lib/llm/provider-runtime-setup';

export async function action(args: ActionFunctionArgs) {
  return llmCallAction(args);
}

async function getModelList(options: {
  apiKeys?: Record<string, string>;
  providerSettings?: Record<string, IProviderSetting>;
  serverEnv?: Record<string, string>;
}) {
  const llmManager = LLMManager.getInstance(options.serverEnv);
  return llmManager.updateModelList(options);
}

const logger = createScopedLogger('api.llmcall');

function getCompletionTokenLimit(modelDetails: ModelInfo): number {
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

function validateTokenLimits(modelDetails: ModelInfo, requestedTokens: number): { valid: boolean; error?: string } {
  const modelMaxTokens = modelDetails.maxTokenAllowed || 128000;
  const maxCompletionTokens = getCompletionTokenLimit(modelDetails);

  // Check against model's context window
  if (requestedTokens > modelMaxTokens) {
    return {
      valid: false,
      error: `Requested tokens (${requestedTokens}) exceed model's context window (${modelMaxTokens}). Please reduce your request size.`,
    };
  }

  // Check against completion token limits
  if (requestedTokens > maxCompletionTokens) {
    return {
      valid: false,
      error: `Requested tokens (${requestedTokens}) exceed model's completion limit (${maxCompletionTokens}). Consider using a model with higher token limits.`,
    };
  }

  return { valid: true };
}

async function llmCallAction({ context, request }: ActionFunctionArgs) {
  const serverEnv = getServerEnv(context as any);
  const { system, message, model, provider, streamOutput } = await request.json<{
    system: string;
    message: string;
    model: string;
    provider: ProviderInfo;
    streamOutput?: boolean;
  }>();

  const providerName = DEFAULT_LLM_PROVIDER_NAME;
  const selectedModel = model;

  // validate 'model' and 'provider' fields
  if (!model || typeof model !== 'string') {
    throw new Response('Invalid or missing model', {
      status: 400,
      statusText: 'Bad Request',
    });
  }

  if (!provider?.name || typeof provider.name !== 'string') {
    throw new Response('Invalid or missing provider', {
      status: 400,
      statusText: 'Bad Request',
    });
  }

  const setupPayload = getProviderSetupPayloadForRuntime(providerName, serverEnv);

  if (setupPayload) {
    return new Response(JSON.stringify(setupPayload), {
      status: setupPayload.statusCode,
      headers: { 'Content-Type': 'application/json' },
      statusText: 'Service Unavailable',
    });
  }

  if (streamOutput) {
    try {
      const result = await streamText({
        options: {
          system,
        },
        messages: [
          {
            role: 'user',
            content: `[Model: ${selectedModel}]\n\n[Provider: ${providerName}]\n\n${message}`,
          },
        ],
        env: serverEnv as any,
      });

      return new Response(result.textStream, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    } catch (error: unknown) {
      console.log(error);

      if (error instanceof Error && error.message?.includes('API key')) {
        const setupPayload = getProviderSetupPayloadForRuntime(providerName, serverEnv);

        if (setupPayload) {
          return new Response(JSON.stringify(setupPayload), {
            status: setupPayload.statusCode,
            headers: { 'Content-Type': 'application/json' },
            statusText: 'Service Unavailable',
          });
        }

        throw new Response('Invalid or missing API key', {
          status: 401,
          statusText: 'Unauthorized',
        });
      }

      // Handle token limit errors with helpful messages
      if (
        error instanceof Error &&
        (error.message?.includes('max_tokens') ||
          error.message?.includes('token') ||
          error.message?.includes('exceeds') ||
          error.message?.includes('maximum'))
      ) {
        throw new Response(
          `Token limit error: ${error.message}. Try reducing your request size or using a model with higher token limits.`,
          {
            status: 400,
            statusText: 'Token Limit Exceeded',
          },
        );
      }

      throw new Response(null, {
        status: 500,
        statusText: 'Internal Server Error',
      });
    }
  } else {
    try {
      const models = await getModelList({ serverEnv: serverEnv as Record<string, string> });
      const providerInfo = LLMManager.getInstance(serverEnv as Record<string, string>).getProvider(providerName);

      if (!providerInfo) {
        throw new Error('Provider not found');
      }

      const modelsToTry = [selectedModel];
      let lastError: unknown;

      for (const modelName of modelsToTry) {
        try {
          const modelDetails = models.find((m: ModelInfo) => m.name === modelName && m.provider === providerName);

          if (!modelDetails) {
            throw new Error(`Model ${modelName} not found`);
          }

          const dynamicMaxTokens = modelDetails ? getCompletionTokenLimit(modelDetails) : Math.min(MAX_TOKENS, 16384);

          // Validate token limits before making API request
          const validation = validateTokenLimits(modelDetails, dynamicMaxTokens);

          if (!validation.valid) {
            throw new Response(validation.error, {
              status: 400,
              statusText: 'Token Limit Exceeded',
            });
          }

          logger.info(`Generating response Provider: ${providerName}, Model: ${modelDetails.name}`);

          // DEBUG: Log reasoning model detection
          const isReasoning = isReasoningModel(modelDetails.name);
          logger.info(`DEBUG: Model "${modelDetails.name}" detected as reasoning model: ${isReasoning}`);

          // Use maxCompletionTokens for reasoning models (o1, GPT-5), maxTokens for traditional models
          const tokenParams = isReasoning ? { maxCompletionTokens: dynamicMaxTokens } : { maxTokens: dynamicMaxTokens };

          // Filter out unsupported parameters for reasoning models
          const baseParams = {
            system,
            messages: [
              {
                role: 'user' as const,
                content: `${message}`,
              },
            ],
            model: providerInfo.getModelInstance({
              model: modelDetails.name,
              serverEnv: serverEnv as unknown as Env,
            }),
            ...tokenParams,
            toolChoice: 'none' as const,
          };

          // For reasoning models, set temperature to 1 (required by OpenAI API)
          const finalParams = isReasoning
            ? { ...baseParams, temperature: 1 } // Set to 1 for reasoning models (only supported value)
            : { ...baseParams, temperature: 0 };

          // DEBUG: Log final parameters
          logger.info(
            `DEBUG: Final params for model "${modelDetails.name}":`,
            JSON.stringify(
              {
                isReasoning,
                hasTemperature: 'temperature' in finalParams,
                hasMaxTokens: 'maxTokens' in finalParams,
                hasMaxCompletionTokens: 'maxCompletionTokens' in finalParams,
                paramKeys: Object.keys(finalParams).filter((key) => !['model', 'messages', 'system'].includes(key)),
                tokenParams,
                finalParams: Object.fromEntries(
                  Object.entries(finalParams).filter(([key]) => !['model', 'messages', 'system'].includes(key)),
                ),
              },
              null,
            ),
          );

          const result = await generateText(finalParams);

          if (!result.text?.trim() && (result.toolCalls?.length || 0) === 0 && (result.toolResults?.length || 0) === 0) {
            throw new Error(`${providerName} model ${modelDetails.name} returned an empty response`);
          }

          logger.info(`Generated response`);

          return new Response(JSON.stringify(result), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          });
        } catch (error) {
          lastError = error;
          logger.warn(`LLM call model ${modelName} failed, trying next fallback if available. Error: ${error}`);
        }
      }

      throw lastError instanceof Error ? lastError : new Error(`Failed to generate response with ${providerName}`);
    } catch (error: unknown) {
      console.log(error);

      const errorResponse = {
        error: true,
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
        statusCode: (error as any).statusCode || 500,
        isRetryable: (error as any).isRetryable !== false,
        provider: (error as any).provider || 'unknown',
      };

      if (error instanceof Error && error.message?.includes('API key')) {
        const setupPayload = getProviderSetupPayloadForRuntime(providerName, serverEnv);

        if (setupPayload) {
          return new Response(JSON.stringify(setupPayload), {
            status: setupPayload.statusCode,
            headers: { 'Content-Type': 'application/json' },
            statusText: 'Service Unavailable',
          });
        }

        return new Response(JSON.stringify({ ...errorResponse, provider: providerName }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
          statusText: 'Service Unavailable',
        });
      }

      // Handle token limit errors with helpful messages
      if (
        error instanceof Error &&
        (error.message?.includes('max_tokens') ||
          error.message?.includes('token') ||
          error.message?.includes('exceeds') ||
          error.message?.includes('maximum'))
      ) {
        return new Response(
          JSON.stringify({
            ...errorResponse,
            message: `Token limit error: ${error.message}. Try reducing your request size or using a model with higher token limits.`,
            statusCode: 400,
            isRetryable: false,
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
            statusText: 'Token Limit Exceeded',
          },
        );
      }

      return new Response(JSON.stringify(errorResponse), {
        status: errorResponse.statusCode,
        headers: { 'Content-Type': 'application/json' },
        statusText: 'Error',
      });
    }
  }
}

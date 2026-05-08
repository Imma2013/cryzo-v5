import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { createDataStream, generateId } from 'ai';
import { MAX_RESPONSE_SEGMENTS, MAX_TOKENS, type FileMap } from '~/lib/.server/llm/constants';
import { CONTINUE_PROMPT } from '~/lib/common/prompts/prompts';
import { streamText, type Messages, type StreamingOptions } from '~/lib/.server/llm/stream-text';
import SwitchableStream from '~/lib/.server/llm/switchable-stream';
import { createScopedLogger } from '~/utils/logger';
import { getFilePaths, selectContext } from '~/lib/.server/llm/select-context';
import type { ContextAnnotation, ProgressAnnotation } from '~/types/context';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, WORK_DIR } from '~/utils/constants';
import { createSummary } from '~/lib/.server/llm/create-summary';
import type { DesignScheme } from '~/types/design-scheme';
import { StreamRecoveryManager } from '~/lib/.server/llm/stream-recovery';
import { routeDesignReferences } from '~/lib/.server/design-system';
import { requireAuth, withSupabaseAuthHeaders } from '~/lib/auth/require-auth.server';
import { getServerEnv } from '~/lib/server-env';

export async function action(args: ActionFunctionArgs) {
  return chatAction(args);
}

const logger = createScopedLogger('api.chat');

function isHiddenMessage(message: { role: string; annotations?: unknown[] }) {
  return message.role === 'user' && Array.isArray(message.annotations) && message.annotations.includes('hidden');
}

async function chatAction({ context, request }: ActionFunctionArgs) {
  const requestOrigin = new URL(request.url).origin;
  const serverEnv = getServerEnv(context as any);
  let authHeaders: Headers | undefined;
  let authenticatedUser: {
    email?: string;
    image?: string;
    name?: string;
    uid: string;
  };
  try {
    const auth = await requireAuth(request, context as any, {
      message: 'Sign in before sending chat requests.',
    });
    authHeaders = auth.responseHeaders;
    const metadata = (auth.user.user_metadata ?? {}) as Record<string, unknown>;

    authenticatedUser = {
      uid: auth.user.id,
      email: auth.user.email ?? undefined,
      image:
        (typeof metadata.avatar_url === 'string' ? metadata.avatar_url : undefined) ??
        (typeof metadata.picture === 'string' ? metadata.picture : undefined),
      name:
        (typeof metadata.full_name === 'string' ? metadata.full_name : undefined) ??
        (typeof metadata.name === 'string' ? metadata.name : undefined),
    };
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    logger.warn('Auth validation failed for /api/chat', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: 'Authentication validation failed.',
        statusCode: 500,
      }),
      {
        status: 500,
        headers: withSupabaseAuthHeaders({ 'Content-Type': 'application/json' }, authHeaders),
      },
    );
  }

  const streamRecovery = new StreamRecoveryManager({
    timeout: 45000,
    maxRetries: 2,
    onTimeout: () => {
      logger.warn('Stream timeout - attempting recovery');
    },
  });

  const { messages, files, promptId, contextOptimization, supabase, chatMode, designScheme, user: requestUser } =
    await request.json<{
      messages: Messages;
      files: any;
      promptId?: string;
      contextOptimization: boolean;
      chatMode: 'discuss' | 'build';
      designScheme?: DesignScheme;
      user?: {
        email?: string;
        composioUserId?: string;
        hasComposioIdentity?: boolean;
        isAuthenticated: boolean;
        isSignedIn?: boolean;
        uid?: string;
      };
      supabase?: {
        isConnected: boolean;
        hasSelectedProject: boolean;
        credentials?: {
          anonKey?: string;
          supabaseUrl?: string;
        };
      };
    }>();

  const user = {
    ...requestUser,
    composioUserId: authenticatedUser.uid,
    email: authenticatedUser.email || requestUser?.email,
    hasComposioIdentity: true,
    isAuthenticated: true,
    isSignedIn: true,
    uid: authenticatedUser.uid,
  };

  const lastUserMessage = messages.filter((message) => message.role === 'user').slice(-1)[0];
  const runtimeProviderName = DEFAULT_PROVIDER.name;

  const stream = new SwitchableStream();

  const cumulativeUsage = {
    completionTokens: 0,
    promptTokens: 0,
    totalTokens: 0,
  };
  const encoder: TextEncoder = new TextEncoder();
  let progressCounter: number = 1;

  try {
    const totalMessageContent = messages.reduce((acc, message) => acc + message.content, '');
    logger.debug(`Total message length: ${totalMessageContent.split(' ').length}, words`);

    let lastChunk: string | undefined = undefined;

    const dataStream = createDataStream({
      async execute(dataStream) {
        streamRecovery.startMonitoring();

        const filePaths = getFilePaths(files || {});
        let filteredFiles: FileMap | undefined = undefined;
        let summary: string | undefined = undefined;
        let messageSliceId = 0;

        const processedMessages = messages;
        const fullUserPrompt = processedMessages
          .filter((message) => message.role === 'user' && !isHiddenMessage(message))
          .map((message) => message.content)
          .join('\n')
          .trim();

        if (chatMode === 'build' && fullUserPrompt) {
          const designRouting = routeDesignReferences(fullUserPrompt, 1);

          dataStream.writeData({
            type: 'progress',
            label: 'design-routing',
            status: 'in-progress',
            order: progressCounter++,
            message: 'Selecting design reference',
          } satisfies ProgressAnnotation);

          dataStream.writeMessageAnnotation({
            type: 'designRouting',
            primarySlug: designRouting.primary?.slug,
            selectionSource: designRouting.selectionSource,
            supportingSlugs: designRouting.supporting.map((reference) => reference.slug),
            matchedCategories: designRouting.matchedCategories,
            matchedSignals: designRouting.matchedSignals,
            ranked: designRouting.ranked,
          } as ContextAnnotation);

          dataStream.writeData({
            type: 'progress',
            label: 'design-routing',
            status: 'complete',
            order: progressCounter++,
            message: `Selected design: ${designRouting.primary?.slug ?? 'none'}${designRouting.selectionSource === 'fallback' ? ' (fallback)' : ''}`,
          } satisfies ProgressAnnotation);
        }

        if (processedMessages.length > 3) {
          messageSliceId = processedMessages.length - 3;
        }

        if (filePaths.length > 0 && contextOptimization) {
          logger.debug('Generating Chat Summary');
          dataStream.writeData({
            type: 'progress',
            label: 'summary',
            status: 'in-progress',
            order: progressCounter++,
            message: 'Analysing Request',
          } satisfies ProgressAnnotation);

          // Create a summary of the chat
          console.log(`Messages count: ${processedMessages.length}`);

          summary = await createSummary({
            messages: [...processedMessages],
            env: serverEnv as any,
            promptId,
            contextOptimization,
      user,
            onFinish(resp) {
              if (resp.usage) {
                logger.debug('createSummary token usage', JSON.stringify(resp.usage));
                cumulativeUsage.completionTokens += resp.usage.completionTokens || 0;
                cumulativeUsage.promptTokens += resp.usage.promptTokens || 0;
                cumulativeUsage.totalTokens += resp.usage.totalTokens || 0;
              }
            },
          });
          dataStream.writeData({
            type: 'progress',
            label: 'summary',
            status: 'complete',
            order: progressCounter++,
            message: 'Analysis Complete',
          } satisfies ProgressAnnotation);

          dataStream.writeMessageAnnotation({
            type: 'chatSummary',
            summary,
            chatId: processedMessages.slice(-1)?.[0]?.id,
          } as ContextAnnotation);

          // Update context buffer
          logger.debug('Updating Context Buffer');
          dataStream.writeData({
            type: 'progress',
            label: 'context',
            status: 'in-progress',
            order: progressCounter++,
            message: 'Determining Files to Read',
          } satisfies ProgressAnnotation);

          // Select context files
          console.log(`Messages count: ${processedMessages.length}`);
          filteredFiles = await selectContext({
            messages: [...processedMessages],
            env: serverEnv as any,
            files,
            promptId,
            contextOptimization,
            user,
            summary,
            onFinish(resp) {
              if (resp.usage) {
                logger.debug('selectContext token usage', JSON.stringify(resp.usage));
                cumulativeUsage.completionTokens += resp.usage.completionTokens || 0;
                cumulativeUsage.promptTokens += resp.usage.promptTokens || 0;
                cumulativeUsage.totalTokens += resp.usage.totalTokens || 0;
              }
            },
          });

          if (filteredFiles) {
            logger.debug(`files in context : ${JSON.stringify(Object.keys(filteredFiles))}`);
          }

          dataStream.writeMessageAnnotation({
            type: 'codeContext',
            files: Object.keys(filteredFiles).map((key) => {
              let path = key;

              if (path.startsWith(WORK_DIR)) {
                path = path.replace(WORK_DIR, '');
              }

              return path;
            }),
          } as ContextAnnotation);

          dataStream.writeData({
            type: 'progress',
            label: 'context',
            status: 'complete',
            order: progressCounter++,
            message: 'Code Files Selected',
          } satisfies ProgressAnnotation);

          // logger.debug('Code Files Selected');
        }

        const options: StreamingOptions = {
          supabaseConnection: supabase,
          onFinish: async ({ text: content, finishReason, usage }) => {
            logger.debug('usage', JSON.stringify(usage));

            if (usage) {
              cumulativeUsage.completionTokens += usage.completionTokens || 0;
              cumulativeUsage.promptTokens += usage.promptTokens || 0;
              cumulativeUsage.totalTokens += usage.totalTokens || 0;
            }

            if (finishReason !== 'length') {
              dataStream.writeMessageAnnotation({
                type: 'usage',
                value: {
                  completionTokens: cumulativeUsage.completionTokens,
                  promptTokens: cumulativeUsage.promptTokens,
                  totalTokens: cumulativeUsage.totalTokens,
                },
              });
              dataStream.writeData({
                type: 'progress',
                label: 'response',
                status: 'in-progress',
                order: progressCounter++,
                message: 'Applying changes',
              } satisfies ProgressAnnotation);
              await new Promise((resolve) => setTimeout(resolve, 0));

              // stream.close();
              return;
            }

            if (stream.switches >= MAX_RESPONSE_SEGMENTS) {
              throw Error('Cannot continue message: Maximum segments reached');
            }

            const switchesLeft = MAX_RESPONSE_SEGMENTS - stream.switches;

            logger.info(`Reached max token limit (${MAX_TOKENS}): Continuing message (${switchesLeft} switches left)`);

            processedMessages.push({ id: generateId(), role: 'assistant', content });
            processedMessages.push({
              id: generateId(),
              role: 'user',
              content: `[Model: ${DEFAULT_MODEL}]\n\n[Provider: ${DEFAULT_PROVIDER.name}]\n\n${CONTINUE_PROMPT}`,
            });

            const result = await streamText({
              messages: [...processedMessages],
              env: serverEnv as any,
              options,
              files,
              promptId,
              contextOptimization,
              user,
              contextFiles: filteredFiles,
              chatMode,
              designScheme,
              requestOrigin,
              summary,
              messageSliceId,
            });

            result.mergeIntoDataStream(dataStream);

            (async () => {
              for await (const part of result.fullStream) {
                if (part.type === 'error') {
                  const error: any = part.error;
                  logger.error(`${error}`);

                  return;
                }
              }
            })();

            return;
          },
        };
        dataStream.writeData({
          type: 'progress',
          label: 'response',
          status: 'in-progress',
          order: progressCounter++,
          message: 'Generating Response',
        } satisfies ProgressAnnotation);

        const result = await streamText({
          messages: [...processedMessages],
          env: serverEnv as any,
          options,
          files,
          promptId,
          contextOptimization,
          user,
          contextFiles: filteredFiles,
          chatMode,
          designScheme,
          requestOrigin,
          summary,
          messageSliceId,
        });

        logger.info(
          `Build diagnostics: primary=${fullUserPrompt ? routeDesignReferences(fullUserPrompt, 1).primary?.slug ?? 'none' : 'none'} source=${fullUserPrompt ? routeDesignReferences(fullUserPrompt, 1).selectionSource ?? 'unknown' : 'unknown'} hiddenBootstrap=${processedMessages.filter((message) => isHiddenMessage(message as any)).length}`,
        );

        (async () => {
          for await (const part of result.fullStream) {
            streamRecovery.updateActivity();

            if (part.type === 'error') {
              const error: any = part.error;
              logger.error('Streaming error:', error);
              streamRecovery.stop();

              // Enhanced error handling for common streaming issues
              if (error.message?.includes('Invalid JSON response')) {
                logger.error('Invalid JSON response detected - likely malformed API response');
              } else if (error.message?.includes('token')) {
                logger.error('Token-related error detected - possible token limit exceeded');
              }

              return;
            }
          }
          streamRecovery.stop();
        })();
        result.mergeIntoDataStream(dataStream);
      },
      onError: (error: any) => {
        // Provide more specific error messages for common issues
        const errorMessage = error.message || 'Unknown error';
        const errorCauseMessage = typeof error?.cause?.message === 'string' ? error.cause.message : undefined;

        logger.error('LLM stream failure diagnostics', {
          causeMessage: errorCauseMessage,
          errorMessage,
          provider: runtimeProviderName,
          statusCode: error?.statusCode,
          url: error?.url,
        });

        if (errorMessage.includes('model') && errorMessage.includes('not found')) {
          return 'Custom error: Invalid model selected. Please check that the model name is correct and available.';
        }

        if (errorMessage.includes('Failed to process successful response') && errorCauseMessage) {
          return `Custom error: The AI service returned an unexpected response format. ${errorCauseMessage}`;
        }

        if (errorMessage.includes('Invalid JSON response')) {
          return 'Custom error: The AI service returned an invalid response. This may be due to an invalid model name, API rate limiting, or server issues. Try selecting a different model or check your API key.';
        }

        if (
          errorMessage.includes('API key') ||
          errorMessage.includes('unauthorized') ||
          errorMessage.includes('authentication')
        ) {
          return 'Custom error: API key is missing or invalid. Check your provider environment variables on Vercel and redeploy.';
        }

        if (errorMessage.toLowerCase().includes('sign in before')) {
          return 'Custom error: Sign in before sending chat requests.';
        }

        if (errorMessage.includes('token') && errorMessage.includes('limit')) {
          return 'Custom error: Token limit exceeded. The conversation is too long for the selected model. Try using a model with larger context window or start a new conversation.';
        }

        if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
          return 'Custom error: API rate limit exceeded. Please wait a moment before trying again.';
        }

        if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
          return 'Custom error: Network error. Please check your internet connection and try again.';
        }

        return `Custom error: ${errorMessage}`;
      },
    }).pipeThrough(
      new TransformStream({
        transform: (chunk, controller) => {
          if (!lastChunk) {
            lastChunk = ' ';
          }

          if (typeof chunk === 'string') {
            if (chunk.startsWith('g') && !lastChunk.startsWith('g')) {
              controller.enqueue(encoder.encode(`0: "<div class=\\"__boltThought__\\">"\n`));
            }

            if (lastChunk.startsWith('g') && !chunk.startsWith('g')) {
              controller.enqueue(encoder.encode(`0: "</div>\\n"\n`));
            }
          }

          lastChunk = chunk;

          let transformedChunk = chunk;

          if (typeof chunk === 'string' && chunk.startsWith('g')) {
            let content = chunk.split(':').slice(1).join(':');

            if (content.endsWith('\n')) {
              content = content.slice(0, content.length - 1);
            }

            transformedChunk = `0:${content}\n`;
          }

          // Convert the string stream to a byte stream
          const str = typeof transformedChunk === 'string' ? transformedChunk : JSON.stringify(transformedChunk);
          controller.enqueue(encoder.encode(str));
        },
      }),
    );

    return new Response(dataStream, {
      status: 200,
      headers: withSupabaseAuthHeaders(
        {
          'Content-Type': 'text/event-stream; charset=utf-8',
          Connection: 'keep-alive',
          'Cache-Control': 'no-cache',
          'Text-Encoding': 'chunked',
        },
        authHeaders,
      ),
    });
  } catch (error: any) {
    if (error instanceof Response) {
      return error;
    }

    logger.error(error);

    const errorResponse = {
      error: true,
      message: error.message || 'An unexpected error occurred',
      statusCode: error.statusCode || 500,
      isRetryable: error.isRetryable !== false, // Default to retryable unless explicitly false
      provider: error.provider || 'unknown',
    };

    if (error.message?.includes('API key')) {
      return new Response(
        JSON.stringify({
          ...errorResponse,
          message: 'Invalid or missing API key. Check your provider environment variables on Vercel and redeploy.',
          statusCode: 401,
          isRetryable: false,
        }),
        {
          status: 401,
          headers: withSupabaseAuthHeaders({ 'Content-Type': 'application/json' }, authHeaders),
          statusText: 'Unauthorized',
        },
      );
    }

    return new Response(JSON.stringify(errorResponse), {
      status: errorResponse.statusCode,
      headers: withSupabaseAuthHeaders({ 'Content-Type': 'application/json' }, authHeaders),
      statusText: 'Error',
    });
  }
}

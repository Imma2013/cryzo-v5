import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { streamText } from '~/lib/.server/llm/stream-text';
import { stripIndents } from '~/utils/stripIndent';
import type { ProviderInfo } from '~/types/model';
import { createScopedLogger } from '~/utils/logger';
import { getServerEnv } from '~/lib/server-env';
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from '~/utils/constants';
import {
  getGoogleProviderSetupPayloadForRuntime,
  resolveGoogleServerApiKeyForRuntime,
} from '~/lib/llm/google-server-runtime';
import { GOOGLE_PROVIDER_NAME, logGoogleServerKeyResolution } from '~/lib/llm/provider-setup';

export async function action(args: ActionFunctionArgs) {
  return enhancerAction(args);
}

const logger = createScopedLogger('api.enhancher');

async function enhancerAction({ context, request }: ActionFunctionArgs) {
  const serverEnv = getServerEnv(context as any);
  const { message, model, provider } = await request.json<{
    message: string;
    model: string;
    provider: ProviderInfo;
    apiKeys?: Record<string, string>;
  }>();

  const { name: providerName } = provider;

  // validate 'model' and 'provider' fields
  if (!model || typeof model !== 'string') {
    throw new Response('Invalid or missing model', {
      status: 400,
      statusText: 'Bad Request',
    });
  }

  if (!providerName || typeof providerName !== 'string') {
    throw new Response('Invalid or missing provider', {
      status: 400,
      statusText: 'Bad Request',
    });
  }

  logGoogleServerKeyResolution('api.enhancer', resolveGoogleServerApiKeyForRuntime(serverEnv));
  const setupPayload = getGoogleProviderSetupPayloadForRuntime(GOOGLE_PROVIDER_NAME, serverEnv);

  if (setupPayload) {
    return new Response(JSON.stringify(setupPayload), {
      status: setupPayload.statusCode,
      headers: { 'Content-Type': 'application/json' },
      statusText: 'Service Unavailable',
    });
  }

  try {
    const result = await streamText({
      messages: [
        {
          role: 'user',
          content:
            `[Model: ${DEFAULT_MODEL}]\n\n[Provider: ${DEFAULT_PROVIDER.name}]\n\n` +
            stripIndents`
            You are a professional prompt engineer specializing in crafting precise, effective prompts.
            Your task is to enhance prompts by making them more specific, actionable, and effective.

            I want you to improve the user prompt that is wrapped in \`<original_prompt>\` tags.

            For valid prompts:
            - Make instructions explicit and unambiguous
            - Add relevant context and constraints
            - Remove redundant information
            - Maintain the core intent
            - Ensure the prompt is self-contained
            - Use professional language

            For invalid or unclear prompts:
            - Respond with clear, professional guidance
            - Keep responses concise and actionable
            - Maintain a helpful, constructive tone
            - Focus on what the user should provide
            - Use a standard template for consistency

            IMPORTANT: Your response must ONLY contain the enhanced prompt text.
            Do not include any explanations, metadata, or wrapper tags.

            <original_prompt>
              ${message}
            </original_prompt>
          `,
        },
      ],
      env: serverEnv as any,
      options: {
        system:
          'You are a senior software principal architect, you should help the user analyse the user query and enrich it with the necessary context and constraints to make it more specific, actionable, and effective. You should also ensure that the prompt is self-contained and uses professional language. Your response should ONLY contain the enhanced prompt text. Do not include any explanations, metadata, or wrapper tags.',

        /*
         * onError: (event) => {
         *   throw new Response(null, {
         *     status: 500,
         *     statusText: 'Internal Server Error',
         *   });
         * }
         */
      },
    });

    // Handle streaming errors in a non-blocking way
    (async () => {
      try {
        for await (const part of result.fullStream) {
          if (part.type === 'error') {
            const error: any = part.error;
            logger.error('Streaming error:', error);
            break;
          }
        }
      } catch (error) {
        logger.error('Error processing stream:', error);
      }
    })();

    // Return the text stream directly since it's already text data
    return new Response(result.textStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: unknown) {
    console.log(error);

    if (error instanceof Error && error.message?.includes('API key')) {
      const payload = getGoogleProviderSetupPayloadForRuntime(GOOGLE_PROVIDER_NAME, serverEnv);

      return new Response(
        JSON.stringify(
          payload ?? {
            error: true,
            errorType: 'setup',
            isRetryable: false,
            message:
              'Google is selected, but GOOGLE_GENERATIVE_AI_API_KEY is missing on the server. Add it to the Vercel project environment variables and redeploy before retrying.',
            provider: GOOGLE_PROVIDER_NAME,
            setupKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
            setupSource: 'server_env',
            statusCode: 503,
          },
        ),
        {
          status: payload?.statusCode ?? 503,
          headers: { 'Content-Type': 'application/json' },
          statusText: 'Service Unavailable',
        },
      );
    }

    throw new Response(null, {
      status: 500,
      statusText: 'Internal Server Error',
    });
  }
}

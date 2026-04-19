import type { LoaderFunction } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';
import { LLMManager } from '~/lib/modules/llm/manager';
import { SERVER_CONFIGURED_PROVIDERS } from '~/lib/stores/settings';
import { getServerEnv } from '~/lib/server-env';
import { GOOGLE_PROVIDER_NAME, logGoogleServerKeyResolution, resolveGoogleServerApiKey } from '~/lib/llm/provider-setup';

interface ConfiguredProvider {
  name: string;
  isConfigured: boolean;
  configMethod: 'environment' | 'none';
}

interface ConfiguredProvidersResponse {
  providers: ConfiguredProvider[];
}

/**
 * API endpoint that detects which providers are configured via environment variables
 * This helps auto-enable providers that have been set up by the user
 */
export const loader: LoaderFunction = async ({ context }) => {
  try {
    const serverEnv = getServerEnv(context as any);
    const llmManager = LLMManager.getInstance(serverEnv as Record<string, string>);
    const configuredProviders: ConfiguredProvider[] = [];

    // Check each local provider for environment configuration
    for (const providerName of SERVER_CONFIGURED_PROVIDERS) {
      const providerInstance = llmManager.getProvider(providerName);
      let isConfigured = false;
      let configMethod: 'environment' | 'none' = 'none';

      if (providerName === GOOGLE_PROVIDER_NAME) {
        const resolution = resolveGoogleServerApiKey(serverEnv);
        logGoogleServerKeyResolution('api.configured-providers', resolution);
        isConfigured = resolution.hasKey;
        configMethod = resolution.hasKey ? 'environment' : 'none';

        configuredProviders.push({
          name: providerName,
          isConfigured,
          configMethod,
        });

        continue;
      }

      if (providerInstance) {
        const config = providerInstance.config;

        /*
         * Check if required environment variables are set
         * For providers with baseUrlKey (Ollama, LMStudio, OpenAILike)
         */
        if (config.baseUrlKey) {
          const baseUrlEnvVar = config.baseUrlKey;
          const envBaseUrl = serverEnv[baseUrlEnvVar] || llmManager.env[baseUrlEnvVar];

          /*
           * Only consider configured if environment variable is explicitly set
           * Don't count default config.baseUrl values or placeholder values
           */
          const isValidEnvValue =
            envBaseUrl &&
            typeof envBaseUrl === 'string' &&
            envBaseUrl.trim().length > 0 &&
            !envBaseUrl.includes('your_') && // Filter out placeholder values like "your_openai_like_base_url_here"
            !envBaseUrl.includes('_here') &&
            envBaseUrl.startsWith('http'); // Must be a valid URL

          if (isValidEnvValue) {
            isConfigured = true;
            configMethod = 'environment';
          }
        }

        // For providers that might need API keys as well (check this separately, not as fallback)
        if (config.apiTokenKey && !isConfigured) {
          const apiTokenEnvVar = config.apiTokenKey;
          const envApiToken = serverEnv[apiTokenEnvVar] || llmManager.env[apiTokenEnvVar];

          // Only consider configured if API key is set and not a placeholder
          const isValidApiToken =
            envApiToken &&
            typeof envApiToken === 'string' &&
            envApiToken.trim().length > 0 &&
            !envApiToken.includes('your_') && // Filter out placeholder values
            !envApiToken.includes('_here') &&
            envApiToken.length > 10; // API keys are typically longer than 10 chars

          if (isValidApiToken) {
            isConfigured = true;
            configMethod = 'environment';
          }
        }
      }

      configuredProviders.push({
        name: providerName,
        isConfigured,
        configMethod,
      });
    }

    return json<ConfiguredProvidersResponse>({
      providers: configuredProviders,
    });
  } catch (error) {
    console.error('Error detecting configured providers:', error);

    // Return default state on error
    return json<ConfiguredProvidersResponse>({
      providers: SERVER_CONFIGURED_PROVIDERS.map((name) => ({
        name,
        isConfigured: false,
        configMethod: 'none' as const,
      })),
    });
  }
};

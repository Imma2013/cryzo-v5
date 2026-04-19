import { atom, map } from 'nanostores';
import { PROVIDER_LIST } from '~/utils/constants';
import type { IProviderConfig } from '~/types/model';
import type { TabVisibilityConfig, TabWindowConfig, UserTabConfig } from '~/components/@settings/core/types';
import { DEFAULT_TAB_CONFIG } from '~/components/@settings/core/constants';
import { toggleTheme } from './theme';
import { create } from 'zustand';
import { applyProviderSettingsSnapshot, createProviderSettingsSnapshot } from '~/lib/llm/provider-preferences';

export interface Shortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  ctrlOrMetaKey?: boolean;
  action: () => void;
  description?: string; // Description of what the shortcut does
  isPreventDefault?: boolean; // Whether to prevent default browser behavior
}

export interface Shortcuts {
  toggleTheme: Shortcut;
  toggleTerminal: Shortcut;
}

export const URL_CONFIGURABLE_PROVIDERS = ['Ollama', 'LMStudio', 'OpenAILike'];
export const LOCAL_PROVIDERS = ['OpenAILike', 'LMStudio', 'Ollama'];
export const SERVER_CONFIGURED_PROVIDERS = [...LOCAL_PROVIDERS, 'Google'];
const GOOGLE_PROVIDER_NAME = 'Google';
const DEFAULT_ENABLED_PROVIDERS = new Set<string>();

export type ProviderSetting = Record<string, IProviderConfig>;

// Simplified shortcuts store with only theme toggle
export const shortcutsStore = map<Shortcuts>({
  toggleTheme: {
    key: 'd',
    metaKey: true,
    altKey: true,
    shiftKey: true,
    action: () => toggleTheme(),
    description: 'Toggle theme',
    isPreventDefault: true,
  },
  toggleTerminal: {
    key: '`',
    ctrlOrMetaKey: true,
    action: () => {
      // This will be handled by the terminal component
    },
    description: 'Toggle terminal',
    isPreventDefault: true,
  },
});

// Create a single key for provider settings
const PROVIDER_SETTINGS_KEY = 'provider_settings';
const AUTO_ENABLED_KEY = 'auto_enabled_providers';

// Add this helper function at the top of the file
const isBrowser = typeof window !== 'undefined';

// Interface for configured provider info from server
interface ConfiguredProvider {
  name: string;
  isConfigured: boolean;
  configMethod: 'environment' | 'none';
}

// Fetch configured providers from server
const fetchConfiguredProviders = async (): Promise<ConfiguredProvider[]> => {
  try {
    const response = await fetch('/api/configured-providers');

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as { providers?: ConfiguredProvider[] };

    return data.providers || [];
  } catch (error) {
    console.error('Error fetching configured providers:', error);
    return [];
  }
};

function persistProviderSettings(settings: ProviderSetting) {
  if (!isBrowser) {
    return;
  }

  localStorage.setItem(PROVIDER_SETTINGS_KEY, JSON.stringify(settings));
}

function createDefaultProviderSettings(): ProviderSetting {
  const initialSettings: ProviderSetting = {};

  PROVIDER_LIST.forEach((provider) => {
    initialSettings[provider.name] = {
      ...provider,
      settings: {
        enabled: DEFAULT_ENABLED_PROVIDERS.has(provider.name),
      },
    };
  });

  return initialSettings;
}

export function getStoredProviderSettingsSnapshot(): Record<string, IProviderConfig['settings']> | undefined {
  if (!isBrowser) {
    return undefined;
  }

  const savedSettings = localStorage.getItem(PROVIDER_SETTINGS_KEY);

  if (!savedSettings) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(savedSettings) as Record<string, IProviderConfig>;
    const defaults = createDefaultProviderSettings();

    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([providerName]) => providerName in defaults)
        .map(([providerName, value]) => [providerName, (value as IProviderConfig).settings]),
    );
  } catch (error) {
    console.error('Error parsing saved provider settings:', error);
    return undefined;
  }
}

export function getProviderSettingsFromLocalStorage(): ProviderSetting {
  const initialSettings = createDefaultProviderSettings();

  if (isBrowser) {
    const storedSnapshot = getStoredProviderSettingsSnapshot();

    if (storedSnapshot) {
      Object.entries(storedSnapshot).forEach(([key, nextSettings]) => {
        if (initialSettings[key]) {
          const shouldForceDisableCloudProvider = !LOCAL_PROVIDERS.includes(key) && !DEFAULT_ENABLED_PROVIDERS.has(key);

          initialSettings[key].settings = {
            ...initialSettings[key].settings,
            ...nextSettings,
            enabled: shouldForceDisableCloudProvider ? false : nextSettings.enabled,
          };
        }
      });
    }
  }

  return initialSettings;
}

export function resetProviderSettingsToDefaults() {
  providersStore.set(createDefaultProviderSettings());
}

export function hydrateProviderSettingsFromLocalStorage(options?: { persistToLocalStorage?: boolean }) {
  const nextSettings = getProviderSettingsFromLocalStorage();
  providersStore.set(nextSettings);

  if (options?.persistToLocalStorage !== false) {
    persistProviderSettings(nextSettings);
  }

  return nextSettings;
}

// Auto-enable providers that are configured on the server
const autoEnableConfiguredProviders = async (options?: { persistToLocalStorage?: boolean }) => {
  if (!isBrowser) {
    return;
  }

  try {
    const configuredProviders = await fetchConfiguredProviders();
    const currentSettings = providersStore.get();
    const savedSettings = localStorage.getItem(PROVIDER_SETTINGS_KEY);
    const autoEnabledProviders = localStorage.getItem(AUTO_ENABLED_KEY);

    // Track which providers were auto-enabled to avoid overriding user preferences
    const previouslyAutoEnabled = autoEnabledProviders ? JSON.parse(autoEnabledProviders) : [];
    const newlyAutoEnabled: string[] = [];

    let hasChanges = false;

    configuredProviders.forEach(({ name, isConfigured, configMethod }) => {
      if (isConfigured && configMethod === 'environment' && SERVER_CONFIGURED_PROVIDERS.includes(name)) {
        const currentProvider = currentSettings[name];

        if (currentProvider) {
          /*
           * Only auto-enable if:
           * 1. Provider is not already enabled, AND
           * 2. Either we haven't saved settings yet (first time) OR provider was previously auto-enabled
           */
          const hasUserSettings = savedSettings !== null;
          const wasAutoEnabled = previouslyAutoEnabled.includes(name);
          const shouldAutoEnable = !currentProvider.settings.enabled && (!hasUserSettings || wasAutoEnabled);

          if (shouldAutoEnable) {
            currentSettings[name] = {
              ...currentProvider,
              settings: {
                ...currentProvider.settings,
                enabled: true,
              },
            };
            newlyAutoEnabled.push(name);
            hasChanges = true;
          }
        }
      }

      if (name === GOOGLE_PROVIDER_NAME && !isConfigured) {
        const currentProvider = currentSettings[name];

        if (currentProvider?.settings.enabled) {
          currentSettings[name] = {
            ...currentProvider,
            settings: {
              ...currentProvider.settings,
              enabled: false,
            },
          };
          hasChanges = true;
        }
      }
    });

    if (hasChanges) {
      providersStore.set(currentSettings);

      if (options?.persistToLocalStorage !== false) {
        persistProviderSettings(currentSettings);
      }

      const allAutoEnabled = [...new Set([...previouslyAutoEnabled, ...newlyAutoEnabled])];
      localStorage.setItem(AUTO_ENABLED_KEY, JSON.stringify(allAutoEnabled));

      console.log(`Auto-enabled providers: ${newlyAutoEnabled.join(', ')}`);
    }
  } catch (error) {
    console.error('Error auto-enabling configured providers:', error);
  }
};

export const providersStore = map<ProviderSetting>(createDefaultProviderSettings());

// Export the auto-enable function for use in components
export const initializeProviders = autoEnableConfiguredProviders;

// Create a function to update provider settings that handles both store and persistence
export const updateProviderSettings = (
  provider: string,
  settings: IProviderConfig['settings'],
  options?: { persistToLocalStorage?: boolean },
) => {
  const currentSettings = providersStore.get();

  // Create new provider config with updated settings
  const updatedProvider = {
    ...currentSettings[provider],
    settings: {
      ...currentSettings[provider].settings,
      ...settings,
    },
  };

  // Update the store with new settings
  providersStore.setKey(provider, updatedProvider);

  if (options?.persistToLocalStorage !== false) {
    const allSettings = providersStore.get();
    persistProviderSettings(allSettings);
  }

  // If this is a local provider, update the auto-enabled tracking
  if (SERVER_CONFIGURED_PROVIDERS.includes(provider) && updatedProvider.settings.enabled !== undefined) {
    updateAutoEnabledTracking(provider, updatedProvider.settings.enabled);
  }
};

export const replaceProviderSettings = (snapshot: Record<string, any>, options?: { persistToLocalStorage?: boolean }) => {
  const nextSettings = applyProviderSettingsSnapshot(providersStore.get(), snapshot);
  providersStore.set(nextSettings);

  if (options?.persistToLocalStorage !== false) {
    persistProviderSettings(nextSettings);
  }
};

export const getProviderSettingsSnapshot = () => createProviderSettingsSnapshot(providersStore.get());

// Update auto-enabled tracking when user manually changes provider settings
const updateAutoEnabledTracking = (providerName: string, isEnabled: boolean) => {
  if (!isBrowser) {
    return;
  }

  try {
    const autoEnabledProviders = localStorage.getItem(AUTO_ENABLED_KEY);
    const currentAutoEnabled = autoEnabledProviders ? JSON.parse(autoEnabledProviders) : [];

    if (isEnabled) {
      // If user enables provider, add to auto-enabled list (for future detection)
      if (!currentAutoEnabled.includes(providerName)) {
        currentAutoEnabled.push(providerName);
        localStorage.setItem(AUTO_ENABLED_KEY, JSON.stringify(currentAutoEnabled));
      }
    } else {
      // If user disables provider, remove from auto-enabled list (respect user choice)
      const updatedAutoEnabled = currentAutoEnabled.filter((name: string) => name !== providerName);
      localStorage.setItem(AUTO_ENABLED_KEY, JSON.stringify(updatedAutoEnabled));
    }
  } catch (error) {
    console.error('Error updating auto-enabled tracking:', error);
  }
};

export const isDebugMode = atom(false);

// Define keys for localStorage
const SETTINGS_KEYS = {
  LATEST_BRANCH: 'isLatestBranch',
  AUTO_SELECT_TEMPLATE: 'autoSelectTemplate',
  CONTEXT_OPTIMIZATION: 'contextOptimizationEnabled',
  EVENT_LOGS: 'isEventLogsEnabled',
  PROMPT_ID: 'promptId',
  DEVELOPER_MODE: 'isDeveloperMode',
} as const;

// Initialize settings from localStorage or defaults
const getInitialSettings = () => {
  const getStoredBoolean = (key: string, defaultValue: boolean): boolean => {
    if (!isBrowser) {
      return defaultValue;
    }

    const stored = localStorage.getItem(key);

    if (stored === null) {
      return defaultValue;
    }

    try {
      return JSON.parse(stored);
    } catch {
      return defaultValue;
    }
  };

  return {
    latestBranch: getStoredBoolean(SETTINGS_KEYS.LATEST_BRANCH, false),
    autoSelectTemplate: getStoredBoolean(SETTINGS_KEYS.AUTO_SELECT_TEMPLATE, true),
    contextOptimization: getStoredBoolean(SETTINGS_KEYS.CONTEXT_OPTIMIZATION, true),
    eventLogs: getStoredBoolean(SETTINGS_KEYS.EVENT_LOGS, true),
    promptId: isBrowser ? localStorage.getItem(SETTINGS_KEYS.PROMPT_ID) || 'default' : 'default',
    developerMode: getStoredBoolean(SETTINGS_KEYS.DEVELOPER_MODE, false),
  };
};

// Initialize stores with persisted values
const initialSettings = getInitialSettings();

export const latestBranchStore = atom<boolean>(initialSettings.latestBranch);
export const autoSelectStarterTemplate = atom<boolean>(initialSettings.autoSelectTemplate);
export const enableContextOptimizationStore = atom<boolean>(initialSettings.contextOptimization);
export const isEventLogsEnabled = atom<boolean>(initialSettings.eventLogs);
export const promptStore = atom<string>(initialSettings.promptId);

// Helper functions to update settings with persistence
export const updateLatestBranch = (enabled: boolean) => {
  latestBranchStore.set(enabled);
  localStorage.setItem(SETTINGS_KEYS.LATEST_BRANCH, JSON.stringify(enabled));
};

export const updateAutoSelectTemplate = (enabled: boolean) => {
  autoSelectStarterTemplate.set(enabled);
  localStorage.setItem(SETTINGS_KEYS.AUTO_SELECT_TEMPLATE, JSON.stringify(enabled));
};

export const updateContextOptimization = (enabled: boolean) => {
  enableContextOptimizationStore.set(enabled);
  localStorage.setItem(SETTINGS_KEYS.CONTEXT_OPTIMIZATION, JSON.stringify(enabled));
};

export const updateEventLogs = (enabled: boolean) => {
  isEventLogsEnabled.set(enabled);
  localStorage.setItem(SETTINGS_KEYS.EVENT_LOGS, JSON.stringify(enabled));
};

export const updatePromptId = (id: string) => {
  promptStore.set(id);
  localStorage.setItem(SETTINGS_KEYS.PROMPT_ID, id);
};

// Initialize tab configuration from localStorage or defaults
const getInitialTabConfiguration = (): TabWindowConfig => {
  const defaultConfig: TabWindowConfig = {
    userTabs: DEFAULT_TAB_CONFIG.filter((tab): tab is UserTabConfig => tab.window === 'user'),
  };

  if (!isBrowser) {
    return defaultConfig;
  }

  try {
    const saved = localStorage.getItem('bolt_tab_configuration');

    if (!saved) {
      return defaultConfig;
    }

    const parsed = JSON.parse(saved);

    if (!parsed?.userTabs) {
      return defaultConfig;
    }

    // Ensure proper typing of loaded configuration
    return {
      userTabs: parsed.userTabs.filter((tab: TabVisibilityConfig): tab is UserTabConfig => tab.window === 'user'),
    };
  } catch (error) {
    console.warn('Failed to parse tab configuration:', error);
    return defaultConfig;
  }
};

// console.log('Initial tab configuration:', getInitialTabConfiguration());

export const tabConfigurationStore = map<TabWindowConfig>(getInitialTabConfiguration());

// Helper function to reset tab configuration
export const resetTabConfiguration = () => {
  const defaultConfig: TabWindowConfig = {
    userTabs: DEFAULT_TAB_CONFIG.filter((tab): tab is UserTabConfig => tab.window === 'user'),
  };

  tabConfigurationStore.set(defaultConfig);
  localStorage.setItem('bolt_tab_configuration', JSON.stringify(defaultConfig));
};

// First, let's define the SettingsStore interface
interface SettingsStore {
  isOpen: boolean;
  selectedTab: string;
  openSettings: () => void;
  closeSettings: () => void;
  setSelectedTab: (tab: string) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  isOpen: false,
  selectedTab: 'user', // Default tab

  openSettings: () => {
    set({
      isOpen: true,
      selectedTab: 'user', // Always open to user tab
    });
  },

  closeSettings: () => {
    set({
      isOpen: false,
      selectedTab: 'user', // Reset to user tab when closing
    });
  },

  setSelectedTab: (tab: string) => {
    set({ selectedTab: tab });
  },
}));

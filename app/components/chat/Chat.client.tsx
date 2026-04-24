import { useStore } from '@nanostores/react';
import type { Message } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useAnimate } from 'framer-motion';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useMessageParser, usePromptEnhancer, useShortcuts } from '~/lib/hooks';
import { description, useChatHistory } from '~/lib/persistence';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROMPT_COOKIE_KEY, PROVIDER_LIST, WORK_DIR } from '~/utils/constants';
import { cubicEasingFn } from '~/utils/easings';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import { BaseChat } from './BaseChat';
import Cookies from 'js-cookie';
import { debounce } from '~/utils/debounce';
import { useSettings } from '~/lib/hooks/useSettings';
import type { ProviderInfo } from '~/types/model';
import { useSearchParams } from '@remix-run/react';
import { createSampler } from '~/utils/sampler';
import { getTemplates, selectStarterTemplate } from '~/utils/selectStarterTemplate';
import { logStore } from '~/lib/stores/logs';
import { streamingState } from '~/lib/stores/streaming';
import { filesToArtifacts } from '~/utils/fileUtils';
import { supabaseConnection } from '~/lib/stores/supabase';
import type { DesignScheme } from '~/types/design-scheme';
import type { ElementInfo } from '~/components/workbench/Inspector';
import type { TextUIPart, FileUIPart, Attachment } from '@ai-sdk/ui-utils';
import type { LlmErrorAlertType } from '~/types/actions';
import type { GeneratedImageAssetData } from '~/types/context';
import { buildGeneratedImageManifestEntries, buildGeneratedImageManifestSource } from '~/lib/common/generated-image-manifest';
import { useSupabaseAuth, getCurrentSupabaseAccessToken } from '~/lib/auth/supabase-auth';
import { isExternalAppToolIntent } from '~/utils/tool-intent';
import { COMPOSIO_GUEST_ID_STORAGE_KEY } from '~/components/apps/apps.constants';
import { stripServerManagedApiKeys } from '~/lib/api/cookies';
import { createLlmErrorAlert } from '~/lib/llm/error-alerts';
import { useSupabaseUserPreferences } from '~/lib/supabase/user-preferences.client';
import { resolveActiveProviderSelection } from '~/lib/llm/provider-selection';
import { getApiKeysFromCookies } from './APIKeyManager';

const logger = createScopedLogger('Chat');

export function Chat() {
  renderLogger.trace('Chat');

  const { ready, initialMessages, storeMessageHistory, importChat, exportChat } = useChatHistory();
  const title = useStore(description);
  useEffect(() => {
    workbenchStore.setReloadedMessages(initialMessages.map((m) => m.id));
  }, [initialMessages]);

  return (
    <>
      {ready && (
        <ChatImpl
          description={title}
          initialMessages={initialMessages}
          exportChat={exportChat}
          storeMessageHistory={storeMessageHistory}
          importChat={importChat}
        />
      )}
    </>
  );
}

const processSampledMessages = createSampler(
  (options: {
    messages: Message[];
    initialMessages: Message[];
    isLoading: boolean;
    parseMessages: (messages: Message[], isLoading: boolean) => void;
    storeMessageHistory: (messages: Message[]) => Promise<void>;
  }) => {
    const { messages, initialMessages, isLoading, parseMessages, storeMessageHistory } = options;
    parseMessages(messages, isLoading);

    if (messages.length > initialMessages.length) {
      storeMessageHistory(messages).catch((error) => toast.error(error.message));
    }
  },
  50,
);

interface ChatProps {
  initialMessages: Message[];
  storeMessageHistory: (messages: Message[]) => Promise<void>;
  importChat: (description: string, messages: Message[]) => Promise<void>;
  exportChat: () => void;
  description?: string;
}

export const ChatImpl = memo(
  ({ description, initialMessages, storeMessageHistory, importChat, exportChat }: ChatProps) => {
    useShortcuts();

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [chatStarted, setChatStarted] = useState(initialMessages.length > 0);
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
    const [imageDataList, setImageDataList] = useState<string[]>([]);
    const [searchParams, setSearchParams] = useSearchParams();
    const [fakeLoading, setFakeLoading] = useState(false);
    const files = useStore(workbenchStore.files);
    const [designScheme, setDesignScheme] = useState<DesignScheme | undefined>(undefined);
    const actionAlert = useStore(workbenchStore.alert);
    const deployAlert = useStore(workbenchStore.deployAlert);
    const supabaseConn = useStore(supabaseConnection);
    const selectedProject = supabaseConn.stats?.projects?.find(
      (project) => project.id === supabaseConn.selectedProjectId,
    );
    const supabaseAlert = useStore(workbenchStore.supabaseAlert);
    const { activeProviders, promptId, autoSelectTemplate, contextOptimizationEnabled, llmPreferencesReady, providersReady } =
      useSettings();
    const [llmErrorAlert, setLlmErrorAlert] = useState<LlmErrorAlertType | undefined>(undefined);
    const [model, setModel] = useState(() => DEFAULT_MODEL);
    const [provider, setProvider] = useState<ProviderInfo | undefined>(() => (PROVIDER_LIST[0] || DEFAULT_PROVIDER) as ProviderInfo);
    const { showChat } = useStore(chatStore);
    const [animationScope, animate] = useAnimate();
    const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
    const [chatMode, setChatMode] = useState<'discuss' | 'build'>('build');
    const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null);
    const appliedGeneratedImageAssetIds = useRef(new Set<string>());
    const { getAccessToken, user } = useSupabaseAuth();
    const [authAccessToken, setAuthAccessToken] = useState<string | null>(null);
    const { currentUserRecord, isSyncAvailable, saveLlmPreferences } = useSupabaseUserPreferences();
    const [localGuestId, setLocalGuestId] = useState<string | null>(null);
    const composioUserId = user?.uid || localGuestId;
    const syncedPreferences = currentUserRecord?.llmPreferences;
    const shouldSyncSelection = Boolean(user) && isSyncAvailable;
    const activeProvider = provider ?? activeProviders[0] ?? DEFAULT_PROVIDER;

    useEffect(() => {
      if (!llmPreferencesReady) {
        return;
      }

      const fallbackProvider = resolveActiveProviderSelection({
        activeProviders,
        currentProviderName: provider?.name,
        preferredProviderName: shouldSyncSelection ? syncedPreferences?.selectedProvider : undefined,
        savedProviderName: undefined,
      });

      if (!fallbackProvider || fallbackProvider.name === provider?.name) {
        return;
      }

      setProvider(fallbackProvider);
    }, [activeProviders, llmPreferencesReady, provider, shouldSyncSelection, syncedPreferences?.selectedProvider]);

    useEffect(() => {
      if (!shouldSyncSelection || currentUserRecord === undefined || !llmPreferencesReady) {
        return;
      }

      if (!syncedPreferences?.selectedProvider && provider?.name) {
        void saveLlmPreferences({ selectedProvider: provider.name });
      }
    }, [
      currentUserRecord,
      llmPreferencesReady,
      provider?.name,
      saveLlmPreferences,
      shouldSyncSelection,
      syncedPreferences?.selectedProvider,
    ]);

    useEffect(() => {
      if (!shouldSyncSelection || currentUserRecord === undefined || !llmPreferencesReady) {
        return;
      }

      if (!syncedPreferences?.selectedModel && model) {
        void saveLlmPreferences({ selectedModel: model });
      }
    }, [currentUserRecord, llmPreferencesReady, model, saveLlmPreferences, shouldSyncSelection, syncedPreferences?.selectedModel]);

    useEffect(() => {
      if (typeof window === 'undefined') {
        return;
      }

      const existingGuestId = localStorage.getItem(COMPOSIO_GUEST_ID_STORAGE_KEY);

      if (existingGuestId) {
        setLocalGuestId(existingGuestId);
        return;
      }

      const guestId = `guest_${crypto.randomUUID()}`;
      localStorage.setItem(COMPOSIO_GUEST_ID_STORAGE_KEY, guestId);
      setLocalGuestId(guestId);
    }, []);

    useEffect(() => {
      let cancelled = false;

      if (!user) {
        setAuthAccessToken(null);
        return;
      }

      (async () => {
        let token: string | null = null;

        try {
          token = await getAccessToken();
        } catch (error) {
          logger.warn('Failed to read auth access token for chat request headers', error);
        }

        if (!cancelled) {
          setAuthAccessToken(token);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [getAccessToken, user]);

    const {
      messages,
      isLoading,
      input,
      handleInputChange,
      setInput,
      stop,
      append,
      setMessages,
      reload,
      error,
      data: chatData,
      setData,
      addToolResult,
    } = useChat({
      api: '/api/chat',
      fetch: async (url, options) => {
        const token = getCurrentSupabaseAccessToken();
        const headers = new Headers((options?.headers as HeadersInit) ?? {});
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }
        return fetch(url, { ...options, headers });
      },
      body: {
        apiKeys,
        files,
        promptId,
        contextOptimization: contextOptimizationEnabled,
        chatMode,
        designScheme,
        supabase: {
          isConnected: supabaseConn.isConnected,
          hasSelectedProject: !!selectedProject,
          credentials: {
            supabaseUrl: supabaseConn?.credentials?.supabaseUrl,
            anonKey: supabaseConn?.credentials?.anonKey,
          },
        },
        user: {
          uid: user?.uid,
          composioUserId: composioUserId || undefined,
          email: user?.email || undefined,
          hasComposioIdentity: Boolean(composioUserId),
          isAuthenticated: Boolean(user),
          isSignedIn: Boolean(user),
        },
      },
      sendExtraMessageFields: true,
      onError: (e) => {
        setFakeLoading(false);
        handleError(e, 'chat');
      },
      onFinish: (message, response) => {
        const usage = response.usage;
        setData(undefined);

        if (usage) {
          console.log('Token usage:', usage);
          logStore.logProvider('Chat response completed', {
            component: 'Chat',
            action: 'response',
            model,
            provider: activeProvider.name,
            usage,
            messageLength: message.content.length,
          });
        }

        logger.debug('Finished streaming');
      },
      initialMessages,
      initialInput: Cookies.get(PROMPT_COOKIE_KEY) || '',
    });
    useEffect(() => {
      const prompt = searchParams.get('prompt');

      // console.log(prompt, searchParams, model, provider);

      if (prompt) {
        setSearchParams({});
        runAnimation();
        append({
          role: 'user',
          content: `[Model: ${model}]\n\n[Provider: ${activeProvider.name}]\n\n${prompt}`,
        });
      }
    }, [activeProvider.name, model, searchParams]);

    const { enhancingPrompt, promptEnhanced, enhancePrompt, resetEnhancer } = usePromptEnhancer();
    const { parsedMessages, parseMessages } = useMessageParser();

    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;

    useEffect(() => {
      chatStore.setKey('started', initialMessages.length > 0);
    }, []);

    useEffect(() => {
      processSampledMessages({
        messages,
        initialMessages,
        isLoading,
        parseMessages,
        storeMessageHistory,
      });
    }, [messages, isLoading, parseMessages]);

    useEffect(() => {
      if (!chatData) {
        return;
      }

      const generatedAssets = chatData.filter(
        (entry): entry is GeneratedImageAssetData =>
          typeof entry === 'object' && entry !== null && (entry as GeneratedImageAssetData).type === 'generatedImageAsset',
      );

      generatedAssets.forEach((asset) => {
        if (appliedGeneratedImageAssetIds.current.has(asset.id)) {
          return;
        }

        appliedGeneratedImageAssetIds.current.add(asset.id);

        const fullPath = `${WORK_DIR}/${asset.filePath.replace(/^\/+/, '')}`;
        const bytes = Uint8Array.from(atob(asset.data), (char) => char.charCodeAt(0));

        workbenchStore.createFile(fullPath, bytes, { select: false }).catch((error) => {
          appliedGeneratedImageAssetIds.current.delete(asset.id);
          logger.error('Failed to create generated image asset', error);
        });
      });

      const manifestEntries = buildGeneratedImageManifestEntries(
        generatedAssets.map((asset) => ({
          filePath: asset.filePath,
          urlPath: `/${asset.filePath.replace(/^public\/+/, '')}`,
        })),
      );

      if (manifestEntries.length > 0) {
        const manifestPath = `${WORK_DIR}/src/generated-images.ts`;
        const manifestSource = buildGeneratedImageManifestSource(
          manifestEntries.map((entry) => ({
            filePath: entry.filePath,
            urlPath: entry.urlPath,
          })),
        );

        workbenchStore.createFile(manifestPath, manifestSource, { select: false }).catch((error) => {
          logger.error('Failed to create generated image manifest', error);
        });
      }
    }, [chatData]);

    const scrollTextArea = () => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.scrollTop = textarea.scrollHeight;
      }
    };

    const abort = () => {
      stop();
      chatStore.setKey('aborted', true);
      workbenchStore.abortAllActions();

      logStore.logProvider('Chat response aborted', {
        component: 'Chat',
        action: 'abort',
        model,
        provider: activeProvider.name,
      });
    };

    const handleError = useCallback(
      (error: any, context: 'chat' | 'template' | 'llmcall' = 'chat') => {
        logger.error(`${context} request failed`, error);

        stop();
        setFakeLoading(false);
        const alert = createLlmErrorAlert(error, activeProvider.name);

        logStore.logError(`${context} request failed`, error, {
          component: 'Chat',
          action: 'request',
          error: alert.description,
          context,
          retryable: alert.errorType !== 'setup',
          errorType: alert.errorType,
          provider: alert.provider || activeProvider.name,
        });

        setLlmErrorAlert(alert);
        setData([]);
      },
      [activeProvider.name, stop],
    );

    const clearApiErrorAlert = useCallback(() => {
      setLlmErrorAlert(undefined);
    }, []);

    useEffect(() => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.style.height = 'auto';

        const scrollHeight = textarea.scrollHeight;

        textarea.style.height = `${Math.min(scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
        textarea.style.overflowY = scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
      }
    }, [input, textareaRef]);

    const runAnimation = async () => {
      if (chatStarted) {
        return;
      }

      await Promise.all([
        animate('#examples', { opacity: 0, display: 'none' }, { duration: 0.1 }),
        animate('#intro', { opacity: 0, flex: 1 }, { duration: 0.2, ease: cubicEasingFn }),
      ]);

      chatStore.setKey('started', true);

      setChatStarted(true);
    };

    // Helper function to create message parts array from text and images
    const createMessageParts = (text: string, images: string[] = []): Array<TextUIPart | FileUIPart> => {
      // Create an array of properly typed message parts
      const parts: Array<TextUIPart | FileUIPart> = [
        {
          type: 'text',
          text,
        },
      ];

      // Add image parts if any
      images.forEach((imageData) => {
        // Extract correct MIME type from the data URL
        const mimeType = imageData.split(';')[0].split(':')[1] || 'image/jpeg';

        // Create file part according to AI SDK format
        parts.push({
          type: 'file',
          mimeType,
          data: imageData.replace(/^data:image\/[^;]+;base64,/, ''),
        });
      });

      return parts;
    };

    // Helper function to convert File[] to Attachment[] for AI SDK
    const filesToAttachments = async (files: File[]): Promise<Attachment[] | undefined> => {
      if (files.length === 0) {
        return undefined;
      }

      const attachments = await Promise.all(
        files.map(
          (file) =>
            new Promise<Attachment>((resolve) => {
              const reader = new FileReader();

              reader.onloadend = () => {
                resolve({
                  name: file.name,
                  contentType: file.type,
                  url: reader.result as string,
                });
              };
              reader.readAsDataURL(file);
            }),
        ),
      );

      return attachments;
    };

    const sendMessage = async (_event: React.UIEvent, messageInput?: string) => {
      const messageContent = messageInput || input;

      if (!messageContent?.trim()) {
        return;
      }

      if (isLoading) {
        return;
      }

      if (!user) {
        setLlmErrorAlert({
          type: 'error',
          title: 'Sign-In Required',
          description: 'Sign in before sending chat requests.',
          provider: 'Cryzo',
          errorType: 'auth_required',
        });
        return;
      }

      const token = await getAccessToken();

      if (!token) {
        setLlmErrorAlert({
          type: 'error',
          title: 'Sign-In Required',
          description: 'Sign in before sending chat requests.',
          provider: 'Cryzo',
          errorType: 'auth_required',
        });
        return;
      }

      if (isLoading) {
        return;
      }

      let finalMessageContent = messageContent;
      const isExternalToolRequest = isExternalAppToolIntent(finalMessageContent);

      if (selectedElement) {
        console.log('Selected Element:', selectedElement);

        const elementInfo = `<div class=\"__boltSelectedElement__\" data-element='${JSON.stringify(selectedElement)}'>${JSON.stringify(`${selectedElement.displayText}`)}</div>`;
        finalMessageContent = messageContent + elementInfo;
      }

      if (isExternalToolRequest && chatMode !== 'discuss') {
        setChatMode('discuss');
      }

      runAnimation();

      if (!chatStarted) {
        setFakeLoading(true);

        if (autoSelectTemplate && !isExternalToolRequest) {
          let templateSelection: { template: string; title: string };

          try {
            templateSelection = await selectStarterTemplate({
              message: finalMessageContent,
              model,
              provider: activeProvider,
            });
          } catch (selectionError) {
            handleError(selectionError, 'llmcall');
            return;
          }

          const { template, title } = templateSelection;

          if (template !== 'blank') {
            const temResp = await getTemplates(template, title).catch((e) => {
              if (e.message.includes('rate limit')) {
                toast.warning('Rate limit exceeded. Skipping starter template\n Continuing with blank template');
              } else {
                toast.warning('Failed to import starter template\n Continuing with blank template');
              }

              return null;
            });

            if (temResp) {
              const { assistantMessage, userMessage } = temResp;
              const userMessageText = `[Model: ${model}]\n\n[Provider: ${activeProvider.name}]\n\n${finalMessageContent}`;

              setMessages([
                {
                  id: `1-${new Date().getTime()}`,
                  role: 'user',
                  content: userMessageText,
                  parts: createMessageParts(userMessageText, imageDataList),
                },
                {
                  id: `2-${new Date().getTime()}`,
                  role: 'assistant',
                  content: assistantMessage,
                },
                {
                  id: `3-${new Date().getTime()}`,
                  role: 'user',
                  content: `[Model: ${model}]\n\n[Provider: ${activeProvider.name}]\n\n${userMessage}`,
                  annotations: ['hidden'],
                },
              ]);

              const reloadOptions =
                uploadedFiles.length > 0
                  ? { experimental_attachments: await filesToAttachments(uploadedFiles) }
                  : undefined;

              reload(reloadOptions);
              setInput('');
              Cookies.remove(PROMPT_COOKIE_KEY);

              setUploadedFiles([]);
              setImageDataList([]);

              resetEnhancer();

              textareaRef.current?.blur();
              setFakeLoading(false);

              return;
            }
          }
        }

        // If autoSelectTemplate is disabled or template selection failed, proceed with normal message
        const userMessageText = `[Model: ${model}]\n\n[Provider: ${activeProvider.name}]\n\n${finalMessageContent}`;
        const attachments = uploadedFiles.length > 0 ? await filesToAttachments(uploadedFiles) : undefined;

        setMessages([
          {
            id: `${new Date().getTime()}`,
            role: 'user',
            content: userMessageText,
            parts: createMessageParts(userMessageText, imageDataList),
            experimental_attachments: attachments,
          },
        ]);
        reload(attachments ? { experimental_attachments: attachments } : undefined);
        setFakeLoading(false);
        setInput('');
        Cookies.remove(PROMPT_COOKIE_KEY);

        setUploadedFiles([]);
        setImageDataList([]);

        resetEnhancer();

        textareaRef.current?.blur();

        return;
      }

      if (error != null) {
        setMessages(messages.slice(0, -1));
      }

      const modifiedFiles = workbenchStore.getModifiedFiles();

      chatStore.setKey('aborted', false);

      if (modifiedFiles !== undefined) {
        const userUpdateArtifact = filesToArtifacts(modifiedFiles, `${Date.now()}`);
        const messageText = `[Model: ${model}]\n\n[Provider: ${activeProvider.name}]\n\n${userUpdateArtifact}${finalMessageContent}`;

        const attachmentOptions =
          uploadedFiles.length > 0 ? { experimental_attachments: await filesToAttachments(uploadedFiles) } : undefined;

        append(
          {
            role: 'user',
            content: messageText,
            parts: createMessageParts(messageText, imageDataList),
          },
          attachmentOptions,
        );

        workbenchStore.resetAllFileModifications();
      } else {
        const messageText = `[Model: ${model}]\n\n[Provider: ${activeProvider.name}]\n\n${finalMessageContent}`;

        const attachmentOptions =
          uploadedFiles.length > 0 ? { experimental_attachments: await filesToAttachments(uploadedFiles) } : undefined;

        append(
          {
            role: 'user',
            content: messageText,
            parts: createMessageParts(messageText, imageDataList),
          },
          attachmentOptions,
        );
      }

      setInput('');
      Cookies.remove(PROMPT_COOKIE_KEY);

      setUploadedFiles([]);
      setImageDataList([]);

      resetEnhancer();

      textareaRef.current?.blur();
    };

    /**
     * Handles the change event for the textarea and updates the input state.
     * @param event - The change event from the textarea.
     */
    const onTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      handleInputChange(event);
    };

    /**
     * Debounced function to cache the prompt in cookies.
     * Caches the trimmed value of the textarea input after a delay to optimize performance.
     */
    const debouncedCachePrompt = useCallback(
      debounce((event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const trimmedValue = event.target.value.trim();
        Cookies.set(PROMPT_COOKIE_KEY, trimmedValue, { expires: 30 });
      }, 1000),
      [],
    );

    useEffect(() => {
      setApiKeys(stripServerManagedApiKeys(getApiKeysFromCookies()));
    }, []);

    useEffect(() => {
      if (!user) {
        return;
      }

      setLlmErrorAlert((currentAlert) => (currentAlert?.errorType === 'auth_required' ? undefined : currentAlert));
    }, [user]);

    const handleModelChange = (newModel: string) => {
      setModel(newModel);
      if (shouldSyncSelection) {
        void saveLlmPreferences({ selectedModel: newModel });
      }
    };

    const handleProviderChange = (newProvider: ProviderInfo) => {
      setProvider(newProvider);

      if (shouldSyncSelection) {
        void saveLlmPreferences({ selectedProvider: newProvider.name });
      }
    };

    const handleWebSearchResult = useCallback(
      (result: string) => {
        const currentInput = input || '';
        const newInput = currentInput.length > 0 ? `${result}\n\n${currentInput}` : result;

        // Update the input via the same mechanism as handleInputChange
        const syntheticEvent = {
          target: { value: newInput },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        handleInputChange(syntheticEvent);
      },
      [input, handleInputChange],
    );

    return (
      <BaseChat
        ref={animationScope}
        textareaRef={textareaRef}
        input={input}
        showChat={showChat}
        chatStarted={chatStarted}
        isStreaming={isLoading || fakeLoading}
        onStreamingChange={(streaming) => {
          streamingState.set(streaming);
        }}
        enhancingPrompt={enhancingPrompt}
        promptEnhanced={promptEnhanced}
        sendMessage={sendMessage}
        model={model}
        preferredModel={shouldSyncSelection ? syncedPreferences?.selectedModel : undefined}
        llmPreferencesReady={llmPreferencesReady}
        providersReady={providersReady}
        setModel={handleModelChange}
        provider={activeProvider}
        setProvider={handleProviderChange}
        providerList={activeProviders}
        handleInputChange={(e) => {
          onTextareaChange(e);
          debouncedCachePrompt(e);
        }}
        handleStop={abort}
        description={description}
        importChat={importChat}
        exportChat={exportChat}
        messages={messages.map((message, i) => {
          if (message.role === 'user') {
            return message;
          }

          return {
            ...message,
            content: parsedMessages[i] || '',
          };
        })}
        enhancePrompt={() => {
          enhancePrompt(
            input,
            (input) => {
              setInput(input);
              scrollTextArea();
            },
            model,
            activeProvider,
            apiKeys,
          );
        }}
        uploadedFiles={uploadedFiles}
        setUploadedFiles={setUploadedFiles}
        imageDataList={imageDataList}
        setImageDataList={setImageDataList}
        actionAlert={actionAlert}
        clearAlert={() => workbenchStore.clearAlert()}
        supabaseAlert={supabaseAlert}
        clearSupabaseAlert={() => workbenchStore.clearSupabaseAlert()}
        deployAlert={deployAlert}
        clearDeployAlert={() => workbenchStore.clearDeployAlert()}
        llmErrorAlert={llmErrorAlert}
        clearLlmErrorAlert={clearApiErrorAlert}
        data={chatData}
        chatMode={chatMode}
        setChatMode={setChatMode}
        append={append}
        designScheme={designScheme}
        setDesignScheme={setDesignScheme}
        selectedElement={selectedElement}
        setSelectedElement={setSelectedElement}
        addToolResult={addToolResult}
        onWebSearchResult={handleWebSearchResult}
      />
    );
  },
);

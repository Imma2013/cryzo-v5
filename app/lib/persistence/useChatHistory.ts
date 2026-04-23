import { useLoaderData, useNavigate, useSearchParams } from '@remix-run/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { atom } from 'nanostores';
import { generateId, type JSONValue, type Message } from 'ai';
import { toast } from 'react-toastify';
import { workbenchStore } from '~/lib/stores/workbench';
import { logStore } from '~/lib/stores/logs';
import type { Snapshot } from './types';
import { webcontainer } from '~/lib/webcontainer';
import { detectProjectCommands, createCommandActionsString } from '~/utils/projectCommands';
import type { ContextAnnotation } from '~/types/context';
import { useSupabaseAuth } from '~/lib/auth/supabase-auth';

export interface ChatHistoryItem {
  id: string;
  urlId?: string;
  description?: string;
  messages: Message[];
  timestamp: string;
  metadata?: IChatMetadata;
}

export interface IChatMetadata {
  gitUrl: string;
  gitBranch?: string;
  netlifySiteId?: string;
}

type SupabaseChatRecord = {
  routeId: string;
  description?: string;
  messages: Message[];
  metadata?: IChatMetadata;
  snapshot?: Snapshot;
  timestamp: string;
  lastUpdatedAt?: number;
};

export const db = undefined;
export const chatId = atom<string | undefined>(undefined);
export const description = atom<string | undefined>(undefined);
export const chatMetadata = atom<IChatMetadata | undefined>(undefined);

function createRouteId(seed?: string) {
  const normalizedSeed = seed?.trim().replace(/[^a-zA-Z0-9-_]/g, '-');

  if (normalizedSeed) {
    return `${normalizedSeed}-${crypto.randomUUID().slice(0, 8)}`;
  }

  return crypto.randomUUID();
}

function navigateChat(nextId: string) {
  const url = new URL(window.location.href);
  url.pathname = `/chat/${nextId}`;
  window.history.replaceState({}, '', url);
}

function buildArchivedMessagesPayload(
  storedMessages: Message[],
  snapshot: Snapshot | undefined,
  rewindId: string | null,
) {
  const validSnapshot = snapshot || { chatIndex: '', files: {} };
  const summary = validSnapshot.summary;
  let startingIdx = -1;
  const endingIdx = rewindId ? storedMessages.findIndex((message) => message.id === rewindId) + 1 : storedMessages.length;
  const snapshotIndex = storedMessages.findIndex((message) => message.id === validSnapshot.chatIndex);

  if (snapshotIndex >= 0 && snapshotIndex < endingIdx) {
    startingIdx = snapshotIndex;
  }

  if (snapshotIndex > 0 && storedMessages[snapshotIndex]?.id === rewindId) {
    startingIdx = -1;
  }

  const archivedMessages = startingIdx >= 0 ? storedMessages.slice(0, startingIdx + 1) : [];

  return {
    archivedMessages,
    endingIdx,
    snapshotIndex,
    startingIdx,
    summary,
    validSnapshot,
  };
}

function mergeChatRecord(records: SupabaseChatRecord[] | undefined, nextRecord: SupabaseChatRecord) {
  const next = records ? [...records] : [];
  const existingIndex = next.findIndex((record) => record.routeId === nextRecord.routeId);

  if (existingIndex >= 0) {
    next[existingIndex] = nextRecord;
  } else {
    next.unshift(nextRecord);
  }

  next.sort((left, right) => {
    const leftTime = left.lastUpdatedAt ?? (Date.parse(left.timestamp) || 0);
    const rightTime = right.lastUpdatedAt ?? (Date.parse(right.timestamp) || 0);
    return rightTime - leftTime;
  });

  return next;
}

export function useChatHistory() {
  const navigate = useNavigate();
  const { id: mixedId } = useLoaderData<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const { getAccessToken, isLoading: isAuthLoading, user } = useSupabaseAuth();
  const [listChats, setListChats] = useState<SupabaseChatRecord[] | undefined>(undefined);
  const [currentChat, setCurrentChat] = useState<SupabaseChatRecord | null | undefined>(undefined);

  const [archivedMessages, setArchivedMessages] = useState<Message[]>([]);
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [ready, setReady] = useState<boolean>(false);
  const [urlId, setUrlId] = useState<string | undefined>();

  const getAuthHeaders = useCallback(async () => {
    const token = await getAccessToken();

    if (!token) {
      throw new Error('Sign in before accessing chats.');
    }

    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }, [getAccessToken]);

  useEffect(() => {
    let cancelled = false;

    const loadChats = async () => {
      if (isAuthLoading) {
        return;
      }

      if (!user) {
        if (!cancelled) {
          setListChats([]);
          setCurrentChat(null);
        }
        return;
      }

      try {
        const headers = await getAuthHeaders();
        const listResponse = await fetch('/api/chats', {
          method: 'GET',
          headers,
        });
        const listPayload = (await listResponse.json()) as { chats?: SupabaseChatRecord[]; message?: string };

        if (!listResponse.ok) {
          throw new Error(listPayload.message || 'Failed to load chat list.');
        }

        let nextCurrentChat: SupabaseChatRecord | null | undefined = null;

        if (mixedId) {
          const currentResponse = await fetch(`/api/chats?routeId=${encodeURIComponent(mixedId)}`, {
            method: 'GET',
            headers,
          });
          const currentPayload = (await currentResponse.json()) as { chat?: SupabaseChatRecord | null; message?: string };

          if (!currentResponse.ok) {
            throw new Error(currentPayload.message || 'Failed to load chat.');
          }

          nextCurrentChat = currentPayload.chat ?? null;
        }

        if (!cancelled) {
          setListChats(listPayload.chats || []);
          setCurrentChat(nextCurrentChat);
        }
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          setListChats([]);
          setCurrentChat(null);
        }
      }
    };

    loadChats().catch((error) => {
      if (!cancelled) {
        console.error(error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [getAuthHeaders, isAuthLoading, mixedId, user]);

  const chatList = useMemo<ChatHistoryItem[]>(
    () => {
      if (!user) {
        return [];
      }

      return (listChats || []).map((chat) => ({
        description: chat.description,
        id: chat.routeId,
        messages: chat.messages,
        metadata: chat.metadata,
        timestamp: chat.timestamp,
        urlId: chat.routeId,
      }));
    },
    [listChats, user],
  );

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (!user) {
      if (isAuthLoading) {
        return;
      }

      setArchivedMessages([]);
      setInitialMessages([]);
      setUrlId(undefined);
      setReady(true);
      description.set(undefined);
      chatId.set(undefined);
      chatMetadata.set(undefined);

      if (mixedId) {
        navigate('/', { replace: true });
      }

      return;
    }

    if (!mixedId) {
      setReady(true);
      return;
    }

    if (currentChat === undefined) {
      return;
    }

    if (!currentChat) {
      navigate('/', { replace: true });
      setReady(true);
      return;
    }

    const rewindId = searchParams.get('rewindTo');
    const { archivedMessages, endingIdx, snapshotIndex, startingIdx, summary, validSnapshot } = buildArchivedMessagesPayload(
      currentChat.messages,
      currentChat.snapshot,
      rewindId,
    );

    const loadChat = async () => {
      let filteredMessages = currentChat.messages.slice(startingIdx + 1, endingIdx);

      if (startingIdx > 0) {
        const files = Object.entries(validSnapshot.files || {})
          .map(([key, value]) => {
            if (value?.type !== 'file') {
              return null;
            }

            return {
              content: value.content,
              path: key,
            };
          })
          .filter((entry): entry is { content: string; path: string } => Boolean(entry));
        const projectCommands = await detectProjectCommands(files);
        const commandActionsString = createCommandActionsString(projectCommands);

        filteredMessages = [
          {
            id: generateId(),
            role: 'user',
            content: 'Restore project from snapshot',
            annotations: ['no-store', 'hidden'],
          },
          {
            id: currentChat.messages[snapshotIndex].id,
            role: 'assistant',
            content: `Bolt Restored your chat from a snapshot. You can revert this message to load the full chat history.
                  <boltArtifact id="restored-project-setup" title="Restored Project & Setup" type="bundled">
                  ${Object.entries(validSnapshot.files || {})
                    .map(([key, value]) =>
                      value?.type === 'file'
                        ? `
                      <boltAction type="file" filePath="${key}">
${value.content}
                      </boltAction>
                      `
                        : ``,
                    )
                    .join('\n')}
                  ${commandActionsString} 
                  </boltArtifact>
                  `,
            annotations: [
              'no-store',
              ...(summary
                ? [
                    {
                      chatId: currentChat.messages[snapshotIndex].id,
                      type: 'chatSummary',
                      summary,
                    } satisfies ContextAnnotation,
                  ]
                : []),
            ],
          },
          ...filteredMessages,
        ];
        await restoreSnapshot(currentChat.routeId, validSnapshot);
      }

      setArchivedMessages(archivedMessages);
      setInitialMessages(filteredMessages);
      setUrlId(currentChat.routeId);
      description.set(currentChat.description);
      chatId.set(currentChat.routeId);
      chatMetadata.set(currentChat.metadata);
      setReady(true);
    };

    loadChat().catch((error) => {
      console.error(error);
      logStore.logError('Failed to load chat messages or snapshot', error);
      toast.error('Failed to load chat: ' + error.message);
      setReady(true);
    });
  }, [currentChat, isAuthLoading, mixedId, navigate, searchParams, user]);

  const updateStoredChat = useCallback(
    async (routeId: string, messages: Message[], metadata?: IChatMetadata, nextDescription?: string, snapshot?: Snapshot) => {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/chats', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          operation: 'upsert',
          description: nextDescription,
          messagesJson: JSON.stringify(messages),
          metadata,
          routeId,
          snapshotJson:
            snapshot ? JSON.stringify(snapshot) : currentChat?.snapshot ? JSON.stringify(currentChat.snapshot) : undefined,
          timestamp:
            currentChat?.routeId === routeId
              ? currentChat.timestamp
              : chatList.find((chat) => chat.id === routeId)?.timestamp || new Date().toISOString(),
        }),
      });
      const payload = (await response.json()) as { chat?: SupabaseChatRecord; message?: string };

      if (!response.ok || !payload.chat) {
        throw new Error(payload.message || 'Failed to persist chat.');
      }

      setCurrentChat((existing) => (existing?.routeId === routeId ? payload.chat! : existing));
      setListChats((existing) => mergeChatRecord(existing, payload.chat!));
    },
    [chatList, currentChat, getAuthHeaders],
  );

  const updateChatDescription = useCallback(
    async (routeId: string, nextDescription: string) => {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/chats', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          operation: 'updateDescription',
          routeId,
          description: nextDescription,
        }),
      });
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message || 'Failed to update chat description.');
      }

      setCurrentChat((existing) =>
        existing && existing.routeId === routeId ? { ...existing, description: nextDescription } : existing,
      );
      setListChats((existing) =>
        (existing || []).map((chat) => (chat.routeId === routeId ? { ...chat, description: nextDescription } : chat)),
      );
    },
    [getAuthHeaders],
  );

  const restoreSnapshot = useCallback(async (_id: string, snapshot?: Snapshot) => {
    const container = await webcontainer;
    const validSnapshot = snapshot || { chatIndex: '', files: {} };

    if (!validSnapshot?.files) {
      return;
    }

    await Promise.all(
      Object.entries(validSnapshot.files).map(async ([key, value]) => {
        if (key.startsWith(container.workdir)) {
          key = key.replace(container.workdir, '');
        }

        if (value?.type === 'folder') {
          await container.fs.mkdir(key, { recursive: true });
        }
      }),
    );

    await Promise.all(
      Object.entries(validSnapshot.files).map(async ([key, value]) => {
        if (value?.type === 'file') {
          if (key.startsWith(container.workdir)) {
            key = key.replace(container.workdir, '');
          }

          await container.fs.writeFile(key, value.content, { encoding: value.isBinary ? undefined : 'utf8' });
        }
      }),
    );
  }, []);

  return {
    chatList,
    ready: !mixedId || ready,
    initialMessages,
    updateChatMestaData: async (metadata: IChatMetadata) => {
      const id = chatId.get();

      if (!id) {
        return;
      }

      try {
        await updateStoredChat(id, currentChat?.messages || initialMessages, metadata, description.get(), currentChat?.snapshot);
        chatMetadata.set(metadata);
      } catch (error) {
        toast.error('Failed to update chat metadata');
        console.error(error);
      }
    },
    storeMessageHistory: async (messages: Message[]) => {
      if (!user || messages.length === 0) {
        return;
      }

      const { firstArtifact } = workbenchStore;
      const filteredMessages = messages.filter((message) => !message.annotations?.includes('no-store'));

      let nextRouteId = urlId;

      if (!nextRouteId) {
        nextRouteId = chatId.get() || createRouteId(firstArtifact?.id);
        chatId.set(nextRouteId);
        setUrlId(nextRouteId);
        navigateChat(nextRouteId);
      }

      let chatSummary: string | undefined;
      const lastMessage = filteredMessages[filteredMessages.length - 1];

      if (lastMessage?.role === 'assistant') {
        const annotations = lastMessage.annotations as JSONValue[];
        const filteredAnnotations = (annotations?.filter(
          (annotation: JSONValue) =>
            annotation && typeof annotation === 'object' && Object.keys(annotation).includes('type'),
        ) || []) as Array<{ type: string; value?: any; summary?: string }>;

        const summaryAnnotation = filteredAnnotations.find((annotation) => annotation.type === 'chatSummary');
        chatSummary = summaryAnnotation?.summary;
      }

      const snapshot: Snapshot = {
        chatIndex: filteredMessages[filteredMessages.length - 1].id,
        files: workbenchStore.files.get(),
        summary: chatSummary,
      };

      if (!description.get() && firstArtifact?.title) {
        description.set(firstArtifact.title);
      }

      await updateStoredChat(
        nextRouteId,
        [...archivedMessages, ...filteredMessages],
        chatMetadata.get(),
        description.get(),
        snapshot,
      );

    },
    duplicateCurrentChat: async (listItemId: string) => {
      const sourceId = mixedId || listItemId;

      if (!sourceId) {
        return;
      }

      try {
        const headers = await getAuthHeaders();
        const response = await fetch('/api/chats', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            operation: 'duplicate',
            nextRouteId: createRouteId(sourceId),
            routeId: sourceId,
          }),
        });
        const payload = (await response.json()) as { routeId?: string; message?: string };

        if (!response.ok || !payload.routeId) {
          throw new Error(payload.message || 'Failed to duplicate chat.');
        }

        const newId = payload.routeId;
        navigate(`/chat/${newId}`);
        toast.success('Chat duplicated successfully');
      } catch (error) {
        toast.error('Failed to duplicate chat');
        console.log(error);
      }
    },
    deleteChat: async (id: string) => {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/chats', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          operation: 'delete',
          routeId: id,
        }),
      });
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message || 'Failed to delete chat.');
      }

      setListChats((existing) => (existing || []).filter((chat) => chat.routeId !== id));
    },
    forkCurrentChat: async (messageId: string) => {
      const sourceId = chatId.get();

      if (!sourceId) {
        throw new Error('Chat not found');
      }

      const headers = await getAuthHeaders();
      const response = await fetch('/api/chats', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          operation: 'fork',
          messageId,
          nextRouteId: createRouteId(sourceId),
          routeId: sourceId,
        }),
      });
      const payload = (await response.json()) as { routeId?: string; message?: string };

      if (!response.ok || !payload.routeId) {
        throw new Error(payload.message || 'Failed to fork chat.');
      }

      return payload.routeId;
    },
    updateChatDescription,
    importChat: async (nextDescription: string, messages: Message[], metadata?: IChatMetadata) => {
      if (!user) {
        toast.error('Sign in before importing chats.');
        return;
      }

      try {
        const routeId = createRouteId(nextDescription);
        const headers = await getAuthHeaders();
        const response = await fetch('/api/chats', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            operation: 'upsert',
            description: nextDescription,
            messagesJson: JSON.stringify(messages),
            metadata,
            routeId,
            timestamp: new Date().toISOString(),
          }),
        });
        const payload = (await response.json()) as { message?: string };

        if (!response.ok) {
          throw new Error(payload.message || 'Failed to import chat.');
        }

        window.location.href = `/chat/${routeId}`;
        toast.success('Chat imported successfully');
      } catch (error) {
        if (error instanceof Error) {
          toast.error('Failed to import chat: ' + error.message);
        } else {
          toast.error('Failed to import chat');
        }
      }
    },
    exportChat: async (id = urlId) => {
      if (!id) {
        return;
      }

      const chat = chatList.find((entry) => entry.id === id || entry.urlId === id);

      if (!chat) {
        return;
      }

      const chatData = {
        messages: chat.messages,
        description: chat.description,
        exportDate: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `chat-${new Date().toISOString()}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    },
  };
}

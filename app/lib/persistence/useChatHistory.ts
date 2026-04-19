import { useLoaderData, useNavigate, useSearchParams } from '@remix-run/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { atom } from 'nanostores';
import { generateId, type JSONValue, type Message } from 'ai';
import { toast } from 'react-toastify';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { workbenchStore } from '~/lib/stores/workbench';
import { logStore } from '~/lib/stores/logs';
import type { Snapshot } from './types';
import { webcontainer } from '~/lib/webcontainer';
import { detectProjectCommands, createCommandActionsString } from '~/utils/projectCommands';
import type { ContextAnnotation } from '~/types/context';
import { useFirebaseAuth } from '~/lib/auth/firebase-auth';
import { getAll as getAllLegacyChats, getSnapshot as getLegacySnapshot, openDatabase } from './db';

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

type ConvexChatRecord = {
  routeId: string;
  description?: string;
  messages: Message[];
  metadata?: IChatMetadata;
  snapshot?: Snapshot;
  timestamp: string;
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

export function useChatHistory() {
  const navigate = useNavigate();
  const { id: mixedId } = useLoaderData<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const { isLoading: isAuthLoading, user } = useFirebaseAuth();
  const listChats = useQuery(api.chats.listCurrentUserChats, user ? {} : 'skip') as ConvexChatRecord[] | undefined;
  const currentChat = useQuery(api.chats.getCurrentUserChatByRouteId, user && mixedId ? { routeId: mixedId } : 'skip') as
    | ConvexChatRecord
    | null
    | undefined;
  const upsertChat = useMutation(api.chats.upsertCurrentUserChat);
  const deleteChatMutation = useMutation(api.chats.deleteCurrentUserChat);
  const duplicateChatMutation = useMutation(api.chats.duplicateCurrentUserChat);
  const forkChatMutation = useMutation(api.chats.forkCurrentUserChat);

  const [archivedMessages, setArchivedMessages] = useState<Message[]>([]);
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [ready, setReady] = useState<boolean>(false);
  const [urlId, setUrlId] = useState<string | undefined>();
  const hasMigratedLegacyChatsRef = useRef(false);

  const chatList = useMemo<ChatHistoryItem[]>(
    () =>
      (listChats || []).map((chat) => ({
        description: chat.description,
        id: chat.routeId,
        messages: chat.messages,
        metadata: chat.metadata,
        timestamp: chat.timestamp,
        urlId: chat.routeId,
      })),
    [listChats],
  );

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (!user) {
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

  useEffect(() => {
    if (!user || hasMigratedLegacyChatsRef.current || listChats === undefined) {
      return;
    }

    hasMigratedLegacyChatsRef.current = true;

    const migrateLegacyChats = async () => {
      const legacyDb = await openDatabase();

      if (!legacyDb) {
        return;
      }

      const legacyChats = await getAllLegacyChats(legacyDb);

      await Promise.all(
        legacyChats.map(async (legacyChat) => {
          const routeId = legacyChat.urlId || legacyChat.id;
          const legacySnapshot = await getLegacySnapshot(legacyDb, legacyChat.id).catch(() => undefined);

          await upsertChat({
            description: legacyChat.description,
            messagesJson: JSON.stringify(legacyChat.messages),
            metadata: legacyChat.metadata,
            routeId,
            snapshotJson: legacySnapshot ? JSON.stringify(legacySnapshot) : undefined,
            timestamp: legacyChat.timestamp,
          });
        }),
      );
    };

    migrateLegacyChats().catch((error) => {
      hasMigratedLegacyChatsRef.current = false;
      console.error('Failed to migrate legacy chats into Convex:', error);
    });
  }, [listChats, upsertChat, user]);

  const updateStoredChat = useCallback(
    async (routeId: string, messages: Message[], metadata?: IChatMetadata, nextDescription?: string, snapshot?: Snapshot) => {
      await upsertChat({
        description: nextDescription,
        messagesJson: JSON.stringify(messages),
        metadata,
        routeId,
        snapshotJson: snapshot ? JSON.stringify(snapshot) : currentChat?.snapshot ? JSON.stringify(currentChat.snapshot) : undefined,
        timestamp:
          currentChat?.routeId === routeId
            ? currentChat.timestamp
            : chatList.find((chat) => chat.id === routeId)?.timestamp || new Date().toISOString(),
      });
    },
    [chatList, currentChat, upsertChat],
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
        const newId = await duplicateChatMutation({
          nextRouteId: createRouteId(sourceId),
          routeId: sourceId,
        });
        navigate(`/chat/${newId}`);
        toast.success('Chat duplicated successfully');
      } catch (error) {
        toast.error('Failed to duplicate chat');
        console.log(error);
      }
    },
    deleteChat: async (id: string) => {
      await deleteChatMutation({ routeId: id });
    },
    forkCurrentChat: async (messageId: string) => {
      const sourceId = chatId.get();

      if (!sourceId) {
        throw new Error('Chat not found');
      }

      return forkChatMutation({
        messageId,
        nextRouteId: createRouteId(sourceId),
        routeId: sourceId,
      });
    },
    importChat: async (nextDescription: string, messages: Message[], metadata?: IChatMetadata) => {
      if (!user) {
        toast.error('Sign in before importing chats.');
        return;
      }

      try {
        const routeId = createRouteId(nextDescription);
        await upsertChat({
          description: nextDescription,
          messagesJson: JSON.stringify(messages),
          metadata,
          routeId,
          timestamp: new Date().toISOString(),
        });
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

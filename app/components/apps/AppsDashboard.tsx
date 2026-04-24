import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { Button } from '~/components/ui/Button';
import { APPS_RESTORE_STORAGE_KEY, APPS_VIEW_QUERY_VALUE } from './apps.constants';
import { ensureToolkitArray } from './apps.data';
import { shouldRenderToolkitLogo } from './apps.utils';

export type AppToolkit = {
  slug: string;
  name: string;
  logo?: string;
  isAvailable?: boolean;
  isConnected: boolean;
  connectedAccountId?: string;
};

interface AppsDashboardProps {
  userId: string | null;
  onRequireIdentity?: () => void;
}

type ActionState = Record<string, 'connect' | 'disconnect'>;

export function AppsDashboard({ userId, onRequireIdentity }: AppsDashboardProps) {
  const [toolkits, setToolkits] = useState<AppToolkit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<ActionState>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [brokenLogoSlugs, setBrokenLogoSlugs] = useState<Record<string, true>>({});

  const filteredToolkits = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return toolkits;
    }

    return toolkits.filter((toolkit) => toolkit.name.toLowerCase().includes(normalizedQuery));
  }, [searchQuery, toolkits]);

  const fetchConnections = useCallback(async () => {
    if (!userId) {
      setError('Apps are unavailable until you sign in.');
      setIsLoading(false);
      onRequireIdentity?.();

      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/connections');

      const data = (await response.json()) as { error?: string; toolkits?: unknown };

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load app connections.');
      }

      setToolkits(ensureToolkitArray(data.toolkits));
      setBrokenLogoSlugs({});
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Failed to load app connections.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [onRequireIdentity, userId]);

  useEffect(() => {
    fetchConnections().catch((requestError) => {
      console.error('Failed to fetch Composio connections', requestError);
    });
  }, [fetchConnections]);

  const connect = async (slug: string) => {
    if (!userId) {
      onRequireIdentity?.();

      return;
    }

    setActionState((current) => ({ ...current, [slug]: 'connect' }));

    try {
      const response = await fetch('/api/connections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ toolkit: slug }),
      });

      const data = (await response.json()) as { error?: string; redirectUrl?: string };

      if (!response.ok || !data.redirectUrl) {
        throw new Error(data.error || 'Failed to start app connection.');
      }

      localStorage.setItem(APPS_RESTORE_STORAGE_KEY, APPS_VIEW_QUERY_VALUE);
      window.location.href = data.redirectUrl;
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'Failed to start app connection.');
      setActionState((current) => {
        const nextState = { ...current };
        delete nextState[slug];

        return nextState;
      });
    }
  };

  const disconnect = async (connectedAccountId: string, slug: string) => {
    if (!userId) {
      onRequireIdentity?.();

      return;
    }

    setActionState((current) => ({ ...current, [slug]: 'disconnect' }));

    try {
      const response = await fetch('/api/connections/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ connectedAccountId }),
      });

      const data = (await response.json()) as { error?: string; success?: boolean };

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to disconnect app.');
      }

      await fetchConnections();
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'Failed to disconnect app.');
    } finally {
      setActionState((current) => {
        const nextState = { ...current };
        delete nextState[slug];

        return nextState;
      });
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return <div className="px-6 py-10 text-sm text-gray-500 dark:text-gray-400">Loading app connections...</div>;
    }

    if (error) {
      return (
        <div className="rounded-2xl border border-red-200 bg-red-50/80 p-5 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
          <div className="font-medium">Apps unavailable</div>
          <p className="mt-1 text-red-600/90 dark:text-red-200/80">{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => fetchConnections()}>
            Retry
          </Button>
        </div>
      );
    }

    if (filteredToolkits.length === 0) {
      return (
        <div className="rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-8 text-sm text-gray-500 dark:text-gray-400">
          {toolkits.length === 0 ? 'No connectable apps were returned.' : 'No apps match your search.'}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
        {filteredToolkits.map((toolkit) => {
          const currentAction = actionState[toolkit.slug];
          const showLogoImage = shouldRenderToolkitLogo(toolkit.logo, Boolean(brokenLogoSlugs[toolkit.slug]));

          return (
            <div
              key={toolkit.slug}
              className="flex items-center justify-between gap-4 rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background px-4 py-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                {showLogoImage ? (
                  <img
                    src={toolkit.logo}
                    alt={toolkit.name}
                    className="h-11 w-11 object-contain"
                    loading="lazy"
                    onError={() =>
                      setBrokenLogoSlugs((current) => ({
                        ...current,
                        [toolkit.slug]: true,
                      }))
                    }
                  />
                ) : (
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                    aria-label={`${toolkit.name} fallback icon`}
                  >
                    <div className="i-ph:grid-nine h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-bolt-elements-textPrimary">{toolkit.name}</div>
                  <div
                    className={`text-xs ${
                      toolkit.isConnected
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : toolkit.isAvailable === false
                          ? 'text-amber-600 dark:text-amber-400'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {toolkit.isConnected ? 'Connected' : toolkit.isAvailable === false ? 'Unavailable' : 'Not connected'}
                  </div>
                </div>
              </div>
              {toolkit.isConnected ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentAction === 'disconnect' || !toolkit.connectedAccountId}
                  onClick={() => toolkit.connectedAccountId && disconnect(toolkit.connectedAccountId, toolkit.slug)}
                >
                  {currentAction === 'disconnect' ? 'Disconnecting...' : 'Disconnect'}
                </Button>
              ) : toolkit.isAvailable === false ? (
                <Button size="sm" variant="outline" disabled>
                  Unavailable
                </Button>
              ) : (
                <Button size="sm" disabled={currentAction === 'connect'} onClick={() => connect(toolkit.slug)}>
                  {currentAction === 'connect' ? 'Redirecting...' : 'Connect'}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-bolt-elements-background-depth-1">
      <div className="border-b border-bolt-elements-borderColor bg-bolt-elements-background px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-bolt-elements-textPrimary">Apps</h1>
            <p className="mt-1 text-sm text-bolt-elements-textSecondary">
              Connect your apps to give your agent access outside the chat.
            </p>
          </div>
          <div className="relative w-full max-w-md">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
              <span className="i-ph:magnifying-glass h-4 w-4 text-gray-400 dark:text-gray-500" />
            </div>
            <input
              className="w-full rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 py-2.5 pl-9 pr-3 text-sm text-bolt-elements-textPrimary outline-none transition focus:border-purple-400 focus:ring-1 focus:ring-purple-400/40"
              type="search"
              placeholder="Search apps..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              aria-label="Search apps"
            />
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-6">{renderContent()}</div>
    </section>
  );
}

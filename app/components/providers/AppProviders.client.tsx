import { ConvexAuthProvider, type TokenStorage } from '@convex-dev/auth/react';
import type { ReactNode } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { FirebaseAuthProvider } from '~/lib/auth/firebase-auth';
import { convexClient, isConvexConfigured } from '~/lib/convex/client';
import { FirebaseAppProvider } from '~/lib/firebase/user-preferences.client';

interface AppProvidersProps {
  children: ReactNode;
}

const inMemoryTokenEntries = new Map<string, string>();

const inMemoryTokenStorage: TokenStorage = {
  getItem: (key) => inMemoryTokenEntries.get(key) ?? null,
  removeItem: (key) => {
    inMemoryTokenEntries.delete(key);
  },
  setItem: (key, value) => {
    inMemoryTokenEntries.set(key, value);
  },
};

export function AppProviders({ children }: AppProvidersProps) {
  const appTree = (
    <FirebaseAuthProvider>
      <FirebaseAppProvider>{children}</FirebaseAppProvider>
    </FirebaseAuthProvider>
  );

  return (
    <DndProvider backend={HTML5Backend}>
      {isConvexConfigured && convexClient ? (
        <ConvexAuthProvider client={convexClient} storage={inMemoryTokenStorage}>
          {appTree}
        </ConvexAuthProvider>
      ) : (
        appTree
      )}
    </DndProvider>
  );
}

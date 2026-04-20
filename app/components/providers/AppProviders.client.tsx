import type { ReactNode } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { FirebaseAuthProvider } from '~/lib/auth/firebase-auth';
import { FirebaseAppProvider } from '~/lib/firebase/user-preferences.client';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <DndProvider backend={HTML5Backend}>
      <FirebaseAuthProvider>
        <FirebaseAppProvider>{children}</FirebaseAppProvider>
      </FirebaseAuthProvider>
    </DndProvider>
  );
}

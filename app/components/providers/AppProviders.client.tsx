import type { ReactNode } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { FirebaseAuthProvider } from '~/lib/auth/firebase-auth';
import { ConvexAppProvider } from '~/lib/convex/client';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <DndProvider backend={HTML5Backend}>
      <FirebaseAuthProvider>
        <ConvexAppProvider>{children}</ConvexAppProvider>
      </FirebaseAuthProvider>
    </DndProvider>
  );
}

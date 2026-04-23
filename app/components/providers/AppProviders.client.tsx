import type { ReactNode } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { SupabaseAuthProvider } from '~/lib/auth/supabase-auth';
import { SupabaseAppProvider } from '~/lib/supabase/user-preferences.client';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <DndProvider backend={HTML5Backend}>
      <SupabaseAuthProvider>
        <SupabaseAppProvider>{children}</SupabaseAppProvider>
      </SupabaseAuthProvider>
    </DndProvider>
  );
}

import { json, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { useState } from 'react';
import { AuthDialog } from '~/components/auth/AuthDialog';
import { Button } from '~/components/ui/Button';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import { useFirebaseAuth } from '~/lib/auth/firebase-auth';
import BackgroundRays from '~/components/ui/BackgroundRays';

export const meta: MetaFunction = () => {
  return [{ title: 'Bolt' }, { name: 'description', content: 'Talk with Bolt, an AI assistant from StackBlitz' }];
};

export const loader = () => json({});

function AppAccessGate() {
  const { isLoading, user } = useFirebaseAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  if (isLoading) {
    return <div className="mx-auto mt-16 text-sm text-bolt-elements-textSecondary">Checking session...</div>;
  }

  if (user) {
    return <Chat />;
  }

  return (
    <div className="mx-auto mt-16 flex w-full max-w-xl flex-col items-center gap-4 rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-8 text-center">
      <h2 className="text-2xl font-semibold text-bolt-elements-textPrimary">Sign in to use Cryzo</h2>
      <p className="text-sm text-bolt-elements-textSecondary">
        Create an account or sign in first. Once signed in, your chats and preferences sync through Convex.
      </p>
      <Button className="h-10 rounded-full px-6" onClick={() => setIsDialogOpen(true)} variant="outline">
        Sign In
      </Button>
      <AuthDialog onOpenChange={setIsDialogOpen} open={isDialogOpen} />
    </div>
  );
}

/**
 * Landing page component for Bolt
 * Note: Settings functionality should ONLY be accessed through the sidebar menu.
 * Do not add settings button/panel to this landing page as it was intentionally removed
 * to keep the UI clean and consistent with the design system.
 */
export default function Index() {
  return (
    <div className="flex flex-col h-full w-full bg-bolt-elements-background-depth-1">
      <BackgroundRays />
      <Header />
      <ClientOnly fallback={<BaseChat />}>{() => <AppAccessGate />}</ClientOnly>
    </div>
  );
}

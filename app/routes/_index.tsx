import { json, redirect, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import BackgroundRays from '~/components/ui/BackgroundRays';
import { hasAuthCallbackQueryParams } from '~/lib/auth/auth-callback';
import { sanitizeRelativeRedirectPath } from '~/lib/auth/redirect-path';

export const meta: MetaFunction = () => {
  return [{ title: 'Bolt' }, { name: 'description', content: 'Talk with Bolt, an AI assistant from StackBlitz' }];
};

export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (hasAuthCallbackQueryParams(url)) {
    const callbackParams = new URLSearchParams(url.searchParams);

    if (!callbackParams.has('next')) {
      const currentPath = `${url.pathname}${url.search}${url.hash}`;
      callbackParams.set('next', sanitizeRelativeRedirectPath(currentPath, '/'));
    }

    return redirect(`/auth/callback?${callbackParams.toString()}`);
  }

  return json({});
};

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
      <ClientOnly fallback={<BaseChat />}>{() => <Chat />}</ClientOnly>
    </div>
  );
}

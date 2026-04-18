import { useMemo, useState } from 'react';
import { Button } from '~/components/ui/Button';
import { AuthDialog } from '~/components/auth/AuthDialog';
import { useFirebaseAuth } from '~/lib/auth/firebase-auth';

function getInitials(label: string) {
  return label
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function AuthButton() {
  const { error, isConfigured, isLoading, signOutUser, user } = useFirebaseAuth();
  const [isOpen, setIsOpen] = useState(false);

  const identityLabel = useMemo(() => {
    if (!user) {
      return '';
    }

    return user.displayName || user.email || 'Cryzo user';
  }, [user]);

  if (isLoading) {
    return <span className="text-xs text-bolt-elements-textSecondary">Checking session...</span>;
  }

  if (!isConfigured) {
    return (
      <span className="rounded-full border border-bolt-elements-borderColor px-3 py-2 text-xs text-bolt-elements-textSecondary">
        Auth offline
      </span>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        {error && (
          <span className="max-w-[18rem] truncate text-xs text-bolt-elements-textSecondary" title={error}>
            {error}
          </span>
        )}
        <Button className="h-10 rounded-full px-4" onClick={() => window.location.reload()} variant="outline">
          Retry
        </Button>
        <Button className="h-10 rounded-full px-4" onClick={() => setIsOpen(true)} variant="outline">
          Sign In
        </Button>
        <AuthDialog onOpenChange={setIsOpen} open={isOpen} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-semibold text-black">
          {getInitials(identityLabel)}
        </div>
        <div className="pr-2">
          <div className="max-w-[12rem] truncate text-sm text-bolt-elements-textPrimary">{identityLabel}</div>
          <div className="max-w-[12rem] truncate text-[11px] text-bolt-elements-textSecondary">
            {user.email ?? 'Signed in'}
          </div>
        </div>
      </div>
      <Button className="h-10 rounded-full px-4" onClick={() => signOutUser().catch(console.error)} variant="outline">
        Sign Out
      </Button>
    </div>
  );
}

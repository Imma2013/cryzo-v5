import { useEffect, useState } from 'react';
import { Dialog, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { useFirebaseAuth } from '~/lib/auth/firebase-auth';
import { getFirebaseAuthErrorMessage } from '~/lib/auth/firebase-errors';

interface AuthDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function AuthDialog({ onOpenChange, open }: AuthDialogProps) {
  const { error, isConfigured, isLoading, signInWithEmail, signInWithGoogle, signUpWithEmail, user } = useFirebaseAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pendingAction, setPendingAction] = useState<'email' | 'google' | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (user && open) {
      onOpenChange(false);
    }
  }, [onOpenChange, open, user]);

  const authError = localError ?? error;
  const isPending = pendingAction !== null || isLoading;

  const handleEmailAuth = async () => {
    setPendingAction('email');
    setLocalError(null);

    try {
      if (mode === 'signup') {
        await signUpWithEmail(name, email, password);
      } else {
        await signInWithEmail(email, password);
      }
    } catch (authFailure) {
      setLocalError(getFirebaseAuthErrorMessage(authFailure));
    } finally {
      setPendingAction(null);
    }
  };

  const handleGoogleAuth = async () => {
    setPendingAction('google');
    setLocalError(null);

    try {
      await signInWithGoogle();
    } catch (authFailure) {
      setLocalError(getFirebaseAuthErrorMessage(authFailure));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <Dialog className="w-[min(92vw,30rem)]">
        <div className="space-y-5 p-6">
          <div className="space-y-1">
            <DialogTitle className="text-2xl font-semibold">Sign in to Cryzo</DialogTitle>
            <DialogDescription>
              Create an account or sign in to use Cryzo. Authentication runs on Firebase and data is synced to Convex.
            </DialogDescription>
          </div>

          {!isConfigured ? (
            <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4 text-sm text-bolt-elements-textSecondary">
              Auth is not configured yet. Add `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
              `VITE_FIREBASE_APP_ID`, and `VITE_FIREBASE_MESSAGING_SENDER_ID`, then restart the app.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-bolt-elements-borderColor p-1">
                <button
                  className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                    mode === 'signin'
                      ? 'bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary'
                      : 'text-bolt-elements-textSecondary'
                  }`}
                  onClick={() => setMode('signin')}
                  type="button"
                >
                  Sign in
                </button>
                <button
                  className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                    mode === 'signup'
                      ? 'bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary'
                      : 'text-bolt-elements-textSecondary'
                  }`}
                  onClick={() => setMode('signup')}
                  type="button"
                >
                  Create account
                </button>
              </div>

              <div className="space-y-3">
                {mode === 'signup' && (
                  <Input
                    autoComplete="name"
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Name"
                    value={name}
                  />
                )}
                <Input
                  autoComplete="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Email"
                  type="email"
                  value={email}
                />
                <Input
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  type="password"
                  value={password}
                />
              </div>

              {authError && <p className="text-sm text-red-500">{authError}</p>}

              <div className="space-y-3">
                <Button
                  className="h-11 w-full"
                  disabled={isPending}
                  onClick={handleGoogleAuth}
                  type="button"
                  variant="outline"
                >
                  {pendingAction === 'google' ? 'Working...' : 'Continue with Google'}
                </Button>
                <Button
                  className="h-11 w-full bg-white text-black hover:bg-neutral-200"
                  disabled={isPending || !email || !password || (mode === 'signup' && !name.trim())}
                  onClick={handleEmailAuth}
                  type="button"
                  variant="outline"
                >
                  {pendingAction === 'email' ? 'Working...' : mode === 'signup' ? 'Create account' : 'Sign in'}
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </DialogRoot>
  );
}

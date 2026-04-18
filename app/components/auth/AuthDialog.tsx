import { useEffect, useState } from 'react';
import { Dialog, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { useFirebaseAuth } from '~/lib/auth/firebase-auth';

interface AuthDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function AuthDialog({ onOpenChange, open }: AuthDialogProps) {
  const { error, isConfigured, signInWithEmail, signInWithGoogle, signUpWithEmail, user } = useFirebaseAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (user && open) {
      onOpenChange(false);
    }
  }, [onOpenChange, open, user]);

  const authError = localError ?? error;

  const handleEmailAuth = async () => {
    setPending(true);
    setLocalError(null);

    try {
      if (mode === 'signup') {
        await signUpWithEmail(name, email, password);
      } else {
        await signInWithEmail(email, password);
      }
    } catch (authFailure) {
      setLocalError(authFailure instanceof Error ? authFailure.message : 'Authentication failed.');
    } finally {
      setPending(false);
    }
  };

  const handleGoogleAuth = async () => {
    setPending(true);
    setLocalError(null);

    try {
      await signInWithGoogle();
    } catch (authFailure) {
      setLocalError(authFailure instanceof Error ? authFailure.message : 'Google sign-in failed.');
    } finally {
      setPending(false);
    }
  };

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <Dialog className="w-[min(92vw,30rem)]">
        <div className="p-6 space-y-5">
          <div className="space-y-1">
            <DialogTitle className="text-2xl font-semibold">Sign in to Cryzo</DialogTitle>
            <DialogDescription>
              Use Firebase Auth for user access and keep Convex ready for your app data.
            </DialogDescription>
          </div>

          {!isConfigured ? (
            <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4 text-sm text-bolt-elements-textSecondary">
              Firebase Auth is not configured yet. Add the `VITE_FIREBASE_*` keys for your Cryzo Firebase app, then
              restart the app. `VITE_CONVEX_URL` is only needed for Convex-backed user sync after sign-in.
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
                  className="h-11 w-full bg-white text-black hover:bg-neutral-200"
                  disabled={pending || !email || !password || (mode === 'signup' && !name.trim())}
                  onClick={handleEmailAuth}
                  type="button"
                  variant="outline"
                >
                  {pending ? 'Working...' : mode === 'signup' ? 'Create account' : 'Sign in'}
                </Button>

                <Button
                  className="h-11 w-full"
                  disabled={pending}
                  onClick={handleGoogleAuth}
                  type="button"
                  variant="secondary"
                >
                  Continue with Google
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </DialogRoot>
  );
}

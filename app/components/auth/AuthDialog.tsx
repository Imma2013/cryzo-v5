import { useEffect, useState } from 'react';
import { Dialog, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { useSupabaseAuth } from '~/lib/auth/supabase-auth';
import { getSupabaseAuthErrorMessage } from '~/lib/auth/supabase-errors';

interface AuthDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function AuthDialog({ onOpenChange, open }: AuthDialogProps) {
  const { error, isConfigured, isLoading, signInWithEmail, signInWithGoogle, signUpWithEmail, user } = useSupabaseAuth();
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
  const isEmailSubmitDisabled = isPending || !email || !password || (mode === 'signup' && !name.trim());

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
      setLocalError(getSupabaseAuthErrorMessage(authFailure));
    } finally {
      setPendingAction(null);
    }
  };

  const handleGoogleAuth = async () => {
    setPendingAction('google');
    setLocalError(null);

    try {
      const nextPath =
        typeof window === 'undefined' ? '/' : `${window.location.pathname}${window.location.search}${window.location.hash}`;
      await signInWithGoogle(nextPath);
    } catch (authFailure) {
      setLocalError(getSupabaseAuthErrorMessage(authFailure));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <Dialog className="w-[min(94vw,30rem)]">
        <div className="space-y-5 p-6">
          <div className="space-y-2">
            <p className="text-sm font-medium text-bolt-elements-textSecondary">Start building.</p>
            <DialogTitle className="text-3xl font-semibold leading-tight">
              {mode === 'signup' ? 'Create free account' : 'Welcome back'}
            </DialogTitle>
            <DialogDescription>
              Sign in with Google first, or use your email as a fallback. Authentication and synced data are powered by
              Supabase.
            </DialogDescription>
          </div>

          {!isConfigured ? (
            <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4 text-sm text-bolt-elements-textSecondary">
              Auth is not configured yet. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then restart the app.
            </div>
          ) : (
            <>
              <Button
                className="h-12 w-full justify-start gap-3 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background px-4 text-left text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2"
                disabled={isPending}
                onClick={handleGoogleAuth}
                type="button"
                variant="outline"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-bolt-elements-borderColor bg-white text-base font-semibold text-black">
                  G
                </span>
                <span className="text-sm font-medium">
                  {pendingAction === 'google' ? 'Redirecting to Google...' : 'Continue with Google'}
                </span>
              </Button>

              <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-bolt-elements-textSecondary">
                <span className="h-px flex-1 bg-bolt-elements-borderColor" />
                <span>Or continue with email</span>
                <span className="h-px flex-1 bg-bolt-elements-borderColor" />
              </div>

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

              <Button
                className="h-11 w-full rounded-xl bg-white text-black hover:bg-neutral-200"
                disabled={isEmailSubmitDisabled}
                onClick={handleEmailAuth}
                type="button"
                variant="outline"
              >
                {pendingAction === 'email' ? 'Working...' : mode === 'signup' ? 'Create account' : 'Sign in'}
              </Button>
            </>
          )}
        </div>
      </Dialog>
    </DialogRoot>
  );
}

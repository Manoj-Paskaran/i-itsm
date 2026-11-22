import { createFileRoute, Navigate, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { AuthProvidersResponseSchema } from '@itsm/contracts';
import { ChevronRight, LifeBuoy } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
const googleErrors: Record<string, string> = {
  google_unavailable: 'Google sign-in is unavailable. Please use your email and password.',
  google_denied: 'Google sign-in was cancelled. Try again or use your email and password.',
  google_state: 'Your Google sign-in expired or could not be confirmed. Please try again.',
  google_failed: 'Google sign-in failed. Try again or use your email and password.',
  account_inactive: 'Your account is inactive. Please contact your IT administrator.',
};
const DEMO_PASSWORD = 'demo1234';
/** The people the demo script switches between (seeded by the API's demo seed). */
const DEMO_ACCOUNTS = [
  ['priya', 'Employee'],
  ['rahul', 'Employee'],
  ['farah', 'Technician'],
  ['asha', 'Technician'],
  ['ben', 'Technician'],
  ['divya', 'Team lead'],
  ['vikram', 'IT manager'],
  ['arjun', 'Admin'],
] as const;
export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string; error?: string } => ({
    redirect:
      typeof search.redirect === 'string' &&
      search.redirect.startsWith('/') &&
      !search.redirect.startsWith('//')
        ? search.redirect
        : undefined,
    error:
      typeof search.error === 'string' &&
      (search.error.startsWith('google_') || search.error === 'account_inactive')
        ? search.error
        : undefined,
  }),
  component: Login,
});
function Login() {
  const { redirect, error: signInError } = Route.useSearch();
  const providers = useQuery({
    queryKey: ['auth', 'providers'],
    queryFn: () => apiFetch('/api/auth/providers', AuthProvidersResponseSchema),
    retry: false,
  });
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [demoTarget, setDemoTarget] = useState<string>();
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const displayError =
    error || (signInError && (googleErrors[signInError] ?? googleErrors.google_failed));
  if (auth.status === 'authenticated') return <Navigate to={demoTarget ?? (redirect || '/')} />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    try {
      if (mode === 'register') {
        if (password.length < 8) throw new Error('The password needs at least 8 characters.');
        await auth.register({
          name: name.trim(),
          email: email.trim(),
          password,
          department: department.trim(),
        });
      } else await auth.login(email.trim(), password);
      await navigate({ to: redirect || '/' });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : mode === 'register'
            ? 'Sign up failed'
            : 'Sign in failed',
      );
    } finally {
      setPending(false);
    }
  }
  /** One click signs in as a demo person, so the demo can switch people in one browser. */
  async function signInAs(name: string) {
    if (pending) return;
    const demoEmail = `${name}@itsm.demo`;
    setMode('signin');
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    setPending(true);
    setError('');
    // Demo cards always start the next person on their home screen so staff can open via notifications.
    setDemoTarget('/');
    try {
      await auth.login(demoEmail, DEMO_PASSWORD);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="grid min-h-dvh place-items-center bg-sidebar p-4">
      <div className="w-full max-w-[360px]">
        <form
          onSubmit={(e) => void submit(e)}
          aria-busy={pending}
          className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-pop"
        >
          <div className="flex items-center gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-foreground text-background">
              <LifeBuoy size={16} aria-hidden />
            </span>
            <h1 className="text-lg font-semibold">
              {mode === 'register' ? 'Create your I-ITSM account' : 'Sign in to I-ITSM'}
            </h1>
          </div>
          {mode === 'register' && (
            <>
              <label className="block text-xs font-medium">
                Full name
                <input
                  required
                  name="name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </label>
              <label className="block text-xs font-medium">
                Department
                <input
                  required
                  name="department"
                  autoComplete="organization"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </label>
            </>
          )}
          <label className="block text-xs font-medium">
            Email
            <input
              type="email"
              name="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </label>
          <label className="block text-xs font-medium">
            Password
            <input
              type="password"
              name="password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              minLength={mode === 'register' ? 8 : undefined}
              aria-describedby={mode === 'register' ? 'password-hint' : undefined}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </label>
          {mode === 'register' && (
            <p id="password-hint" className="text-xs text-muted-foreground">
              Use at least 8 characters for your password.
            </p>
          )}
          {displayError && (
            <p role="alert" className="text-xs text-critical-foreground">
              {displayError}
            </p>
          )}
          <Button className="h-10 w-full font-semibold hover:bg-primary-hover" disabled={pending}>
            {pending
              ? mode === 'register'
                ? 'Creating account…'
                : 'Signing in…'
              : mode === 'register'
                ? 'Create account'
                : 'Sign in'}
          </Button>
          {mode === 'signin' && !providers.isError && providers.data?.google && (
            <>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                <span>or</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <Button asChild variant="outline" className="h-10 w-full">
                <a href="/api/auth/google">Sign in with Google</a>
              </Button>
            </>
          )}
          <p className="text-center text-xs text-muted-foreground">
            {mode === 'register' ? 'Already have an account?' : 'New employee?'}{' '}
            <button
              type="button"
              disabled={pending}
              className="inline-flex min-h-10 items-center rounded-md px-1 font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground disabled:opacity-50"
              onClick={() => {
                setError('');
                setMode(mode === 'register' ? 'signin' : 'register');
              }}
            >
              {mode === 'register' ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        </form>
        <section aria-label="Demo accounts" className="mt-5 text-xs text-muted-foreground">
          <h2 className="font-semibold text-foreground">Try a demo account</h2>
          <p className="mt-1">
            Choose a person to sign in as them. Sign out from the sidebar to switch.
          </p>
          <p className="mt-1">
            Demo password: <span className="font-medium text-foreground">demo1234</span>
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map(([name, role]) => (
              <button
                key={name}
                type="button"
                disabled={pending}
                aria-busy={pending && email === `${name}@itsm.demo`}
                className="flex min-h-10 items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-left hover:bg-hover aria-busy:border-border-strong aria-busy:bg-muted disabled:opacity-50"
                onClick={() => void signInAs(name)}
              >
                <span>
                  <span className="block text-sm font-medium text-foreground">
                    {name.charAt(0).toUpperCase() + name.slice(1)}
                  </span>
                  <span className="block">{role}</span>
                </span>
                <ChevronRight size={14} className="shrink-0 text-muted-foreground" aria-hidden />
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

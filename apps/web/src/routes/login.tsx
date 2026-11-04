import { createFileRoute, Navigate, useNavigate } from '@tanstack/react-router';
import { LifeBuoy } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect:
      typeof search.redirect === 'string' &&
      search.redirect.startsWith('/') &&
      !search.redirect.startsWith('//')
        ? search.redirect
        : undefined,
  }),
  component: Login,
});
function Login() {
  const { redirect } = Route.useSearch();
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  if (auth.status === 'authenticated') return <Navigate to={redirect || '/'} />;
  async function submit(event: FormEvent) {
    event.preventDefault();
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
      } else await auth.login(email, password);
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
  return (
    <div className="grid min-h-screen place-items-center bg-sidebar p-4">
      <div className="w-full max-w-[360px]">
        <form
          onSubmit={(e) => void submit(e)}
          className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-pop"
        >
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md bg-foreground text-background">
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
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </label>
              <label className="block text-xs font-medium">
                Department
                <input
                  required
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </label>
            </>
          )}
          <label className="block text-xs font-medium">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </label>
          <label className="block text-xs font-medium">
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </label>
          {error && (
            <p role="alert" className="text-xs text-critical-foreground">
              {error}
            </p>
          )}
          <Button className="w-full" disabled={pending}>
            {pending
              ? mode === 'register'
                ? 'Creating account…'
                : 'Signing in…'
              : mode === 'register'
                ? 'Create account'
                : 'Sign in'}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {mode === 'register' ? 'Already have an account?' : 'New employee?'}{' '}
            <button
              type="button"
              className="font-medium text-primary"
              onClick={() => {
                setError('');
                setMode(mode === 'register' ? 'signin' : 'register');
              }}
            >
              {mode === 'register' ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        </form>
        <div className="mt-5 text-xs text-muted-foreground">
          <p className="font-medium">Demo accounts</p>
          <p>Password for every account: demo1234</p>
          <div className="mt-2 grid grid-cols-2 gap-1">
            {(
              [
                ['asha', 'Technician'],
                ['ben', 'Technician'],
                ['farah', 'Technician'],
                ['priya', 'Employee'],
                ['rahul', 'Employee'],
                ['chen', 'Team lead'],
                ['arjun', 'Admin'],
                ['kavya', 'IT manager'],
              ] as const
            ).map(([name, role]) => (
              <button
                key={name}
                className="text-left hover:text-foreground"
                onClick={() => {
                  // A demo account always signs in, even from the register form.
                  setMode('signin');
                  setError('');
                  setEmail(`${name}@itsm.demo`);
                  setPassword('demo1234');
                }}
              >
                {name.charAt(0).toUpperCase() + name.slice(1)} · {role}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

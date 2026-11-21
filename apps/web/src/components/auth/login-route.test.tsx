import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Route } from '@/routes/login';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => vi.fn(),
}));
const login = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ status: 'anonymous', login }) }));
const Login = Route.options.component!;
beforeEach(() => {
  vi.spyOn(Route, 'useSearch').mockReturnValue({});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function renderLogin() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Login />
    </QueryClientProvider>,
  );
  return client;
}
it('loginPageHidesGoogleButtonWhenUnconfigured', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ google: false }));
  vi.stubGlobal('fetch', fetch);
  const client = renderLogin();
  await waitFor(() =>
    expect(client.getQueryData(['auth', 'providers'])).toEqual({ google: false }),
  );
  expect(screen.queryByRole('link', { name: 'Sign in with Google' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
});
it('loginPageShowsGoogleButtonWhenConfigured', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ google: true }));
  vi.stubGlobal('fetch', fetch);
  renderLogin();
  const link = await screen.findByRole('link', { name: 'Sign in with Google' });
  expect(link.getAttribute('href')).toBe('/api/auth/google');
  expect(fetch).toHaveBeenCalledWith(
    '/api/auth/providers',
    expect.objectContaining({ credentials: 'include' }),
  );
});
it('loginPageHidesGoogleButtonWhenProviderRequestFails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  const client = renderLogin();
  await waitFor(() => expect(client.getQueryState(['auth', 'providers'])?.status).toBe('error'));
  expect(screen.queryByRole('link', { name: 'Sign in with Google' })).toBeNull();
});
it.each([
  'google_denied',
  'google_state',
  'google_failed',
  'google_unavailable',
  'account_inactive',
])('loginPageExplainsCallbackError_%s', (error) => {
  vi.spyOn(Route, 'useSearch').mockReturnValue({ error });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ google: false })));
  renderLogin();
  expect(screen.getByRole('alert').textContent).toMatch(/Google|account is inactive/);
  expect(screen.getByRole('alert').textContent).not.toContain(error);
});
it('demoAccountCardSignsInWithOneClick', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ google: false })));
  renderLogin();
  fireEvent.click(screen.getByRole('button', { name: /Vikram\s*IT manager/ }));
  await waitFor(() => expect(login).toHaveBeenCalledWith('vikram@itsm.demo', 'demo1234'));
});
it('demoAccountsCoverEveryDemoScriptRole', () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ google: false })));
  renderLogin();
  for (const person of ['Priya', 'Farah', 'Divya', 'Vikram', 'Arjun'])
    expect(screen.getByRole('button', { name: new RegExp(person) })).toBeTruthy();
});

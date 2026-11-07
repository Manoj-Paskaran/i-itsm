import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Route } from '@/routes/login';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ status: 'anonymous' }) }));
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

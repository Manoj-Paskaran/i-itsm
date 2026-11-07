import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './auth';
import { getAccessToken, setAccessToken } from './api';

afterEach(() => {
  cleanup();
  setAccessToken(null);
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});
function Session() {
  const auth = useAuth();
  return <p>{auth.status === 'authenticated' ? auth.user?.email : auth.status}</p>;
}
it('restoresSessionFromRefreshCookieOnFullPageLoadAtRoot', async () => {
  window.history.replaceState({}, '', '/');
  setAccessToken(null);
  const fetch = vi.fn().mockResolvedValue(
    Response.json({
      accessToken: 'restored-access-token',
      expiresIn: 3600,
      user: {
        id: '7e762841-2e65-4a04-8f40-b9fd2574692d',
        email: 'alice@example.com',
        name: 'Alice',
        role: 'EMPLOYEE',
        permissions: [],
      },
    }),
  );
  vi.stubGlobal('fetch', fetch);
  render(
    <StrictMode>
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <Session />
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
  expect(await screen.findByText('alice@example.com')).toBeTruthy();
  expect(getAccessToken()).toBe('restored-access-token');
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    '/api/auth/refresh',
    expect.objectContaining({ method: 'POST', credentials: 'include' }),
  );
});

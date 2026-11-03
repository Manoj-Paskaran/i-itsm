import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HealthCard } from './health-card';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <HealthCard />
    </QueryClientProvider>,
  );
}
it('showsOkWhenApiIsHealthy', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'ok',
          service: 'api',
          version: '1.0.0',
          uptimeSeconds: 42,
          timestamp: '2026-11-03T00:00:00Z',
        }),
    }),
  );
  renderCard();
  expect(await screen.findByText('ok')).toBeTruthy();
});
it('showsUnreachableWhenApiIsDown', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  renderCard();
  expect(await screen.findByText('unreachable')).toBeTruthy();
});

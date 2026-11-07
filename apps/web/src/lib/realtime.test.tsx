import type { ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useRealtime } from './realtime';

const socket = vi.hoisted(() => ({
  handlers: new Map<string, (payload: unknown) => void>(),
  disconnect: vi.fn(),
}));
vi.mock('socket.io-client', () => ({
  io: () => ({
    on: (event: string, handler: (payload: unknown) => void) => socket.handlers.set(event, handler),
    disconnect: socket.disconnect,
  }),
}));
vi.mock('./auth', () => ({ useAuth: () => ({ token: 'test-token' }) }));

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  socket.handlers.clear();
});
afterEach(() => {
  cleanup();
  client.clear();
});
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

it('refreshesMonitorRowsTotalsPredictionsAndGlobalAuditTogetherOnIncidentUpdate', async () => {
  let sweep = 0;
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const { result } = renderHook(
    () => {
      useRealtime();
      const rows = useQuery({
        queryKey: ['incidents', 'limit=200'],
        queryFn: () => Promise.resolve(sweep),
      });
      const totals = useQuery({
        queryKey: ['reports', 'sla'],
        queryFn: () => Promise.resolve(sweep),
      });
      const risk = useQuery({ queryKey: ['sla-risk'], queryFn: () => Promise.resolve(sweep) });
      const audit = useQuery({
        queryKey: ['audit', 'limit=200'],
        queryFn: () => Promise.resolve(sweep),
      });
      return [rows.data, totals.data, risk.data, audit.data];
    },
    { wrapper },
  );
  await waitFor(() => expect(result.current).toEqual([0, 0, 0, 0]));
  sweep = 1;
  act(() =>
    socket.handlers.get('incident.updated')!({ incidentId: 'incident-1', type: 'SlaBreached' }),
  );
  expect(invalidate.mock.calls.map(([options]) => options?.queryKey)).toEqual([
    ['incident', 'incident-1'],
    ['incident-audit', 'incident-1'],
    ['incidents'],
    ['reports'],
    ['sla-risk'],
    ['audit'],
  ]);
  await waitFor(() => expect(result.current).toEqual([1, 1, 1, 1]));
});

it.each([
  null,
  'incident-1',
  {},
  { incidentId: 1, type: 'SlaBreached' },
  { incidentId: 'incident-1' },
  { incidentId: 'incident-1', type: 1 },
])('ignoresInvalidIncidentUpdatePayload_%j', (payload) => {
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  renderHook(useRealtime, { wrapper });
  act(() => socket.handlers.get('incident.updated')!(payload));
  expect(invalidate).not.toHaveBeenCalled();
});

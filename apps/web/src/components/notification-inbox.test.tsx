import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route } from '@/routes/notifications';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigate,
}));
vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
  relativeAgo: () => 'just now',
}));
vi.mock('@/lib/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/notifications')>()),
  useNotifications: () => ({
    data: {
      unread: 3,
      items: [
        {
          id: 'notice-1',
          title: 'Your incident was assigned',
          body: 'IT is investigating.',
          createdAt: '2026-11-06T00:00:00Z',
          readAt: null,
          incident: { id: 'incident-1', number: 'INC0001' },
        },
        {
          id: 'notice-2',
          title: 'Service desk update',
          body: 'Contact IT for help.',
          createdAt: '2026-11-06T00:00:00Z',
          readAt: null,
          incident: null,
        },
        {
          id: 'notice-3',
          title: 'INC0002 escalated to It Manager',
          body: 'P1 unacknowledged for 63 s (threshold 1 min) → IT Manager',
          createdAt: '2026-11-06T00:00:00Z',
          readAt: null,
          incident: { id: 'incident-2', number: 'INC0002' },
        },
      ],
    },
  }),
}));

const Inbox = Route.options.component!;
let client: QueryClient;
beforeEach(() => {
  navigate.mockClear();
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});
function renderInbox() {
  render(
    <QueryClientProvider client={client}>
      <Inbox />
    </QueryClientProvider>,
  );
}

it('showsIncidentNumberOnceWhetherTitleIncludesItOrNot', () => {
  renderInbox();
  expect(screen.getByText('INC0001')).toBeTruthy();
  expect(screen.getByText('INC0002 escalated to IT manager')).toBeTruthy();
  expect(screen.queryByText('INC0002')).toBeNull();
});

it('humanizesEscalationLevelsInNotificationTitlesAndBodies', () => {
  renderInbox();
  expect(screen.getByText('INC0002 escalated to IT manager')).toBeTruthy();
  expect(
    screen.getByText('P1 unacknowledged for 63 s (threshold 1 min) → IT manager'),
  ).toBeTruthy();
  expect(screen.getByText('IT is investigating.')).toBeTruthy();
  expect(screen.getByText('Contact IT for help.')).toBeTruthy();
});

it('describesInboxLimitAsAMaximumRatherThanTheLoadedCount', () => {
  renderInbox();
  expect(screen.getByRole('status').textContent).toBe('3 unread. Showing up to the latest 50.');
});

it('opensIncidentWithoutWaitingForMarkReadAndKeepsItsRowEnabled', async () => {
  const fetch = vi.fn(() => new Promise<Response>(() => {}));
  vi.stubGlobal('fetch', fetch);
  renderInbox();
  const row = screen.getByRole<HTMLButtonElement>('button', { name: /Your incident was assigned/ });
  fireEvent.click(row);
  expect(navigate).toHaveBeenCalledWith({
    to: '/incidents/$incidentId',
    params: { incidentId: 'incident-1' },
  });
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(row.disabled).toBe(false);
});

it('opensIncidentEvenWhenMarkReadFails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  renderInbox();
  fireEvent.click(screen.getByRole('button', { name: /Your incident was assigned/ }));
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Could not mark notifications as read. Try again.',
  );
});

it('keepsReadFailureVisibleAndRetryableForNotificationWithoutIncident', async () => {
  const fetch = vi.fn().mockRejectedValue(new Error('offline'));
  vi.stubGlobal('fetch', fetch);
  renderInbox();
  const row = screen.getByRole<HTMLButtonElement>('button', { name: /Service desk update/ });
  fireEvent.click(row);
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(navigate).not.toHaveBeenCalled();
  expect(row.disabled).toBe(false);
  fireEvent.click(row);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
});

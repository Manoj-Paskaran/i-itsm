import type { ReactNode } from 'react';
import type { IncidentSummary, SlaRisk } from '@itsm/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Route } from '@/routes/monitor';

const state = vi.hoisted(() => ({
  risks: { data: new Map<string, SlaRisk>(), isLoading: false, isError: false, refetch: vi.fn() },
  report: {
    data: {
      met: 171,
      breached: 25,
      compliance: 0.87,
      atRiskNow: 1,
      breachedOpen: 2,
      byPriority: [],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  incidents: {
    data: [] as Partial<IncidentSummary>[],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
}));

vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<typeof import('@tanstack/react-router')>()),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  relativeAgo: () => '1h ago',
}));
vi.mock('@/lib/insights', async (original) => ({
  ...(await original<typeof import('@/lib/insights')>()),
  useSlaRisks: () => state.risks,
}));
vi.mock('@/lib/reports', () => ({ useSlaReport: () => state.report }));
vi.mock('@/lib/incidents', async (original) => ({
  ...(await original<typeof import('@/lib/incidents')>()),
  useIncidents: () => state.incidents,
}));

const incident = (overrides: Partial<IncidentSummary> = {}): Partial<IncidentSummary> => ({
  id: 'incident-1',
  number: 'INC0001',
  title: 'Payment unavailable',
  service: { id: 'svc-1', name: 'Payment Gateway' } as IncidentSummary['service'],
  status: 'IN_PROGRESS',
  priority: 'P1',
  slaStatus: 'BREACHED',
  escalationLevel: 'IT_MANAGER',
  assignee: { id: 'tech-1', name: 'Farah Khan' },
  createdAt: '2026-11-07T00:00:00Z',
  ...overrides,
});

const Monitor = Route.options.component!;
beforeEach(() => {
  state.risks.data.clear();
  state.risks.isLoading = false;
  state.risks.isError = false;
  state.report.data = {
    met: 171,
    breached: 25,
    compliance: 0.87,
    atRiskNow: 1,
    breachedOpen: 2,
    byPriority: [],
  };
  state.report.isLoading = false;
  state.report.isError = false;
  state.incidents.data = [incident()];
  state.incidents.isLoading = false;
  state.incidents.isError = false;
});
afterEach(cleanup);

it('breachedRowShowsOverdueNotRisk', () => {
  state.risks.data.set('incident-1', {
    probability: 0.34,
    level: 'LOW',
    source: 'model',
    reasons: ['34% of the resolution window used'],
  });
  render(<Monitor />);
  expect(screen.getAllByText('Overdue')).toHaveLength(2);
  expect(screen.queryByText(/Resolution risk/)).toBeNull();
  expect(screen.queryByText('Advisory')).toBeNull();
});

it('atRiskRowKeepsPredictedRiskAndAdvisoryTag', () => {
  state.incidents.data = [incident({ id: 'incident-2', slaStatus: 'AT_RISK', priority: 'P3' })];
  state.risks.data.set('incident-2', {
    probability: 0.83,
    level: 'HIGH',
    source: 'model',
    reasons: ['high estimated risk'],
  });
  render(<Monitor />);
  expect(screen.getAllByText('Resolution risk 83% · High')).toHaveLength(2);
  expect(screen.getAllByText('Advisory')).toHaveLength(2);
  expect(screen.queryByText('Overdue')).toBeNull();
});

it('distinguishesLoadingPredictionsFromUnavailableInBothMonitorLayouts', () => {
  state.incidents.data = [incident({ id: 'incident-2', slaStatus: 'AT_RISK', priority: 'P2' })];
  state.risks.isLoading = true;
  const { rerender } = render(<Monitor />);
  expect(screen.getAllByText('Loading…')).toHaveLength(2);
  expect(screen.queryByText('Unavailable')).toBeNull();
  state.risks.isLoading = false;
  rerender(<Monitor />);
  expect(screen.getAllByText('Unavailable')).toHaveLength(2);
});

it('listsOpenOnTrackP1AndP2Separately', () => {
  state.incidents.data = [
    incident({ id: 'breached-1', title: 'Repeated login attempts', slaStatus: 'BREACHED' }),
    incident({
      id: 'ontrack-p1',
      number: 'INC0215',
      title: 'Payment Gateway checkout fails',
      priority: 'P1',
      slaStatus: 'ON_TRACK',
      escalationLevel: 'TECHNICIAN',
    }),
    incident({
      id: 'paused-p2',
      number: 'INC0216',
      title: 'Billing export stalled',
      priority: 'P2',
      status: 'PENDING_INFO',
      slaStatus: 'PAUSED',
      escalationLevel: 'TECHNICIAN',
    }),
    incident({
      id: 'ontrack-p3',
      number: 'INC0217',
      title: 'Printer jam on floor 3',
      priority: 'P3',
      slaStatus: 'ON_TRACK',
      escalationLevel: 'TECHNICIAN',
    }),
    incident({
      id: 'resolved-p1',
      number: 'INC0218',
      title: 'Resolved outage',
      priority: 'P1',
      status: 'RESOLVED',
      slaStatus: 'ON_TRACK',
      escalationLevel: 'TECHNICIAN',
    }),
  ];
  render(<Monitor />);

  const watchlist = screen.getByRole('region', { name: 'SLA watchlist' });
  expect(within(watchlist).getByText('Repeated login attempts')).toBeTruthy();
  expect(within(watchlist).queryByText('Payment Gateway checkout fails')).toBeNull();
  expect(within(watchlist).queryByText('Billing export stalled')).toBeNull();

  const onTrackTable = screen.getByRole('region', { name: 'Open P1 and P2 incidents on track' });
  expect(within(onTrackTable).getByText('Payment Gateway checkout fails')).toBeTruthy();
  expect(within(onTrackTable).getByText('SLA on track')).toBeTruthy();
  expect(within(onTrackTable).getByText('Billing export stalled')).toBeTruthy();
  expect(within(onTrackTable).getByText('SLA paused')).toBeTruthy();
  expect(within(onTrackTable).queryByText('Printer jam on floor 3')).toBeNull();
  expect(within(onTrackTable).queryByText('Resolved outage')).toBeNull();

  // Phone stacked-card lists exist for both sections with matching aria-labels.
  const onTrackCards = screen.getByRole('list', { name: 'Open P1 and P2 incidents on track' });
  expect(within(onTrackCards).getByText('Payment Gateway checkout fails')).toBeTruthy();
  expect(within(onTrackCards).getByText('SLA paused')).toBeTruthy();
});

it('showsQuietEmptyLineWhenNoOpenP1OrP2OnTrack', () => {
  render(<Monitor />);
  expect(screen.getByText('No open P1 or P2 incidents on track.')).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Open P1 and P2 incidents on track' })).toBeNull();
});

it('rendersSlaTargetsMetTileWithBreachedSubline', () => {
  render(<Monitor />);
  expect(screen.getByText('SLA targets met')).toBeTruthy();
  expect(screen.getByText('171')).toBeTruthy();
  expect(screen.getByText('25 breached · all time')).toBeTruthy();
  expect(screen.queryByText('Met / breached (all time)')).toBeNull();
});

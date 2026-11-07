import type { ReactNode } from 'react';
import type { SlaRisk } from '@itsm/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Route } from '@/routes/monitor';

const risks = vi.hoisted(() => ({ data: new Map<string, SlaRisk>(), isLoading: false }));
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
  useSlaRisks: () => risks,
}));
vi.mock('@/lib/reports', () => ({ useSlaReport: () => ({ data: {} }) }));
vi.mock('@/lib/incidents', async (original) => ({
  ...(await original<typeof import('@/lib/incidents')>()),
  useIncidents: () => ({
    data: [
      {
        id: 'incident-1',
        number: 'INC0001',
        title: 'Payment unavailable',
        service: { name: 'Payment Gateway' },
        status: 'IN_PROGRESS',
        priority: 'P1',
        slaStatus: 'BREACHED',
        escalationLevel: 'IT_MANAGER',
        createdAt: '2026-11-07T00:00:00Z',
      },
    ],
  }),
}));

const Monitor = Route.options.component!;
beforeEach(() => {
  risks.data.clear();
  risks.isLoading = false;
});
afterEach(cleanup);

it('showsPassedResolutionDeadlineAsActualStateInBothMonitorLayouts', () => {
  risks.data.set('incident-1', {
    probability: 1,
    level: 'HIGH',
    source: 'rules',
    reasons: ['resolution deadline already passed'],
  });
  render(<Monitor />);
  expect(screen.getAllByText('Resolution overdue')).toHaveLength(2);
  expect(screen.queryByText(/Resolution risk 100%/)).toBeNull();
});

it('keepsForecastForResponseBreachWithoutPassedResolutionReasonEvenAtFullProbability', () => {
  risks.data.set('incident-1', {
    probability: 1,
    level: 'HIGH',
    source: 'model',
    reasons: ['high estimated risk'],
  });
  render(<Monitor />);
  expect(screen.getAllByText('Resolution risk 100% · High')).toHaveLength(2);
  expect(screen.queryByText('Resolution overdue')).toBeNull();
});

it('distinguishesLoadingPredictionsFromUnavailableInBothMonitorLayouts', () => {
  risks.isLoading = true;
  const { rerender } = render(<Monitor />);
  expect(screen.getAllByText('Loading…')).toHaveLength(2);
  expect(screen.queryByText('Unavailable')).toBeNull();
  risks.isLoading = false;
  rerender(<Monitor />);
  expect(screen.getAllByText('Unavailable')).toHaveLength(2);
});

import type { IncidentSummary } from '@itsm/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route } from '@/routes/index';

const useIncidentsMock = vi.fn<(...args: unknown[]) => unknown>();

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
  initials: (name: string) =>
    name
      .split(' ')
      .map((p) => p[0])
      .join(''),
  relativeAgo: () => 'just now',
}));
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { role: 'ADMIN', permissions: ['INCIDENT_ASSIGN'] } }),
}));
vi.mock('@/lib/use-now', () => ({ useNow: () => new Date('2026-11-04T10:00:38Z') }));
vi.mock('@/lib/incidents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/incidents')>()),
  useIncidents: () => useIncidentsMock(),
  useTechnicians: () => ({ data: [] }),
  useMyWorkload: () => ({ data: null }),
}));

const StaffHome = Route.options.component!;

const makeIncident = (overrides: Partial<IncidentSummary>): IncidentSummary => ({
  id: 'inc-1',
  number: 'INC0215',
  title: 'Payment Gateway outage',
  status: 'ASSIGNED',
  priority: 'P1',
  service: { id: 'svc-1', name: 'Payment Gateway', criticality: 4 },
  category: null,
  reporter: { id: 'priya', name: 'Priya Sharma' },
  assignee: { id: 'farah', name: 'Farah Ali' },
  createdAt: '2026-11-04T10:00:00Z',
  assignedAt: '2026-11-04T10:00:00Z',
  slaStatus: 'ON_TRACK',
  escalationLevel: 'TECHNICIAN',
  ...overrides,
});

beforeEach(() => {
  useIncidentsMock.mockReturnValue({
    data: [
      makeIncident({
        id: 'inc-tl',
        number: 'INC0215',
        title: 'Team lead escalation',
        status: 'ASSIGNED',
        assignedAt: '2026-11-04T10:00:00Z',
        escalationLevel: 'TEAM_LEAD',
      }),
      makeIncident({
        id: 'inc-sa',
        number: 'INC0216',
        title: 'Sys admin escalation',
        status: 'IN_PROGRESS',
        assignedAt: '2026-11-04T09:59:00Z',
        escalationLevel: 'SYS_ADMIN',
      }),
      makeIncident({
        id: 'inc-im',
        number: 'INC0217',
        title: 'IT manager escalation',
        status: 'ASSIGNED',
        assignedAt: null,
        escalationLevel: 'IT_MANAGER',
      }),
      makeIncident({
        id: 'inc-closed',
        number: 'INC0218',
        title: 'Closed escalated incident',
        status: 'CLOSED',
        escalationLevel: 'IT_MANAGER',
      }),
    ],
    isLoading: false,
    isError: false,
    isPlaceholderData: false,
  });
});

afterEach(cleanup);

describe('staff incidents queue', () => {
  it('showsUnacknowledgedTimerOnlyForAssignedRowsWithAssignedAtAndProgressiveEscalationChips', () => {
    render(<StaffHome />);

    expect(screen.getByText(/Not acknowledged · 0:38/)).toBeTruthy();
    expect(screen.getAllByText(/Not acknowledged/)).toHaveLength(1);

    const tl = screen.getByText('Escalated · Team lead');
    expect(tl.className).toContain('bg-high-subtle');
    expect(tl.className).not.toContain('ring-high');

    const sa = screen.getByText('Escalated · System admin');
    expect(sa.className).toContain('ring-1');
    expect(sa.className).toContain('ring-inset');
    expect(sa.className).toContain('ring-high');

    const im = screen.getByText('Escalated · IT manager');
    expect(im.className).toContain('bg-critical-subtle');
    expect(im.className).toContain('text-critical-foreground');
  });

  it('hidesEscalationChipOnClosedRows', () => {
    render(<StaffHome />);
    fireEvent.click(screen.getByRole('tab', { name: /Closed/ }));
    expect(screen.getByText('Closed escalated incident')).toBeTruthy();
    expect(screen.queryByText(/Escalated ·/)).toBeNull();
  });
});

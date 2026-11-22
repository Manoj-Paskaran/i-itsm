import type { IncidentDetail } from '@itsm/contracts';
import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LifecycleRail } from './lifecycle-rail';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
  }: {
    to: string;
    params?: { incidentId?: string };
    children: ReactNode;
  }) => (
    <a href={params?.incidentId ? to.replace('$incidentId', params.incidentId) : to}>{children}</a>
  ),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'f' } }) }));
vi.mock('@/lib/use-now', () => ({ useNow: () => new Date('2026-11-04T10:30:00Z') }));

afterEach(cleanup);
const detail = {
  status: 'ASSIGNED',
  slaStatus: 'AT_RISK',
  createdAt: '2026-11-04T10:00:00Z',
  slaDeadlines: { response: '2026-11-04T10:30:30Z', resolution: '2026-11-04T10:45:00Z' },
  assignee: { id: 'f', name: 'Farah Ali' },
  reporter: { id: 'p', name: 'Priya Sharma' },
  closure: null,
} as IncidentDetail;

it('emphasizesUrgentAndMutedCountdownsWithoutOverridingSemanticColor', () => {
  render(<LifecycleRail detail={detail} audit={[]} />);
  const urgent = screen.getByText('in <1m');
  const remaining = screen.getByText('in 15m');
  expect(urgent.classList.contains('font-medium')).toBe(true);
  expect(urgent.classList.contains('text-foreground')).toBe(false);
  expect(urgent.parentElement?.classList.contains('text-warning-foreground')).toBe(true);
  expect(remaining.classList.contains('font-medium')).toBe(true);
  expect(remaining.classList.contains('text-foreground')).toBe(true);
});

it('keepsPausedSlaCopyQuiet', () => {
  render(<LifecycleRail detail={{ ...detail, status: 'PENDING_INFO' }} audit={[]} />);
  const paused = screen.getByText('Clock paused');
  const remaining = screen.getByText('15m left when resumed');
  expect(paused.parentElement?.classList.contains('text-muted-foreground')).toBe(true);
  expect(remaining.classList.contains('font-medium')).toBe(false);
  expect(remaining.classList.contains('text-foreground')).toBe(false);
});

it('showsYourTurnWhenTheSignedInViewerIsTheAssignee', () => {
  render(<LifecycleRail detail={detail} audit={[]} />);
  expect(screen.getByText('your turn')).toBeTruthy();
  expect(screen.queryByText(/waiting for\s+Farah/)).toBeNull();
});

it('keepsEarlyMarginQuietInsideMetSlaNote', () => {
  render(
    <LifecycleRail
      detail={{ ...detail, status: 'IN_PROGRESS', slaStatus: 'ON_TRACK' }}
      audit={[
        {
          at: '2026-11-04T10:26:00Z',
          fromStatus: 'ASSIGNED',
          toStatus: 'ACKNOWLEDGED',
        },
      ]}
    />,
  );
  const met = screen.getByText('Response met');
  const margin = screen.getByText('4m early');
  expect(met.parentElement?.classList.contains('text-success-foreground')).toBe(true);
  expect(margin.classList.contains('font-medium')).toBe(false);
});

it('keepsOverdueCountdownEmphasizedAndRedWhilePaused', () => {
  render(
    <LifecycleRail
      detail={{
        ...detail,
        status: 'PENDING_INFO',
        slaDeadlines: { ...detail.slaDeadlines!, resolution: '2026-11-04T10:25:00Z' },
      }}
      audit={[]}
    />,
  );
  const overdue = screen.getByText('5m overdue');
  expect(overdue.classList.contains('font-medium')).toBe(true);
  expect(overdue.classList.contains('text-foreground')).toBe(false);
  expect(overdue.parentElement?.classList.contains('text-critical-foreground')).toBe(true);
});

it('linksToTheOriginalIncidentUnderClosedForADuplicate', () => {
  render(
    <LifecycleRail
      detail={{
        ...detail,
        status: 'CLOSED',
        closure: {
          reason: 'DUPLICATE',
          closedBy: null,
          at: '2026-11-04T10:15:00Z',
          duplicateOf: { id: 'orig-1', number: 'INC0216' },
        },
      }}
      audit={[
        {
          at: '2026-11-04T10:15:00Z',
          fromStatus: 'ASSIGNED',
          toStatus: 'CLOSED',
        },
      ]}
    />,
  );
  const link = screen.getByRole('link', { name: 'INC0216' });
  expect(link.getAttribute('href')).toBe('/incidents/orig-1');
  expect(link.closest('div')?.textContent).toBe('Duplicate of INC0216');
});

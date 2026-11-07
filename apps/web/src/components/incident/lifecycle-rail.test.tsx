import type { IncidentDetail } from '@itsm/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LifecycleRail } from './lifecycle-rail';

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
  const paused = screen.getByText('paused');
  expect(paused.classList.contains('font-medium')).toBe(false);
  expect(paused.classList.contains('text-foreground')).toBe(false);
  expect(paused.parentElement?.classList.contains('text-muted-foreground')).toBe(true);
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

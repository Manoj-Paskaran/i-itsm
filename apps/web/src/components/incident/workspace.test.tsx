import type { IncidentDetail } from '@itsm/contracts';
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SlaPill, StatusPill } from './chips';
import { IncidentWorkspace } from './workspace';

const state = vi.hoisted(() => ({
  user: { id: 'p', name: 'Priya Sharma', role: 'EMPLOYEE', permissions: [] as string[] },
  detail: null as IncidentDetail | null,
  audit: [] as Array<{
    at: string;
    actor: { id: string; name: string } | null;
    action: string;
    fromStatus: IncidentDetail['status'] | null;
    toStatus: IncidentDetail['status'] | null;
    description: string;
  }>,
  mutate: vi.fn(),
}));

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
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/lib/use-now', () => ({ useNow: () => new Date('2026-11-21T16:00:00Z') }));
vi.mock('@/lib/insights', () => ({ useWorkspaceInsights: () => null }));
vi.mock('./context-panel', () => ({
  ContextPanel: () => <aside aria-label="Incident context" />,
  formatDate: (iso: string) => iso,
}));
vi.mock('@/lib/incidents', async (original) => ({
  ...(await original<typeof import('@/lib/incidents')>()),
  useIncident: () => ({
    isLoading: false,
    isError: false,
    data: state.detail,
    refetch: vi.fn(),
  }),
  useIncidentAudit: () => ({
    isLoading: false,
    isError: false,
    data: state.audit,
    refetch: vi.fn(),
  }),
  useIncidentAction: () => ({
    isPending: false,
    isError: false,
    error: null,
    variables: undefined,
    reset: vi.fn(),
    mutate: state.mutate,
  }),
}));

const baseDetail: IncidentDetail = {
  id: '01900000-0000-7000-8000-000000000001',
  number: 'INC0215',
  title: 'Payment Gateway declines every card at checkout',
  description: 'Payment Gateway checkout rejects every card with PG-503.',
  status: 'RESOLVED',
  priority: 'P1',
  impact: 4,
  urgency: 4,
  affectedUsers: 5000,
  service: { id: '01900000-0000-7000-8000-000000000010', name: 'Payment Gateway', criticality: 4 },
  category: {
    id: '01900000-0000-7000-8000-000000000020',
    code: 'APPLICATION',
    name: 'Application',
  },
  reporter: { id: 'p', name: 'Priya Sharma' },
  assignee: { id: 'f', name: 'Farah Ali' },
  createdAt: '2026-11-21T15:56:00Z',
  assignedAt: '2026-11-21T15:56:00Z',
  slaStatus: 'MET',
  slaDeadlines: { response: '2026-11-21T16:01:00Z', resolution: '2026-11-21T16:16:00Z' },
  escalationLevel: 'TECHNICIAN',
  priorityRationale: [],
  notes: [],
  infoRequests: [],
  resolution: {
    summary: 'Restarted gateway connector.',
    rootCause: null,
    resolvedBy: { id: 'f', name: 'Farah Ali' },
    at: '2026-11-21T15:58:00Z',
  },
  feedback: null,
  closure: null,
  reopenCount: 0,
  allowedActions: ['verify', 'reject'],
  assignmentReasons: [],
};

beforeEach(() => {
  state.user = { id: 'p', name: 'Priya Sharma', role: 'EMPLOYEE', permissions: [] };
  state.detail = baseDetail;
  state.audit = [
    {
      at: '2026-11-21T15:56:00Z',
      actor: { id: 'p', name: 'Priya Sharma' },
      action: 'IncidentCreated',
      fromStatus: null,
      toStatus: 'NEW',
      description: 'Incident INC0215 reported.',
    },
  ];
  state.mutate.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('rendersSlaPausedPillWithWarningTokens', () => {
  render(<SlaPill status="PAUSED" />);
  const pill = screen.getByText('SLA paused');
  expect(pill.className).toContain('bg-warning-subtle');
  expect(pill.className).toContain('text-warning-foreground');
  expect(pill.className).not.toContain('bg-fill-done');
});

it('rendersResolvedStatusWithPositiveToneDistinctFromVerified', () => {
  const { rerender } = render(<StatusPill status="RESOLVED" />);
  const resolved = screen.getByText('Resolved');
  expect(resolved.className).toContain('bg-fill-success');
  expect(resolved.className).not.toContain('bg-fill-waiting');

  rerender(<StatusPill status="VERIFIED" />);
  const verified = screen.getByText('Verified');
  expect(verified.className).toContain('bg-fill-done');
  expect(verified.className).not.toContain('bg-fill-success');
});

it('demotesCloseIncidentWhileFeedbackIsPendingAndRestoresAfterFeedback', () => {
  state.detail = {
    ...baseDetail,
    status: 'VERIFIED',
    allowedActions: ['close', 'giveFeedback'],
    feedback: null,
  };
  const { rerender } = render(<IncidentWorkspace incidentId={baseDetail.id} />);
  const closeWhilePending = screen.getByRole('button', { name: 'Close incident' });
  expect(closeWhilePending.className).toContain('border-border');
  expect(closeWhilePending.className).not.toContain('bg-primary');
  const sendFeedback = screen.getByRole('button', { name: 'Send feedback' });
  expect(sendFeedback.className).toContain('bg-primary');

  state.detail = {
    ...baseDetail,
    status: 'VERIFIED',
    allowedActions: ['close'],
    feedback: { rating: 4, comment: 'Fixed fast', at: '2026-11-21T16:00:00Z' },
  };
  rerender(<IncidentWorkspace incidentId={baseDetail.id} />);
  const closeAfterFeedback = screen.getByRole('button', { name: 'Close incident' });
  expect(closeAfterFeedback.className).toContain('bg-primary');
});

it('scrollsFeedbackIntoViewAndFocusesFirstStarAfterConfirmFixSucceeds', () => {
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  let verifyOnSuccess: (() => void) | undefined;
  state.mutate.mockImplementation((_vars: unknown, options?: { onSuccess?: () => void }) => {
    verifyOnSuccess = options?.onSuccess;
  });

  const { rerender } = render(<IncidentWorkspace incidentId={baseDetail.id} />);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm fix' }));
  expect(state.mutate).toHaveBeenCalledWith({ action: 'verify' }, expect.any(Object));

  state.detail = {
    ...baseDetail,
    status: 'VERIFIED',
    allowedActions: ['close', 'giveFeedback'],
    feedback: null,
  };
  act(() => {
    verifyOnSuccess?.();
  });
  rerender(<IncidentWorkspace incidentId={baseDetail.id} />);

  const firstStar = screen.getByRole('radio', { name: '1 out of 5' });
  expect(document.activeElement).toBe(firstStar);
  expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
});

it('showsLiveCueOnlyForExternalUpdatesAndClearsAfterTimeout', async () => {
  vi.useFakeTimers();
  state.user = { id: 'f', name: 'Farah Ali', role: 'TECHNICIAN', permissions: [] };
  state.detail = { ...baseDetail, status: 'PENDING_INFO', allowedActions: ['addNote'] };
  const { rerender } = render(<IncidentWorkspace incidentId={baseDetail.id} />);
  expect(screen.getByRole('status').textContent).toBe('');

  // Viewer's own audit event must not trigger the live cue.
  state.audit = [
    ...state.audit,
    {
      at: '2026-11-21T15:57:00Z',
      actor: { id: 'f', name: 'Farah Ali' },
      action: 'InfoRequested',
      fromStatus: 'IN_PROGRESS',
      toStatus: 'PENDING_INFO',
      description: 'Information requested.',
    },
  ];
  rerender(<IncidentWorkspace incidentId={baseDetail.id} />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.getByRole('status').textContent).toBe('');

  // Reporter's answer arriving via polling/socket shows a polite cue and highlights the activity item.
  state.detail = { ...baseDetail, status: 'IN_PROGRESS', allowedActions: ['resolve'] };
  state.audit = [
    ...state.audit,
    {
      at: '2026-11-21T15:58:00Z',
      actor: { id: 'p', name: 'Priya Sharma' },
      action: 'InfoProvided',
      fromStatus: 'PENDING_INFO',
      toStatus: 'IN_PROGRESS',
      description: 'Information provided: Every checkout shows PG-503.',
    },
  ];
  rerender(<IncidentWorkspace incidentId={baseDetail.id} />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.getByRole('status').textContent).toContain('Priya answered your question');
  const newestItem = screen.getByText(/Information provided/).closest('li')!;
  expect(newestItem.className).toContain('bg-primary-subtle');

  act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(newestItem.className).not.toContain('bg-primary-subtle');
  expect(screen.getByRole('status').textContent).toContain('Priya answered your question');

  act(() => {
    vi.advanceTimersByTime(2500);
  });
  expect(screen.getByRole('status').textContent).toBe('');
});

it('hidesSlaAndEscalationChipsAndLinksOriginalOnClosedDuplicate', () => {
  state.detail = {
    ...baseDetail,
    status: 'CLOSED',
    slaStatus: 'BREACHED',
    escalationLevel: 'IT_MANAGER',
    resolution: null,
    allowedActions: [],
    closure: {
      reason: 'DUPLICATE',
      closedBy: { id: 'a', name: 'Arjun Mehta' },
      at: '2026-11-21T15:59:00Z',
      duplicateOf: { id: 'orig-1', number: 'INC0216' },
    },
  };
  state.audit = [
    ...state.audit,
    {
      at: '2026-11-21T15:59:00Z',
      actor: { id: 'a', name: 'Arjun Mehta' },
      action: 'IncidentClosed',
      fromStatus: 'ASSIGNED',
      toStatus: 'CLOSED',
      description: 'Incident INC0215 closed: DUPLICATE of INC0216.',
    },
  ];
  render(<IncidentWorkspace incidentId={baseDetail.id} />);
  expect(screen.queryByText(/Escalated to/)).toBeNull();
  expect(screen.queryByText(/SLA breached/)).toBeNull();
  const links = screen.getAllByRole('link', { name: 'INC0216' });
  expect(links).toHaveLength(2);
  for (const link of links) expect(link.getAttribute('href')).toBe('/incidents/orig-1');
});

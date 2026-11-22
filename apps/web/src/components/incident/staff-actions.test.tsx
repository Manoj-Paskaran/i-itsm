import type { IncidentDetail, IncidentInsights, IncidentSummary } from '@itsm/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextPanel } from './context-panel';
import { RelatedPanel } from './insights-panel';
import {
  assignButtonLabel,
  AssignPanel,
  DuplicatePanel,
  formatAssignmentReasons,
  resolveDuplicateTarget,
  scrollPageToTop,
} from './staff-actions';

const mutateSpy = vi.fn();
const mutateAsyncSpy = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const useRecommendationsMock = vi.fn<(...args: unknown[]) => unknown>();
const useIncidentsMock = vi.fn<(...args: unknown[]) => unknown>();
const useWorkspaceInsightsMock = vi.fn<(...args: unknown[]) => unknown>();
const useAuthMock = vi.fn<(...args: unknown[]) => unknown>();

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => useAuthMock() }));
vi.mock('@/lib/use-now', () => ({ useNow: () => new Date('2026-11-04T10:05:00Z') }));
vi.mock('@/lib/insights', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/insights')>()),
  useWorkspaceInsights: () => useWorkspaceInsightsMock(),
}));
vi.mock('@/lib/incidents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/incidents')>()),
  useRecommendations: (...args: unknown[]) => useRecommendationsMock(...args),
  useIncidents: (...args: unknown[]) => useIncidentsMock(...args),
  useIncidentAction: () => ({
    mutate: mutateSpy,
    mutateAsync: mutateAsyncSpy,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

const service = { id: 'svc-1', name: 'Payment Gateway', criticality: 4 };
const baseDetail = {
  id: 'inc-2',
  number: 'INC0216',
  title: 'Checkout shows payment error',
  status: 'ASSIGNED',
  priority: 'P1',
  service,
  category: { id: 'cat-1', name: 'Application', code: 'APPLICATION' },
  reporter: { id: 'priya', name: 'Priya Sharma' },
  assignee: { id: 'farah', name: 'Farah Ali' },
  createdAt: '2026-11-04T10:00:00Z',
  assignedAt: '2026-11-04T10:00:00Z',
  slaStatus: 'ON_TRACK',
  escalationLevel: 'IT_MANAGER',
  description: 'Checkout fails.',
  impact: 4,
  urgency: 4,
  affectedUsers: 5000,
  slaDeadlines: { response: '2026-11-04T10:15:00Z', resolution: '2026-11-04T10:30:00Z' },
  priorityRationale: [],
  notes: [],
  infoRequests: [],
  resolution: null,
  feedback: null,
  closure: null,
  reopenCount: 0,
  allowedActions: ['assign', 'closeAsDuplicate'],
  assignmentReasons: [
    'has application skill · 1/5 active incidents',
    'resolved 0 incidents on this service',
    '4 years experience',
  ],
} as IncidentDetail;

const originalCandidate = {
  id: 'inc-1',
  number: 'INC0215',
  title: 'Payment Gateway checkout outage',
  status: 'ASSIGNED',
  priority: 'P1',
  service,
  category: null,
  reporter: { id: 'priya', name: 'Priya Sharma' },
  assignee: { id: 'farah', name: 'Farah Ali' },
  createdAt: '2026-11-04T09:58:00Z',
  assignedAt: '2026-11-04T09:58:00Z',
  slaStatus: 'ON_TRACK',
  escalationLevel: 'TEAM_LEAD',
} as IncidentSummary;

const otherCandidate = {
  ...originalCandidate,
  id: 'inc-0',
  number: 'INC0210',
  title: 'Earlier gateway alert',
  createdAt: '2026-11-04T09:00:00Z',
};

const sampleInsights: IncidentInsights = {
  similar: [
    {
      incident: originalCandidate,
      score: 0.65,
      reasons: ['same service', 'shares: payment'],
      source: 'rules',
    },
  ],
  cluster: null,
  suggestedResolutions: [
    {
      incident: { id: 'inc-res', number: 'INC0193', title: 'Old outage' },
      summary: 'Restored the database connection pool.',
      rootCause: 'Connection pool exhaustion',
      score: 0.48,
    },
  ],
  source: 'rules',
  slaRisk: {
    probability: 0.3,
    level: 'LOW',
    reasons: ['5% of the resolution window used'],
    source: 'rules',
  },
};

beforeEach(() => {
  mutateSpy.mockReset();
  mutateAsyncSpy.mockReset();
  mutateAsyncSpy.mockResolvedValue({});
  useAuthMock.mockReturnValue({ user: { id: 'divya', name: 'Divya Nair' } });
  useRecommendationsMock.mockReturnValue({ data: [], isLoading: false, isError: false });
  useIncidentsMock.mockReturnValue({
    data: [otherCandidate, originalCandidate],
    isLoading: false,
    isError: false,
  });
  useWorkspaceInsightsMock.mockReturnValue(sampleInsights);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('staff actions pure helpers', () => {
  it('splitsCompoundAssignmentReasonsFormatsThemAndDropsMissingSkills', () => {
    expect(
      formatAssignmentReasons([
        'has application skill · 1/5 active incidents · resolved 0 incidents on this service',
        'lacks network skill',
        '4 years experience',
      ]),
    ).toEqual(['Has the Application skill', 'Handling 1 of 5 incidents', '4 years experience']);
  });

  it('capitalisesManualReassignmentReasonsAutomatically', () => {
    expect(
      formatAssignmentReasons([
        'chosen by Divya Nair from the advisory suggestions',
        'has application skill · 2/5 active incidents',
      ]),
    ).toEqual([
      'Chosen by Divya Nair from the advisory suggestions',
      'Has the Application skill',
      'Handling 2 of 5 incidents',
    ]);
  });

  it('labelsAssignButtonsForCurrentSelfAndOtherTechnicians', () => {
    expect(assignButtonLabel('Farah Ali', true, false)).toBe('Current assignee');
    expect(assignButtonLabel('Divya Nair', true, true)).toBe('Current assignee');
    expect(assignButtonLabel('Divya Nair', false, true)).toBe('Assign to yourself');
    expect(assignButtonLabel('Asha Patel', false, false)).toBe('Assign to Asha');
  });

  it('preselectsTopSimilarIncidentOnlyWhenAmongCandidates', () => {
    expect(resolveDuplicateTarget(null, 'inc-1', ['inc-0', 'inc-1'])).toBe('inc-1');
    expect(resolveDuplicateTarget(null, 'inc-missing', ['inc-0', 'inc-1'])).toBe('');
    expect(resolveDuplicateTarget('inc-0', 'inc-1', ['inc-0', 'inc-1'])).toBe('inc-0');
    expect(resolveDuplicateTarget('', 'inc-1', ['inc-0', 'inc-1'])).toBe('');
  });

  it('scrollsMainContainerToTopWhenPresent', () => {
    const main = document.createElement('main');
    const scrollTo = vi.fn();
    main.scrollTo = scrollTo;
    scrollPageToTop(main);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });
});

describe('AssignPanel', () => {
  it('rendersFormattedReasonChecklistMarksViewerAndCurrentAssigneeAndScrollsIntoView', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    useRecommendationsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        {
          technician: { id: 'farah', name: 'Farah Ali' },
          score: 0.66,
          reasons: ['has application skill · 1/5 active incidents', '4 years experience'],
          strategy: 'composite',
        },
        {
          technician: { id: 'divya', name: 'Divya Nair' },
          score: 0.61,
          reasons: ['has application skill', '0/5 active incidents'],
          strategy: 'composite',
        },
        {
          technician: { id: 'asha', name: 'Asha Patel' },
          score: 0.58,
          reasons: ['2/5 active incidents'],
          strategy: 'composite',
        },
      ],
    });

    render(<AssignPanel detail={baseDetail} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reassign' }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
    expect(screen.getByText('Suggestions · advisory')).toBeTruthy();
    expect(screen.getByText('match 66%')).toBeTruthy();
    expect(screen.getAllByText('Has the Application skill')).toHaveLength(2);
    expect(screen.getByText('Handling 1 of 5 incidents')).toBeTruthy();
    expect(screen.getByText('(you)')).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Current assignee' }).disabled,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Assign to yourself' }).disabled,
    ).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Assign to Asha' }).disabled).toBe(
      false,
    );
  });
});

describe('DuplicatePanel, RelatedPanel, and ContextPanel', () => {
  it('preselectsTopRelatedIncidentAllowsChangingAndScrollsMainToTopOnSuccess', async () => {
    const scrollTo = vi.fn();

    const { container } = render(
      <main>
        <DuplicatePanel detail={baseDetail} suggestedDuplicateId="inc-1" />
      </main>,
    );
    container.querySelector('main')!.scrollTo = scrollTo;

    fireEvent.click(screen.getByRole('button', { name: 'Close as duplicate…' }));
    const select = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Duplicate of' });
    expect(select.value).toBe('inc-1');

    fireEvent.change(select, { target: { value: 'inc-0' } });
    expect(select.value).toBe('inc-0');

    fireEvent.click(screen.getByRole('button', { name: 'Close as duplicate' }));
    expect(mutateAsyncSpy).toHaveBeenCalledWith({
      action: 'closeAsDuplicate',
      duplicateOfId: 'inc-0',
    });
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 0 }));
  });

  it('scrollsMainToTopAfterClosingFromPossiblyRelated', async () => {
    const scrollTo = vi.fn();

    const { container } = render(
      <main>
        <RelatedPanel detail={baseDetail} insights={sampleInsights} />
      </main>,
    );
    container.querySelector('main')!.scrollTo = scrollTo;

    fireEvent.click(screen.getByRole('button', { name: 'Close as duplicate of INC0215' }));
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 0 }));
  });

  it('ordersContextSectionsAndFormatsWhyAssigneeReasons', () => {
    render(<ContextPanel detail={baseDetail} />);
    const aside = screen.getByRole('complementary', { name: 'Incident context' });
    const headings = within(aside)
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent);
    expect(headings).toEqual([
      'Priority',
      'Assignee',
      'Possibly related',
      'Duplicates',
      'Breach forecast',
      'Suggested resolutions',
      'Details',
    ]);
    expect(screen.getByText('Why Farah')).toBeTruthy();
    expect(screen.getByText('Has the Application skill')).toBeTruthy();
    expect(screen.getByText('Handling 1 of 5 incidents')).toBeTruthy();
    expect(screen.getByText('4 years experience')).toBeTruthy();
  });
});

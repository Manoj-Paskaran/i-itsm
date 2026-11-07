import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Route } from '@/routes/audit';

const audit = vi.hoisted(() => ({ count: 1, isPlaceholderData: false }));
const navigation = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-query', () => ({ useQueries: () => [] }));
vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<typeof import('@tanstack/react-router')>()),
  useSearch: () => ({}),
  useNavigate: () => navigation,
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  initials: (name: string) => name.slice(0, 2),
}));
vi.mock('@/lib/admin', async (original) => ({
  ...(await original<typeof import('@/lib/admin')>()),
  useAudit: () => ({
    isPlaceholderData: audit.isPlaceholderData,
    data: Array.from({ length: audit.count }, () => ({
      at: '2026-11-07T00:00:00Z',
      action: 'SlaWarningRaised',
      description: 'SLA warning raised for Incident 01a1b42a-e701-7595-b06b-ab31fbab6d2c',
      incident: { id: '01a1b42a-e701-7595-b06b-ab31fbab6d2c', number: 'INC0001' },
      actor: null,
    })),
  }),
}));
vi.mock('@/lib/incidents', async (original) => ({
  ...(await original<typeof import('@/lib/incidents')>()),
  useIncidents: () => ({ data: [] }),
  useTechnicians: () => ({ data: [] }),
  useServices: () => ({ data: [] }),
  useCategories: () => ({ data: [] }),
}));

const Audit = Route.options.component!;
beforeEach(() => {
  audit.count = 1;
  audit.isPlaceholderData = false;
});
afterEach(cleanup);

it.each([0, 37, 200])('describesLoadedAuditCountWithoutRepeatingTheLimit_%i', (count) => {
  audit.count = count;
  render(<Audit />);
  expect(screen.getByRole('status').textContent).toBe(
    `${count} ${count === 1 ? 'match' : 'matches'} · ${count >= 200 ? 'filtering the latest 200 entries' : `${count} entries loaded`}`,
  );
});

it('keepsUpdatingMessageWhileAuditFiltersShowPlaceholderData', () => {
  audit.isPlaceholderData = true;
  render(<Audit />);
  expect(screen.getByRole('status').textContent).toBe('Updating entries…');
});

it('showsOneSemanticLedgerWithTimeActorCategoryAndNarrative', () => {
  render(<Audit />);
  const ledger = within(screen.getByRole('list', { name: /^Audit entries:/ }));
  expect(ledger.getByText('INC0001')).toBeTruthy();
  expect(ledger.getByText('SLA warning raised', { selector: 'p' })).toBeTruthy();
  expect(ledger.getByText('System')).toBeTruthy();
  expect(ledger.getByText('SLA warning', { selector: '.sr-only' })).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
});

it('collapsesMatchingSystemEventsAndRevealsEveryIncidentOnExpansion', () => {
  audit.count = 3;
  render(<Audit />);
  const summary = screen.getByText('3 events ·', { exact: false }).closest('summary')!;
  expect(summary).toBeTruthy();
  fireEvent.click(summary);
  expect(summary.parentElement?.hasAttribute('open')).toBe(true);
  expect(screen.getAllByRole('button', { name: 'Filter to incident INC0001' })).toHaveLength(3);
});

it('clickingAnIncidentCreatesAShareableSearchFilter', () => {
  render(<Audit />);
  fireEvent.click(screen.getByRole('button', { name: 'Filter to incident INC0001' }));
  const call = navigation.mock.calls.at(-1)![0] as {
    to: string;
    search: (previous: object) => object;
  };
  expect(call.to).toBe('/audit');
  expect(call.search({ q: 'risk' })).toEqual({
    q: 'risk',
    incidentId: '01a1b42a-e701-7595-b06b-ab31fbab6d2c',
  });
});

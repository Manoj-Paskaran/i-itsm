import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Route } from '@/routes/reports';
vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/lib/reports', () => ({
  useOverview: () => ({ data: { total: 15 } }),
  useTrends: () => ({ data: { days: [] } }),
  useSlaReport: () => ({ data: { compliance: null, byPriority: [] } }),
  useWorkload: () => ({ data: [] }),
  useServiceReport: () => ({
    data: [
      { service: { id: 'a', name: 'Email' }, total: 5, open: 0, slaViolations: 2 },
      { service: { id: 'b', name: 'Payments' }, total: 10, open: 3, slaViolations: 4 },
    ],
  }),
}));
afterEach(cleanup);
const Reports = Route.options.component!;
it('defaultsServicesToASortedChartWithAllCountsDirectlyReadable', () => {
  render(<Reports />);
  const chart = within(screen.getByRole('list', { name: 'Service incident counts' }));
  expect(chart.getAllByRole('listitem')[0]!.textContent).toContain('Payments');
  expect(chart.getByText('3 not closed · 4 SLA violations')).toBeTruthy();
  expect(chart.getByText('0 not closed · 2 SLA violations')).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
});
it('makesTheSameServiceNumbersAvailableInOneClickAsATable', () => {
  render(<Reports />);
  const card = screen.getByRole('heading', { name: 'Incidents by service' }).closest('section')!;
  fireEvent.click(within(card).getByRole('button', { name: 'Show table' }));
  const table = within(within(card).getByRole('table'));
  expect(table.getAllByRole('row')[1]!.textContent).toBe('Payments1034');
  fireEvent.click(within(card).getByRole('button', { name: 'Show chart' }));
  expect(within(card).getByRole('list', { name: 'Service incident counts' })).toBeTruthy();
});

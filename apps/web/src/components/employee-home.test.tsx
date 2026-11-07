import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Route } from '@/routes/index';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { role: 'EMPLOYEE' } }) }));
vi.mock('@/lib/incidents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/incidents')>()),
  useIncidents: () => ({ data: [], isLoading: false, isError: false }),
}));

afterEach(cleanup);
const EmployeeHome = Route.options.component!;

it('countsNonDefaultSortTogetherWithEmployeeFilters', () => {
  render(<EmployeeHome />);
  expect(screen.queryByRole('combobox', { name: 'Sort incidents' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Sort incidents' }), {
    target: { value: 'oldest' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Priority' }), {
    target: { value: 'P1' },
  });
  expect(screen.getByRole('button', { name: 'Filters 2' })).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox', { name: 'Sort incidents' }), {
    target: { value: 'newest' },
  });
  expect(screen.getByRole('button', { name: 'Filters 1' })).toBeTruthy();
});

it('clearsEmployeeSortBackToNewestWithOtherFilters', () => {
  render(<EmployeeHome />);
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  const sort = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Sort incidents' });
  fireEvent.change(sort, { target: { value: 'priority' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
    target: { value: 'ASSIGNED' },
  });
  fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!);
  expect(sort.value).toBe('newest');
  expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Status' }).value).toBe('');
  expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
});

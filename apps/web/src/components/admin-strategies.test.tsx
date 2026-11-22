import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strategySavedMessage } from '@/lib/admin';
import { Route } from '@/routes/admin';

const mutateSpy = vi.fn();
const useAdminWriteMock = vi.fn<(...args: unknown[]) => unknown>();
const useStrategiesMock = vi.fn<(...args: unknown[]) => unknown>();

vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'arjun', role: 'ADMIN' } }) }));
vi.mock('@/lib/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin')>()),
  useStrategies: () => useStrategiesMock(),
  useAdminWrite: () => useAdminWriteMock(),
}));

const AdminPage = Route.options.component!;

beforeEach(() => {
  mutateSpy.mockReset();
  useStrategiesMock.mockReturnValue({
    data: {
      priority: {
        active: 'weighted-score',
        available: ['weighted-score', 'impact-urgency-matrix'],
      },
      assignment: {
        active: 'composite',
        available: ['skill-based', 'composite'],
      },
    },
    isError: false,
    refetch: vi.fn(),
  });
  useAdminWriteMock.mockReturnValue({
    mutate: mutateSpy,
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
  });
});

afterEach(cleanup);

describe('admin strategies', () => {
  it('formatsPriorityAndAssignmentStrategySavedMessages', () => {
    expect(strategySavedMessage('priority', 'impact-urgency-matrix')).toBe(
      'Strategy saved. New incidents use Impact urgency matrix; existing incidents keep their priority.',
    );
    expect(strategySavedMessage('assignment', 'skill-based')).toBe(
      'Strategy saved. New incidents are assigned by Skill based.',
    );
  });

  it('rendersSavedStatusInsideTheFieldsetThatWasChanged', () => {
    let writeState = {
      mutate: mutateSpy,
      isPending: false,
      isSuccess: false,
      isError: false,
      error: null as Error | null,
    };
    useAdminWriteMock.mockImplementation(() => writeState);

    const { rerender } = render(<AdminPage />);
    const priorityGroup = screen.getByRole('group', { name: 'Priority strategy' });
    const assignmentGroup = screen.getByRole('group', { name: 'Assignment strategy' });

    fireEvent.click(within(priorityGroup).getByRole('radio', { name: /Impact urgency matrix/ }));
    writeState = { ...writeState, isPending: true };
    rerender(<AdminPage />);
    expect(within(priorityGroup).getByRole('status').textContent).toBe('Saving strategy…');
    expect(within(assignmentGroup).queryByRole('status')).toBeNull();

    writeState = { ...writeState, isPending: false, isSuccess: true };
    rerender(<AdminPage />);
    expect(within(priorityGroup).getByRole('status').textContent).toBe(
      'Strategy saved. New incidents use Impact urgency matrix; existing incidents keep their priority.',
    );
    expect(within(assignmentGroup).queryByRole('status')).toBeNull();
  });

  it('rendersAssignmentErrorInsideTheAssignmentFieldset', () => {
    let writeState = {
      mutate: mutateSpy,
      isPending: false,
      isSuccess: false,
      isError: false,
      error: null as Error | null,
    };
    useAdminWriteMock.mockImplementation(() => writeState);

    const { rerender } = render(<AdminPage />);
    const priorityGroup = screen.getByRole('group', { name: 'Priority strategy' });
    const assignmentGroup = screen.getByRole('group', { name: 'Assignment strategy' });

    fireEvent.click(within(assignmentGroup).getByRole('radio', { name: /Skill based/ }));
    writeState = { ...writeState, isError: true, error: new Error('Save failed') };
    rerender(<AdminPage />);
    expect(within(assignmentGroup).getByRole('alert').textContent).toBe('Save failed');
    expect(within(priorityGroup).queryByRole('alert')).toBeNull();
  });
});

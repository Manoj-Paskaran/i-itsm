import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PolicyForm } from './config-forms';
import { Route } from '@/routes/admin';
import type { useSlaPolicies } from '@/lib/admin';

type Policy = NonNullable<ReturnType<typeof useSlaPolicies>['data']>[number];
const config = vi.hoisted(() => ({
  policies: [] as Policy[],
  services: [] as { id: string; name: string }[],
}));

const write = vi.hoisted(() => ({
  isPending: false,
  error: null,
  mutate:
    vi.fn<
      (
        request: { path: string; method: string; body: object },
        callbacks: { onSuccess: () => void },
      ) => void
    >(),
}));
vi.mock('@/lib/admin', async (original) => ({
  ...(await original<typeof import('@/lib/admin')>()),
  useAdminWrite: () => write,
  useStrategies: () => ({
    data: {
      priority: { active: '', available: [] },
      assignment: { active: '', available: [] },
    },
  }),
  useAdminUsers: () => ({
    data: [
      {
        id: 'tech-1',
        name: 'Asha Iyer',
        email: 'asha@itsm.demo',
        role: 'TECHNICIAN',
        active: true,
        technician: {
          skills: ['network'],
          capacity: 5,
          experienceYears: 3,
          availability: 'AVAILABLE',
        },
      },
    ],
  }),
  useAdminServices: () => ({ data: config.services }),
  useAdminCategories: () => ({ data: [] }),
  useSlaPolicies: () => ({ data: config.policies }),
}));
vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'admin' } }) }));

const scrollIntoView = vi.fn();
beforeEach(() => {
  config.policies = [];
  config.services = [];
  write.isPending = false;
  write.mutate.mockReset();
  scrollIntoView.mockClear();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  });
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});

function renderPolicy() {
  render(
    <PolicyForm services={[]} taken={{ serviceIds: [], hasDefault: false }} onDone={vi.fn()} />,
  );
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Default policy' } });
}

it.each(['response', 'resolution'])('allowsClearingAndReplacingSlaTarget_%s', (kind) => {
  renderPolicy();
  const field = screen.getByLabelText<HTMLInputElement>(`P1 ${kind} minutes`);
  fireEvent.change(field, { target: { value: '' } });
  expect(field.value).toBe('');
  fireEvent.change(field, { target: { value: '' } });
  expect(field.value).toBe('');
  fireEvent.change(field, { target: { value: '12' } });
  expect(field.value).toBe('12');
});

it('submitsNumericSlaTargetsAfterEditingStringDrafts', () => {
  renderPolicy();
  fireEvent.change(screen.getByLabelText('P1 response minutes'), { target: { value: '7' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Create policy' }).closest('form')!);
  const { body } = write.mutate.mock.calls[0]![0];
  expect(body).toMatchObject({
    targets: [
      { priority: 'P1', responseMinutes: 7, resolutionMinutes: 30 },
      { priority: 'P2', responseMinutes: 15, resolutionMinutes: 120 },
      { priority: 'P3', responseMinutes: 60, resolutionMinutes: 480 },
      { priority: 'P4', responseMinutes: 240, resolutionMinutes: 1440 },
    ],
  });
});

it.each(['', '0', '31'])('rejectsInvalidSlaResponseDraft_%s', (value) => {
  renderPolicy();
  fireEvent.change(screen.getByLabelText('P1 response minutes'), { target: { value } });
  fireEvent.submit(screen.getByRole('button', { name: 'Create policy' }).closest('form')!);
  expect(screen.getByRole('alert').textContent).toMatch(/P1 (targets|resolution)/);
  expect(write.mutate).not.toHaveBeenCalled();
});

const Admin = Route.options.component!;
function openTechnician() {
  const view = render(<Admin />);
  fireEvent.click(screen.getByRole('tab', { name: 'Users' }));
  const trigger = screen.getByRole('button', { name: 'Edit Asha Iyer' });
  fireEvent.click(trigger);
  return { ...view, trigger };
}

it('revealsTechnicianEditorAndFocusesItsFirstEnabledField', () => {
  openTechnician();
  expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' });
  expect(document.activeElement).toBe(screen.getByLabelText('Skills'));
});

it.each(['Cancel', 'Escape'])('returnsFocusToEditButtonOnClose_%s', (action) => {
  const { trigger } = openTechnician();
  if (action === 'Cancel') fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  else fireEvent.keyDown(screen.getByLabelText('Skills'), { key: 'Escape' });
  expect(screen.queryByLabelText('Skills')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it('returnsFocusToEditButtonAfterSuccessfulSave', () => {
  const { trigger } = openTechnician();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByLabelText('Skills')).toBeTruthy();
  const callbacks = write.mutate.mock.calls[0]![1];
  act(() => callbacks.onSuccess());
  expect(screen.queryByLabelText('Skills')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it('keepsEditorOpenWhileSaveIsPending', () => {
  const { rerender } = openTechnician();
  write.isPending = true;
  rerender(<Admin />);
  fireEvent.keyDown(screen.getByLabelText('Skills'), { key: 'Escape' });
  expect(screen.getByLabelText('Skills')).toBeTruthy();
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Cancel' }).disabled).toBe(true);
});

it.each([
  ['Users', 'Add user', 'Name'],
  ['Services', 'Add service', 'Name'],
  ['Categories', 'Add category', 'Name'],
  ['SLA policies', 'Add policy', 'Name'],
])('returnsFocusToAddButtonOnCancel_%s', (tab, action, field) => {
  render(<Admin />);
  fireEvent.click(screen.getByRole('tab', { name: tab }));
  const trigger = screen.getByRole('button', { name: action });
  fireEvent.click(trigger);
  expect(document.activeElement).toBe(screen.getByLabelText(field));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(document.activeElement).toBe(trigger);
});

const defaultPolicy: Policy = {
  id: 'default',
  name: 'Default SLA',
  service: null,
  warningRatio: 0.75,
  targets: (['P1', 'P2', 'P3', 'P4'] as const).map((priority) => ({
    priority,
    responseMinutes: 5,
    resolutionMinutes: 30,
  })),
};
const paymentPolicy: Policy = {
  ...defaultPolicy,
  id: 'payment',
  name: 'Payment SLA',
  service: { id: 'payment', name: 'Payment Gateway', criticality: 4 },
};
function openPolicies() {
  config.policies = [defaultPolicy, paymentPolicy];
  config.services = [
    { id: 'payment', name: 'Payment Gateway' },
    { id: 'database', name: 'Customer Database' },
  ];
  render(<Admin />);
  fireEvent.click(screen.getByRole('tab', { name: 'SLA policies' }));
}

it('keepsDefaultPolicyOnItsRequiredDefaultDestination', () => {
  openPolicies();
  fireEvent.click(screen.getByRole('button', { name: 'Edit Default SLA' }));
  const select = screen.getByRole<HTMLSelectElement>('combobox', { name: /Applies to/ });
  expect(select.disabled).toBe(true);
  expect([...select.options].map((o) => o.value)).toEqual(['']);
  expect(screen.getByText(/The default policy must remain/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(write.mutate.mock.calls[0]![0].body).toMatchObject({ serviceId: null });
});

it('offersOnlyCurrentAndUnoccupiedServiceTargetsWhenEditing', () => {
  openPolicies();
  config.policies.push({
    ...paymentPolicy,
    id: 'database',
    service: { ...config.services[1]!, criticality: 3 },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Edit Payment SLA' }));
  const select = screen.getByLabelText<HTMLSelectElement>('Applies to');
  expect(select.disabled).toBe(false);
  expect([...select.options].map((o) => o.value)).toEqual(['payment']);
  expect(select.value).toBe('payment');
});

it('savesAnEditedPolicyToAnUnoccupiedService', () => {
  openPolicies();
  fireEvent.click(screen.getByRole('button', { name: 'Edit Payment SLA' }));
  const select = screen.getByLabelText<HTMLSelectElement>('Applies to');
  expect([...select.options].map((o) => o.value)).toEqual(['payment', 'database']);
  fireEvent.change(select, { target: { value: 'database' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(write.mutate.mock.calls[0]![0].body).toMatchObject({ serviceId: 'database' });
});

it('offersOnlyUnoccupiedTargetsWhenCreatingAPolicy', () => {
  openPolicies();
  fireEvent.click(screen.getByRole('button', { name: 'Add policy' }));
  const select = screen.getByLabelText<HTMLSelectElement>('Applies to');
  expect([...select.options].map((o) => o.value)).toEqual(['database']);
  expect(select.value).toBe('database');
});

it('allowsAServicePolicyToBecomeDefaultWhenNoDefaultExists', () => {
  config.policies = [paymentPolicy];
  config.services = [{ id: 'payment', name: 'Payment Gateway' }];
  render(<Admin />);
  fireEvent.click(screen.getByRole('tab', { name: 'SLA policies' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit Payment SLA' }));
  const select = screen.getByLabelText<HTMLSelectElement>('Applies to');
  expect([...select.options].map((o) => o.value)).toEqual(['', 'payment']);
});

it('disablesAddingPolicyOnlyWhenDefaultAndEveryServiceAreCovered', () => {
  config.policies = [defaultPolicy, paymentPolicy];
  config.services = [{ id: 'payment', name: 'Payment Gateway' }];
  const { rerender } = render(<Admin />);
  fireEvent.click(screen.getByRole('tab', { name: 'SLA policies' }));
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add policy' }).disabled).toBe(true);
  expect(screen.getByText(/Every service already has its own policy/)).toBeTruthy();
  // Equal service/policy counts do not imply coverage when the IDs differ.
  config.services = [{ id: 'database', name: 'Customer Database' }];
  rerender(<Admin />);
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add policy' }).disabled).toBe(
    false,
  );
  config.services = [{ id: 'payment', name: 'Payment Gateway' }];
  config.policies = [paymentPolicy];
  rerender(<Admin />);
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add policy' }).disabled).toBe(
    false,
  );
});

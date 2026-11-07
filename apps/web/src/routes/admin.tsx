import { createFileRoute } from '@tanstack/react-router';
import { useRef, useState, type MouseEventHandler, type ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import {
  strategyLabel,
  useAdminCategories,
  useAdminServices,
  useAdminUsers,
  useAdminWrite,
  useSlaPolicies,
  useStrategies,
} from '@/lib/admin';
import { Pencil, Plus } from 'lucide-react';
import {
  availabilityLabel,
  CategoryForm,
  NewUserForm,
  PolicyForm,
  ServiceForm,
  smallButton,
  TechnicianForm,
} from '@/components/admin/config-forms';
import { useAuth } from '@/lib/auth';
import { CRITICALITY_LABEL } from '@/lib/incidents';
import { formatMinutes } from '@/lib/charts';

export const Route = createFileRoute('/admin')({ component: Admin });

const TABS = ['Strategies', 'Users', 'Services', 'Categories', 'SLA policies'] as const;
type Tab = (typeof TABS)[number];
const ROLE = {
  EMPLOYEE: 'Employee',
  TECHNICIAN: 'Technician',
  TEAM_LEAD: 'Team lead',
  ADMIN: 'Admin',
  IT_MANAGER: 'IT manager',
};
const STRATEGY_DESCRIPTION: Record<string, string> = {
  'weighted-score': 'Impact × urgency × criticality × user factor.',
  'impact-urgency-matrix': 'Impact–urgency matrix, adjusted for criticality.',
  'skill-based': 'Required skill first, then lighter workload.',
  'load-based': 'Most spare capacity.',
  'round-robin': 'Next technician after the last one assigned.',
  'experience-based': 'Service history and years of experience.',
  composite: 'Weighted mix of skill, workload and experience.',
};

function Admin() {
  const [tab, setTab] = useState<Tab>('Strategies');
  return (
    <AppShell>
      <header className="border-b border-border px-8 pt-5 max-sm:px-4">
        <h1 className="text-xl font-semibold">Configuration</h1>
        <div
          role="tablist"
          aria-label="Configuration sections"
          className="-mx-0.5 mt-3 flex gap-2 overflow-x-auto sm:-mx-1 sm:gap-5"
        >
          {TABS.map((t, index) => (
            <button
              key={t}
              role="tab"
              id={`admin-tab-${index}`}
              aria-controls="admin-panel"
              aria-selected={tab === t}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => setTab(t)}
              onKeyDown={(e) => {
                const next =
                  e.key === 'ArrowRight'
                    ? (index + 1) % TABS.length
                    : e.key === 'ArrowLeft'
                      ? (index + TABS.length - 1) % TABS.length
                      : e.key === 'Home'
                        ? 0
                        : e.key === 'End'
                          ? TABS.length - 1
                          : null;
                if (next === null) return;
                e.preventDefault();
                setTab(TABS[next]!);
                e.currentTarget.parentElement
                  ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                  [next]?.focus();
              }}
              className={`min-h-10 shrink-0 border-b-2 px-0.5 pb-2 text-sm whitespace-nowrap focus-visible:-outline-offset-2 sm:px-1 ${tab === t ? 'border-primary font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </header>
      <div
        id="admin-panel"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={`admin-tab-${TABS.indexOf(tab)}`}
        className="px-8 py-5 max-sm:px-4"
      >
        {tab === 'Strategies' && <Strategies />}
        {tab === 'Users' && <Users />}
        {tab === 'Services' && <Services />}
        {tab === 'Categories' && <Categories />}
        {tab === 'SLA policies' && <Policies />}
      </div>
    </AppShell>
  );
}

function Table({
  head,
  children,
  state,
  minWidth = 'min-w-[640px]',
}: {
  head: string[];
  children: ReactNode;
  state: { isLoading: boolean; isError: boolean; data?: unknown[]; refetch: () => unknown };
  minWidth?: string;
}) {
  return (
    <div
      className="overflow-x-auto rounded-lg border border-border"
      tabIndex={0}
      role="region"
      aria-label={`${head[0]} configuration table; scroll for more columns`}
    >
      <table className={`w-full text-sm ${minWidth}`}>
        <thead className="sticky top-0 bg-panel text-left text-xs text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {state.isLoading ? (
            <tr>
              <td colSpan={head.length} className="p-4">
                <div className="h-6 animate-pulse rounded bg-muted" />
              </td>
            </tr>
          ) : state.isError ? (
            <tr>
              <td colSpan={head.length} className="p-6 text-center text-critical-foreground">
                Could not load configuration.{' '}
                <button
                  className="min-h-10 underline sm:min-h-0"
                  onClick={() => void state.refetch()}
                >
                  Retry
                </button>
              </td>
            </tr>
          ) : !state.data?.length ? (
            <tr>
              <td colSpan={head.length} className="p-8 text-center text-muted-foreground">
                No entries yet. Use the add action above to create one.
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}
const td = 'border-t border-border px-4 py-2.5 align-middle';
function Toolbar({
  hint,
  action,
  onClick,
  disabled = false,
}: {
  hint: string;
  action: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">{hint}</p>
      <button className={smallButton} onClick={onClick} disabled={disabled}>
        <Plus size={13} aria-hidden />
        {action}
      </button>
    </div>
  );
}
const EditButton = ({
  onClick,
  label,
}: {
  onClick: MouseEventHandler<HTMLButtonElement>;
  label: string;
}) => (
  <button className={smallButton} onClick={onClick} aria-label={label}>
    <Pencil size={12} aria-hidden />
    Edit
  </button>
);
const Active = ({ on }: { on: boolean }) => (
  <span className={on ? 'text-success-foreground' : 'text-muted-foreground'}>
    {on ? 'Active' : 'Inactive'}
  </span>
);

function Strategies() {
  const strategies = useStrategies();
  const write = useAdminWrite();
  if (strategies.isError)
    return (
      <p role="alert" className="text-sm text-critical-foreground">
        Could not load strategies.{' '}
        <button className={smallButton} onClick={() => void strategies.refetch()}>
          Retry strategies
        </button>
      </p>
    );
  if (!strategies.data)
    return (
      <div role="status" className="h-40 animate-pulse rounded-lg bg-muted">
        <span className="sr-only">Loading strategies…</span>
      </div>
    );
  const groups = [
    [
      'priority',
      'Priority strategy',
      'How impact, urgency, service criticality and affected users become P1–P4.',
    ],
    ['assignment', 'Assignment strategy', 'How the system picks a technician for a new incident.'],
  ] as const;
  return (
    <div className="grid max-w-[880px] items-start gap-4 lg:grid-cols-2">
      <p className="text-xs text-muted-foreground lg:col-span-2">
        Selecting a strategy saves it immediately. Existing incidents keep their decisions.
      </p>
      {groups.map(([key, title, hint]) => (
        <fieldset
          key={key}
          disabled={write.isPending}
          className="min-w-0 rounded-lg border border-border p-4 disabled:opacity-60"
        >
          <legend className="px-1 text-sm font-semibold">{title}</legend>
          <p className="text-xs text-muted-foreground">{hint}</p>
          <div className="mt-3 space-y-1.5">
            {strategies.data[key].available.map((id) => (
              <label
                key={id}
                className={`flex min-h-10 cursor-pointer items-start gap-2 rounded-md border px-3 py-2 ${strategies.data[key].active === id ? 'border-primary bg-primary-subtle' : 'border-border hover:bg-hover'}`}
              >
                <input
                  type="radio"
                  name={key}
                  value={id}
                  checked={strategies.data[key].active === id}
                  disabled={write.isPending}
                  onChange={() =>
                    write.mutate({
                      path: '/api/admin/strategies',
                      method: 'PUT',
                      body: { [key]: id },
                    })
                  }
                  className="mt-0.5 accent-[var(--primary)]"
                />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">{strategyLabel(id)}</span>
                  <span className="text-xs text-muted-foreground">{STRATEGY_DESCRIPTION[id]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <p role="status" className="text-xs text-muted-foreground lg:col-span-2">
        {write.isPending
          ? 'Saving strategy…'
          : write.isSuccess
            ? 'Strategy saved. It will apply to new incidents.'
            : ''}
      </p>
      {write.isError && (
        <p role="alert" className="text-xs text-critical-foreground">
          {write.error.message}
        </p>
      )}
    </div>
  );
}

/** Keep the opening button so Cancel and a successful save return to the same row. */
function useEditor() {
  const [form, setForm] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const open =
    (id: string): MouseEventHandler<HTMLButtonElement> =>
    (event) => {
      trigger.current = event.currentTarget;
      setForm(id);
    };
  const close = () => {
    setForm(null);
    trigger.current?.focus();
  };
  return { form, open, close };
}

function Users() {
  const users = useAdminUsers();
  const { user: me } = useAuth();
  const write = useAdminWrite();
  const { form, open, close } = useEditor();
  const editUser = users.data?.find((u) => u.id === form && u.technician);
  return (
    <>
      <Toolbar
        hint="Technicians' skills, capacity and availability drive automatic assignment."
        action="Add user"
        onClick={open('new')}
      />
      {form === 'new' && <NewUserForm onDone={close} />}
      {editUser?.technician && (
        <TechnicianForm
          key={editUser.id}
          user={{ ...editUser, technician: editUser.technician }}
          onDone={close}
        />
      )}
      {write.isError && (
        <p role="alert" className="mb-3 text-sm text-critical-foreground">
          Account status could not be saved. {write.error.message}
        </p>
      )}
      <Table
        head={[
          'Name',
          'Role',
          'Department',
          'Skills',
          'Capacity',
          'Availability',
          'Status',
          'Actions',
        ]}
        state={users}
        minWidth="min-w-[1000px]"
      >
        {users.data?.map((u) => (
          <tr key={u.id}>
            <td className={td}>
              <div className="font-medium">{u.name}</div>
              <div className="text-xs text-muted-foreground">{u.email}</div>
            </td>
            <td className={td}>{ROLE[u.role]}</td>
            <td className={td}>
              {u.department ?? <span className="text-muted-foreground">—</span>}
            </td>
            <td className={`${td} text-xs`}>
              {u.technician?.skills.join(', ') || <span className="text-muted-foreground">—</span>}
            </td>
            <td className={`${td} tabular`}>
              {u.technician ? (
                u.technician.capacity
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </td>
            <td className={`${td} text-xs`}>
              {u.technician ? (
                availabilityLabel(u.technician.availability)
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </td>
            <td className={td}>
              <label className="flex min-h-10 items-center gap-2 sm:min-h-0">
                <input
                  type="checkbox"
                  aria-label={`Active account for ${u.name}`}
                  checked={u.active}
                  disabled={write.isPending || u.id === me?.id}
                  title={u.id === me?.id ? 'You cannot deactivate your own account' : undefined}
                  onChange={() =>
                    write.mutate({
                      path: `/api/admin/users/${u.id}`,
                      method: 'PATCH',
                      body: { active: !u.active },
                    })
                  }
                  className="accent-[var(--primary)]"
                />
                <Active on={u.active} />
              </label>
            </td>
            <td className={td}>
              {u.technician && <EditButton label={`Edit ${u.name}`} onClick={open(u.id)} />}
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}

function Services() {
  const services = useAdminServices();
  const { form, open, close } = useEditor();
  const editing = services.data?.find((s) => s.id === form);
  return (
    <>
      <Toolbar
        hint="Every incident is reported against a service; its criticality feeds the priority."
        action="Add service"
        onClick={open('new')}
      />
      {form === 'new' && <ServiceForm onDone={close} />}
      {editing && <ServiceForm key={editing.id} service={editing} onDone={close} />}
      <Table head={['Service', 'Criticality', 'Description', 'Status', 'Actions']} state={services}>
        {services.data?.map((s) => (
          <tr key={s.id}>
            <td className={`${td} font-medium`}>{s.name}</td>
            <td className={td}>
              {CRITICALITY_LABEL[s.criticality]} ({s.criticality})
            </td>
            <td className={`${td} text-muted-foreground`}>{s.description ?? '—'}</td>
            <td className={td}>
              <Active on={s.active} />
            </td>
            <td className={td}>
              <EditButton label={`Edit ${s.name}`} onClick={open(s.id)} />
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}

function Categories() {
  const categories = useAdminCategories();
  const { form, open, close } = useEditor();
  const editing = categories.data?.find((c) => c.id === form);
  return (
    <>
      <Toolbar
        hint="Classification suggests a category; skill-based assignment matches its required skill."
        action="Add category"
        onClick={open('new')}
      />
      {form === 'new' && <CategoryForm onDone={close} />}
      {editing && <CategoryForm key={editing.id} category={editing} onDone={close} />}
      <Table head={['Category', 'Code', 'Required skill', 'Status', 'Actions']} state={categories}>
        {categories.data?.map((c) => (
          <tr key={c.id}>
            <td className={`${td} font-medium`}>{c.name}</td>
            <td className={`${td} font-mono text-xs`}>{c.code}</td>
            <td className={td}>{c.requiredSkill}</td>
            <td className={td}>
              <Active on={c.active} />
            </td>
            <td className={td}>
              <EditButton label={`Edit ${c.name}`} onClick={open(c.id)} />
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}

function Policies() {
  const policies = useSlaPolicies();
  const services = useAdminServices();
  const { form, open, close } = useEditor();
  const editing = policies.data?.find((p) => p.id === form);
  const serviceList = (services.data ?? []).map((s) => ({ id: s.id, name: s.name }));
  const otherPolicies = (policies.data ?? []).filter((p) => p.id !== editing?.id);
  const taken = {
    serviceIds: otherPolicies.flatMap((p) => (p.service ? [p.service.id] : [])),
    hasDefault: otherPolicies.some((p) => !p.service),
  };
  const allTargetsCovered =
    !!services.data &&
    (policies.data ?? []).some((p) => !p.service) &&
    serviceList.every((s) => policies.data?.some((p) => p.service?.id === s.id));
  return (
    <>
      <Toolbar
        hint="A service's own policy wins; the default policy covers every other service."
        action="Add policy"
        onClick={open('new')}
        disabled={!policies.data || !services.data || allTargetsCovered}
      />
      {allTargetsCovered && (
        <p className="mb-3 text-xs text-muted-foreground">
          Every service already has its own policy, and a default policy exists.
        </p>
      )}
      {services.isError && (
        <p role="alert" className="mb-3 text-sm text-critical-foreground">
          Service choices could not load.{' '}
          <button className={smallButton} onClick={() => void services.refetch()}>
            Retry services
          </button>
        </p>
      )}
      {form === 'new' && <PolicyForm services={serviceList} taken={taken} onDone={close} />}
      {editing && (
        <PolicyForm
          key={editing.id}
          policy={editing}
          services={serviceList}
          taken={taken}
          onDone={close}
        />
      )}
      <Table
        head={['Policy', 'Applies to', 'Warn at', 'P1', 'P2', 'P3', 'P4', 'Actions']}
        state={policies}
        minWidth="min-w-[1000px]"
      >
        {policies.data?.map((p) => (
          <tr key={p.id}>
            <td className={`${td} font-medium`}>{p.name}</td>
            <td className={td}>{p.service?.name ?? 'Every other service'}</td>
            <td className={`${td} tabular`}>{Math.round(p.warningRatio * 100)}%</td>
            {(['P1', 'P2', 'P3', 'P4'] as const).map((pr) => {
              const t = p.targets.find((x) => x.priority === pr);
              return (
                <td key={pr} className={`${td} text-xs whitespace-nowrap tabular`}>
                  {t ? (
                    <>
                      respond {formatMinutes(t.responseMinutes)}
                      <br />
                      resolve {formatMinutes(t.resolutionMinutes)}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              );
            })}
            <td className={td}>
              <EditButton label={`Edit ${p.name}`} onClick={open(p.id)} />
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}

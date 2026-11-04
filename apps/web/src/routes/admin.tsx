import { createFileRoute } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
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
const minutes = (m: number) => (m >= 60 ? `${m / 60}h` : `${m}m`);

function Admin() {
  const [tab, setTab] = useState<Tab>('Strategies');
  return (
    <AppShell>
      <header className="border-b border-border px-8 pt-5 max-sm:px-4">
        <h1 className="text-xl font-semibold">Configuration</h1>
        <div role="tablist" className="mt-3 flex gap-5 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 pb-2 text-sm whitespace-nowrap ${tab === t ? 'border-primary font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </header>
      <div className="px-8 py-5 max-sm:px-4">
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
}: {
  head: string[];
  children: ReactNode;
  state: { isLoading: boolean; isError: boolean };
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-panel text-left text-xs text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-2 font-medium">
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
                Could not load.
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
const td = 'border-t border-border px-4 py-2.5 align-top';
function Toolbar({ hint, action, onClick }: { hint: string; action: string; onClick: () => void }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">{hint}</p>
      <button className={smallButton} onClick={onClick}>
        <Plus size={13} aria-hidden />
        {action}
      </button>
    </div>
  );
}
const EditButton = ({ onClick, label }: { onClick: () => void; label: string }) => (
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
  if (!strategies.data) return <div className="h-40 animate-pulse rounded-lg bg-muted" />;
  const groups = [
    [
      'priority',
      'Priority strategy',
      'How impact, urgency, service criticality and affected users become P1–P4.',
    ],
    ['assignment', 'Assignment strategy', 'How the system picks a technician for a new incident.'],
  ] as const;
  return (
    <div className="grid max-w-[880px] gap-4 lg:grid-cols-2">
      {groups.map(([key, title, hint]) => (
        <fieldset key={key} className="rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-semibold">{title}</legend>
          <p className="text-xs text-muted-foreground">
            {hint} Applies to the next incident; existing incidents keep their decision.
          </p>
          <div className="mt-3 space-y-1.5">
            {strategies.data[key].available.map((id) => (
              <label
                key={id}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 ${strategies.data[key].active === id ? 'border-primary bg-primary-subtle' : 'border-border hover:bg-hover'}`}
              >
                <input
                  type="radio"
                  name={key}
                  checked={strategies.data[key].active === id}
                  disabled={write.isPending}
                  onChange={() =>
                    write.mutate({
                      path: '/api/admin/strategies',
                      method: 'PUT',
                      body: { [key]: id },
                    })
                  }
                  className="accent-[var(--primary)]"
                />
                <span className="text-sm font-medium">{strategyLabel(id)}</span>
                <code className="ml-auto text-2xs text-muted-foreground">{id}</code>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {write.isError && (
        <p role="alert" className="text-xs text-critical-foreground">
          {write.error.message}
        </p>
      )}
    </div>
  );
}

function Users() {
  const users = useAdminUsers();
  const { user: me } = useAuth();
  const write = useAdminWrite();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const editUser = users.data?.find((u) => u.id === editing && u.technician);
  return (
    <>
      <Toolbar
        hint="Technicians' skills, capacity and availability drive automatic assignment."
        action="Add user"
        onClick={() => {
          setEditing(null);
          setAdding(true);
        }}
      />
      {adding && <NewUserForm onDone={() => setAdding(false)} />}
      {editUser?.technician && (
        <TechnicianForm
          key={editUser.id}
          user={{ ...editUser, technician: editUser.technician }}
          onDone={() => setEditing(null)}
        />
      )}
      <Table
        head={['Name', 'Role', 'Department', 'Skills', 'Capacity', 'Availability', 'Status', '']}
        state={users}
      >
        {users.data?.map((u) => (
          <tr key={u.id}>
            <td className={td}>
              <div className="font-medium">{u.name}</div>
              <div className="text-xs text-muted-foreground">{u.email}</div>
            </td>
            <td className={td}>{ROLE[u.role]}</td>
            <td className={td}>{u.department ?? '—'}</td>
            <td className={`${td} text-xs`}>{u.technician?.skills.join(', ') || '—'}</td>
            <td className={`${td} tabular`}>{u.technician ? u.technician.capacity : '—'}</td>
            <td className={`${td} text-xs`}>
              {u.technician ? availabilityLabel(u.technician.availability) : '—'}
            </td>
            <td className={td}>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
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
              {u.technician && (
                <EditButton
                  label={`Edit ${u.name}`}
                  onClick={() => {
                    setAdding(false);
                    setEditing(u.id);
                  }}
                />
              )}
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}

function Services() {
  const services = useAdminServices();
  const [form, setForm] = useState<string | null>(null);
  const editing = services.data?.find((s) => s.id === form);
  return (
    <>
      <Toolbar
        hint="Every incident is reported against a service; its criticality feeds the priority."
        action="Add service"
        onClick={() => setForm('new')}
      />
      {form === 'new' && <ServiceForm onDone={() => setForm(null)} />}
      {editing && <ServiceForm key={editing.id} service={editing} onDone={() => setForm(null)} />}
      <Table head={['Service', 'Criticality', 'Description', 'Status', '']} state={services}>
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
              <EditButton label={`Edit ${s.name}`} onClick={() => setForm(s.id)} />
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}

function Categories() {
  const categories = useAdminCategories();
  const [form, setForm] = useState<string | null>(null);
  const editing = categories.data?.find((c) => c.id === form);
  return (
    <>
      <Toolbar
        hint="Classification suggests a category; skill-based assignment matches its required skill."
        action="Add category"
        onClick={() => setForm('new')}
      />
      {form === 'new' && <CategoryForm onDone={() => setForm(null)} />}
      {editing && <CategoryForm key={editing.id} category={editing} onDone={() => setForm(null)} />}
      <Table head={['Category', 'Code', 'Required skill', 'Status', '']} state={categories}>
        {categories.data?.map((c) => (
          <tr key={c.id}>
            <td className={`${td} font-medium`}>{c.name}</td>
            <td className={`${td} font-mono text-xs`}>{c.code}</td>
            <td className={td}>{c.requiredSkill}</td>
            <td className={td}>
              <Active on={c.active} />
            </td>
            <td className={td}>
              <EditButton label={`Edit ${c.name}`} onClick={() => setForm(c.id)} />
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
  const [form, setForm] = useState<string | null>(null);
  const editing = policies.data?.find((p) => p.id === form);
  const serviceList = (services.data ?? []).map((s) => ({ id: s.id, name: s.name }));
  return (
    <>
      <Toolbar
        hint="A service's own policy wins; the default policy covers every other service."
        action="Add policy"
        onClick={() => setForm('new')}
      />
      {form === 'new' && (
        <PolicyForm
          services={serviceList}
          taken={{
            serviceIds: (policies.data ?? []).flatMap((p) => (p.service ? [p.service.id] : [])),
            hasDefault: (policies.data ?? []).some((p) => !p.service),
          }}
          onDone={() => setForm(null)}
        />
      )}
      {editing && (
        <PolicyForm
          key={editing.id}
          policy={editing}
          services={serviceList}
          onDone={() => setForm(null)}
        />
      )}
      <Table
        head={['Policy', 'Applies to', 'Warn at', 'P1', 'P2', 'P3', 'P4', '']}
        state={policies}
      >
        {policies.data?.map((p) => (
          <tr key={p.id}>
            <td className={`${td} font-medium`}>{p.name}</td>
            <td className={td}>{p.service?.name ?? 'Every other service'}</td>
            <td className={`${td} tabular`}>{Math.round(p.warningRatio * 100)}%</td>
            {(['P1', 'P2', 'P3', 'P4'] as const).map((pr) => {
              const t = p.targets.find((x) => x.priority === pr);
              return (
                <td key={pr} className={`${td} text-xs tabular`}>
                  {t ? (
                    <>
                      respond {minutes(t.responseMinutes)}
                      <br />
                      resolve {minutes(t.resolutionMinutes)}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              );
            })}
            <td className={td}>
              <EditButton label={`Edit ${p.name}`} onClick={() => setForm(p.id)} />
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}

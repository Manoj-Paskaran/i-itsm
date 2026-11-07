import type { ReactNode } from 'react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAdminWrite } from '@/lib/admin';
import {
  CATEGORY_CODE,
  categoryCode,
  createUserBody,
  hasTechnicianProfile,
  PRIORITIES,
  ROLES,
  splitSkills,
  targetErrors,
  type Targets,
  type UserForm,
} from '@/lib/admin-forms';
import { CRITICALITY_LABEL } from '@/lib/incidents';

export const input =
  'mt-1 block h-10 min-w-0 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground disabled:opacity-50 sm:h-9';
const label = 'block text-xs font-medium';
export const smallButton =
  'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-hover disabled:opacity-50 sm:h-7 sm:px-2.5';

/** The shared inline panel: a heading, the fields, an error line, Cancel and Save. */
function Panel({
  title,
  children,
  error,
  pending,
  onSubmit,
  onCancel,
  submit = 'Save',
}: {
  title: string;
  children: ReactNode;
  error: string | null;
  pending: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  submit?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    form.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    form.current
      ?.querySelector<HTMLElement>('input:enabled, select:enabled, textarea:enabled')
      ?.focus({ preventScroll: true });
  }, []);
  return (
    <form
      ref={form}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !pending) {
          e.preventDefault();
          onCancel();
        }
      }}
      className="mb-4 scroll-mt-16 space-y-3 rounded-lg border border-border bg-panel p-4 lg:scroll-mt-4"
    >
      <h2 className="text-sm font-semibold">{title}</h2>
      <fieldset disabled={pending} className="min-w-0 space-y-3">
        {children}
      </fieldset>
      {error && (
        <p role="alert" className="text-xs text-critical-foreground">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          disabled={pending}
          className="h-10 rounded-md px-3 text-sm hover:bg-hover disabled:opacity-50 sm:h-9"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          disabled={pending}
          className="h-10 rounded-md bg-primary px-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50 sm:h-9"
        >
          {pending ? 'Saving…' : submit}
        </button>
      </div>
    </form>
  );
}

/** Runs one admin write and closes the panel on success; shows the API's message on failure. */
function useSave(onDone: () => void) {
  const write = useAdminWrite();
  const [error, setError] = useState<string | null>(null);
  return {
    pending: write.isPending,
    error: error ?? (write.error ? write.error.message : null),
    setError,
    save: (path: string, method: 'POST' | 'PUT' | 'PATCH', body: object) => {
      setError(null);
      write.mutate({ path, method, body }, { onSuccess: onDone });
    },
  };
}

const emptyUser: UserForm = {
  name: '',
  email: '',
  password: '',
  role: 'EMPLOYEE',
  department: '',
  skills: '',
  maxActiveIncidents: '5',
  experienceYears: '1',
};

export function NewUserForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState(emptyUser);
  const s = useSave(onDone);
  const set = (k: keyof UserForm, v: string) => setF((x) => ({ ...x, [k]: v }));
  const tech = hasTechnicianProfile(f.role);
  return (
    <Panel
      title="Add a user"
      submit="Create user"
      error={s.error}
      pending={s.pending}
      onCancel={onDone}
      onSubmit={() => {
        const r = createUserBody(f);
        if (r.ok) s.save('/api/admin/users', 'POST', r.body);
        else s.setError(r.error);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>
          Name
          <input className={input} value={f.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        <label className={label}>
          Email
          <input
            type="email"
            className={input}
            value={f.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </label>
        <label className={label}>
          Initial password
          <input
            type="password"
            className={input}
            value={f.password}
            onChange={(e) => set('password', e.target.value)}
          />
        </label>
        <label className={label}>
          Role
          <select className={input} value={f.role} onChange={(e) => set('role', e.target.value)}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        {f.role === 'EMPLOYEE' && (
          <label className={label}>
            Department
            <input
              className={input}
              value={f.department}
              onChange={(e) => set('department', e.target.value)}
            />
          </label>
        )}
      </div>
      {tech && (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={label}>
            Skills <span className="text-muted-foreground">(comma separated)</span>
            <input
              className={input}
              placeholder="network, database"
              value={f.skills}
              onChange={(e) => set('skills', e.target.value)}
            />
          </label>
          <label className={label}>
            Capacity (open incidents)
            <input
              type="number"
              min={1}
              max={20}
              className={input}
              value={f.maxActiveIncidents}
              onChange={(e) => set('maxActiveIncidents', e.target.value)}
            />
          </label>
          <label className={label}>
            Experience (years)
            <input
              type="number"
              min={0}
              max={50}
              className={input}
              value={f.experienceYears}
              onChange={(e) => set('experienceYears', e.target.value)}
            />
          </label>
        </div>
      )}
    </Panel>
  );
}

const AVAILABILITY = ['AVAILABLE', 'BUSY', 'OFF_SHIFT', 'ON_LEAVE'] as const;
type Availability = (typeof AVAILABILITY)[number];
export const availabilityLabel = (a: string) =>
  a
    .replace('_', ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());

/** Edit a technician's working profile: what assignment and capacity checks read. */
export function TechnicianForm({
  user,
  onDone,
}: {
  user: {
    id: string;
    name: string;
    technician: {
      skills: string[];
      capacity: number;
      availability: Availability;
      experienceYears: number;
    };
  };
  onDone: () => void;
}) {
  const t = user.technician;
  const [skills, setSkills] = useState(t.skills.join(', '));
  const [capacity, setCapacity] = useState(String(t.capacity));
  const [years, setYears] = useState(String(t.experienceYears));
  const [availability, setAvailability] = useState<Availability>(t.availability);
  const s = useSave(onDone);
  return (
    <Panel
      title={`Technician profile · ${user.name}`}
      error={s.error}
      pending={s.pending}
      onCancel={onDone}
      onSubmit={() => {
        const list = splitSkills(skills);
        const cap = Number(capacity);
        if (!list.length) return s.setError('Give at least one skill.');
        if (!Number.isInteger(cap) || cap < 1 || cap > 20)
          return s.setError('Capacity is a whole number from 1 to 20.');
        s.save(`/api/admin/users/${user.id}`, 'PATCH', {
          skills: list,
          maxActiveIncidents: cap,
          experienceYears: Number(years),
          availability,
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <label className={`${label} sm:col-span-2`}>
          Skills
          <input className={input} value={skills} onChange={(e) => setSkills(e.target.value)} />
        </label>
        <label className={label}>
          Capacity
          <input
            type="number"
            min={1}
            max={20}
            className={input}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </label>
        <label className={label}>
          Experience (years)
          <input
            type="number"
            min={0}
            max={50}
            className={input}
            value={years}
            onChange={(e) => setYears(e.target.value)}
          />
        </label>
        <label className={label}>
          Availability
          <select
            className={input}
            value={availability}
            onChange={(e) => setAvailability(e.target.value as Availability)}
          >
            {AVAILABILITY.map((a) => (
              <option key={a} value={a}>
                {availabilityLabel(a)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Panel>
  );
}

export function ServiceForm({
  service,
  onDone,
}: {
  service?: {
    id: string;
    name: string;
    description: string | null;
    criticality: number;
    active: boolean;
  };
  onDone: () => void;
}) {
  const [name, setName] = useState(service?.name ?? '');
  const [description, setDescription] = useState(service?.description ?? '');
  const [criticality, setCriticality] = useState(service?.criticality ?? 2);
  const [active, setActive] = useState(service?.active ?? true);
  const s = useSave(onDone);
  return (
    <Panel
      title={service ? `Edit ${service.name}` : 'Add an IT service'}
      submit={service ? 'Save' : 'Create service'}
      error={s.error}
      pending={s.pending}
      onCancel={onDone}
      onSubmit={() => {
        if (!name.trim()) return s.setError('Enter a service name.');
        const body = {
          name: name.trim(),
          criticality,
          ...(description.trim() ? { description: description.trim() } : {}),
        };
        if (service) s.save(`/api/admin/services/${service.id}`, 'PATCH', { ...body, active });
        else s.save('/api/admin/services', 'POST', body);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>
          Name
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={label}>
          Business criticality
          <select
            className={input}
            value={criticality}
            onChange={(e) => setCriticality(Number(e.target.value))}
          >
            {[1, 2, 3, 4].map((c) => (
              <option key={c} value={c}>
                {CRITICALITY_LABEL[c]} ({c})
              </option>
            ))}
          </select>
        </label>
        {service && (
          <label className="flex min-h-10 items-center gap-2 text-sm sm:mt-5 sm:min-h-9">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="accent-[var(--primary)]"
            />
            Active (employees can report against it)
          </label>
        )}
        <label className={`${label} sm:col-span-3`}>
          Description <span className="text-muted-foreground">(optional)</span>
          <input
            className={input}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Criticality is one factor of the priority score for new incidents on this service.
      </p>
    </Panel>
  );
}

export function CategoryForm({
  category,
  onDone,
}: {
  category?: { id: string; code: string; name: string; requiredSkill: string; active: boolean };
  onDone: () => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [code, setCode] = useState(category?.code ?? '');
  const [codeTouched, setCodeTouched] = useState(false);
  const [skill, setSkill] = useState(category?.requiredSkill ?? '');
  const [active, setActive] = useState(category?.active ?? true);
  const s = useSave(onDone);
  const shownCode = category ? category.code : codeTouched ? code : categoryCode(name);
  return (
    <Panel
      title={category ? `Edit ${category.name}` : 'Add an incident category'}
      submit={category ? 'Save' : 'Create category'}
      error={s.error}
      pending={s.pending}
      onCancel={onDone}
      onSubmit={() => {
        if (!name.trim()) return s.setError('Enter a category name.');
        if (!skill.trim()) return s.setError('Name the skill a technician needs for it.');
        if (category)
          return s.save(`/api/admin/categories/${category.id}`, 'PATCH', {
            name: name.trim(),
            requiredSkill: skill.trim().toLowerCase(),
            active,
          });
        if (!CATEGORY_CODE.test(shownCode))
          return s.setError('The code is 2–32 capital letters, digits or underscores.');
        s.save('/api/admin/categories', 'POST', {
          code: shownCode,
          name: name.trim(),
          requiredSkill: skill.trim().toLowerCase(),
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>
          Name
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={label}>
          Code
          <input
            className={`${input} font-mono`}
            value={shownCode}
            disabled={!!category}
            onChange={(e) => {
              setCodeTouched(true);
              setCode(e.target.value.toUpperCase());
            }}
          />
        </label>
        <label className={label}>
          Required technician skill
          <input
            className={input}
            placeholder="e.g. network"
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
          />
        </label>
        {category && (
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="accent-[var(--primary)]"
            />
            Active
          </label>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Categories are data, not code: a new one is used by classification and skill-based
        assignment straight away.
      </p>
    </Panel>
  );
}

export function PolicyForm({
  policy,
  services,
  taken,
  onDone,
}: {
  policy?: {
    id: string;
    name: string;
    service: { id: string } | null;
    warningRatio: number;
    targets: Targets;
  };
  services: { id: string; name: string }[];
  /** Occupied targets, excluding the policy being edited. */
  taken: { serviceIds: string[]; hasDefault: boolean };
  onDone: () => void;
}) {
  // One default policy and one policy per service: only offer targets that are still free.
  const isDefault = policy?.service === null;
  const choices = isDefault ? [] : services.filter((sv) => !taken.serviceIds.includes(sv.id));
  const offerDefault = isDefault || !taken.hasDefault;
  const [name, setName] = useState(policy?.name ?? '');
  const [serviceId, setServiceId] = useState<string>(
    policy ? (policy.service?.id ?? '') : offerDefault ? '' : (choices[0]?.id ?? ''),
  );
  const [warn, setWarn] = useState(String(Math.round((policy?.warningRatio ?? 0.75) * 100)));
  const [targets, setTargets] = useState(() =>
    (
      policy?.targets ??
      PRIORITIES.map((priority, i) => ({
        priority,
        responseMinutes: [5, 15, 60, 240][i]!,
        resolutionMinutes: [30, 120, 480, 1440][i]!,
      }))
    ).map((t) => ({
      ...t,
      responseMinutes: String(t.responseMinutes),
      resolutionMinutes: String(t.resolutionMinutes),
    })),
  );
  const s = useSave(onDone);
  const setTarget = (p: string, key: 'responseMinutes' | 'resolutionMinutes', v: string) =>
    setTargets((ts) => ts.map((t) => (t.priority === p ? { ...t, [key]: v } : t)));
  return (
    <Panel
      title={policy ? `Edit ${policy.name}` : 'Add an SLA policy'}
      submit={policy ? 'Save' : 'Create policy'}
      error={s.error}
      pending={s.pending}
      onCancel={onDone}
      onSubmit={() => {
        if (!name.trim()) return s.setError('Name the policy.');
        const ratio = Number(warn) / 100;
        const numericTargets: Targets = targets.map((t) => ({
          ...t,
          responseMinutes: Number(t.responseMinutes),
          resolutionMinutes: Number(t.resolutionMinutes),
        }));
        const problem = targetErrors(numericTargets, ratio);
        if (problem) return s.setError(problem);
        const body = {
          name: name.trim(),
          serviceId: serviceId || null,
          warningRatio: ratio,
          targets: numericTargets,
        };
        if (policy) s.save(`/api/admin/sla-policies/${policy.id}`, 'PUT', body);
        else s.save('/api/admin/sla-policies', 'POST', body);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>
          Name
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={label}>
          Applies to
          <select
            className={input}
            value={serviceId}
            disabled={isDefault}
            aria-describedby={isDefault ? 'policy-target-help' : undefined}
            onChange={(e) => setServiceId(e.target.value)}
          >
            {offerDefault && (
              <option value="">Every service without its own policy (default)</option>
            )}
            {choices.map((sv) => (
              <option key={sv.id} value={sv.id}>
                {sv.name}
              </option>
            ))}
          </select>
          {isDefault && (
            <span id="policy-target-help" className="text-xs font-normal text-muted-foreground">
              The default policy must remain to cover services without their own policy.
            </span>
          )}
        </label>
        <label className={label}>
          Warn at (% of the window used)
          <input
            type="number"
            min={1}
            max={99}
            className={input}
            value={warn}
            onChange={(e) => setWarn(e.target.value)}
          />
        </label>
      </div>
      <table className="w-full table-fixed text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="w-14 pr-2 align-bottom font-medium">
              Priority
            </th>
            <th scope="col" className="pr-2 align-bottom font-medium">
              Respond within (min)
            </th>
            <th scope="col" className="align-bottom font-medium">
              Resolve within (min)
            </th>
          </tr>
        </thead>
        <tbody>
          {targets.map((t) => (
            <tr key={t.priority}>
              <th scope="row" className="pr-2 text-left font-medium">
                {t.priority}
              </th>
              <td className="pr-2">
                <input
                  aria-label={`${t.priority} response minutes`}
                  type="number"
                  min={1}
                  className={`${input} tabular`}
                  value={t.responseMinutes}
                  onChange={(e) => setTarget(t.priority, 'responseMinutes', e.target.value)}
                />
              </td>
              <td>
                <input
                  aria-label={`${t.priority} resolution minutes`}
                  type="number"
                  min={1}
                  className={`${input} tabular`}
                  value={t.resolutionMinutes}
                  onChange={(e) => setTarget(t.priority, 'resolutionMinutes', e.target.value)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">
        New incidents use the new targets. Running incidents keep the deadlines they were given.
      </p>
    </Panel>
  );
}

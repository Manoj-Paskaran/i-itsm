import type { AuthUser } from '@itsm/contracts';

export type Role = AuthUser['role'];
export const ROLES: { value: Role; label: string }[] = [
  { value: 'EMPLOYEE', label: 'Employee' },
  { value: 'TECHNICIAN', label: 'Technician' },
  { value: 'TEAM_LEAD', label: 'Team lead' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'IT_MANAGER', label: 'IT manager' },
];
/** Roles that work incidents and so carry skills, capacity and experience. */
export const hasTechnicianProfile = (role: Role) => role === 'TECHNICIAN' || role === 'TEAM_LEAD';

export const splitSkills = (text: string) => [
  ...new Set(
    text
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  ),
];

export interface UserForm {
  name: string;
  email: string;
  password: string;
  role: Role;
  department: string;
  skills: string;
  maxActiveIncidents: string;
  experienceYears: string;
}
type Result<T> = { ok: true; body: T } | { ok: false; error: string };

/** Body for POST /api/admin/users; technician fields only for roles that work incidents. */
export function createUserBody(f: UserForm): Result<Record<string, unknown>> {
  if (!f.name.trim()) return { ok: false, error: 'Enter a name.' };
  if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return { ok: false, error: 'Enter a valid email.' };
  if (f.password.length < 8)
    return { ok: false, error: 'The password needs at least 8 characters.' };
  const body: Record<string, unknown> = {
    name: f.name.trim(),
    email: f.email.trim().toLowerCase(),
    password: f.password,
    role: f.role,
  };
  // Only employees carry a department, and for them it is required.
  if (f.role === 'EMPLOYEE') {
    if (!f.department.trim()) return { ok: false, error: 'Enter the employee’s department.' };
    body.department = f.department.trim();
  }
  if (hasTechnicianProfile(f.role)) {
    const skills = splitSkills(f.skills);
    const capacity = Number(f.maxActiveIncidents);
    const years = Number(f.experienceYears);
    if (!skills.length) return { ok: false, error: 'Give at least one skill.' };
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 20)
      return { ok: false, error: 'Capacity is a whole number from 1 to 20.' };
    if (!Number.isFinite(years) || years < 0 || years > 50)
      return { ok: false, error: 'Experience is between 0 and 50 years.' };
    Object.assign(body, { skills, maxActiveIncidents: capacity, experienceYears: years });
  }
  return { ok: true, body };
}

export const CATEGORY_CODE = /^[A-Z][A-Z0-9_]{1,31}$/;
/** "Data centre power" → "DATA_CENTRE_POWER", the code format the API requires. */
export const categoryCode = (name: string) =>
  name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 'C_$1')
    .slice(0, 32);

export type Targets = {
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  responseMinutes: number;
  resolutionMinutes: number;
}[];
export const PRIORITIES = ['P1', 'P2', 'P3', 'P4'] as const;

/** An SLA policy is usable only if every priority has positive targets and resolution never comes before response. */
export function targetErrors(targets: Targets, warningRatio: number) {
  if (!(warningRatio > 0 && warningRatio < 1))
    return 'The warning point must be between 1% and 99%.';
  for (const p of PRIORITIES) {
    const t = targets.find((x) => x.priority === p);
    if (!t) return `${p} needs targets.`;
    if (!(t.responseMinutes > 0) || !(t.resolutionMinutes > 0))
      return `${p} targets must be above zero.`;
    if (t.resolutionMinutes < t.responseMinutes)
      return `${p} resolution can't be shorter than its response.`;
  }
  return null;
}

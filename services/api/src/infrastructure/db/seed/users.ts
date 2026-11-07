import { z } from 'zod';
import { Role } from '../../../domain/users/index.js';

interface SeedUser {
  name: string;
  email: string;
  role: Role;
  department?: string;
  skills?: string[];
  maxActiveIncidents?: number;
  experienceYears?: number;
  team?: string[];
}

export interface DemoEmailOverride {
  readonly from: string;
  readonly to: string;
}

/** Pure demo identities, in creation order so team members exist before their leads. */
export function buildSeedUsers(override?: DemoEmailOverride): SeedUser[] {
  const users: SeedUser[] = [];
  function add(name: string, role: Role, extra: Partial<SeedUser> = {}): void {
    const email = `${name.split(' ')[0]!.toLowerCase()}@itsm.demo`;
    users.push({ name, role, ...extra, email: email === override?.from ? override.to : email });
  }
  for (const [name, department] of [
    ['Priya Sharma', 'Finance'],
    ['Rahul Verma', 'Sales'],
    ['Neha Gupta', 'HR'],
    ['Arun Pillai', 'Operations'],
  ] as const)
    add(name, Role.EMPLOYEE, { department });
  for (const [name, skills, cap, years] of [
    ['Asha Iyer', ['database', 'network'], 5, 6],
    ['Ben Thomas', ['network', 'hardware'], 4, 3],
    ['Farah Ali', ['application', 'software'], 5, 4],
    ['Gopal Das', ['cloud', 'storage'], 4, 5],
    ["Irene D'Souza", ['security', 'authentication'], 4, 7],
  ] as const)
    add(name, Role.TECHNICIAN, {
      skills: [...skills],
      maxActiveIncidents: cap,
      experienceYears: years,
    });
  add('Chen Wei', Role.TEAM_LEAD, {
    skills: ['database', 'cloud'],
    maxActiveIncidents: 3,
    experienceYears: 10,
    team: ['asha', 'gopal'],
  });
  add('Divya Nair', Role.TEAM_LEAD, {
    skills: ['application', 'authentication'],
    maxActiveIncidents: 3,
    experienceYears: 9,
    team: ['ben', 'farah', 'irene'],
  });
  for (const name of ['Arjun Mehta', 'Sara Khan']) add(name, Role.ADMIN);
  for (const name of ['Kavya Reddy', 'Vikram Rao']) add(name, Role.IT_MANAGER);
  return users;
}

/** Validate before the seed script connects to or clears the demo database. */
export function parseDemoEmailOverride(value?: string): DemoEmailOverride | undefined {
  if (!value?.trim()) return undefined;
  const parts = value.split('=').map((part) => part.trim().toLowerCase());
  const [from, to] = parts;
  if (
    parts.length !== 2 ||
    !z.email().safeParse(from).success ||
    !z.email().safeParse(to).success
  ) {
    throw new Error('DEMO_EMAIL_OVERRIDE must look like seed@itsm.demo=you@example.com');
  }
  if (!buildSeedUsers().some((user) => user.email === from)) {
    throw new Error(
      'DEMO_EMAIL_OVERRIDE must look like seed@itsm.demo=you@example.com; source must be a seeded user',
    );
  }
  return { from: from!, to: to! };
}

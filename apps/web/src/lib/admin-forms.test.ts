import { describe, expect, it } from 'vitest';
import {
  categoryCode,
  createUserBody,
  splitSkills,
  targetErrors,
  type UserForm,
} from './admin-forms';

const form: UserForm = {
  name: 'Ravi Kumar',
  email: 'Ravi@ITSM.demo',
  password: 'demo12345',
  role: 'TECHNICIAN',
  department: '',
  skills: 'network, Database, network',
  maxActiveIncidents: '4',
  experienceYears: '3',
};
const targets = [
  { priority: 'P1' as const, responseMinutes: 5, resolutionMinutes: 30 },
  { priority: 'P2' as const, responseMinutes: 15, resolutionMinutes: 120 },
  { priority: 'P3' as const, responseMinutes: 60, resolutionMinutes: 480 },
  { priority: 'P4' as const, responseMinutes: 240, resolutionMinutes: 1440 },
];

describe('admin forms', () => {
  it('sendsTechnicianFieldsOnlyForRolesThatWorkIncidents', () => {
    expect(createUserBody(form)).toEqual({
      ok: true,
      body: {
        name: 'Ravi Kumar',
        email: 'ravi@itsm.demo',
        password: 'demo12345',
        role: 'TECHNICIAN',
        skills: ['network', 'database'],
        maxActiveIncidents: 4,
        experienceYears: 3,
      },
    });
    const employee = createUserBody({ ...form, role: 'EMPLOYEE', department: 'Finance' });
    expect(employee.ok && employee.body).toEqual({
      name: 'Ravi Kumar',
      email: 'ravi@itsm.demo',
      password: 'demo12345',
      role: 'EMPLOYEE',
      department: 'Finance',
    });
  });
  it('requiresADepartmentForEmployeesOnly', () =>
    expect(createUserBody({ ...form, role: 'EMPLOYEE' }).ok).toBe(false));
  it('rejectsAShortPasswordOrMissingSkills', () => {
    expect(createUserBody({ ...form, password: 'short' }).ok).toBe(false);
    expect(createUserBody({ ...form, skills: ' , ' }).ok).toBe(false);
    expect(createUserBody({ ...form, maxActiveIncidents: '0' }).ok).toBe(false);
  });
  it('dedupesAndLowercasesSkills', () =>
    expect(splitSkills('VPN, vpn ,  Email')).toEqual(['vpn', 'email']));
  it('derivesACategoryCodeTheApiAccepts', () => {
    expect(categoryCode('Data centre power')).toBe('DATA_CENTRE_POWER');
    expect(categoryCode('5G network')).toBe('C_5G_NETWORK');
  });
  it('acceptsCompleteSlaTargets', () => expect(targetErrors(targets, 0.75)).toBeNull());
  it('rejectsAResolutionShorterThanItsResponse', () =>
    expect(
      targetErrors(
        [{ priority: 'P1', responseMinutes: 30, resolutionMinutes: 10 }, ...targets.slice(1)],
        0.75,
      ),
    ).toMatch(/P1 resolution/));
  it('rejectsAWarningPointOutsideTheWindow', () =>
    expect(targetErrors(targets, 1)).toMatch(/warning/));
});

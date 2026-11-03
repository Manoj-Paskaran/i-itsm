import { describe, expect, it } from 'vitest';
import { asUserId, asItServiceId, SkillTag } from '../shared/index.js';
import {
  InvalidInputException,
  TechnicianUnavailableException,
  UnauthorizedOperationException,
  WorkloadExceededException,
} from '../exceptions/index.js';
import {
  Admin,
  Availability,
  Employee,
  ITManager,
  Permission as P,
  Role,
  TeamLead,
  Technician,
  UserFactory,
  type NewUserDraft,
} from './index.js';
const common = {
  id: asUserId('u1'),
  name: '  Name  ',
  email: 'name@example.com',
  passwordHash: 'hash',
};
const tech = {
  skills: ['network'],
  maxActiveIncidents: 2,
  availability: Availability.AVAILABLE,
  experienceYears: 3,
};
const cases = [
  [
    Role.EMPLOYEE,
    Employee,
    [P.INCIDENT_REPORT, P.INCIDENT_VIEW_OWN, P.INCIDENT_VERIFY_OWN, P.INCIDENT_FEEDBACK],
  ],
  [Role.TECHNICIAN, Technician, [P.INCIDENT_VIEW_ASSIGNED, P.INCIDENT_WORK]],
  [
    Role.TEAM_LEAD,
    TeamLead,
    [
      P.INCIDENT_VIEW_ASSIGNED,
      P.INCIDENT_WORK,
      P.INCIDENT_ASSIGN,
      P.REPORTS_VIEW,
      P.INCIDENT_VIEW_ALL,
    ],
  ],
  [
    Role.ADMIN,
    Admin,
    [P.INCIDENT_VIEW_ALL, P.INCIDENT_ASSIGN, P.CONFIG_MANAGE, P.REPORTS_VIEW, P.AUDIT_VIEW],
  ],
  [
    Role.IT_MANAGER,
    ITManager,
    [P.INCIDENT_VIEW_ALL, P.INCIDENT_ASSIGN, P.REPORTS_VIEW, P.AUDIT_VIEW],
  ],
] as const;
describe('users', () => {
  it.each(cases)('creates, authorises and round-trips %s', (role, cls, permissions) => {
    const u = UserFactory.create({ ...common, ...tech, department: 'IT', role });
    expect(u).toBeInstanceOf(cls);
    expect([...u.permissions()].sort()).toEqual([...permissions].sort());
    expect(UserFactory.rehydrate(u.toSnapshot()).toSnapshot()).toEqual(u.toSnapshot());
    expect(u.name()).toBe('Name');
    u.deactivate();
    expect(u.can(permissions[0])).toBe(false);
    expect(() => u.require(permissions[0])).toThrow(UnauthorizedOperationException);
    u.activate();
    expect(u.can(permissions[0])).toBe(true);
  });
  it('keeps permission sets immutable through forEach', () => {
    const user = UserFactory.create({ ...common, role: Role.ADMIN });
    user.permissions().forEach((_value, _again, permissions) => {
      expect('add' in permissions).toBe(false);
    });
    expect(user.can(P.CONFIG_MANAGE)).toBe(true);
  });
  it('rejects empty and overlong names and invalid email', () => {
    for (const draft of [
      { ...common, name: ' ' },
      { ...common, name: 'x'.repeat(101) },
      { ...common, email: 'bad' },
    ])
      expect(() => UserFactory.create({ ...draft, role: Role.ADMIN })).toThrow(
        InvalidInputException,
      );
  });
  it('rejects missing department and skills', () => {
    expect(() => UserFactory.create({ ...common, role: Role.EMPLOYEE })).toThrow(
      InvalidInputException,
    );
    for (const skills of [undefined, []]) {
      const draft: NewUserDraft = {
        ...common,
        role: Role.TECHNICIAN,
        maxActiveIncidents: 2,
        ...(skills ? { skills } : {}),
      };
      expect(() => UserFactory.create(draft)).toThrow(InvalidInputException);
    }
  });
  it('rejects invalid capacity and experience', () => {
    for (const n of [0, 21, 1.5])
      expect(() =>
        UserFactory.create({ ...common, ...tech, role: Role.TECHNICIAN, maxActiveIncidents: n }),
      ).toThrow(InvalidInputException);
    for (const n of [-1, 51])
      expect(() =>
        UserFactory.create({ ...common, ...tech, role: Role.TECHNICIAN, experienceYears: n }),
      ).toThrow(InvalidInputException);
  });
  it('enforces skill and workload rules', () => {
    const u = UserFactory.create({ ...common, ...tech, role: Role.TECHNICIAN }) as Technician;
    const network = SkillTag.of('network');
    expect(u.hasSkill(SkillTag.of('NETWORK'))).toBe(true);
    expect(() => u.removeSkill(network)).toThrow(InvalidInputException);
    u.addSkill(SkillTag.of('database'));
    u.removeSkill(network);
    expect(u.hasSkill(network)).toBe(false);
    expect(() => u.ensureCanTake(2)).toThrow(WorkloadExceededException);
    u.setAvailability(Availability.BUSY);
    expect(() => u.ensureCanTake(0)).toThrow(TechnicianUnavailableException);
    const service = asItServiceId('s');
    expect(u.experienceWith(service)).toBe(0);
    u.recordResolvedFor(service);
    expect(u.experienceWith(service)).toBe(1);
  });
  it('rejects a team lead supervising themself', () => {
    const lead = UserFactory.create({ ...common, ...tech, role: Role.TEAM_LEAD }) as TeamLead;
    expect(() => lead.addMember(common.id)).toThrow(InvalidInputException);
    const id = asUserId('u2');
    lead.addMember(id);
    expect(lead.supervises(id)).toBe(true);
    lead.removeMember(id);
    expect(lead.supervises(id)).toBe(false);
  });
});

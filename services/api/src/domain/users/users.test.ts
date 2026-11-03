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
    expect(user.permissions().size).toBe(5);
    const visited: P[] = [];
    user.permissions().forEach((_value, _again, permissions) => {
      visited.push(_value);
      expect('add' in permissions).toBe(false);
    });
    expect(visited).toHaveLength(user.permissions().size);
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
  it('preserves employee department and user rename through snapshots', () => {
    const employee = UserFactory.create({ ...common, department: 'IT', role: Role.EMPLOYEE });
    expect(employee.toSnapshot()).toMatchObject({ department: 'IT' });
    employee.rename('New Name');
    expect(employee.name()).toBe('New Name');
    expect(employee.toSnapshot().name).toBe('New Name');
    expect(() => employee.rename('x'.repeat(101))).toThrow(/name/);
  });
  it('changes employee department in snapshots', () => {
    const employee = UserFactory.create({
      ...common,
      department: 'IT',
      role: Role.EMPLOYEE,
    }) as Employee;
    employee.changeDepartment('Finance');
    expect(employee.toSnapshot()).toMatchObject({ department: 'Finance' });
    expect(UserFactory.rehydrate(employee.toSnapshot()).toSnapshot()).toEqual(
      employee.toSnapshot(),
    );
  });
  it('rehydrates technicians with their saved availability', () => {
    const snapshot = {
      ...common,
      ...tech,
      active: true,
      serviceHistory: [],
      availability: Availability.BUSY,
      role: Role.TECHNICIAN,
    } as const;
    const technician = UserFactory.rehydrate(snapshot);
    expect(technician).toBeInstanceOf(Technician);
    expect((technician as Technician).availabilityStatus()).toBe(Availability.BUSY);
    const corrupt = { ...snapshot, availability: 'ON_MARS' as Availability };
    expect(() => UserFactory.rehydrate(corrupt)).toThrow(/availability/);
  });
  it('rehydrates team leads without a team as an empty team', () => {
    const lead = UserFactory.create({ ...common, ...tech, role: Role.TEAM_LEAD });
    expect(lead.toSnapshot()).toMatchObject({ team: [] });
  });
  it('rejects rehydrating a team lead snapshot with another role', () => {
    const snapshot = {
      ...common,
      ...tech,
      active: true,
      serviceHistory: [],
      role: Role.TECHNICIAN,
    } as const;
    expect(() => TeamLead.rehydrate(snapshot)).toThrow(InvalidInputException);
  });
  it('rejects unsupported roles when creating or rehydrating users', () => {
    const invalidRole = 'UNKNOWN' as Role;
    expect(() => UserFactory.create({ ...common, role: invalidRole })).toThrow(/role/);
    expect(() => UserFactory.rehydrate({ ...common, role: invalidRole } as never)).toThrow(/role/);
  });
  it('applies technician availability and validates capacity boundaries', () => {
    const technician = UserFactory.create({
      ...common,
      ...tech,
      role: Role.TECHNICIAN,
    }) as Technician;
    expect(technician.role()).toBe(Role.TECHNICIAN);
    expect([...technician.skills()].map((skill) => skill.value)).toEqual(['network']);
    expect(technician.hasCapacity(1)).toBe(true);
    expect(technician.hasCapacity(2)).toBe(false);
    technician.setAvailability(Availability.BUSY);
    expect(technician.availabilityStatus()).toBe(Availability.BUSY);
    expect(technician.isAvailable()).toBe(false);
    expect(() => technician.setAvailability('INVALID' as Availability)).toThrow(/availability/);
    expect(() => technician.hasCapacity(-1)).toThrow(/activeCount/);
  });
});

it('validates technician capacity and experience updates', () => {
  const user = UserFactory.create({ ...common, ...tech, role: Role.TECHNICIAN });
  if (!(user instanceof Technician)) throw new Error('Expected technician');
  user.setCapacity(5);
  user.setExperienceYears(7);
  expect(user.capacity()).toBe(5);
  expect(user.experience()).toBe(7);
  expect(() => user.setCapacity(0)).toThrow(InvalidInputException);
  expect(() => user.setExperienceYears(-1)).toThrow(InvalidInputException);
});

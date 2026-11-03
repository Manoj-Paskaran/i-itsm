import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { InvalidInputException } from '../../../domain/exceptions/index.js';
import { asUserId, Email, SkillTag } from '../../../domain/shared/index.js';
import { Availability, Role, Technician, UserFactory } from '../../../domain/users/index.js';
import { seed } from '../testing/fixtures.js';
import { startTestPostgres, type TestPostgres } from '../testing/postgres-container.js';

let postgres: TestPostgres;
let f: Awaited<ReturnType<typeof seed>>;
beforeAll(async () => {
  postgres = await startTestPostgres();
});
afterAll(async () => {
  await postgres?.stop();
});
beforeEach(async () => {
  await postgres.clear();
  f = await seed(postgres);
});

it('roundTripsEveryUserRole', async () => {
  const common = { name: 'Person', passwordHash: 'hash', active: true };
  const employee = UserFactory.create({
    ...common,
    id: asUserId(randomUUID()),
    email: 'employee@example.com',
    role: Role.EMPLOYEE,
    department: 'Finance',
  });
  const tech = UserFactory.create({
    ...common,
    id: asUserId(randomUUID()),
    email: 'technician@example.com',
    role: Role.TECHNICIAN,
    skills: ['database', 'network'],
    maxActiveIncidents: 5,
    availability: Availability.BUSY,
    experienceYears: 4,
    serviceHistory: [[f.service.id(), 3]],
  }) as Technician;
  const lead = UserFactory.create({
    ...common,
    id: asUserId(randomUUID()),
    email: 'lead@example.com',
    role: Role.TEAM_LEAD,
    skills: ['network'],
    maxActiveIncidents: 5,
    experienceYears: 7,
    serviceHistory: [[f.service.id(), 2]],
    team: [tech.id()],
  });
  const admin = UserFactory.create({
    ...common,
    id: asUserId(randomUUID()),
    email: 'admin@example.com',
    role: Role.ADMIN,
  });
  const manager = UserFactory.create({
    ...common,
    id: asUserId(randomUUID()),
    email: 'manager@example.com',
    role: Role.IT_MANAGER,
  });
  const users = [employee, tech, lead, admin, manager];
  for (const user of users) {
    await f.userRepo.save(user);
  }
  for (const user of users) {
    expect((await f.userRepo.findById(user.id()))?.toSnapshot()).toEqual(user.toSnapshot());
    expect((await f.userRepo.findByEmail(Email.of(user.toSnapshot().email)))?.toSnapshot()).toEqual(
      user.toSnapshot(),
    );
    expect((await f.userRepo.listByRole(user.role())).map((item) => item.id())).toContain(
      user.id(),
    );
  }
  expect((await f.userRepo.listTechnicians()).map((item) => item.id()).sort()).toEqual(
    [f.technician.id(), tech.id(), lead.id()].sort(),
  );
  tech.removeSkill(SkillTag.of('database'));
  tech.recordResolvedFor(f.service.id());
  await f.userRepo.save(tech);
  expect((await f.userRepo.findById(tech.id()))?.toSnapshot()).toEqual(tech.toSnapshot());
});
it('rejectsDuplicateEmail', async () => {
  const user = UserFactory.create({
    id: asUserId(randomUUID()),
    name: 'Duplicate',
    email: f.reporter.toSnapshot().email,
    passwordHash: 'hash',
    role: Role.ADMIN,
  });
  const save = f.userRepo.save(user);
  await expect(save).rejects.toBeInstanceOf(InvalidInputException);
  await expect(save).rejects.toMatchObject({
    code: 'INVALID_INPUT',
    details: { field: 'email', value: user.toSnapshot().email },
  });
  expect(await f.userRepo.findById(user.id())).toBeNull();
});

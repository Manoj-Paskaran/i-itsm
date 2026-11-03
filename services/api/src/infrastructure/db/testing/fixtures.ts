import { randomUUID } from 'node:crypto';
import { Category, ItService } from '../../../domain/catalog/index.js';
import { Actor, Incident } from '../../../domain/incidents/index.js';
import {
  asCategoryId,
  asItServiceId,
  asUserId,
  Duration,
  Impact,
  Instant,
  Priority,
  Urgency,
} from '../../../domain/shared/index.js';
import { SlaTarget } from '../../../domain/sla/index.js';
import { Availability, Role, Technician, UserFactory } from '../../../domain/users/index.js';
import {
  DrizzleCategoryRepository,
  DrizzleItServiceRepository,
} from '../repositories/catalog.repositories.js';
import { DrizzleIncidentRepository } from '../repositories/incident.repository.js';
import { DrizzleUserRepository } from '../repositories/user.repository.js';
import type { TestPostgres } from './postgres-container.js';

export const at = Instant.fromIso('2026-11-03T09:00:00.000Z');
export const sla = {
  target: SlaTarget.of(Duration.ofMinutes(15), Duration.ofHours(2)),
  warningRatio: 0.75,
};
export async function seed(postgres: TestPostgres) {
  const userRepo = new DrizzleUserRepository(postgres.db);
  const incidents = new DrizzleIncidentRepository(postgres.db);
  const service = ItService.create({
    id: asItServiceId(randomUUID()),
    name: 'WiFi',
    criticality: 3,
    active: true,
  });
  const category = Category.create({
    id: asCategoryId(randomUUID()),
    code: 'NETWORK',
    name: 'Network',
    requiredSkill: 'network',
    active: true,
  });
  const reporter = UserFactory.create({
    id: asUserId(randomUUID()),
    name: 'Reporter',
    email: 'reporter@example.com',
    passwordHash: 'hash',
    role: Role.EMPLOYEE,
    department: 'IT',
  });
  const technician = UserFactory.create({
    id: asUserId(randomUUID()),
    name: 'Technician',
    email: 'tech@example.com',
    passwordHash: 'hash',
    role: Role.TECHNICIAN,
    skills: ['network'],
    maxActiveIncidents: 20,
    availability: Availability.AVAILABLE,
    experienceYears: 2,
  }) as Technician;
  await new DrizzleItServiceRepository(postgres.db).save(service);
  await new DrizzleCategoryRepository(postgres.db).save(category);
  await userRepo.save(reporter);
  await userRepo.save(technician);
  async function report() {
    const identity = await incidents.nextIdentity();
    return Incident.report({
      ...identity,
      title: 'WiFi unavailable',
      description: 'Unable to connect to the office WiFi.',
      reporterId: reporter.id(),
      serviceId: service.id(),
      impact: Impact.of(2),
      urgency: Urgency.of(3),
      affectedUsers: 4,
      at,
    });
  }
  function classify(incident: Incident) {
    incident.classify(category, Priority.P2, sla, Actor.system(), at);
  }
  function assign(incident: Incident) {
    incident.assign(technician, 0, Actor.system(), at);
  }
  return {
    userRepo,
    incidents,
    service,
    category,
    reporter,
    technician,
    report,
    classify,
    assign,
    reporterActor: Actor.user(reporter),
    techActor: Actor.user(technician),
  };
}

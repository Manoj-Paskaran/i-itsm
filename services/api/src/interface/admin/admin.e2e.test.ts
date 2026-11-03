/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AuditLogEntrySchema, IncidentDetailSchema } from '@itsm/contracts';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { InMemoryReportQueries } from '../../application/testing/in-memory-report-queries.js';
import { InMemoryNotificationRepository } from '../../application/testing/in-memory-notification-repository.js';
import { InMemoryIncidentRepository } from '../../application/testing/in-memory-incident-repository.js';
import { InMemoryUserRepository } from '../../application/testing/in-memory-user-repository.js';
import { InMemoryServiceRepository } from '../../application/testing/in-memory-service-repository.js';
import { InMemoryCategoryRepository } from '../../application/testing/in-memory-category-repository.js';
import { InMemorySlaPolicyRepository } from '../../application/testing/in-memory-sla-policy-repository.js';
import { InMemoryAuditRepository } from '../../application/testing/in-memory-audit-repository.js';
import { Category, ItService } from '../../domain/catalog/index.js';
import { asCategoryId, asItServiceId, asSlaPolicyId, asUserId } from '../../domain/shared/index.js';
import { SlaPolicy } from '../../domain/sla/index.js';
import {
  Admin,
  Availability,
  Employee,
  ITManager,
  Role,
  Technician,
} from '../../domain/users/index.js';
import { JoseTokenService } from '../../infrastructure/auth/token.service.js';
import { loadEnv } from '../../infrastructure/config/env.js';
import {
  REPORT_QUERIES,
  AUDIT_REPOSITORY,
  NOTIFICATION_REPOSITORY,
  CATEGORY_REPOSITORY,
  INCIDENT_REPOSITORY,
  IT_SERVICE_REPOSITORY,
  SLA_POLICY_REPOSITORY,
  USER_REPOSITORY,
} from '../../ports/index.js';
import { configureApp } from '../configure-app.js';

const ids = {
  employee: asUserId('00000000-0000-4000-8000-000000000001'),
  tech: asUserId('00000000-0000-4000-8000-000000000003'),
  admin: asUserId('00000000-0000-4000-8000-000000000004'),
  manager: asUserId('00000000-0000-4000-8000-000000000008'),
  service: asItServiceId('00000000-0000-4000-8000-000000000005'),
  category: asCategoryId('00000000-0000-4000-8000-000000000006'),
};
const common = { name: 'User', passwordHash: 'hash', active: true };
const employee = Employee.rehydrate({
  ...common,
  id: ids.employee,
  email: 'employee@example.com',
  role: Role.EMPLOYEE,
  department: 'IT',
});
const technician = Technician.rehydrate({
  ...common,
  id: ids.tech,
  email: 'tech@example.com',
  role: Role.TECHNICIAN,
  skills: ['network'],
  maxActiveIncidents: 5,
  availability: Availability.AVAILABLE,
  experienceYears: 2,
  serviceHistory: [],
});
const admin = Admin.rehydrate({ ...common, id: ids.admin, email: 'admin@example.com' });
const manager = ITManager.rehydrate({ ...common, id: ids.manager, email: 'manager@example.com' });
const policy = {
  name: 'Custom',
  serviceId: null,
  warningRatio: 0.8,
  targets: (['P1', 'P2', 'P3', 'P4'] as const).map((priority) => ({
    priority,
    responseMinutes: 10,
    resolutionMinutes: 60,
  })),
};

describe('admin HTTP', () => {
  let app: INestApplication;
  let employeeToken: string, adminToken: string, managerToken: string;
  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  const auth = (token: string) => `Bearer ${token}`;
  beforeEach(async () => {
    const users = new InMemoryUserRepository(),
      services = new InMemoryServiceRepository(),
      categories = new InMemoryCategoryRepository(),
      policies = new InMemorySlaPolicyRepository();
    for (const u of [employee, technician, admin, manager]) await users.save(u);
    await services.save(
      ItService.create({ id: ids.service, name: 'WiFi', criticality: 3, active: true }),
    );
    await categories.save(
      Category.create({
        id: ids.category,
        code: 'NETWORK',
        name: 'Network',
        requiredSkill: 'network',
        active: true,
      }),
    );
    await policies.save(
      SlaPolicy.specDefault(asSlaPolicyId('00000000-0000-4000-8000-000000000007')),
    );
    const incidents = new InMemoryIncidentRepository();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REPORT_QUERIES)
      .useValue(new InMemoryReportQueries([], [], []))
      .overrideProvider(NOTIFICATION_REPOSITORY)
      .useValue(new InMemoryNotificationRepository())
      .overrideProvider(INCIDENT_REPOSITORY)
      .useValue(incidents)
      .overrideProvider(USER_REPOSITORY)
      .useValue(users)
      .overrideProvider(IT_SERVICE_REPOSITORY)
      .useValue(services)
      .overrideProvider(CATEGORY_REPOSITORY)
      .useValue(categories)
      .overrideProvider(SLA_POLICY_REPOSITORY)
      .useValue(policies)
      .overrideProvider(AUDIT_REPOSITORY)
      .useValue(new InMemoryAuditRepository(incidents))
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    const tokens = new JoseTokenService(loadEnv());
    [employeeToken, adminToken, managerToken] = (await Promise.all(
      [employee, admin, manager].map(async (u) => (await tokens.issueAccess(u)).token),
    )) as [string, string, string];
  });
  afterEach(async () => {
    await app?.close();
  });

  it('adminCreatesCategoryThenIncidentUsesIt', async () => {
    await request(server())
      .post('/api/admin/categories')
      .set('Authorization', auth(adminToken))
      .send({ code: 'PRINTING', name: 'Printing', requiredSkill: 'printing' })
      .expect(201);
    const response = await request(server())
      .post('/api/incidents')
      .set('Authorization', auth(employeeToken))
      .send({
        title: 'Printing queue is stuck on floor 3',
        description: 'Printing queue is stuck on floor 3',
        serviceId: ids.service,
        impact: 2,
        urgency: 2,
        affectedUsers: 5,
      })
      .expect(201);
    expect(IncidentDetailSchema.parse(response.body).category?.code).toBe('PRINTING');
  });
  it('employeeGets403OnAdmin', async () => {
    await request(server())
      .get('/api/admin/users')
      .set('Authorization', auth(employeeToken))
      .expect(403);
  });
  it('adminSwitchesAssignmentStrategy', async () => {
    const before = await request(server())
      .get('/api/admin/strategies')
      .set('Authorization', auth(adminToken))
      .expect(200);
    const target = (before.body.assignment.available as string[]).find(
      (name) => name !== before.body.assignment.active,
    )!;
    await request(server())
      .put('/api/admin/strategies')
      .set('Authorization', auth(adminToken))
      .send({ assignment: target })
      .expect(200);
    const after = await request(server())
      .get('/api/admin/strategies')
      .set('Authorization', auth(adminToken))
      .expect(200);
    expect(after.body.assignment.active).toBe(target);
  });
  it('managerSearchesAuditLog', async () => {
    await request(server())
      .post('/api/incidents')
      .set('Authorization', auth(employeeToken))
      .send({
        title: 'WiFi network unavailable',
        description: 'Office wifi network is unavailable',
        serviceId: ids.service,
        impact: 4,
        urgency: 4,
        affectedUsers: 20,
      })
      .expect(201);
    const all = await request(server())
      .get('/api/audit')
      .set('Authorization', auth(managerToken))
      .expect(200);
    expect(all.body.length).toBeGreaterThan(0);
    const action = AuditLogEntrySchema.parse(all.body[0]).action;
    const filtered = await request(server())
      .get(`/api/audit?action=${encodeURIComponent(action)}`)
      .set('Authorization', auth(managerToken))
      .expect(200);
    expect(filtered.body.length).toBeGreaterThan(0);
    for (const entry of filtered.body) {
      expect(AuditLogEntrySchema.parse(entry).action).toBe(action);
      expect(entry.incident.number).toMatch(/\S/);
    }
  });
  it('invalidSlaTargetsReturn400', async () => {
    await request(server())
      .post('/api/admin/sla-policies')
      .set('Authorization', auth(adminToken))
      .send({ ...policy, targets: policy.targets.slice(0, 2) })
      .expect(400);
  });
  it('unknownUserReturns404', async () => {
    await request(server())
      .patch('/api/admin/users/00000000-0000-4000-8000-0000000000ff')
      .set('Authorization', auth(adminToken))
      .send({ name: 'Nobody' })
      .expect(404);
  });
});

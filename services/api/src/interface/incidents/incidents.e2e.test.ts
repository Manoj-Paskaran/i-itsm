/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { IncidentDetailSchema, OverviewReportSchema } from '@itsm/contracts';
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
  other: asUserId('00000000-0000-4000-8000-000000000002'),
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
const other = Employee.rehydrate({
  ...common,
  id: ids.other,
  email: 'other@example.com',
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
const create = {
  title: 'WiFi network unavailable',
  description: 'Office wifi network is unavailable',
  serviceId: ids.service,
  impact: 4,
  urgency: 4,
  affectedUsers: 20,
};
describe('incident HTTP', () => {
  let app: INestApplication;
  let employeeToken: string,
    otherToken: string,
    techToken: string,
    adminToken: string,
    managerToken: string;
  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  const auth = (token: string) => `Bearer ${token}`;
  async function report() {
    const r = await request(server())
      .post('/api/incidents')
      .set('Authorization', auth(employeeToken))
      .send(create)
      .expect(201);
    return IncidentDetailSchema.parse(r.body);
  }
  beforeEach(async () => {
    const incidents = new InMemoryIncidentRepository(),
      users = new InMemoryUserRepository(),
      services = new InMemoryServiceRepository(),
      categories = new InMemoryCategoryRepository(),
      policies = new InMemorySlaPolicyRepository(),
      audit = new InMemoryAuditRepository();
    for (const u of [employee, other, technician, admin, manager]) await users.save(u);
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
      .useValue(audit)
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    const tokens = new JoseTokenService(loadEnv());
    [employeeToken, otherToken, techToken, adminToken, managerToken] = (await Promise.all(
      [employee, other, technician, admin, manager].map(
        async (u) => (await tokens.issueAccess(u)).token,
      ),
    )) as [string, string, string, string, string];
  });
  afterEach(async () => {
    await app?.close();
  });
  it('managerGetsOverview', async () => {
    const response = await request(server())
      .get('/api/reports/overview')
      .set('Authorization', auth(managerToken))
      .expect(200);
    expect(OverviewReportSchema.safeParse(response.body).success).toBe(true);
  });
  it('employeeGets403OnReports', async () => {
    await request(server())
      .get('/api/reports/overview')
      .set('Authorization', auth(employeeToken))
      .expect(403);
  });
  it('trendsRejectsTooManyDays400', async () => {
    await request(server())
      .get('/api/reports/trends?days=91')
      .set('Authorization', auth(managerToken))
      .expect(400);
  });
  it('listFiltersBySlaBreached', async () => {
    await report();
    const response = await request(server())
      .get('/api/incidents?sla=BREACHED')
      .set('Authorization', auth(adminToken))
      .expect(200);
    expect(response.body).toEqual([]);
  });
  it('reportingNotifiesAssignedTechnicianInbox', async () => {
    await report();
    const response = await request(server())
      .get('/api/notifications')
      .set('Authorization', auth(techToken))
      .expect(200);
    expect(response.body.unread).toBe(1);
    expect(response.body.items[0].title).toContain('assigned to you');
  });
  it('markReadClearsUnread', async () => {
    await report();
    const response = await request(server())
      .get('/api/notifications')
      .set('Authorization', auth(techToken));
    await request(server())
      .post(`/api/notifications/${response.body.items[0].id}/read`)
      .set('Authorization', auth(techToken))
      .expect(204);
    const after = await request(server())
      .get('/api/notifications')
      .set('Authorization', auth(techToken))
      .expect(200);
    expect(after.body.unread).toBe(0);
  });
  it('cannotReadOthersNotification404', async () => {
    await report();
    const response = await request(server())
      .get('/api/notifications')
      .set('Authorization', auth(techToken));
    await request(server())
      .post(`/api/notifications/${response.body.items[0].id}/read`)
      .set('Authorization', auth(otherToken))
      .expect(404);
  });
  it('inboxRequiresAuth401', async () => {
    await request(server()).get('/api/notifications').expect(401);
  });
  it('adminCanTriggerSweep', async () => {
    const response = await request(server())
      .post('/api/monitor/sweep')
      .set('Authorization', auth(adminToken))
      .expect(200);
    const report = response.body as Record<string, unknown>;
    for (const key of [
      'checked',
      'slaWarnings',
      'slaBreaches',
      'escalations',
      'skipped',
      'durationMs',
    ])
      expect(typeof report[key]).toBe('number');
  });
  it('employeeCannotTriggerSweep', async () => {
    await request(server())
      .post('/api/monitor/sweep')
      .set('Authorization', auth(employeeToken))
      .expect(403);
  });
  it('employeeReportsAndSeesAutoAssignment', async () => {
    const d = await report();
    expect(d.priority).toBeTruthy();
    expect(d.assignee?.id).toBe(ids.tech);
    expect(d.allowedActions).not.toContain('acknowledge');
  });
  it('technicianWalksLifecycleViaRest', async () => {
    const d = await report();
    for (const [path, token, body] of [
      ['acknowledge', techToken, {}],
      ['start', techToken, {}],
      ['notes', techToken, { text: 'Investigating' }],
      ['request-info', techToken, { question: 'Which office?' }],
      ['provide-info', employeeToken, { answer: 'Office A' }],
      ['resolve', techToken, { summary: 'Restarted router' }],
      ['verify', employeeToken, {}],
      ['feedback', employeeToken, { rating: 5 }],
      ['close', employeeToken, {}],
    ] as const) {
      const r = await request(server())
        .post(`/api/incidents/${d.id}/${path}`)
        .set('Authorization', auth(token))
        .send(body)
        .expect(200);
      const view = IncidentDetailSchema.parse(r.body);
      if (path === 'verify') expect(view.allowedActions).toContain('giveFeedback');
      if (path === 'feedback') expect(view.allowedActions).not.toContain('giveFeedback');
    }
    const audit = await request(server())
      .get(`/api/incidents/${d.id}/audit`)
      .set('Authorization', auth(employeeToken))
      .expect(200);
    const actions = (audit.body as Array<{ action: string }>).map((x) => x.action);
    expect(actions[0]).toBe('IncidentCreated');
    expect(actions.at(-1)).toBe('IncidentClosed');
  });
  it('offersFeedbackOnlyToTheReporterAfterVerification', async () => {
    const d = await report();
    for (const [path, token, body] of [
      ['acknowledge', techToken, {}],
      ['start', techToken, {}],
      ['resolve', techToken, { summary: 'Restarted router' }],
      ['verify', employeeToken, {}],
    ] as const)
      await request(server())
        .post(`/api/incidents/${d.id}/${path}`)
        .set('Authorization', auth(token))
        .send(body)
        .expect(200);
    const asTech = await request(server())
      .get(`/api/incidents/${d.id}`)
      .set('Authorization', auth(techToken))
      .expect(200);
    expect(IncidentDetailSchema.parse(asTech.body).allowedActions).not.toContain('giveFeedback');
  });
  it('letsTheReporterAddInformationToTheirOwnIncident', async () => {
    const d = await report();
    expect(d.allowedActions).toContain('addNote');
    const r = await request(server())
      .post(`/api/incidents/${d.id}/notes`)
      .set('Authorization', auth(employeeToken))
      .send({ text: 'It also fails on the guest network' })
      .expect(200);
    expect(IncidentDetailSchema.parse(r.body).notes.at(-1)?.text).toBe(
      'It also fails on the guest network',
    );
  });
  it('offersTheReporterProvideInfoNotAddNoteWhileInfoIsPending', async () => {
    const d = await report();
    for (const [path, body] of [
      ['acknowledge', {}],
      ['start', {}],
      ['request-info', { question: 'Which office?' }],
    ] as const)
      await request(server())
        .post(`/api/incidents/${d.id}/${path}`)
        .set('Authorization', auth(techToken))
        .send(body)
        .expect(200);
    const r = await request(server())
      .get(`/api/incidents/${d.id}`)
      .set('Authorization', auth(employeeToken))
      .expect(200);
    const actions = IncidentDetailSchema.parse(r.body).allowedActions;
    expect(actions).toContain('provideInfo');
    expect(actions).not.toContain('addNote');
  });
  it('hidesAnotherEmployeesIncidentFromTheirNotes404', async () => {
    const d = await report();
    await request(server())
      .post(`/api/incidents/${d.id}/notes`)
      .set('Authorization', auth(otherToken))
      .send({ text: 'Not my incident' })
      .expect(404);
  });
  it('showsATechnicianTheirOwnWorkload', async () => {
    await report();
    const r = await request(server())
      .get('/api/technicians/me')
      .set('Authorization', auth(techToken))
      .expect(200);
    expect(r.body).toMatchObject({ id: ids.tech, activeIncidents: 1, capacity: 5 });
  });
  it('refusesWorkloadToAnEmployee403', async () => {
    await request(server())
      .get('/api/technicians/me')
      .set('Authorization', auth(employeeToken))
      .expect(403);
  });
  it('illegalTransitionReturns409', async () => {
    const d = await report();
    const r = await request(server())
      .post(`/api/incidents/${d.id}/close`)
      .set('Authorization', auth(employeeToken))
      .expect(409);
    expect(r.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });
  it('employeeCannotSeeOthersIncident404', async () => {
    const d = await report();
    await request(server())
      .get(`/api/incidents/${d.id}`)
      .set('Authorization', auth(otherToken))
      .expect(404);
  });
  it('technicianCannotAssign403', async () => {
    const d = await report();
    await request(server())
      .post(`/api/incidents/${d.id}/assign`)
      .set('Authorization', auth(techToken))
      .send({})
      .expect(403);
  });
  it('invalidCreateBodyReturns400', async () => {
    await request(server())
      .post('/api/incidents')
      .set('Authorization', auth(employeeToken))
      .send({})
      .expect(400);
  });
  it('adminGetsRecommendations', async () => {
    const d = await report();
    const r = await request(server())
      .get(`/api/incidents/${d.id}/recommendations`)
      .set('Authorization', auth(adminToken))
      .expect(200);
    expect(r.body).toHaveLength(1);
  });
  it('catalogListsServicesAndCategories', async () => {
    for (const path of ['services', 'categories']) {
      const r = await request(server())
        .get(`/api/${path}`)
        .set('Authorization', auth(employeeToken))
        .expect(200);
      expect(r.body).toHaveLength(1);
    }
    const r = await request(server())
      .get('/api/technicians')
      .set('Authorization', auth(adminToken))
      .expect(200);
    expect(r.body[0].activeIncidents).toBe(0);
  });
  it('invalidIncidentIdReturns400', async () => {
    await request(server())
      .get('/api/incidents/invalid')
      .set('Authorization', auth(employeeToken))
      .expect(400);
  });
});

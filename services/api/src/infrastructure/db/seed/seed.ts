import { hash } from '@node-rs/argon2';
import { sql } from 'drizzle-orm';
import { AuditRecorder } from '../../../application/audit/audit-recorder.js';
import { InProcessEventPublisher } from '../../../application/events/in-process-event-publisher.js';
import {
  AssignmentContext,
  AssignmentStrategyRegistry,
  TechnicianAssigner,
  TechnicianLoad,
} from '../../../domain/assignment/index.js';
import { Category, ItService } from '../../../domain/catalog/index.js';
import { Actor, IncidentFactory, type Incident } from '../../../domain/incidents/index.js';
import { PriorityInput, WeightedScorePriorityStrategy } from '../../../domain/priority/index.js';
import {
  asAuditId,
  asCategoryId,
  asItServiceId,
  asSlaPolicyId,
  asUserId,
  Duration,
  Impact,
  Instant,
  Urgency,
} from '../../../domain/shared/index.js';
import { SlaCatalog, SlaPolicy, SlaTarget } from '../../../domain/sla/index.js';
import { Role, Technician, UserFactory, type User } from '../../../domain/users/index.js';
import { loadEnv } from '../../config/env.js';
import { createDatabase } from '../database.js';
import { DrizzleAuditRepository } from '../repositories/audit.repository.js';
import {
  DrizzleCategoryRepository,
  DrizzleItServiceRepository,
} from '../repositories/catalog.repositories.js';
import { DrizzleIncidentRepository } from '../repositories/incident.repository.js';
import { DrizzleSlaPolicyRepository } from '../repositories/sla-policy.repository.js';
import { DrizzleUserRepository } from '../repositories/user.repository.js';
import { investigationNotes, templates } from './templates.js';

let idCounter = 0;
const nextId = () => `00000000-0000-4000-8000-${(++idCounter).toString(16).padStart(12, '0')}`;
const now = Date.now();
const minute = 60_000;
let randomState = 0x2132026;
function random(): number {
  randomState = (randomState + 0x6d2b79f5) | 0;
  let t = Math.imul(randomState ^ (randomState >>> 15), 1 | randomState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}
const at = (ms: number) => Instant.of(Math.round(ms));
const connection = createDatabase(loadEnv().DATABASE_URL);
const db = connection.db;
const userRepo = new DrizzleUserRepository(db);
const incidentRepo = new DrizzleIncidentRepository(db);
const publisher = new InProcessEventPublisher();
publisher.subscribe(new AuditRecorder(new DrizzleAuditRepository(db), () => asAuditId(nextId())));
const assigner = new TechnicianAssigner(AssignmentStrategyRegistry.withDefaults());
const priorityStrategy = new WeightedScorePriorityStrategy();
const system = Actor.system();
const password = process.env.SEED_PASSWORD ?? 'demo1234';

async function main(): Promise<void> {
  // The audit table is insert-only for UPDATE/DELETE; TRUNCATE is intentional for a fresh demo.
  await db.execute(
    sql`TRUNCATE TABLE audit_records, info_requests, investigation_notes, incidents, technician_service_history, technician_skills, team_members, users, sla_targets, sla_policies, categories, it_services RESTART IDENTITY CASCADE`,
  );
  await db.execute(sql`ALTER SEQUENCE incident_number_seq RESTART WITH 1`);
  const categoryRepo = new DrizzleCategoryRepository(db);
  const serviceRepo = new DrizzleItServiceRepository(db);
  const policyRepo = new DrizzleSlaPolicyRepository(db);
  const categories = new Map<string, Category>();
  for (const code of Object.keys(templates)) {
    const category = Category.create({
      id: asCategoryId(nextId()),
      code,
      name: code[0]! + code.slice(1).toLowerCase(),
      requiredSkill: code.toLowerCase(),
      active: true,
    });
    categories.set(code, category);
    await categoryRepo.save(category);
  }
  const services = new Map<string, ItService>();
  for (const [name, criticality] of [
    ['Payment Gateway', 4],
    ['Customer Database', 4],
    ['Single Sign-On', 4],
    ['Corporate Email', 3],
    ['VPN', 3],
    ['Cloud Storage', 3],
    ['HR Portal', 2],
    ['Employee Laptops', 1],
  ] as const) {
    const service = ItService.create({
      id: asItServiceId(nextId()),
      name,
      criticality,
      active: true,
    });
    services.set(name, service);
    await serviceRepo.save(service);
  }
  const policies = [
    SlaPolicy.specDefault(asSlaPolicyId(nextId())),
    SlaPolicy.create({
      id: asSlaPolicyId(nextId()),
      name: 'Payment Gateway',
      serviceId: services.get('Payment Gateway')!.id(),
      targets: new Map([
        ['P1', SlaTarget.of(Duration.ofMinutes(5), Duration.ofMinutes(20))],
        ['P2', SlaTarget.of(Duration.ofMinutes(10), Duration.ofHours(1))],
        ['P3', SlaTarget.of(Duration.ofMinutes(30), Duration.ofHours(4))],
        ['P4', SlaTarget.of(Duration.ofHours(2), Duration.ofHours(12))],
      ]),
    }),
  ];
  for (const policy of policies) await policyRepo.save(policy);
  const catalog = new SlaCatalog(policies);
  const passwordHash = await hash(password);
  const people = new Map<string, User>();
  async function create(
    name: string,
    role: Role,
    extra: {
      department?: string;
      skills?: string[];
      maxActiveIncidents?: number;
      experienceYears?: number;
      team?: ReturnType<typeof asUserId>[];
    } = {},
  ) {
    const first = name.split(' ')[0]!.toLowerCase();
    const user = UserFactory.create({
      id: asUserId(nextId()),
      name,
      email: `${first}@itsm.demo`,
      passwordHash,
      role,
      ...extra,
    });
    await userRepo.save(user);
    people.set(first, user);
    return user;
  }
  for (const [name, department] of [
    ['Priya Sharma', 'Finance'],
    ['Rahul Verma', 'Sales'],
    ['Neha Gupta', 'HR'],
    ['Arun Pillai', 'Operations'],
  ])
    await create(name!, Role.EMPLOYEE, { department: department! });
  for (const [name, skills, cap, years] of [
    ['Asha Iyer', ['database', 'network'], 5, 6],
    ['Ben Thomas', ['network', 'hardware'], 4, 3],
    ['Farah Ali', ['application', 'software'], 5, 4],
    ['Gopal Das', ['cloud', 'storage'], 4, 5],
    ["Irene D'Souza", ['security', 'authentication'], 4, 7],
  ] as const)
    await create(name, Role.TECHNICIAN, {
      skills: [...skills],
      maxActiveIncidents: cap,
      experienceYears: years,
    });
  await create('Chen Wei', Role.TEAM_LEAD, {
    skills: ['database', 'cloud'],
    maxActiveIncidents: 3,
    experienceYears: 10,
    team: [people.get('asha')!.id(), people.get('gopal')!.id()],
  });
  await create('Divya Nair', Role.TEAM_LEAD, {
    skills: ['application', 'authentication'],
    maxActiveIncidents: 3,
    experienceYears: 9,
    team: [people.get('ben')!.id(), people.get('farah')!.id(), people.get('irene')!.id()],
  });
  for (const name of ['Arjun Mehta', 'Sara Khan']) await create(name, Role.ADMIN);
  for (const name of ['Kavya Reddy', 'Vikram Rao']) await create(name, Role.IT_MANAGER);
  const employees = ['priya', 'rahul', 'neha', 'arun'].map((name) => people.get(name)!);
  const techs = [...people.values()].filter(
    (person): person is Technician => person instanceof Technician,
  );
  const serviceFor: Record<keyof typeof templates, string[]> = {
    HARDWARE: ['Employee Laptops'],
    SOFTWARE: ['Employee Laptops'],
    NETWORK: ['VPN', 'Corporate Email'],
    DATABASE: ['Customer Database', 'Payment Gateway'],
    CLOUD: ['Cloud Storage'],
    SECURITY: ['Single Sign-On'],
    AUTHENTICATION: ['Single Sign-On'],
    APPLICATION: ['HR Portal'],
    STORAGE: ['Cloud Storage'],
  };
  const codes = Object.keys(templates) as Array<keyof typeof templates>;
  // A title that names a service must be filed under that service, or dashboards mislabel it.
  const serviceKeywords: ReadonlyArray<[RegExp, string]> = [
    [/payment|checkout/i, 'Payment Gateway'],
    [/\bvpn\b/i, 'VPN'],
    [/\b(e-?mail|mail server|mailbox|outlook)\b/i, 'Corporate Email'],
    [/\bhr\b|payroll/i, 'HR Portal'],
    [/\b(sso|single sign-on)\b/i, 'Single Sign-On'],
    [/laptop|desktop|keyboard|monitor/i, 'Employee Laptops'],
    [/cloud storage|cloud upload|upload/i, 'Cloud Storage'],
    [/customer (database|queries|records)/i, 'Customer Database'],
  ];
  const serviceNamedIn = (title: string): string | undefined =>
    serviceKeywords.find(([pattern]) => pattern.test(title))?.[1];
  const originals = new Map<string, Incident>();

  async function save(incident: Incident) {
    await incidentRepo.save(incident);
    const report = await publisher.publish(incident.pullEvents());
    if (report.failures.length)
      throw new Error('Audit publication failed', { cause: report.failures[0]!.error });
  }
  async function generate(index: number, stage: string, created: number) {
    const code = index < 8 ? 'DATABASE' : codes[index % codes.length]!;
    const choices = templates[code];
    const template =
      index < 8
        ? choices[3 + (index % 3)]!
        : choices[Math.floor(index / codes.length) % choices.length]!;
    const serviceName =
      index < 8
        ? 'Payment Gateway'
        : stage === 'escalation'
          ? 'VPN'
          : (serviceNamedIn(template[0]) ?? pick(serviceFor[code]));
    const service = services.get(serviceName)!;
    const category = categories.get(code)!;
    const employee = pick(employees);
    const reporter = Actor.user(employee);
    // The eight-minute escalation example is P2: 2 × 2 × 4 = 16.
    const impact = Impact.of(
      stage === 'escalation' || stage === 'risk' ? 2 : 1 + Math.floor(random() * 3),
    );
    const urgency = Urgency.of(
      stage === 'escalation' ? 3 : stage === 'risk' ? 2 : 1 + Math.floor(random() * 3),
    );
    const affectedUsers = 1 + Math.floor(random() * 8);
    const priority = priorityStrategy.assess(
      new PriorityInput(impact, urgency, service.businessCriticality(), affectedUsers),
    ).priority;
    const terms = catalog.resolve(service.id(), priority);
    const identity = await incidentRepo.nextIdentity();
    const openIncidentsOfReporter = await incidentRepo.findOpenByReporter(employee.id());
    const duplicateTitle = openIncidentsOfReporter.some(
      (existing) =>
        existing.serviceId === service.id() &&
        existing.title.toLowerCase() === template[0].toLowerCase(),
    );
    const incident = IncidentFactory.report(
      {
        title: duplicateTitle ? `${template[0]} (follow-up ${index})` : template[0],
        description: template[1],
        reporterId: employee.id(),
        serviceId: service.id(),
        impact,
        urgency,
        affectedUsers,
      },
      { ...identity, at: at(created), service, openIncidentsOfReporter },
    );
    if (stage === 'new') {
      await save(incident);
      return;
    }
    incident.classify(category, priority, terms, system, at(created + 10_000));
    if (stage === 'classified') {
      await save(incident);
      return;
    }
    if (stage === 'duplicate' && originals.has(serviceName)) {
      incident.closeAsDuplicate(originals.get(serviceName)!.id, system, at(created + minute));
      incident.checkSla(at(created + minute));
      await save(incident);
      return;
    }
    const counts = await incidentRepo.countOpenByAssignee();
    const recommendation = assigner.pick(
      new AssignmentContext(
        incident.id,
        service.id(),
        priority,
        category,
        techs.map((tech) => new TechnicianLoad(tech, counts.get(tech.id()) ?? 0)),
      ),
    );
    const tech = techs.find((item) => item.id() === recommendation.technicianId)!;
    const worker = Actor.user(tech);
    const assigned = stage === 'escalation' ? now - 8 * minute : created + 20_000;
    incident.assign(tech, counts.get(tech.id()) ?? 0, system, at(assigned));
    assigner.confirm(recommendation);
    if (stage === 'assigned' || stage === 'escalation') {
      incident.checkSla(at(now));
      await save(incident);
      return;
    }
    const breach = stage === 'historical' && index % 25 < 3;
    const responseAt =
      created +
      (breach
        ? terms.target.response.ms + minute
        : Math.min(terms.target.response.ms * 0.35, 2 * minute));
    if (breach) incident.checkSla(at(responseAt));
    incident.acknowledge(worker, at(responseAt));
    const started = responseAt + 10_000;
    incident.startWork(worker, at(started));
    const noteCount = 1 + Math.floor(random() * 3);
    const noteTemplates = investigationNotes[code];
    for (let noteIndex = 0; noteIndex < noteCount; noteIndex++) {
      const noteAt = started + Math.floor(((noteIndex + 1) * 9_000) / (noteCount + 1));
      incident.addNote(pick(noteTemplates), worker, at(noteAt));
    }
    if (stage === 'progress' || stage === 'risk') {
      incident.checkSla(at(now));
      await save(incident);
      return;
    }
    let paused = 0;
    if (stage === 'pending' || (stage === 'historical' && index % 4 === 0)) {
      const asked = started + 10_000;
      incident.requestInfo(
        'When did the problem begin, and what error did you see?',
        worker,
        at(asked),
      );
      if (stage === 'pending') {
        incident.checkSla(at(now));
        await save(incident);
        return;
      }
      paused = minute;
      incident.provideInfo(
        'It started this morning; the operation timed out.',
        reporter,
        at(asked + paused),
      );
    }
    const resolved = Math.max(
      started + paused + 20_000,
      created + terms.target.resolution.ms * 0.55 + paused,
    );
    incident.resolve(template[2], template[3], worker, at(resolved));
    tech.recordResolvedFor(service.id());
    await userRepo.save(tech);
    if (stage === 'resolved') {
      incident.checkSla(at(now));
      await save(incident);
      return;
    }
    if (stage === 'reopened') {
      incident.reject('The issue returned when I tried again.', reporter, at(resolved + 10_000));
      incident.checkSla(at(now));
      await save(incident);
      return;
    }
    incident.verify(reporter, at(resolved + 10_000));
    incident.close(reporter, at(resolved + 20_000));
    incident.checkSla(at(resolved + 20_000));
    await save(incident);
    if (!originals.has(serviceName)) originals.set(serviceName, incident);
  }
  // Sequential closed timelines keep the assignment workload consistent with persisted open work.
  for (let i = 0; i < 200; i++)
    await generate(
      i,
      i >= 10 && i % 20 === 0 ? 'duplicate' : 'historical',
      now - (60 * 24 * 60 - i * 400) * minute,
    );
  const stages = [
    'new',
    'classified',
    'classified',
    'escalation',
    'assigned',
    'assigned',
    'risk',
    'progress',
    'progress',
    'pending',
    'pending',
    'resolved',
    'resolved',
    'reopened',
  ];
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i]!;
    // Force a P2 VPN ticket for escalation and a P3 HR ticket near its warning point.
    const index = stage === 'escalation' ? 11 : stage === 'risk' ? 16 : 207 + i;
    const age =
      stage === 'risk'
        ? 6.2 * 60
        : stage === 'escalation'
          ? 9
          : stage === 'resolved' || stage === 'reopened'
            ? 1800
            : 15;
    await generate(index, stage, now - age * minute);
  }
  const tables = [
    'users',
    'technician_skills',
    'technician_service_history',
    'team_members',
    'categories',
    'it_services',
    'sla_policies',
    'sla_targets',
    'incidents',
    'investigation_notes',
    'info_requests',
    'audit_records',
  ];
  const summary: Array<{ table: string; count: number }> = [];
  for (const table of tables) {
    const result = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from ${sql.identifier(table)}`,
    );
    summary.push({ table, count: result.rows[0]!.count });
  }
  console.table(summary);
  console.table(
    [...people.values()].map((user) => ({
      name: user.toSnapshot().name,
      role: user.role(),
      login: user.toSnapshot().email,
    })),
  );
  console.log(`Demo password: ${password}`);
}
try {
  await main();
} finally {
  await connection.close();
}

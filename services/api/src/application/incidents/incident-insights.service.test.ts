import { beforeEach, describe, expect, it } from 'vitest';
import {
  IncidentNotFoundException,
  UnauthorizedOperationException,
} from '../../domain/exceptions/index.js';
import { Incident, type IncidentStatus } from '../../domain/incidents/index.js';
import {
  at,
  category,
  later,
  employee,
  service,
  snapshot,
  technician,
} from '../../domain/incidents/test-fixtures.js';
import { asIncidentId, asUserId, FixedClock } from '../../domain/shared/index.js';
import { Admin, Employee, Technician } from '../../domain/users/index.js';
import { InMemoryCategoryRepository } from '../testing/in-memory-category-repository.js';
import { InMemoryIncidentRepository } from '../testing/in-memory-incident-repository.js';
import { InMemoryServiceRepository } from '../testing/in-memory-service-repository.js';
import { InMemoryUserRepository } from '../testing/in-memory-user-repository.js';
import { IncidentInsightsService } from './incident-insights.service.js';
import { IncidentViewMapper } from './incident-view-mapper.js';
import { RuleBasedIntelligenceAdapter } from './rule-based-intelligence-adapter.js';

const admin = Admin.rehydrate({
  id: asUserId('admin'),
  name: 'Admin',
  email: 'admin@example.com',
  passwordHash: 'hash',
  active: true,
});
const colleague = Employee.rehydrate({
  ...employee.toSnapshot(),
  id: asUserId('colleague'),
  email: 'c@example.com',
});
let n = 0;
function incident(
  title: string,
  status: IncidentStatus = 'ASSIGNED',
  extra: Partial<ReturnType<typeof snapshot>> = {},
) {
  const k = String(++n).padStart(12, '0');
  return Incident.rehydrate({
    ...snapshot(status),
    id: asIncidentId(`00000000-0000-4000-8000-${k}`),
    number: `INC${k.slice(-4)}`,
    title,
    // Stop words only: the title alone decides the score in these tests.
    description: 'it is not at all',
    ...extra,
  });
}

describe('IncidentInsightsService', () => {
  let incidents: InMemoryIncidentRepository;
  let svc: IncidentInsightsService;
  let checkout: Incident, declined: Incident, timeout: Incident;
  beforeEach(async () => {
    incidents = new InMemoryIncidentRepository();
    const users = new InMemoryUserRepository();
    const services = new InMemoryServiceRepository();
    const categories = new InMemoryCategoryRepository();
    for (const u of [employee, colleague, technician, admin]) await users.save(u);
    await services.save(service);
    await categories.save(category);
    checkout = incident('Checkout card payments failing');
    declined = incident('Card payment declined at checkout', 'ASSIGNED', {
      reporterId: colleague.id(),
      assigneeId: null,
      status: 'CLASSIFIED',
      assignedAt: null,
    });
    timeout = incident('Payment page times out');
    for (const i of [checkout, declined, timeout]) await incidents.save(i);
    const mapper = new IncidentViewMapper(
      incidents,
      users,
      services,
      categories,
      new FixedClock(at),
    );
    svc = new IncidentInsightsService(
      incidents,
      new RuleBasedIntelligenceAdapter(incidents),
      mapper,
      new FixedClock(later),
    );
  });
  it('listsSimilarOpenIncidentsExcludingItselfWithReasons', async () => {
    const result = await svc.insights(admin, checkout.id);
    expect(result.similar.map((s) => [s.incident.title, s.score, s.source])).toEqual([
      ['Card payment declined at checkout', 0.81, 'rules'],
      ['Payment page times out', 0.38, 'rules'],
    ]);
    expect(result.similar[0]!.reasons).toEqual([
      'same service',
      'shares: checkout, card, payments',
    ]);
    expect(result.source).toBe('rules');
  });
  it('reportsACorrelationClusterOfThreeOnTheSameService', async () => {
    const { cluster } = await svc.insights(admin, checkout.id);
    expect(cluster).toMatchObject({
      service: { id: service.id(), name: 'WiFi' },
      windowMinutes: 120,
      reason: '3 open WiFi incidents with similar text in 2 h',
    });
    expect(cluster!.incidents.map((i) => i.id)).toEqual([checkout.id, declined.id, timeout.id]);
  });
  it('suggestsEachDistinctFixOnceFromResolvedNonDuplicateIncidents', async () => {
    const fixed = incident('Card payments failing at checkout', 'CLOSED');
    const duplicate = incident('Card payments failing at checkout again', 'CLOSED', {
      closure: { reason: 'DUPLICATE', closedBy: null, at: at.toIso(), duplicateOfId: fixed.id },
    });
    const sameFix = incident('Card payments failing slowly', 'CLOSED');
    for (const i of [fixed, duplicate, sameFix]) await incidents.save(i);
    const { suggestedResolutions, similar } = await svc.insights(admin, checkout.id);
    expect(suggestedResolutions).toEqual([
      {
        incident: { id: fixed.id, number: fixed.number.value, title: fixed.toSnapshot().title },
        summary: 'Restarted the router',
        rootCause: 'Router fault',
        score: expect.any(Number) as number,
      },
    ]);
    expect(similar.map((s) => s.incident.id)).not.toContain(fixed.id);
  });
  it('estimatesSlaRiskOfAnOpenIncidentWithReasons', async () => {
    const { slaRisk } = await svc.insights(admin, checkout.id);
    expect(slaRisk).toEqual({
      probability: 0.6,
      level: 'MEDIUM',
      reasons: ['50% of the resolution window used', 'P2 has a tight window'],
      source: 'rules',
    });
  });
  it('hasNoSlaRiskOnceResolved', async () => {
    const fixed = incident('Card payments failing at checkout', 'CLOSED');
    await incidents.save(fixed);
    expect((await svc.insights(admin, fixed.id)).slaRisk).toBeNull();
  });
  it('listsSlaRiskOfVisibleOpenIncidentsForTheMonitor', async () => {
    // An incident not yet triaged has no SLA; a resolved one is not open, so neither is listed.
    const untriaged = incident('Badge reader beeps', 'NEW');
    const resolved = incident('Projector flickers', 'RESOLVED');
    for (const i of [untriaged, resolved]) await incidents.save(i);
    expect((await svc.slaRisks(admin)).map((r) => r.incidentId).sort()).toEqual(
      [checkout.id, declined.id, timeout.id].sort(),
    );
    expect((await svc.slaRisks(employee)).map((r) => r.incidentId).sort()).toEqual(
      [checkout.id, timeout.id].sort(),
    );
  });
  it('scopesInsightsToIncidentsTheCallerMaySee', async () => {
    const result = await svc.insights(employee, checkout.id);
    expect(result.similar.map((s) => s.incident.id)).toEqual([timeout.id]);
    expect(result.cluster).toBeNull();
  });
  it('hidesInsightsOfAnIncidentTheCallerMayNotSee', async () => {
    await expect(svc.insights(colleague, checkout.id)).rejects.toBeInstanceOf(
      IncidentNotFoundException,
    );
  });
  it('findsSimilarIncidentsForADraftReportWithinTheCallersScope', async () => {
    const draft = { title: 'Card checkout broken', description: 'payments declined' };
    expect((await svc.similar(admin, draft)).map((s) => s.incident.id)).toEqual([
      declined.id,
      checkout.id,
    ]);
    expect((await svc.similar(colleague, draft)).map((s) => s.incident.id)).toEqual([declined.id]);
    const tech = Technician.rehydrate({ ...technician.toSnapshot() } as Parameters<
      typeof Technician.rehydrate
    >[0]);
    expect((await svc.similar(tech, draft)).map((s) => s.incident.id)).toEqual([checkout.id]);
  });
  it('rejectsSimilarityCheckFromAnInactiveUser', async () => {
    const inactive = Employee.rehydrate({ ...employee.toSnapshot(), active: false });
    await expect(
      svc.similar(inactive, { title: 'Checkout', description: '' }),
    ).rejects.toBeInstanceOf(UnauthorizedOperationException);
  });
});

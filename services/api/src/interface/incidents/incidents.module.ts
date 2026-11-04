import { randomBytes } from 'node:crypto';
import { Module } from '@nestjs/common';
import { AuditRecorder } from '../../application/audit/audit-recorder.js';
import { InProcessEventPublisher } from '../../application/events/in-process-event-publisher.js';
import { IncidentInsightsService } from '../../application/incidents/incident-insights.service.js';
import { IncidentViewMapper } from '../../application/incidents/incident-view-mapper.js';
import { IncidentService } from '../../application/incidents/incident.service.js';
import { RuleBasedIntelligenceAdapter } from '../../application/incidents/rule-based-intelligence-adapter.js';
import { KeywordCategorySuggester } from '../../application/incidents/keyword-category-suggester.js';
import { AssignmentStrategyRegistry, TechnicianAssigner } from '../../domain/assignment/index.js';
import {
  MatrixPriorityStrategy,
  PriorityStrategyRegistry,
  WeightedScorePriorityStrategy,
} from '../../domain/priority/index.js';
import { asAuditId, SystemClock } from '../../domain/shared/index.js';
import { ConfigModule, ENV } from '../../infrastructure/config/config.module.js';
import type { Env } from '../../infrastructure/config/env.js';
import { RepositoriesModule } from '../../infrastructure/db/repositories/repositories.module.js';
import { HttpIntelligenceAdapter } from '../../infrastructure/intelligence/http-intelligence-adapter.js';
import {
  AUDIT_REPOSITORY,
  CATEGORY_REPOSITORY,
  CATEGORY_SUGGESTER,
  INCIDENT_REPOSITORY,
  INTELLIGENCE_PORT,
  IT_SERVICE_REPOSITORY,
  SLA_POLICY_REPOSITORY,
  USER_REPOSITORY,
  type AuditRepository,
  type CategoryRepository,
  type CategorySuggester,
  type IncidentRepository,
  type IntelligencePort,
  type ItServiceRepository,
  type SlaPolicyRepository,
  type UserRepository,
} from '../../ports/index.js';
import { CatalogController } from '../catalog/catalog.controller.js';
import { IncidentsController } from './incidents.controller.js';
// UUIDv7 keeps events generated in the same millisecond ordered by their sequence.
let lastMillis = 0;
let sequence = 0;
function nextAuditId() {
  const now = Date.now();
  if (now > lastMillis) {
    lastMillis = now;
    sequence = 0;
  } else if (++sequence > 0xfff) {
    lastMillis++;
    sequence = 0;
  }
  const time = lastMillis.toString(16).padStart(12, '0');
  const seq = sequence.toString(16).padStart(3, '0');
  const random = randomBytes(8);
  random[0] = (random[0]! & 0x3f) | 0x80;
  const tail = random.toString('hex');
  return asAuditId(
    `${time.slice(0, 8)}-${time.slice(8)}-7${seq}-${tail.slice(0, 4)}-${tail.slice(4)}`,
  );
}
@Module({
  imports: [RepositoriesModule, ConfigModule],
  controllers: [IncidentsController, CatalogController],
  exports: [
    IncidentService,
    SystemClock,
    InProcessEventPublisher,
    PriorityStrategyRegistry,
    AssignmentStrategyRegistry,
  ],
  providers: [
    {
      provide: PriorityStrategyRegistry,
      useFactory: () =>
        new PriorityStrategyRegistry(
          [new WeightedScorePriorityStrategy(), new MatrixPriorityStrategy()],
          'weighted-score',
        ),
    },
    {
      provide: AssignmentStrategyRegistry,
      useFactory: () => AssignmentStrategyRegistry.withDefaults(),
    },
    {
      provide: TechnicianAssigner,
      useFactory: (registry: AssignmentStrategyRegistry) => new TechnicianAssigner(registry),
      inject: [AssignmentStrategyRegistry],
    },
    { provide: CATEGORY_SUGGESTER, useClass: KeywordCategorySuggester },
    {
      // Adapter + fallback: the ML service when configured, the domain rules whenever it fails.
      provide: INTELLIGENCE_PORT,
      useFactory: (incidents: IncidentRepository, env: Env): IntelligencePort => {
        const rules = new RuleBasedIntelligenceAdapter(incidents);
        return env.ML_SERVICE_URL
          ? new HttpIntelligenceAdapter(env.ML_SERVICE_URL, incidents, rules)
          : rules;
      },
      inject: [INCIDENT_REPOSITORY, ENV],
    },
    {
      provide: IncidentInsightsService,
      useFactory: (
        incidents: IncidentRepository,
        intelligence: IntelligencePort,
        users: UserRepository,
        services: ItServiceRepository,
        categories: CategoryRepository,
        clock: SystemClock,
      ) =>
        new IncidentInsightsService(
          incidents,
          intelligence,
          new IncidentViewMapper(incidents, users, services, categories, clock),
        ),
      inject: [
        INCIDENT_REPOSITORY,
        INTELLIGENCE_PORT,
        USER_REPOSITORY,
        IT_SERVICE_REPOSITORY,
        CATEGORY_REPOSITORY,
        SystemClock,
      ],
    },
    SystemClock,
    {
      provide: InProcessEventPublisher,
      useFactory: (audit: AuditRepository) => {
        const publisher = new InProcessEventPublisher();
        publisher.subscribe(new AuditRecorder(audit, nextAuditId));
        return publisher;
      },
      inject: [AUDIT_REPOSITORY],
    },
    {
      provide: IncidentService,
      useFactory: (
        incidents: IncidentRepository,
        users: UserRepository,
        services: ItServiceRepository,
        categories: CategoryRepository,
        policies: SlaPolicyRepository,
        suggester: CategorySuggester,
        priorities: PriorityStrategyRegistry,
        assigner: TechnicianAssigner,
        events: InProcessEventPublisher,
        clock: SystemClock,
        audit: AuditRepository,
      ) =>
        new IncidentService(
          incidents,
          users,
          services,
          categories,
          policies,
          suggester,
          priorities,
          assigner,
          events,
          clock,
          audit,
        ),
      inject: [
        INCIDENT_REPOSITORY,
        USER_REPOSITORY,
        IT_SERVICE_REPOSITORY,
        CATEGORY_REPOSITORY,
        SLA_POLICY_REPOSITORY,
        CATEGORY_SUGGESTER,
        PriorityStrategyRegistry,
        TechnicianAssigner,
        InProcessEventPublisher,
        SystemClock,
        AUDIT_REPOSITORY,
      ],
    },
  ],
})
export class IncidentsModule {}

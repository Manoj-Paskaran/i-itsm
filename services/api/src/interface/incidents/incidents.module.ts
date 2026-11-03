import { randomBytes } from 'node:crypto';
import { Module } from '@nestjs/common';
import { AuditRecorder } from '../../application/audit/audit-recorder.js';
import { InProcessEventPublisher } from '../../application/events/in-process-event-publisher.js';
import { IncidentService } from '../../application/incidents/incident.service.js';
import { KeywordCategorySuggester } from '../../application/incidents/keyword-category-suggester.js';
import { AssignmentStrategyRegistry, TechnicianAssigner } from '../../domain/assignment/index.js';
import {
  MatrixPriorityStrategy,
  PriorityStrategyRegistry,
  WeightedScorePriorityStrategy,
} from '../../domain/priority/index.js';
import { asAuditId, SystemClock } from '../../domain/shared/index.js';
import { RepositoriesModule } from '../../infrastructure/db/repositories/repositories.module.js';
import {
  AUDIT_REPOSITORY,
  CATEGORY_REPOSITORY,
  CATEGORY_SUGGESTER,
  INCIDENT_REPOSITORY,
  IT_SERVICE_REPOSITORY,
  SLA_POLICY_REPOSITORY,
  USER_REPOSITORY,
  type AuditRepository,
  type CategoryRepository,
  type CategorySuggester,
  type IncidentRepository,
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
  imports: [RepositoriesModule],
  controllers: [IncidentsController, CatalogController],
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

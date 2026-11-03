import { Module } from '@nestjs/common';
import {
  AUDIT_REPOSITORY,
  CATEGORY_REPOSITORY,
  INCIDENT_REPOSITORY,
  IT_SERVICE_REPOSITORY,
  SLA_POLICY_REPOSITORY,
  USER_REPOSITORY,
} from '../../../ports/index.js';
import { DatabaseModule } from '../database.js';
import { DrizzleAuditRepository } from './audit.repository.js';
import { DrizzleCategoryRepository, DrizzleItServiceRepository } from './catalog.repositories.js';
import { DrizzleIncidentRepository } from './incident.repository.js';
import { DrizzleSlaPolicyRepository } from './sla-policy.repository.js';
import { DrizzleUserRepository } from './user.repository.js';

const providers = [
  { provide: INCIDENT_REPOSITORY, useClass: DrizzleIncidentRepository },
  { provide: USER_REPOSITORY, useClass: DrizzleUserRepository },
  { provide: IT_SERVICE_REPOSITORY, useClass: DrizzleItServiceRepository },
  { provide: CATEGORY_REPOSITORY, useClass: DrizzleCategoryRepository },
  { provide: SLA_POLICY_REPOSITORY, useClass: DrizzleSlaPolicyRepository },
  { provide: AUDIT_REPOSITORY, useClass: DrizzleAuditRepository },
];
@Module({ imports: [DatabaseModule], providers, exports: providers })
export class RepositoriesModule {}

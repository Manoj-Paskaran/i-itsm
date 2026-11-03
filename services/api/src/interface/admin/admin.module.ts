import { Module } from '@nestjs/common';
import { AdminService } from '../../application/admin/admin.service.js';
import { AssignmentStrategyRegistry } from '../../domain/assignment/index.js';
import { PriorityStrategyRegistry } from '../../domain/priority/index.js';
import { Argon2PasswordHasher } from '../../infrastructure/auth/password-hasher.js';
import { RepositoriesModule } from '../../infrastructure/db/repositories/repositories.module.js';
import {
  AUDIT_REPOSITORY,
  CATEGORY_REPOSITORY,
  IT_SERVICE_REPOSITORY,
  PASSWORD_HASHER,
  SLA_POLICY_REPOSITORY,
  USER_REPOSITORY,
  type AuditRepository,
  type CategoryRepository,
  type ItServiceRepository,
  type PasswordHasher,
  type SlaPolicyRepository,
  type UserRepository,
} from '../../ports/index.js';
import { IncidentsModule } from '../incidents/incidents.module.js';
import { AdminController } from './admin.controller.js';
import { AuditController } from './audit.controller.js';

@Module({
  // IncidentsModule exports the strategy registries so admin switches the live instances.
  imports: [RepositoriesModule, IncidentsModule],
  controllers: [AdminController, AuditController],
  providers: [
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    {
      provide: AdminService,
      useFactory: (
        users: UserRepository,
        services: ItServiceRepository,
        categories: CategoryRepository,
        policies: SlaPolicyRepository,
        audit: AuditRepository,
        hasher: PasswordHasher,
        priority: PriorityStrategyRegistry,
        assignment: AssignmentStrategyRegistry,
      ) =>
        new AdminService(
          users,
          services,
          categories,
          policies,
          audit,
          hasher,
          priority,
          assignment,
        ),
      inject: [
        USER_REPOSITORY,
        IT_SERVICE_REPOSITORY,
        CATEGORY_REPOSITORY,
        SLA_POLICY_REPOSITORY,
        AUDIT_REPOSITORY,
        PASSWORD_HASHER,
        PriorityStrategyRegistry,
        AssignmentStrategyRegistry,
      ],
    },
  ],
})
export class AdminModule {}

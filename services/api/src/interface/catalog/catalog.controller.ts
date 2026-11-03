import { Controller, Get, Inject } from '@nestjs/common';
import {
  CategorySummarySchema,
  ServiceSummarySchema,
  TechnicianSummarySchema,
} from '@itsm/contracts';
import { z } from 'zod';
import { Permission } from '../../domain/users/index.js';
import {
  CATEGORY_REPOSITORY,
  INCIDENT_REPOSITORY,
  IT_SERVICE_REPOSITORY,
  USER_REPOSITORY,
  type CategoryRepository,
  type IncidentRepository,
  type ItServiceRepository,
  type UserRepository,
} from '../../ports/index.js';
import { RequirePermissions } from '../auth/decorators.js';
@Controller()
export class CatalogController {
  constructor(
    @Inject(IT_SERVICE_REPOSITORY) private readonly services: ItServiceRepository,
    @Inject(CATEGORY_REPOSITORY) private readonly categories: CategoryRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(INCIDENT_REPOSITORY) private readonly incidents: IncidentRepository,
  ) {}
  @Get('services') async listServices() {
    return z.array(ServiceSummarySchema).parse(
      (await this.services.listActive()).map((s) => ({
        id: s.id(),
        name: s.name(),
        criticality: s.businessCriticality().value,
      })),
    );
  }
  @Get('categories') async listCategories() {
    return z.array(CategorySummarySchema).parse(
      (await this.categories.listActive()).map((c) => ({
        id: c.id(),
        code: c.toSnapshot().code,
        name: c.name(),
      })),
    );
  }
  @Get('technicians') @RequirePermissions(Permission.INCIDENT_ASSIGN) async listTechnicians() {
    const [technicians, counts] = await Promise.all([
      this.users.listTechnicians(),
      this.incidents.countOpenByAssignee(),
    ]);
    return z.array(TechnicianSummarySchema).parse(
      technicians
        .filter((t) => t.isActive())
        .map((t) => ({
          id: t.id(),
          name: t.name(),
          role: t.role(),
          skills: [...t.skills()].map((s) => s.value),
          availability: t.availabilityStatus(),
          activeIncidents: counts.get(t.id()) ?? 0,
          capacity: t.capacity(),
        })),
    );
  }
}

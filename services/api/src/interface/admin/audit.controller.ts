import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuditLogEntrySchema, AuditSearchQuerySchema } from '@itsm/contracts';
import { AdminService } from '../../application/admin/admin.service.js';
import { InvalidInputException } from '../../domain/exceptions/index.js';
import { Permission, type User } from '../../domain/users/index.js';
import { CurrentUser, RequirePermissions } from '../auth/decorators.js';

@Controller('audit')
export class AuditController {
  constructor(private readonly admin: AdminService) {}
  @Get() @RequirePermissions(Permission.AUDIT_VIEW) async search(
    @CurrentUser() user: User,
    @Query() query: unknown,
  ) {
    const parsed = AuditSearchQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new InvalidInputException('Invalid input.', { issues: parsed.error.issues });
    return z.array(AuditLogEntrySchema).parse(await this.admin.searchAudit(user, parsed.data));
  }
}

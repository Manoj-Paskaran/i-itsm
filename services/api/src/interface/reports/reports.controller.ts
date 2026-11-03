import { Controller, Get, Query } from '@nestjs/common';
import {
  OverviewReportSchema,
  WorkloadReportSchema,
  ServiceReportSchema,
  SlaReportSchema,
  TrendReportSchema,
  TrendQuerySchema,
} from '@itsm/contracts';
import { ReportService } from '../../application/reports/report.service.js';
import { InvalidInputException } from '../../domain/exceptions/index.js';
import { Permission, type User } from '../../domain/users/index.js';
import { CurrentUser, RequirePermissions } from '../auth/decorators.js';

@Controller('reports')
@RequirePermissions(Permission.REPORTS_VIEW)
export class ReportsController {
  constructor(private readonly reports: ReportService) {}
  @Get('overview') async overview(@CurrentUser() user: User) {
    return OverviewReportSchema.parse(await this.reports.overview(user));
  }
  @Get('workload') async workload(@CurrentUser() user: User) {
    return WorkloadReportSchema.parse(await this.reports.workload(user));
  }
  @Get('services') async services(@CurrentUser() user: User) {
    return ServiceReportSchema.parse(await this.reports.services(user));
  }
  @Get('sla') async sla(@CurrentUser() user: User) {
    return SlaReportSchema.parse(await this.reports.sla(user));
  }
  @Get('trends') async trends(@CurrentUser() user: User, @Query() query: unknown) {
    const parsed = TrendQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new InvalidInputException('Invalid input.', { issues: parsed.error.issues });
    return TrendReportSchema.parse(await this.reports.trends(user, parsed.data.days));
  }
}

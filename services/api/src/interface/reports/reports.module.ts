import { Module } from '@nestjs/common';
import { ReportService } from '../../application/reports/report.service.js';
import { SystemClock } from '../../domain/shared/index.js';
import { RepositoriesModule } from '../../infrastructure/db/repositories/repositories.module.js';
import { REPORT_QUERIES, type ReportQueries } from '../../ports/reports.js';
import { ReportsController } from './reports.controller.js';
@Module({
  imports: [RepositoriesModule],
  controllers: [ReportsController],
  exports: [ReportService],
  providers: [
    SystemClock,
    {
      provide: ReportService,
      useFactory: (queries: ReportQueries, clock: SystemClock) => new ReportService(queries, clock),
      inject: [REPORT_QUERIES, SystemClock],
    },
  ],
})
export class ReportsModule {}

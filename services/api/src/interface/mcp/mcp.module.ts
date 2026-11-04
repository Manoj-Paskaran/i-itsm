import { Module } from '@nestjs/common';
import { IncidentService } from '../../application/incidents/incident.service.js';
import { ReportService } from '../../application/reports/report.service.js';
import { RepositoriesModule } from '../../infrastructure/db/repositories/repositories.module.js';
import { IT_SERVICE_REPOSITORY, type ItServiceRepository } from '../../ports/index.js';
import { IncidentsModule } from '../incidents/incidents.module.js';
import { ReportsModule } from '../reports/reports.module.js';
import { McpController } from './mcp.controller.js';
import { McpServer } from './mcp-server.js';
import { createMcpTools } from './mcp-tools.js';

@Module({
  imports: [RepositoriesModule, IncidentsModule, ReportsModule],
  controllers: [McpController],
  providers: [
    {
      provide: McpServer,
      useFactory: (
        incidents: IncidentService,
        reports: ReportService,
        services: ItServiceRepository,
      ) => new McpServer(createMcpTools({ incidents, reports, services })),
      inject: [IncidentService, ReportService, IT_SERVICE_REPOSITORY],
    },
  ],
})
export class McpModule {}

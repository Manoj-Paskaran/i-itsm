import { Module } from '@nestjs/common';
import { IncidentMonitor } from '../../application/monitoring/incident-monitor.js';
import { InProcessEventPublisher } from '../../application/events/in-process-event-publisher.js';
import { EscalationPolicy } from '../../domain/escalation/index.js';
import { SystemClock } from '../../domain/shared/index.js';
import { ConfigModule, ENV } from '../../infrastructure/config/config.module.js';
import type { Env } from '../../infrastructure/config/env.js';
import { RepositoriesModule } from '../../infrastructure/db/repositories/repositories.module.js';
import { MonitorJobs } from '../../infrastructure/jobs/monitor-jobs.js';
import { INCIDENT_REPOSITORY, type IncidentRepository } from '../../ports/index.js';
import { IncidentsModule } from '../incidents/incidents.module.js';
import { MonitorController } from './monitor.controller.js';
@Module({
  imports: [ConfigModule, RepositoriesModule, IncidentsModule],
  controllers: [MonitorController],
  providers: [
    {
      provide: IncidentMonitor,
      useFactory: (
        repo: IncidentRepository,
        env: Env,
        clock: SystemClock,
        events: InProcessEventPublisher,
      ) =>
        new IncidentMonitor(
          repo,
          env.ESCALATION_POLICY === 'demo' ? EscalationPolicy.demo() : EscalationPolicy.standard(),
          clock,
          events,
        ),
      inject: [INCIDENT_REPOSITORY, ENV, SystemClock, InProcessEventPublisher],
    },
    MonitorJobs,
  ],
})
export class MonitoringModule {}

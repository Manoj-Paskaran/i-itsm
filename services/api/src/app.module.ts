import { AdminModule } from './interface/admin/admin.module.js';
import { ReportsModule } from './interface/reports/reports.module.js';
import { NotificationsModule } from './interface/notifications/notifications.module.js';
import { MonitoringModule } from './interface/monitoring/monitoring.module.js';
import { IncidentsModule } from './interface/incidents/incidents.module.js';
import { AuthModule } from './interface/auth/auth.module.js';
import { Module } from '@nestjs/common';
import { ConfigModule } from './infrastructure/config/config.module.js';
import { DatabaseModule } from './infrastructure/db/database.js';
import { HealthModule } from './interface/health/health.module.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    HealthModule,
    AuthModule,
    IncidentsModule,
    MonitoringModule,
    NotificationsModule,
    ReportsModule,
    AdminModule,
  ],
})
export class AppModule {}

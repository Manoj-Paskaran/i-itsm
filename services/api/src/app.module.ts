import { IncidentsModule } from './interface/incidents/incidents.module.js';
import { AuthModule } from './interface/auth/auth.module.js';
import { Module } from '@nestjs/common';
import { ConfigModule } from './infrastructure/config/config.module.js';
import { DatabaseModule } from './infrastructure/db/database.js';
import { HealthModule } from './interface/health/health.module.js';

@Module({ imports: [ConfigModule, DatabaseModule, HealthModule, AuthModule, IncidentsModule] })
export class AppModule {}

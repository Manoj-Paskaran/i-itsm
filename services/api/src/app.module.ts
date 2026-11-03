import { Module } from '@nestjs/common';
import { ConfigModule } from './infrastructure/config/config.module.js';
import { HealthModule } from './interface/health/health.module.js';

@Module({ imports: [ConfigModule, HealthModule] })
export class AppModule {}

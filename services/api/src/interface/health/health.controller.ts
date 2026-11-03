import { Controller, Get } from '@nestjs/common';
import { HealthResponseSchema, type HealthResponse } from '@itsm/contracts';
import { readFileSync } from 'node:fs';
import { Public } from '../auth/decorators.js';

const packageVersion: string =
  (
    JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as {
      version?: string;
    }
  ).version ?? '0.0.0';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  health(): HealthResponse {
    return HealthResponseSchema.parse({
      status: 'ok',
      service: 'api',
      version: packageVersion,
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  }
}

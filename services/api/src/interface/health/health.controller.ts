import { Controller, Get } from '@nestjs/common';
import { HealthResponseSchema, type HealthResponse } from '@itsm/contracts';
import { readFileSync } from 'node:fs';

const packageVersion: string =
  (
    JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as {
      version?: string;
    }
  ).version ?? '0.0.0';

@Controller('health')
export class HealthController {
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

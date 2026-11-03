import { Controller, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { IncidentMonitor } from '../../application/monitoring/incident-monitor.js';
import { Permission } from '../../domain/users/index.js';
import { RequirePermissions } from '../auth/decorators.js';

const SweepReportSchema = z.object({
  checked: z.number().int().nonnegative(),
  slaWarnings: z.number().int().nonnegative(),
  slaBreaches: z.number().int().nonnegative(),
  escalations: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
});
@Controller('monitor')
export class MonitorController {
  constructor(private readonly monitor: IncidentMonitor) {}
  @Post('sweep')
  @HttpCode(200)
  @RequirePermissions(Permission.CONFIG_MANAGE)
  async sweep() {
    return SweepReportSchema.parse(await this.monitor.sweep());
  }
}

import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { IncidentMonitor } from '../../application/monitoring/incident-monitor.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

@Injectable()
export class MonitorJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonitorJobs.name);
  private queue?: Queue;
  private worker?: Worker;
  constructor(
    private readonly monitor: IncidentMonitor,
    @Inject(ENV) private readonly env: Env,
  ) {}
  async onModuleInit(): Promise<void> {
    if (!this.env.MONITOR_ENABLED) return;
    const probe = new Redis(this.env.VALKEY_URL, {
      lazyConnect: true,
      retryStrategy: () => null,
      connectTimeout: 1500,
    });
    probe.on('error', () => {});
    try {
      await probe.connect();
      const url = new URL(this.env.VALKEY_URL);
      const connection = {
        host: url.hostname,
        port: Number(url.port || 6379),
        ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
        ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
        ...(url.pathname.length > 1 ? { db: Number(url.pathname.slice(1)) } : {}),
        ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
      };
      this.queue = new Queue('itsm-monitor', {
        connection: { ...connection, maxRetriesPerRequest: 1, retryStrategy: () => null },
      });
      this.queue.on('error', (error) => this.logger.warn(`Monitor queue: ${error.message}`));
      await this.queue.upsertJobScheduler('incident-sweep', {
        every: this.env.MONITOR_INTERVAL_MS,
      });
      this.worker = new Worker(
        'itsm-monitor',
        async () => {
          const report = await this.monitor.sweep();
          if (report.slaWarnings || report.slaBreaches || report.escalations)
            this.logger.log(report);
        },
        { connection },
      );
      this.worker.on('error', (error) => this.logger.warn(`Monitor worker: ${error.message}`));
    } catch (error) {
      this.logger.warn(
        `Valkey unavailable; scheduled monitoring disabled, manual sweep remains available: ${String(error)}`,
      );
      await this.queue?.close();
      this.queue = undefined;
    } finally {
      probe.disconnect();
    }
  }
  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}

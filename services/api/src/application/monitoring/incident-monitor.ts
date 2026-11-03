import { EscalationChainFactory, type EscalationPolicy } from '../../domain/escalation/index.js';
import { SlaBreached, SlaWarningRaised } from '../../domain/events/index.js';
import { ConcurrentModificationException } from '../../domain/exceptions/index.js';
import type { Incident } from '../../domain/incidents/index.js';
import type { Clock, Instant, IncidentId } from '../../domain/shared/index.js';
import type { EventPublisher, IncidentRepository } from '../../ports/index.js';

export interface SweepReport {
  checked: number;
  slaWarnings: number;
  slaBreaches: number;
  escalations: number;
  skipped: number;
  durationMs: number;
}
export interface MonitorLogger {
  error(message: string, error: unknown): void;
}
/** Periodic SLA + escalation sweep; overlapping triggers share the sweep in progress. */
export class IncidentMonitor {
  private running: Promise<SweepReport> | null = null;
  constructor(
    private readonly incidents: IncidentRepository,
    private readonly policy: EscalationPolicy,
    private readonly clock: Clock,
    private readonly events: EventPublisher,
    private readonly logger: MonitorLogger = console,
  ) {}
  sweep(now?: Instant): Promise<SweepReport> {
    // The timer and the manual endpoint can fire together; run one sweep and share its result.
    this.running ??= this.runSweep(now ?? this.clock.now()).finally(() => {
      this.running = null;
    });
    return this.running;
  }
  private async runSweep(now: Instant): Promise<SweepReport> {
    const start = Date.now();
    const report: SweepReport = {
      checked: 0,
      slaWarnings: 0,
      slaBreaches: 0,
      escalations: 0,
      skipped: 0,
      durationMs: 0,
    };
    const skipped = new Set<IncidentId>();
    const process = async (incident: Incident, check: () => void) => {
      try {
        check();
        const events = incident.pullEvents();
        if (!events.length) return;
        await this.incidents.save(incident);
        await this.events.publish(events);
        report.slaWarnings += events.filter((event) => event instanceof SlaWarningRaised).length;
        report.slaBreaches += events.filter((event) => event instanceof SlaBreached).length;
        report.escalations += events.filter((event) => event.type === 'IncidentEscalated').length;
      } catch (error) {
        skipped.add(incident.id);
        report.skipped++;
        if (!(error instanceof ConcurrentModificationException))
          this.logger.error(`Monitor failed for incident ${incident.id}`, error);
      }
    };
    for (const incident of await this.incidents.listOpenClassified()) {
      report.checked++;
      await process(incident, () => {
        incident.checkSla(now);
      });
    }
    const chain = EscalationChainFactory.create();
    for (const incident of await this.incidents.listAssignedUnacknowledged()) {
      if (skipped.has(incident.id)) continue;
      await process(incident, () => {
        incident.checkEscalation(chain, this.policy, now);
      });
    }
    report.durationMs = Date.now() - start;
    return report;
  }
}

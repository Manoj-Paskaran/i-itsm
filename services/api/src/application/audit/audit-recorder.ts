import { AuditRecord } from '../../domain/audit/index.js';
import type { DomainEvent } from '../../domain/events/index.js';
import type { AuditId } from '../../domain/shared/index.js';
import type { AuditSink, EventSubscriber } from '../../ports/index.js';

/** Observer subscriber that records each domain event in an audit sink. */
export class AuditRecorder implements EventSubscriber {
  readonly name = 'AuditRecorder';
  constructor(
    private readonly sink: AuditSink,
    private readonly nextId: () => AuditId,
  ) {}
  handles(): boolean {
    return true;
  }
  async on(event: DomainEvent): Promise<void> {
    await this.sink.append(AuditRecord.fromEvent(event, this.nextId()));
  }
}

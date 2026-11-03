import type { DomainEvent } from '../../domain/events/index.js';
import type { EventSubscriber } from '../../ports/index.js';
import { RealtimeGateway } from './realtime.gateway.js';
export class RealtimeBroadcaster implements EventSubscriber {
  readonly name = 'RealtimeBroadcaster';
  constructor(private readonly gateway: RealtimeGateway) {}
  handles(): boolean {
    return true;
  }
  on(event: DomainEvent): Promise<void> {
    this.gateway.incidentUpdated(event.incidentId);
    return Promise.resolve();
  }
}

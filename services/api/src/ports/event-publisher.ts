import type { DomainEvent, EventType } from '../domain/events/index.js';

export interface EventSubscriber {
  readonly name: string;
  handles(type: EventType): boolean;
  on(event: DomainEvent): Promise<void>;
}
export interface PublishReport {
  delivered: number;
  failures: Array<{ subscriber: string; eventType: EventType; error: unknown }>;
}
export interface EventPublisher {
  subscribe(s: EventSubscriber): void;
  publish(events: readonly DomainEvent[]): Promise<PublishReport>;
}

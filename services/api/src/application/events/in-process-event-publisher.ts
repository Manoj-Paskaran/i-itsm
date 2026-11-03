import type { DomainEvent } from '../../domain/events/index.js';
import { InvalidInputException } from '../../domain/exceptions/index.js';
import type { EventPublisher, EventSubscriber, PublishReport } from '../../ports/index.js';

/** Observer subject that dispatches domain events to registered subscribers. */
export class InProcessEventPublisher implements EventPublisher {
  private readonly subscribers: EventSubscriber[] = [];

  subscribe(subscriber: EventSubscriber): void {
    if (this.subscribers.some((existing) => existing.name === subscriber.name)) {
      throw new InvalidInputException('Subscriber name already registered', {
        name: subscriber.name,
      });
    }
    this.subscribers.push(subscriber);
  }

  async publish(events: readonly DomainEvent[]): Promise<PublishReport> {
    const report: PublishReport = { delivered: 0, failures: [] };
    for (const event of events) {
      for (const subscriber of this.subscribers) {
        try {
          if (!subscriber.handles(event.type)) continue;
          await subscriber.on(event);
          report.delivered++;
        } catch (error) {
          report.failures.push({ subscriber: subscriber.name, eventType: event.type, error });
        }
      }
    }
    return report;
  }
}

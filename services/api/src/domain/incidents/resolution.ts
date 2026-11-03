import type { Instant, UserId } from '../shared/index.js';
import { incidentText } from './validation.js';

export class Resolution {
  readonly summary: string;
  constructor(
    summary: string,
    readonly rootCause: string | undefined,
    readonly resolvedBy: UserId | null,
    readonly at: Instant,
  ) {
    this.summary = incidentText(summary, 'summary', 1, 5000);
    Object.freeze(this);
  }
}

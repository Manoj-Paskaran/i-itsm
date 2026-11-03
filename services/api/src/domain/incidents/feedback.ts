import type { Instant, Rating } from '../shared/index.js';
import { incidentText } from './validation.js';

export class Feedback {
  readonly comment: string | undefined;
  constructor(
    readonly rating: Rating,
    comment: string | undefined,
    readonly at: Instant,
  ) {
    this.comment = comment === undefined ? undefined : incidentText(comment, 'comment', 0, 2000);
    Object.freeze(this);
  }
}

import type { Instant, UserId } from '../shared/index.js';
import { incidentText } from './validation.js';

export class InvestigationNote {
  readonly text: string;
  constructor(
    readonly authorId: UserId | null,
    text: string,
    readonly at: Instant,
  ) {
    this.text = incidentText(text, 'note', 1, 5000);
    Object.freeze(this);
  }
}

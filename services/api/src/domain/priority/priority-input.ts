import { InvalidInputException } from '../exceptions/index.js';
import { BusinessCriticality, Impact, Urgency } from '../shared/index.js';

/** Validated impact, urgency, criticality, and affected-user inputs for priority assessment. */
export class PriorityInput {
  constructor(
    readonly impact: Impact,
    readonly urgency: Urgency,
    readonly criticality: BusinessCriticality,
    readonly affectedUsers: number,
  ) {
    if (!Number.isSafeInteger(affectedUsers) || affectedUsers < 1) {
      throw new InvalidInputException('Invalid affectedUsers.', { affectedUsers });
    }
  }
}

import type { AssignmentContext } from './assignment-context.js';
import type { Recommendation } from './recommendation.js';

import type { UserId } from '../shared/index.js';

/** Strategy pattern contract: rank candidate technicians for an incident. */
export interface AssignmentStrategy {
  readonly name: string;
  /** Pure: ranking never changes strategy state, so the UI can preview recommendations freely. */
  rank(ctx: AssignmentContext): Recommendation[];
  /** Optional hook for stateful strategies, called once an assignment is actually made. */
  recordAssignment?(technicianId: UserId): void;
}

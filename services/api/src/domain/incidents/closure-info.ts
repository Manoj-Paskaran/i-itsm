import type { IncidentId, Instant, UserId } from '../shared/index.js';
export type ClosureReason = 'RESOLVED' | 'DUPLICATE';

export class ClosureInfo {
  constructor(
    readonly reason: ClosureReason,
    readonly closedBy: UserId | null,
    readonly at: Instant,
    readonly duplicateOfId?: IncidentId,
  ) {
    Object.freeze(this);
  }
}

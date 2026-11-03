import { TechnicianUnavailableException, WorkloadExceededException } from '../exceptions/index.js';
import { numberIn } from '../shared/validation.js';
import { AssignmentContext } from './assignment-context.js';
import type { AssignmentStrategyRegistry } from './assignment-strategy-registry.js';
import type { Recommendation } from './recommendation.js';

/** Domain Service applying eligibility rules before invoking a Strategy. */
export class TechnicianAssigner {
  constructor(private readonly registry: AssignmentStrategyRegistry) {}
  recommend(ctx: AssignmentContext, limit = 3): Recommendation[] {
    numberIn(limit, 'limit', 0, Number.MAX_SAFE_INTEGER, true);
    const eligible = ctx.candidates.filter(
      ({ technician, activeIncidents }) =>
        technician.isAvailable() && technician.hasCapacity(activeIncidents),
    );
    return this.registry
      .active()
      .rank(
        new AssignmentContext(ctx.incidentId, ctx.serviceId, ctx.priority, ctx.category, eligible),
      )
      .slice(0, limit);
  }
  /** Tells the active strategy an assignment was made (advances round-robin rotation). */
  confirm(recommendation: Recommendation): void {
    this.registry.active().recordAssignment?.(recommendation.technicianId);
  }
  pick(ctx: AssignmentContext): Recommendation {
    const available = ctx.candidates.filter(({ technician }) => technician.isAvailable());
    if (!available.length) throw new TechnicianUnavailableException();
    const eligible = available.filter(({ technician, activeIncidents }) =>
      technician.hasCapacity(activeIncidents),
    );
    if (!eligible.length) {
      const least = [...available].sort(
        (a, b) =>
          a.activeIncidents / a.technician.capacity() -
            b.activeIncidents / b.technician.capacity() ||
          (a.technician.id() < b.technician.id()
            ? -1
            : a.technician.id() > b.technician.id()
              ? 1
              : 0),
      )[0]!;
      throw new WorkloadExceededException(
        least.technician.id(),
        least.activeIncidents,
        least.technician.capacity(),
      );
    }
    return this.registry
      .active()
      .rank(
        new AssignmentContext(ctx.incidentId, ctx.serviceId, ctx.priority, ctx.category, eligible),
      )[0]!;
  }
}

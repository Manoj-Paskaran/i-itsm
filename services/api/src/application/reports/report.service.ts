import { Permission, type User } from '../../domain/users/index.js';
import type { Clock } from '../../domain/shared/index.js';
import type { ReportQueries } from '../../ports/reports.js';
export class ReportService {
  constructor(
    private readonly queries: ReportQueries,
    private readonly clock: Clock,
  ) {}
  overview(user: User) {
    user.require(Permission.REPORTS_VIEW);
    return this.queries.overview(this.clock.now());
  }
  workload(user: User) {
    user.require(Permission.REPORTS_VIEW);
    return this.queries.workload(this.clock.now());
  }
  services(user: User) {
    user.require(Permission.REPORTS_VIEW);
    return this.queries.services();
  }
  sla(user: User) {
    user.require(Permission.REPORTS_VIEW);
    return this.queries.sla(this.clock.now());
  }
  trends(user: User, days: number) {
    user.require(Permission.REPORTS_VIEW);
    return this.queries.trends(days, this.clock.now());
  }
}

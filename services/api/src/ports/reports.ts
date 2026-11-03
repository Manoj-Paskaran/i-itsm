import type {
  OverviewReport,
  WorkloadReport,
  ServiceReport,
  SlaReport,
  TrendReport,
} from '@itsm/contracts';
import type { Instant } from '../domain/shared/index.js';
export interface ReportQueries {
  overview(now: Instant): Promise<OverviewReport>;
  workload(now: Instant): Promise<WorkloadReport>;
  services(): Promise<ServiceReport>;
  sla(now: Instant): Promise<SlaReport>;
  trends(days: number, now: Instant): Promise<TrendReport>;
}
export const REPORT_QUERIES = Symbol('REPORT_QUERIES');

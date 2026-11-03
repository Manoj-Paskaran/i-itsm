import { z } from 'zod';
import { PersonRefSchema, ServiceSummarySchema, TechnicianSummarySchema } from './catalog.js';
import { IncidentStatusSchema, PrioritySchema } from './incidents.js';

const count = z.number().int().nonnegative();
const compliance = z.number().min(0).max(1).nullable();
export const OverviewReportSchema = z.object({
  total: count,
  open: count,
  critical: count,
  resolved: count,
  slaViolations: count,
  duplicates: count,
  byStatus: z.record(IncidentStatusSchema, count),
  byPriority: z.record(PrioritySchema, count),
  avgResolutionMinutes: z.number().nonnegative().nullable(),
});
export const WorkloadReportSchema = z.array(
  z.object({
    technician: PersonRefSchema,
    role: TechnicianSummarySchema.shape.role,
    active: count,
    capacity: count,
    utilisation: z.number().nonnegative(),
    resolvedLast30Days: count,
    availability: TechnicianSummarySchema.shape.availability,
  }),
);
export const ServiceReportSchema = z.array(
  z.object({ service: ServiceSummarySchema, total: count, open: count, slaViolations: count }),
);
export const SlaReportSchema = z.object({
  met: count,
  breached: count,
  compliance,
  atRiskNow: count,
  breachedOpen: count,
  byPriority: z.array(
    z.object({ priority: PrioritySchema, met: count, breached: count, compliance }),
  ),
});
export const TrendQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});
export const TrendReportSchema = z.object({
  days: z.array(z.object({ date: z.iso.date(), created: count, resolved: count })),
});
export type OverviewReport = z.infer<typeof OverviewReportSchema>;
export type WorkloadReport = z.infer<typeof WorkloadReportSchema>;
export type ServiceReport = z.infer<typeof ServiceReportSchema>;
export type SlaReport = z.infer<typeof SlaReportSchema>;
export type TrendReport = z.infer<typeof TrendReportSchema>;

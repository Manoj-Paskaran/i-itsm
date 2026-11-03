import { z } from 'zod';
import { CategorySummarySchema, PersonRefSchema, ServiceSummarySchema } from './catalog.js';

export const IncidentStatusSchema = z.enum([
  'NEW',
  'CLASSIFIED',
  'ASSIGNED',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'PENDING_INFO',
  'RESOLVED',
  'VERIFIED',
  'CLOSED',
  'REOPENED',
]);
export const PrioritySchema = z.enum(['P1', 'P2', 'P3', 'P4']);
export const SlaStatusSchema = z.enum(['ON_TRACK', 'AT_RISK', 'BREACHED', 'MET', 'PAUSED']);
export const IncidentActionSchema = z.enum([
  'classify',
  'assign',
  'acknowledge',
  'startWork',
  'addNote',
  'requestInfo',
  'provideInfo',
  'resolve',
  'verify',
  'reject',
  'close',
  'closeAsDuplicate',
  // Not a state transition: the reporter may rate a verified or closed incident once.
  'giveFeedback',
]);
export const EscalationLevelSchema = z.enum(['TECHNICIAN', 'TEAM_LEAD', 'SYS_ADMIN', 'IT_MANAGER']);
const iso = z.iso.datetime({ offset: true });
const level = z.number().int().min(1).max(4);
const text = z.string().trim().min(1).max(5000);
export const CreateIncidentRequestSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(5000),
  serviceId: z.uuid(),
  impact: level,
  urgency: level,
  affectedUsers: z.number().int().min(1).max(1_000_000),
});
export const IncidentSummarySchema = z.object({
  id: z.uuid(),
  number: z.string(),
  title: z.string(),
  status: IncidentStatusSchema,
  priority: PrioritySchema.nullable(),
  service: ServiceSummarySchema,
  category: CategorySummarySchema.nullable(),
  reporter: PersonRefSchema,
  assignee: PersonRefSchema.nullable(),
  createdAt: iso,
  slaStatus: SlaStatusSchema.nullable(),
  escalationLevel: EscalationLevelSchema,
});
export const IncidentDetailSchema = IncidentSummarySchema.extend({
  description: z.string(),
  impact: level,
  urgency: level,
  affectedUsers: z.number().int().positive(),
  slaDeadlines: z.object({ response: iso, resolution: iso }).nullable(),
  priorityRationale: z.array(z.string()),
  notes: z.array(z.object({ author: PersonRefSchema, text: z.string(), at: iso })),
  infoRequests: z.array(
    z.object({
      question: z.string(),
      askedBy: PersonRefSchema,
      askedAt: iso,
      answer: z.string().nullable(),
      answeredAt: iso.nullable(),
    }),
  ),
  resolution: z
    .object({
      summary: z.string(),
      rootCause: z.string().nullable(),
      resolvedBy: PersonRefSchema,
      at: iso,
    })
    .nullable(),
  feedback: z
    .object({ rating: z.number().int().min(1).max(5), comment: z.string().nullable(), at: iso })
    .nullable(),
  closure: z
    .object({
      reason: z.enum(['RESOLVED', 'DUPLICATE']),
      closedBy: PersonRefSchema.nullable(),
      at: iso,
      duplicateOf: z.object({ id: z.uuid(), number: z.string() }).nullable(),
    })
    .nullable(),
  reopenCount: z.number().int().nonnegative(),
  allowedActions: z.array(IncidentActionSchema),
  assignmentReasons: z.array(z.string()),
});
export const AssignRequestSchema = z.object({ technicianId: z.uuid().optional() });
export const NoteRequestSchema = z.object({ text });
export const RequestInfoSchema = z.object({ question: text });
export const ProvideInfoSchema = z.object({ answer: text });
export const ResolveRequestSchema = z.object({ summary: text, rootCause: text.optional() });
export const RejectRequestSchema = z.object({ reason: text });
export const FeedbackRequestSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: text.optional(),
});
export const CloseAsDuplicateRequestSchema = z.object({ duplicateOfId: z.uuid() });
export const IncidentListQuerySchema = z.object({
  from: z.union([z.iso.date(), iso]).optional(),
  to: z.union([z.iso.date(), iso]).optional(),
  categoryId: z.uuid().optional(),
  sla: z.enum(['BREACHED', 'WITHIN_SLA']).optional(),
  status: IncidentStatusSchema.optional(),
  priority: PrioritySchema.optional(),
  serviceId: z.uuid().optional(),
  assigneeId: z.uuid().optional(),
  q: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export const RecommendationSchema = z.object({
  technician: PersonRefSchema,
  score: z.number().min(0).max(1),
  reasons: z.array(z.string()),
  strategy: z.string(),
});
export const AuditEntrySchema = z.object({
  at: iso,
  actor: PersonRefSchema.nullable(),
  action: z.string(),
  fromStatus: IncidentStatusSchema.nullable(),
  toStatus: IncidentStatusSchema.nullable(),
  description: z.string(),
});
export type CreateIncidentRequest = z.infer<typeof CreateIncidentRequestSchema>;
export type IncidentSummary = z.infer<typeof IncidentSummarySchema>;
export type IncidentDetail = z.infer<typeof IncidentDetailSchema>;
export type IncidentListQuery = z.infer<typeof IncidentListQuerySchema>;

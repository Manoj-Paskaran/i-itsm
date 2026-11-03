import { z } from 'zod';
import { RoleSchema } from './auth.js';
import { CategorySummarySchema, PersonRefSchema, ServiceSummarySchema } from './catalog.js';
import { AuditEntrySchema, PrioritySchema } from './incidents.js';

const name = z.string().trim().min(1).max(100);
const skill = z.string().trim().min(1);
const availability = z.enum(['AVAILABLE', 'BUSY', 'OFF_SHIFT', 'ON_LEAVE']);
const technicianFields = {
  skills: z.array(skill),
  maxActiveIncidents: z.number().int().min(1).max(20),
  experienceYears: z.number().min(0).max(50),
};
export const AdminUserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: RoleSchema,
  active: z.boolean(),
  department: z.string().nullable(),
  technician: z
    .object({
      skills: z.array(z.string()),
      capacity: z.number(),
      availability,
      experienceYears: z.number(),
    })
    .nullable(),
  team: z.array(PersonRefSchema),
});
export const CreateUserRequestSchema = z.object({
  name,
  email: z.email(),
  password: z.string().min(8).max(128),
  role: RoleSchema,
  department: name.optional(),
  skills: technicianFields.skills.optional(),
  maxActiveIncidents: technicianFields.maxActiveIncidents.optional(),
  experienceYears: technicianFields.experienceYears.optional(),
});
export const UpdateUserRequestSchema = z
  .object({
    name: name.optional(),
    active: z.boolean().optional(),
    department: name.optional(),
    skills: technicianFields.skills.optional(),
    maxActiveIncidents: technicianFields.maxActiveIncidents.optional(),
    availability: availability.optional(),
    experienceYears: technicianFields.experienceYears.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export const AdminServiceSchema = ServiceSummarySchema.extend({
  description: z.string().nullable(),
  active: z.boolean(),
});
export const CreateServiceRequestSchema = z.object({
  name,
  description: z.string().trim().min(1).optional(),
  criticality: z.number().int().min(1).max(4),
});
export const UpdateServiceRequestSchema = CreateServiceRequestSchema.partial().extend({
  active: z.boolean().optional(),
});
export const AdminCategorySchema = CategorySummarySchema.extend({
  requiredSkill: z.string(),
  active: z.boolean(),
});
export const CreateCategoryRequestSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/),
  name,
  requiredSkill: skill,
});
export const UpdateCategoryRequestSchema = z.object({
  name: name.optional(),
  requiredSkill: skill.optional(),
  active: z.boolean().optional(),
});
const target = z.object({
  priority: PrioritySchema,
  responseMinutes: z.number().positive(),
  resolutionMinutes: z.number().positive(),
});
const targets = z
  .array(target)
  .length(4)
  .refine(
    (values) => new Set(values.map((value) => value.priority)).size === 4,
    'Each priority is required exactly once',
  );
export const SlaPolicyViewSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  service: ServiceSummarySchema.nullable(),
  warningRatio: z.number(),
  targets,
});
export const UpsertSlaPolicyRequestSchema = z.object({
  name,
  serviceId: z.uuid().nullable(),
  warningRatio: z.number().gt(0).lt(1),
  targets,
});
export const StrategySettingsSchema = z.object({
  priority: z.object({ active: z.string(), available: z.array(z.string()) }),
  assignment: z.object({ active: z.string(), available: z.array(z.string()) }),
});
export const UpdateStrategiesRequestSchema = z.object({
  priority: z.string().optional(),
  assignment: z.string().optional(),
});
const date = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);
export const AuditSearchQuerySchema = z.object({
  incidentId: z.uuid().optional(),
  actorId: z.uuid().optional(),
  action: z.string().trim().min(1).optional(),
  from: date.optional(),
  to: date.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export const AuditLogEntrySchema = AuditEntrySchema.extend({
  incident: z.object({ id: z.uuid(), number: z.string() }),
});

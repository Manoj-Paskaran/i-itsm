import { z } from 'zod';
import { RoleSchema } from './auth.js';

export const PersonRefSchema = z.object({ id: z.uuid(), name: z.string() });
export const ServiceSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  criticality: z.number().int().min(1).max(4),
});
export const CategorySummarySchema = z.object({ id: z.uuid(), code: z.string(), name: z.string() });
export const TechnicianSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  role: RoleSchema,
  skills: z.array(z.string()),
  availability: z.enum(['AVAILABLE', 'BUSY', 'OFF_SHIFT', 'ON_LEAVE']),
  activeIncidents: z.number().int().nonnegative(),
  capacity: z.number().int().nonnegative(),
});
export type PersonRef = z.infer<typeof PersonRefSchema>;
export type ServiceSummary = z.infer<typeof ServiceSummarySchema>;
export type CategorySummary = z.infer<typeof CategorySummarySchema>;
export type TechnicianSummary = z.infer<typeof TechnicianSummarySchema>;

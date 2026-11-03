import { z } from 'zod';
export const RoleSchema = z.enum(['EMPLOYEE', 'TECHNICIAN', 'TEAM_LEAD', 'ADMIN', 'IT_MANAGER']);
export const PermissionSchema = z.enum([
  'INCIDENT_REPORT',
  'INCIDENT_VIEW_OWN',
  'INCIDENT_VIEW_ASSIGNED',
  'INCIDENT_VIEW_ALL',
  'INCIDENT_WORK',
  'INCIDENT_ASSIGN',
  'INCIDENT_VERIFY_OWN',
  'INCIDENT_FEEDBACK',
  'CONFIG_MANAGE',
  'REPORTS_VIEW',
  'AUDIT_VIEW',
]);
export const RegisterRequestSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.email(),
  password: z.string().min(8).max(128),
  department: z.string().min(1).max(80),
});
export const LoginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
});
export const AuthUserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: RoleSchema,
  permissions: z.array(PermissionSchema),
});
export const AuthResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int().positive(),
  user: AuthUserSchema,
});
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type AuthUser = z.infer<typeof AuthUserSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

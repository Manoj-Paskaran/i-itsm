import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  JWT_SECRET: z.string().min(32).optional(),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z
    .url()
    .refine(
      (value) => ['postgres:', 'postgresql:'].includes(URL.parse(value)?.protocol ?? ''),
      'Must be a PostgreSQL URL',
    )
    .default('postgresql://itsm:itsm@localhost:5432/itsm'),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
});

export type Env = Omit<z.infer<typeof EnvSchema>, 'JWT_SECRET'> & { JWT_SECRET: string };

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(
      `Invalid environment: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
    );
  }
  if (!result.data.JWT_SECRET && result.data.NODE_ENV === 'production')
    throw new Error('Invalid environment: JWT_SECRET is required in production');
  return {
    ...result.data,
    JWT_SECRET: result.data.JWT_SECRET ?? 'itsm-fixed-development-secret-not-for-production',
  };
}

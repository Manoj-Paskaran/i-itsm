import { defineConfig } from 'drizzle-kit';
import { loadEnv } from './src/infrastructure/config/env.js';
export default defineConfig({
  schema: './src/infrastructure/db/schema/index.ts',
  out: './src/infrastructure/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: loadEnv().DATABASE_URL },
});

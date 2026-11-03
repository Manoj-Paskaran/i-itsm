import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../config/env.js';
import { createDatabase } from './database.js';

const connection = createDatabase(loadEnv().DATABASE_URL);
try {
  await migrate(connection.db, {
    migrationsFolder: fileURLToPath(
      new URL('../../../src/infrastructure/db/migrations', import.meta.url),
    ),
  });
} finally {
  await connection.close();
}

import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from '../database.js';

/** One isolated Postgres instance per integration test file. */
export async function startTestPostgres() {
  const container = await new PostgreSqlContainer('pgvector/pgvector:0.8.7-pg18-trixie').start();
  const connection = createDatabase(container.getConnectionUri());
  try {
    await migrate(connection.db, {
      migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
    });
  } catch (error) {
    await connection.close();
    await container.stop();
    throw error;
  }
  return {
    ...connection,
    async stop() {
      // Silence the pool before the server goes away, so shutdown can't surface as an unhandled error.
      connection.pool.removeAllListeners('error');
      connection.pool.on('error', () => undefined);
      try {
        await connection.close();
      } finally {
        await container.stop();
      }
    },
    async clear() {
      await connection.pool.query(
        'TRUNCATE audit_records, incidents, users, it_services, categories, sla_policies CASCADE',
      );
    },
  };
}
export type TestPostgres = Awaited<ReturnType<typeof startTestPostgres>>;

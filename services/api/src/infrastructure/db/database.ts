import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { ConfigModule, ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import * as schema from './schema/index.js';

export function createDatabase(url: string) {
  const pool = new pg.Pool({ connectionString: url });
  // An idle client losing its connection (e.g. Postgres restarting) must not crash the API.
  pool.on('error', (error) => console.warn(`Postgres pool: idle client error: ${error.message}`));
  return { db: drizzle(pool, { schema }), pool, close: () => pool.end() };
}
export type Database = ReturnType<typeof createDatabase>['db'];
export const DB = Symbol('DB');
const CONNECTION = Symbol('DATABASE_CONNECTION');

export async function nextIncidentNumber(db: Database): Promise<string> {
  const result = await db.execute<{ number: string }>(
    sql`select 'INC' || case when length(n) < 4 then lpad(n, 4, '0') else n end as number from (select nextval('incident_number_seq')::text as n) sequence_value`,
  );
  const row = result.rows[0];
  if (!row) throw new Error('Incident sequence returned no value');
  return row.number;
}
@Injectable()
class DatabaseShutdown implements OnApplicationShutdown {
  constructor(@Inject(CONNECTION) private readonly connection: ReturnType<typeof createDatabase>) {}
  async onApplicationShutdown(): Promise<void> {
    await this.connection.close();
  }
}
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: CONNECTION,
      useFactory: (env: Env) => createDatabase(env.DATABASE_URL),
      inject: [ENV],
    },
    {
      provide: DB,
      useFactory: (connection: ReturnType<typeof createDatabase>) => connection.db,
      inject: [CONNECTION],
    },
    DatabaseShutdown,
  ],
  exports: [DB],
})
export class DatabaseModule {}

import { describe, expect, it } from 'vitest';
import { getTableColumns, getTableName } from 'drizzle-orm';
import * as schema from './schema/index.js';

describe('database schema', () => {
  it('exportsTablesAndKeyColumns', () => {
    for (const table of [
      schema.users,
      schema.technicianSkills,
      schema.technicianServiceHistory,
      schema.teamMembers,
      schema.itServices,
      schema.categories,
      schema.slaPolicies,
      schema.slaTargets,
      schema.incidents,
      schema.investigationNotes,
      schema.infoRequests,
      schema.auditRecords,
    ])
      expect(getTableName(table)).toBeTruthy();
    expect(getTableColumns(schema.incidents)).toHaveProperty('version');
    expect(getTableColumns(schema.incidents)).toHaveProperty('embedding');
    expect(getTableColumns(schema.incidents)).toHaveProperty('search');
    expect(getTableColumns(schema.users)).toHaveProperty('passwordHash');
    expect(getTableColumns(schema.slaTargets)).toHaveProperty('responseMs');
  });
});

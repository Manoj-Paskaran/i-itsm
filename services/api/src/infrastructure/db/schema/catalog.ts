import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, smallint, text, uuid } from 'drizzle-orm/pg-core';
export const itServices = pgTable(
  'it_services',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    name: text().notNull().unique(),
    description: text().notNull(),
    criticality: smallint().notNull(),
    active: boolean().notNull(),
  },
  (t) => [check('it_services_criticality_check', sql`${t.criticality} between 1 and 4`)],
);
export const categories = pgTable('categories', {
  id: uuid()
    .primaryKey()
    .default(sql`uuidv7()`),
  code: text().notNull().unique(),
  name: text().notNull(),
  requiredSkill: text('required_skill').notNull(),
  active: boolean().notNull(),
});

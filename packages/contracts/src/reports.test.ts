import { expect, it } from 'vitest';
import { IncidentListQuerySchema } from './incidents.js';
import { OverviewReportSchema, TrendQuerySchema } from './reports.js';
it('acceptsReportSearchFiltersAndRejectsInvalidDates', () => {
  expect(
    IncidentListQuerySchema.parse({
      from: '2026-11-01',
      to: '2026-11-03T10:00:00Z',
      sla: 'BREACHED',
    }),
  ).toMatchObject({ sla: 'BREACHED' });
  expect(IncidentListQuerySchema.safeParse({ from: '2026-02-30' }).success).toBe(false);
});
it('limitsTrendDaysAndRequiresCompleteBreakdowns', () => {
  expect(TrendQuerySchema.parse({}).days).toBe(30);
  expect(TrendQuerySchema.safeParse({ days: 91 }).success).toBe(false);
  expect(OverviewReportSchema.safeParse({ total: 0, byStatus: {} }).success).toBe(false);
});

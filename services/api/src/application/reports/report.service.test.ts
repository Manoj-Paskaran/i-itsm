import { expect, it } from 'vitest';
import { UnauthorizedOperationException } from '../../domain/exceptions/index.js';
import {
  at,
  employee,
  service,
  snapshot,
  technician,
} from '../../domain/incidents/test-fixtures.js';
import { FixedClock } from '../../domain/shared/index.js';
import { InMemoryReportQueries } from '../testing/in-memory-report-queries.js';
import { ReportService } from './report.service.js';

const closed = snapshot('CLOSED');
const breach = { ...closed, slaClock: { ...closed.slaClock!, breached: ['RESOLUTION' as const] } };
const duplicate = { ...closed, closure: { ...closed.closure!, reason: 'DUPLICATE' as const } };
const active = { ...snapshot('ASSIGNED'), priority: 'P1' as const };
const queries = new InMemoryReportQueries(
  [active, closed, breach, duplicate],
  [technician],
  [service],
);
it('employeeCannotViewReports', () => {
  const reports = new ReportService(queries, new FixedClock(at));
  expect(() => reports.overview(employee)).toThrow(UnauthorizedOperationException);
});
it('overviewCountsOpenCriticalAndResolved', async () => {
  expect(await queries.overview(at)).toMatchObject({
    total: 4,
    open: 1,
    critical: 1,
    resolved: 2,
    duplicates: 1,
  });
});
it('duplicatesAreExcludedFromResolvedAndSla', async () => {
  const q = new InMemoryReportQueries([{ ...breach, closure: duplicate.closure }], [], []);
  expect(await q.overview(at)).toMatchObject({ resolved: 0, duplicates: 1 });
  expect(await q.sla(at)).toMatchObject({ met: 0, breached: 0, compliance: null });
});
it('slaComplianceIsMetOverMetPlusBreached', async () => {
  expect(await queries.sla(at)).toMatchObject({ met: 1, breached: 1, compliance: 0.5 });
});
it('workloadShowsActiveAgainstCapacity', async () => {
  expect(await queries.workload(at)).toMatchObject([
    { active: 1, capacity: 2, utilisation: 0.5, resolvedLast30Days: 2 },
  ]);
});
it('servicesSortedByIncidentCount', async () => {
  const other = service.toSnapshot();
  const { ItService } = await import('../../domain/catalog/index.js');
  const { asItServiceId } = await import('../../domain/shared/index.js');
  const otherService = ItService.create({ ...other, id: asItServiceId('other'), name: 'Other' });
  expect(
    (await new InMemoryReportQueries([active], [], [otherService, service]).services()).map(
      (x) => x.total,
    ),
  ).toEqual([1, 0]);
});
it('trendsZeroFillMissingDays', async () => {
  expect((await queries.trends(2, at)).days).toEqual([
    { date: '2026-11-02', created: 0, resolved: 0 },
    { date: '2026-11-03', created: 4, resolved: 2 },
  ]);
});

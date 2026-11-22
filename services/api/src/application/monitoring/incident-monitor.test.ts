import { describe, expect, it, vi } from 'vitest';
import { EscalationPolicy } from '../../domain/escalation/index.js';
import { ConcurrentModificationException } from '../../domain/exceptions/index.js';
import { Incident } from '../../domain/incidents/index.js';
import { at, snapshot } from '../../domain/incidents/test-fixtures.js';
import { asAuditId, Duration, FixedClock } from '../../domain/shared/index.js';
import { AuditRecorder } from '../audit/audit-recorder.js';
import { InProcessEventPublisher } from '../events/in-process-event-publisher.js';
import { InMemoryAuditRepository } from '../testing/in-memory-audit-repository.js';
import { InMemoryIncidentRepository } from '../testing/in-memory-incident-repository.js';
import { IncidentMonitor } from './incident-monitor.js';

async function setup(status: 'CLASSIFIED' | 'ASSIGNED' | 'ACKNOWLEDGED' = 'CLASSIFIED') {
  const incidents = new InMemoryIncidentRepository();
  const incident = Incident.rehydrate({ ...snapshot(status), priority: 'P1' });
  await incidents.save(incident);
  const clock = new FixedClock(at);
  const audit = new InMemoryAuditRepository();
  const events = new InProcessEventPublisher();
  let n = 0;
  events.subscribe(new AuditRecorder(audit, () => asAuditId(`audit-${++n}`)));
  const monitor = new IncidentMonitor(incidents, EscalationPolicy.demo(), clock, events);
  return { incidents, incident, clock, audit, monitor };
}
describe('IncidentMonitor rules', () => {
  it('sweepRaisesSlaWarningAtSeventyFivePercent', async () => {
    const { clock, monitor } = await setup();
    clock.advance(Duration.ofSeconds(675));
    expect(await monitor.sweep()).toMatchObject({ checked: 1, slaWarnings: 1, slaBreaches: 0 });
  });
  it('sweepRecordsSlaBreachOnce', async () => {
    const { clock, monitor, audit, incident } = await setup();
    clock.advance(Duration.ofMinutes(16));
    expect((await monitor.sweep()).slaBreaches).toBe(1);
    expect((await monitor.sweep()).slaBreaches).toBe(0);
    expect(
      (await audit.listByIncident(incident.id)).filter(
        (e) => e.toSnapshot().action === 'SlaBreached',
      ),
    ).toHaveLength(1);
  });
  it('sweepEscalatesUnacknowledgedP1WithDemoPolicy', async () => {
    const { clock, monitor, incidents, incident } = await setup('ASSIGNED');
    clock.advance(Duration.ofSeconds(65));
    expect((await monitor.sweep()).escalations).toBe(1);
    expect((await incidents.findById(incident.id))?.escalationLevel()).toBe('TEAM_LEAD');
    clock.advance(Duration.ofSeconds(30));
    expect((await monitor.sweep()).escalations).toBe(1);
    expect((await incidents.findById(incident.id))?.escalationLevel()).toBe('SYS_ADMIN');
  });
  it('sweepIgnoresAcknowledgedIncidents', async () => {
    const { clock, monitor } = await setup('ACKNOWLEDGED');
    clock.advance(Duration.ofSeconds(125));
    expect((await monitor.sweep()).escalations).toBe(0);
  });
  it('overlappingSweepsShareOneRun', async () => {
    const { clock, monitor, incidents } = await setup();
    clock.advance(Duration.ofMinutes(16));
    const save = vi.spyOn(incidents, 'save');
    const [first, second] = await Promise.all([monitor.sweep(), monitor.sweep()]);
    expect(second).toBe(first);
    expect(first.skipped).toBe(0);
    expect(save).toHaveBeenCalledTimes(1);
  });
  it('sweepSkipsConcurrentModification', async () => {
    const { clock, monitor, incidents, incident } = await setup();
    clock.advance(Duration.ofMinutes(16));
    vi.spyOn(incidents, 'save').mockRejectedValue(new ConcurrentModificationException(incident.id));
    expect(await monitor.sweep()).toMatchObject({ skipped: 1, slaBreaches: 0 });
  });
  it('sweepCountsAndLogsOtherIncidentErrors', async () => {
    const { clock, incidents } = await setup();
    const logger = { error: vi.fn() };
    const monitor = new IncidentMonitor(
      incidents,
      EscalationPolicy.demo(),
      clock,
      new InProcessEventPublisher(),
      logger,
    );
    clock.advance(Duration.ofMinutes(16));
    vi.spyOn(incidents, 'save').mockRejectedValue(new Error('storage failed'));
    expect((await monitor.sweep()).skipped).toBe(1);
    expect(logger.error).toHaveBeenCalledOnce();
  });
  it('sweepPublishesEventsToAudit', async () => {
    const { clock, monitor, audit, incident } = await setup();
    clock.advance(Duration.ofSeconds(675));
    await monitor.sweep();
    expect((await audit.listByIncident(incident.id)).map((e) => e.toSnapshot().action)).toContain(
      'SlaWarningRaised',
    );
  });
});

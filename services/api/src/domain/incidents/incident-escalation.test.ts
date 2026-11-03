import { describe, expect, it } from 'vitest';
import { EscalationChainFactory, EscalationLevel, EscalationPolicy } from '../escalation/index.js';
import { IncidentEscalated } from '../events/index.js';
import { Duration } from '../shared/index.js';
import { Incident } from './incident.js';
import { assignee, at, inState, otherTechnician, system } from './test-fixtures.js';

const chain = EscalationChainFactory.create();
const policy = EscalationPolicy.standard();
const after = (minutes: number) => at.plus(Duration.ofMinutes(minutes));
describe('incident escalation', () => {
  it('checkEscalationRecordsIncidentEscalatedEvent', () => {
    const incident = inState('ASSIGNED');
    const decision = incident.checkEscalation(chain, policy, after(15));
    const event = incident.pullEvents()[0];
    expect(event).toBeInstanceOf(IncidentEscalated);
    expect(event).toMatchObject({
      fromStatus: null,
      toStatus: null,
      from: EscalationLevel.TECHNICIAN,
      to: EscalationLevel.TEAM_LEAD,
    });
    expect(event?.describe()).toBe(decision?.reason);
    expect(incident.status()).toBe('ASSIGNED');
  });
  it('acknowledgedIncidentIsNotEscalated', () => {
    const incident = inState('ASSIGNED');
    incident.acknowledge(assignee, after(1));
    incident.pullEvents();
    expect(incident.checkEscalation(chain, policy, after(30))).toBeNull();
    expect(incident.pullEvents()).toHaveLength(0);
  });
  it('reassignmentResetsEscalationWindow', () => {
    const incident = inState('ASSIGNED');
    incident.checkEscalation(chain, policy, after(30));
    incident.assign(otherTechnician, 0, system, after(31));
    expect(incident.escalationLevel()).toBe(EscalationLevel.TECHNICIAN);
    expect(incident.checkEscalation(chain, policy, after(45))).toBeNull();
    expect(incident.checkEscalation(chain, policy, after(46))?.to).toBe(EscalationLevel.TEAM_LEAD);
  });
  it('checkEscalationIsIdempotentWithinABand', () => {
    const incident = inState('ASSIGNED');
    incident.checkEscalation(chain, policy, after(15));
    incident.pullEvents();
    expect(incident.checkEscalation(chain, policy, after(16))).toBeNull();
    expect(incident.pullEvents()).toHaveLength(0);
  });
  it('snapshotRoundTripKeepsEscalationLevelAndAssignmentTime', () => {
    const incident = inState('ASSIGNED');
    incident.checkEscalation(chain, policy, after(15));
    const restored = Incident.rehydrate(incident.toSnapshot());
    expect(restored.toSnapshot()).toEqual(incident.toSnapshot());
    expect(restored.escalationLevel()).toBe(EscalationLevel.TEAM_LEAD);
    expect(restored.checkEscalation(chain, policy, after(30))?.to).toBe(EscalationLevel.SYS_ADMIN);
  });
});

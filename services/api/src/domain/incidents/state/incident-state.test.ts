import { describe, expect, it } from 'vitest';
import {
  InvalidIncidentException,
  InvalidStateTransitionException,
} from '../../exceptions/index.js';
import { Priority } from '../../shared/index.js';
import { Incident } from '../incident.js';
import {
  at,
  assignee,
  category,
  sla,
  duplicateId,
  inState,
  otherTechnician,
  reporter,
  snapshot,
  system,
} from '../test-fixtures.js';
import { IncidentStates, type IncidentAction, type IncidentStatus } from './index.js';

// Deliberately literal and independent of the production states and action constants.
const table: Record<IncidentStatus, Partial<Record<IncidentAction, IncidentStatus>>> = {
  NEW: { classify: 'CLASSIFIED' },
  CLASSIFIED: { assign: 'ASSIGNED', closeAsDuplicate: 'CLOSED' },
  ASSIGNED: {
    assign: 'ASSIGNED',
    acknowledge: 'ACKNOWLEDGED',
    addNote: 'ASSIGNED',
    closeAsDuplicate: 'CLOSED',
  },
  ACKNOWLEDGED: { startWork: 'IN_PROGRESS', assign: 'ASSIGNED', addNote: 'ACKNOWLEDGED' },
  IN_PROGRESS: {
    requestInfo: 'PENDING_INFO',
    resolve: 'RESOLVED',
    assign: 'ASSIGNED',
    addNote: 'IN_PROGRESS',
  },
  PENDING_INFO: { provideInfo: 'IN_PROGRESS', addNote: 'PENDING_INFO' },
  RESOLVED: { verify: 'VERIFIED', reject: 'REOPENED' },
  VERIFIED: { close: 'CLOSED' },
  REOPENED: { startWork: 'IN_PROGRESS', addNote: 'REOPENED' },
  CLOSED: {},
};
const actions: readonly IncidentAction[] = [
  'classify',
  'assign',
  'acknowledge',
  'startWork',
  'addNote',
  'requestInfo',
  'provideInfo',
  'resolve',
  'verify',
  'reject',
  'close',
  'closeAsDuplicate',
];
const statuses = Object.keys(table) as IncidentStatus[];
const invoke: Record<IncidentAction, (incident: Incident) => void> = {
  classify: (i) => i.classify(category, Priority.P2, sla, system, at),
  assign: (i) => i.assign(otherTechnician, 0, system, at),
  acknowledge: (i) => i.acknowledge(assignee, at),
  startWork: (i) => i.startWork(assignee, at),
  addNote: (i) => i.addNote('Investigating', assignee, at),
  requestInfo: (i) => i.requestInfo('Which office?', assignee, at),
  provideInfo: (i) => i.provideInfo('Office A', reporter, at),
  resolve: (i) => i.resolve('Router restarted', undefined, assignee, at),
  verify: (i) => i.verify(reporter, at),
  reject: (i) => i.reject('Still broken', reporter, at),
  close: (i) => i.close(reporter, at),
  closeAsDuplicate: (i) => i.closeAsDuplicate(duplicateId, system, at),
};

describe('Incident lifecycle transition table', () => {
  it.each(
    statuses.flatMap((status) =>
      actions.map((action) => ({ status, action, next: table[status][action] })),
    ),
  )('enforcesTransitionRule $status × $action → $next', ({ status, action, next }) => {
    const incident = inState(status);
    const before = incident.toSnapshot();
    if (next === undefined) {
      expect(() => invoke[action](incident)).toThrow(InvalidStateTransitionException);
      expect(incident.toSnapshot()).toEqual(before);
      expect(incident.pullEvents()).toEqual([]);
    } else {
      invoke[action](incident);
      expect(incident.status()).toBe(next);
      expect(incident.pullEvents()).toHaveLength(action === 'classify' ? 2 : 1);
    }
  });
  it.each(statuses)('allowedActionsAgreesWithLiteralTableFor%s', (status) => {
    expect([...inState(status).allowedActions()].sort()).toEqual(Object.keys(table[status]).sort());
  });
  it.each(statuses)('snapshotRoundTripIsLosslessFor%s', (status) => {
    const original = snapshot(status);
    const incident = Incident.rehydrate(original);
    const encoded = JSON.stringify(incident.toSnapshot());
    expect(JSON.parse(encoded)).toEqual(original);
    expect(Incident.rehydrate(incident.toSnapshot()).toSnapshot()).toEqual(original);
    expect(incident.pullEvents()).toEqual([]);
    expect(incident.isOpen()).toBe(status !== 'CLOSED');
  });
  it.each(statuses)('registryReturnsTheSameStatelessSingletonFor%s', (status) => {
    expect(IncidentStates.of(status)).toBe(IncidentStates.of(status));
    expect(IncidentStates.of(status).status).toBe(status);
    expect(Object.isFrozen(IncidentStates.of(status))).toBe(true);
  });
  it('allowedActionsReturnsADefensiveCopy', () => {
    const allowed = inState('NEW').allowedActions();
    // Even an untyped UI consumer cannot change the policy by mutating the returned set.
    (allowed as Set<IncidentAction>).clear();
    expect([...inState('NEW').allowedActions()]).toEqual(['classify']);
  });
  it('rejectsUnknownSnapshotStatus', () => {
    expect(() =>
      Incident.rehydrate({ ...snapshot('NEW'), status: 'UNKNOWN' as IncidentStatus }),
    ).toThrow(InvalidIncidentException);
  });
});

import { describe, expect, it } from 'vitest';
import { Duration, Priority, asIncidentId } from '../shared/index.js';
import { Role } from '../users/index.js';
import { InvalidInputException } from '../exceptions/index.js';
import {
  EscalationChainFactory,
  EscalationLevel,
  EscalationPolicy,
  EscalationRequest,
} from './index.js';

const chain = EscalationChainFactory.create();
const policy = EscalationPolicy.standard();
function check(
  seconds: number,
  level: EscalationLevel = EscalationLevel.TECHNICIAN,
  priority = Priority.P1,
  p = policy,
) {
  return chain.handle(
    new EscalationRequest(asIncidentId('incident'), priority, level, Duration.ofSeconds(seconds)),
    p,
  );
}
describe('escalation chain', () => {
  it('staysWithTechnicianBeforeFiveMinutes', () => expect(check(299)).toBeNull());
  it('escalatesToTeamLeadAtFiveMinutes', () =>
    expect(check(300)).toMatchObject({
      to: EscalationLevel.TEAM_LEAD,
      notifyRole: Role.TEAM_LEAD,
    }));
  it('escalatesToSysAdminAtTenMinutes', () =>
    expect(check(600)).toMatchObject({ to: EscalationLevel.SYS_ADMIN, notifyRole: Role.ADMIN }));
  it('escalatesToItManagerAtTwentyMinutes', () =>
    expect(check(1200)).toMatchObject({
      to: EscalationLevel.IT_MANAGER,
      notifyRole: Role.IT_MANAGER,
    }));
  it('skipsLevelsWhenCheckedLate', () => expect(check(1500)?.to).toBe(EscalationLevel.IT_MANAGER));
  it('doesNotRepeatSameLevel', () => expect(check(360, EscalationLevel.TEAM_LEAD)).toBeNull());
  it('neverDeescalates', () => expect(check(360, EscalationLevel.IT_MANAGER)).toBeNull());
  it.each([
    [Priority.P2, 15, 30, 60],
    [Priority.P3, 60, 120, 240],
    [Priority.P4, 240, 480, 960],
  ])('uses cumulative thresholds for %s', (priority, a, b, c) => {
    expect(check(a * 60 - 1, EscalationLevel.TECHNICIAN, priority)).toBeNull();
    expect(check(a * 60, EscalationLevel.TECHNICIAN, priority)?.to).toBe(EscalationLevel.TEAM_LEAD);
    expect(check(b * 60, EscalationLevel.TECHNICIAN, priority)?.to).toBe(EscalationLevel.SYS_ADMIN);
    expect(check(c * 60, EscalationLevel.TECHNICIAN, priority)?.to).toBe(
      EscalationLevel.IT_MANAGER,
    );
  });
  it('policyRejectsNonAscendingThresholds', () => {
    const t = policy.thresholdsFor(Priority.P1);
    expect(() => new EscalationPolicy({ P1: [t[0], t[0], t[2]], P2: t, P3: t, P4: t })).toThrow(
      InvalidInputException,
    );
    expect(
      () => new EscalationPolicy({ P1: [Duration.ofMs(0), t[1], t[2]], P2: t, P3: t, P4: t }),
    ).toThrow(InvalidInputException);
  });
  it('demoPolicyEscalatesP1WithinSeconds', () =>
    expect(check(20, EscalationLevel.TECHNICIAN, Priority.P1, EscalationPolicy.demo())?.to).toBe(
      EscalationLevel.TEAM_LEAD,
    ));
  it('chainFactoryBuildsFourHandlersInOrder', () => {
    expect(
      [299, 300, 600, 1200].map((seconds) => check(seconds)?.to ?? EscalationLevel.TECHNICIAN),
    ).toEqual([
      EscalationLevel.TECHNICIAN,
      EscalationLevel.TEAM_LEAD,
      EscalationLevel.SYS_ADMIN,
      EscalationLevel.IT_MANAGER,
    ]);
  });
});

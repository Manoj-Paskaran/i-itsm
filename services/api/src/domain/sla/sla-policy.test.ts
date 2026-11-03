import { describe, expect, it } from 'vitest';
import { InvalidInputException, MissingSlaConfigurationException } from '../exceptions/index.js';
import {
  asItServiceId,
  asSlaPolicyId,
  Duration,
  Priority,
  type PriorityCode,
} from '../shared/index.js';
import { SlaCatalog, SlaPolicy, SlaTarget } from './index.js';

const serviceId = asItServiceId('wifi');
const defaultPolicy = SlaPolicy.specDefault(asSlaPolicyId('default'));
const target = SlaTarget.of(Duration.ofMinutes(1), Duration.ofMinutes(10));
function policy(service: typeof serviceId | null = serviceId): SlaPolicy {
  return SlaPolicy.create({
    id: asSlaPolicyId('custom'),
    name: 'Custom SLA',
    serviceId: service,
    targets: new Map([['P1', target]]),
    warningRatio: 0.8,
  });
}

describe('SlaTarget rules', () => {
  it.each([
    [0, 10],
    [1, 0],
    [11, 10],
  ])('rejectsNonPositiveOrUnorderedWindows response=%s resolution=%s', (response, resolution) => {
    expect(() => SlaTarget.of(Duration.ofMs(response), Duration.ofMs(resolution))).toThrow(
      InvalidInputException,
    );
  });
  it('acceptsEqualPositiveWindows', () => {
    expect(SlaTarget.of(Duration.ofMs(1), Duration.ofMs(1)).toSnapshot()).toEqual({
      response: 1,
      resolution: 1,
    });
  });
  it('snapshotRoundTripPreservesWindows', () => {
    expect(SlaTarget.rehydrate(target.toSnapshot()).toSnapshot()).toEqual(target.toSnapshot());
    expect(Object.isFrozen(target)).toBe(true);
  });
});

describe('SlaPolicy rules', () => {
  it.each([
    [Priority.P1, 5, 30],
    [Priority.P2, 15, 120],
    [Priority.P3, 60, 480],
    [Priority.P4, 240, 1440],
  ] as const)('specDefaultUsesTheSpecifiedWindowsFor%s', (priority, response, resolution) => {
    expect(defaultPolicy.targetFor(priority)?.response.minutes).toBe(response);
    expect(defaultPolicy.targetFor(priority)?.resolution.minutes).toBe(resolution);
  });
  it('specDefaultAppliesToAllServicesAtSeventyFivePercent', () => {
    expect(defaultPolicy.serviceId()).toBeNull();
    expect(defaultPolicy.warningRatio).toBe(0.75);
  });
  it('omittedWarningRatioDefaultsToSeventyFivePercent', () => {
    expect(
      SlaPolicy.create({
        id: asSlaPolicyId('empty'),
        name: 'Empty',
        serviceId: null,
        targets: new Map(),
      }).warningRatio,
    ).toBe(0.75);
  });
  it.each([0, 1, -1, 1.1, NaN, Infinity])('rejectsInvalidWarningRatio %s', (warningRatio) => {
    expect(() => SlaPolicy.rehydrate({ ...defaultPolicy.toSnapshot(), warningRatio })).toThrow(
      InvalidInputException,
    );
  });
  it('rejectsBlankPolicyName', () => {
    expect(() => SlaPolicy.rehydrate({ ...defaultPolicy.toSnapshot(), name: ' ' })).toThrow(
      InvalidInputException,
    );
  });
  it('returnsUndefinedForUnconfiguredPriority', () => {
    expect(policy().targetFor(Priority.P2)).toBeUndefined();
  });
  it('snapshotRoundTripPreservesIdentityAndTargets', () => {
    const original = policy();
    const data = JSON.parse(JSON.stringify(original.toSnapshot())) as ReturnType<
      SlaPolicy['toSnapshot']
    >;
    const restored = SlaPolicy.rehydrate(data);
    expect(restored.toSnapshot()).toEqual(original.toSnapshot());
    expect(restored.id()).toBe(original.id());
    expect(restored.name()).toBe('Custom SLA');
    expect(restored.serviceId()).toBe(serviceId);
  });
  it('copiesInputMapAndDoesNotExposeSnapshotReferences', () => {
    const targets = new Map<PriorityCode, SlaTarget>([['P1', target]]);
    const original = SlaPolicy.create({
      id: asSlaPolicyId('copy'),
      name: 'Copy',
      serviceId,
      targets,
    });
    targets.clear();
    expect(original.targetFor(Priority.P1)).toBe(target);
    const data = original.toSnapshot();
    const restored = SlaPolicy.rehydrate(data);
    Reflect.set(data.targets[0]![1], 'response', 999);
    expect(original.targetFor(Priority.P1)?.response.minutes).toBe(1);
    expect(restored.targetFor(Priority.P1)?.response.minutes).toBe(1);
  });
});

describe('SlaCatalog rules', () => {
  it('prefersServicePolicyOverDefaultForMatchingPriority', () => {
    const specific = policy();
    const resolved = new SlaCatalog([defaultPolicy, specific]).resolve(serviceId, Priority.P1);
    expect(resolved).toEqual({ policy: specific, target, warningRatio: 0.8 });
  });
  it('fallsBackToDefaultWhenServicePolicyLacksPriority', () => {
    expect(new SlaCatalog([policy(), defaultPolicy]).resolve(serviceId, Priority.P2)).toEqual({
      policy: defaultPolicy,
      target: defaultPolicy.targetFor(Priority.P2),
      warningRatio: 0.75,
    });
  });
  it('fallsBackToDefaultWhenNoServicePolicyExists', () => {
    expect(new SlaCatalog([defaultPolicy]).resolve(serviceId, Priority.P1).policy).toBe(
      defaultPolicy,
    );
  });
  it('resolvesServicePolicyWithoutADefault', () => {
    expect(new SlaCatalog([policy()]).resolve(serviceId, Priority.P1).target).toBe(target);
  });
  it.each([[], [policy()], [policy(null)], [policy(asItServiceId('other-service'))]])(
    'throwsMissingConfigurationWhenNeitherPolicyCoversPriority %j',
    (...policies) => {
      expect(() => new SlaCatalog(policies).resolve(serviceId, Priority.P2)).toThrow(
        MissingSlaConfigurationException,
      );
      try {
        new SlaCatalog(policies).resolve(serviceId, Priority.P2);
      } catch (error) {
        expect(error).toMatchObject({ details: { serviceId, priority: 'P2' } });
      }
    },
  );
  it('rejectsTwoDefaultPolicies', () => {
    expect(() => new SlaCatalog([defaultPolicy, policy(null)])).toThrow(InvalidInputException);
  });
  it('rejectsTwoPoliciesForTheSameService', () => {
    expect(() => new SlaCatalog([policy(), policy()])).toThrow(InvalidInputException);
  });
  it('permitsDistinctServicePolicies', () => {
    expect(() => new SlaCatalog([policy(), policy(asItServiceId('other'))])).not.toThrow();
  });
});

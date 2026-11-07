import { expect, it } from 'vitest';
import { parsePriorityRationale } from './priority-rationale';
const lines = [
  'Impact Critical (4) × Urgency Critical (4) × Criticality Mission-critical (4) = 64',
  'Affected users 5000 → ×1.5',
  'Score 96.0 ≥ 32 → P1 Critical',
];
it('parsesTheCompleteWorkedPriorityCalculation', () => {
  expect(parsePriorityRationale(lines)).toMatchObject({
    base: 64,
    users: 5000,
    multiplier: 1.5,
    score: 96,
    threshold: 32,
    priority: 'P1',
  });
  expect(parsePriorityRationale(lines)?.terms[2]).toEqual({
    label: 'Service criticality',
    name: 'Mission-critical',
    value: 4,
  });
});
it('keepsOtherStrategiesAndIncompleteExplanationsAsPlainText', () => {
  for (const value of [
    [],
    lines.slice(0, 2),
    [...lines, 'Extra explanation'],
    ['Matrix P3'],
    [lines[0]!, lines[1]!, 'Score unknown'],
  ])
    expect(parsePriorityRationale(value)).toBeNull();
});
it('rejectsAnInconsistentEquationRatherThanInventingItsResult', () => {
  expect(parsePriorityRationale([lines[0]!.replace('64', '60'), ...lines.slice(1)])).toBeNull();
  expect(
    parsePriorityRationale([...lines.slice(0, 2), lines[2]!.replace('96.0', '95.0')]),
  ).toBeNull();
});
it('parsesTheBelowThresholdRuleForLowPriority', () => {
  expect(
    parsePriorityRationale([
      'Impact Low (1) × Urgency Low (1) × Criticality Low (1) = 1',
      'Affected users 1 → ×1',
      'Score 1.0 < 6 → P4 Low',
    ]),
  ).toMatchObject({ comparison: '<', threshold: 6, priority: 'P4' });
});

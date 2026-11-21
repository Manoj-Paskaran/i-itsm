import { expect, it } from 'vitest';
import {
  appliedFactors,
  formatReportAssignmentReason,
  formatReportPriorityReason,
} from './report-context';

it('spellsOutTheDraftsOwnPriorityFactors', () => {
  const form = {
    title: 't',
    description: 'd',
    serviceId: 's',
    impact: 4,
    urgency: 3,
    affectedUsers: '5000',
  };
  const service = { id: 's', name: 'Payment Gateway', criticality: 4 };
  expect(appliedFactors(form, service)).toBe(
    'Critical impact × High urgency × Mission-critical service, 5,000 people',
  );
  expect(appliedFactors({ ...form, affectedUsers: '1' }, { ...service, criticality: 2 })).toBe(
    'Critical impact × High urgency × Medium-criticality service, 1 (just you)',
  );
});

it('namesThePriorityAndItsStartingThresholdForAWeightedScore', () => {
  expect(
    formatReportPriorityReason([
      'Impact Critical (4) × Urgency Critical (4) × Criticality Mission-critical (4) = 64',
      'Affected users 5000 → ×1.5',
      'Score 96.0 ≥ 32 → P1 Critical',
    ]),
  ).toBe('Score 96 (P1 starts at 32)');
});

it('showsTheBelowThresholdRuleForP4', () => {
  expect(
    formatReportPriorityReason([
      'Impact Low (1) × Urgency Low (1) × Criticality Low (1) = 1',
      'Affected users 1 → ×1',
      'Score 1.0 < 6 → P4 Low',
    ]),
  ).toBe('Score 1 (below 6)');
});

it('keepsUnparsedPriorityReasonsOnOneLine', () => {
  expect(formatReportPriorityReason(['  Matrix\n priority  ', '', ' fallback applied '])).toBe(
    'Matrix priority · fallback applied',
  );
});

it('namesTheTechniciansMatchingSkill', () => {
  expect(formatReportAssignmentReason('has application skill')).toBe('Has the Application skill');
});

it('omitsMissingSkillsAndRetainsOtherReasons', () => {
  expect(formatReportAssignmentReason('lacks network skill')).toBe('');
  expect(formatReportAssignmentReason('lacks network skill · 1/5 active incidents')).toBe(
    'Handling 1 of 5 incidents',
  );
});

it('explainsHowManyIncidentsTheTechnicianIsHandling', () => {
  expect(formatReportAssignmentReason('1/5 active incidents')).toBe('Handling 1 of 5 incidents');
});

it('capitalisesRotationAndOtherAssignmentReasons', () => {
  expect(formatReportAssignmentReason('next in rotation')).toBe('Next in rotation');
  expect(formatReportAssignmentReason('  lightest workload  ')).toBe('Lightest workload');
});

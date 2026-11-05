import type { CorrelationCluster } from '@itsm/contracts';
import { describe, expect, it } from 'vitest';
import {
  clusterHeadline,
  riskExplanation,
  riskLabel,
  showsInsights,
  similarityQuery,
} from './insights';

const form = { title: 'Checkout fails', description: ' Card payments time out ', serviceId: 'svc' };

describe('incident insights', () => {
  it('asksForSimilarOnceTitleHasThreeCharactersAndServiceIsChosen', () =>
    expect(similarityQuery(form)).toEqual({
      title: 'Checkout fails',
      description: 'Card payments time out',
      serviceId: 'svc',
    }));
  it('skipsSimilarCheckForShortTitle', () =>
    expect(similarityQuery({ ...form, title: ' ab ' })).toBeNull());
  it('skipsSimilarCheckWithoutService', () =>
    expect(similarityQuery({ ...form, serviceId: '' })).toBeNull());
  it('showsInsightsOnlyWhileIncidentIsUnresolved', () => {
    expect(showsInsights('IN_PROGRESS')).toBe(true);
    expect(showsInsights('REOPENED')).toBe(true);
    expect((['RESOLVED', 'VERIFIED', 'CLOSED'] as const).map(showsInsights)).toEqual([
      false,
      false,
      false,
    ]);
  });
  it('clusterHeadlineStatesEvidenceThenLikelyCommonCause', () =>
    expect(
      clusterHeadline({
        reason: '3 open Payment Gateway incidents with similar text in 2 h',
      } as CorrelationCluster),
    ).toBe('3 open Payment Gateway incidents in 2 h — likely common cause'));
  it('labelsRiskWithPercentThenLevel', () =>
    expect(riskLabel({ probability: 0.816, level: 'HIGH' })).toBe('Resolution risk 82% · High'));
  it('explainsRiskWithReasonsAndSource', () =>
    expect(
      riskExplanation({
        probability: 0.6,
        level: 'MEDIUM',
        reasons: ['50% of the resolution window used', 'P2 has a tight window'],
        source: 'rules',
      }),
    ).toBe(
      'Suggestion · advisory (rules): 50% of the resolution window used, P2 has a tight window',
    ));
});

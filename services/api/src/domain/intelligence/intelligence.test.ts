import { describe, expect, it } from 'vitest';
import { InvalidInputException } from '../exceptions/index.js';
import {
  CorrelationPolicy,
  jaccard,
  overlap,
  SimilarityPolicy,
  stem,
  TextFingerprint,
  TextSimilarity,
} from './index.js';

const pay = 'payment-gateway';
const at = (minutes: number) => new Date(Date.UTC(2026, 10, 3, 9, minutes));
const incident = (id: string, title: string, minutes = 0, serviceId = pay, description = '') => ({
  id,
  title,
  description,
  serviceId,
  createdAt: at(minutes),
});

describe('TextFingerprint', () => {
  it.each([
    ['payments', 'payment'],
    ['failing', 'fail'],
    ['failed', 'fail'],
    ['declined', 'declin'],
    ['decline', 'declin'],
    ['times', 'tim'],
    ['queries', 'query'],
    ['crashes', 'crash'],
    ['access', 'access'],
    ['bus', 'bu'],
    ['red', 'red'],
    ['sing', 'sing'],
    ['eye', 'eye'],
  ])('stemsSuffixes %s -> %s', (word, root) => {
    expect(stem(word)).toBe(root);
  });
  it('dropsStopWordsShortTokensAndPunctuation', () => {
    const f = TextFingerprint.of('The VPN is down, and it fails!', 'Out of office: wifi');
    expect([...f.titleTokens]).toEqual(['vpn', 'down', 'fail']);
    expect([...f.allTokens]).toEqual(['vpn', 'down', 'fail', 'offic', 'wifi']);
    expect(TextFingerprint.of('a an of', '').isEmpty()).toBe(true);
    expect(f.isEmpty()).toBe(false);
  });
  it('explainsSharedWordsWithTheFirstSurfaceForm', () => {
    const a = TextFingerprint.of('Checkout card payments failing');
    const b = TextFingerprint.of('Card payment declined at checkout');
    expect(a.sharedWords(b)).toEqual(['checkout', 'card', 'payments']);
  });
  it('scoresSetsWithJaccardAndOverlapCoefficient', () => {
    const a = new Set(['a', 'b', 'c', 'd']);
    const b = new Set(['c', 'd']);
    expect(jaccard(a, b)).toBe(0.5);
    expect(overlap(a, b)).toBe(1);
    expect(jaccard(new Set(), new Set())).toBe(0);
    expect(overlap(a, new Set())).toBe(0);
  });
});

describe('TextSimilarity', () => {
  const rules = new TextSimilarity();
  it('scoresRewordedReportsOfTheSameProblemAsSimilarWithReasons', () => {
    const result = rules.score(
      incident('a', 'Checkout card payments failing'),
      incident('b', 'Card payment declined at checkout'),
    );
    // 0.6 * 3/5 title Jaccard + 0.4 * 3/4 overlap + 0.15 same service
    expect(result).toEqual({
      score: 0.81,
      reasons: ['same service', 'shares: checkout, card, payments'],
    });
    expect(rules.isSimilar(result)).toBe(true);
  });
  it('givesNoServiceBoostWithoutAnySharedWord', () => {
    const result = rules.score(
      incident('a', 'Printer jammed'),
      incident('b', 'VPN keeps dropping'),
    );
    expect(result).toEqual({ score: 0, reasons: [] });
    expect(rules.isSimilar(result)).toBe(false);
  });
  it('givesNoServiceBoostAcrossServices', () => {
    const result = rules.score(
      incident('a', 'Checkout card payments failing'),
      incident('b', 'Card payment declined at checkout', 0, 'email'),
    );
    expect(result).toEqual({ score: 0.66, reasons: ['shares: checkout, card, payments'] });
  });
  it('capsTheScoreAtOne', () => {
    expect(rules.score(incident('a', 'Checkout down'), incident('b', 'Checkout down')).score).toBe(
      1,
    );
  });
  it('limitsTheExplanationToFiveSharedWords', () => {
    const text = 'alpha bravo charlie delta echo foxtrot golf';
    expect(rules.score(incident('a', text), incident('b', text)).reasons[1]).toBe(
      'shares: alpha, bravo, charlie, delta, echo',
    );
  });
  it('ranksOnlyMatchesAtOrAboveTheThresholdBestFirstUpToTheLimit', () => {
    const query = incident('q', 'Checkout card payments failing');
    const strong = incident('s', 'Card payment declined at checkout');
    const weak = incident('w', 'Payment page times out');
    const unrelated = incident('u', 'Laptop battery swollen');
    const ranked = rules.rank(query, [weak, unrelated, strong], 5);
    expect(ranked.map((m) => m.subject.id)).toEqual(['s', 'w']);
    expect(rules.rank(query, [weak, strong], 1).map((m) => m.subject.id)).toEqual(['s']);
    const atThreshold = new TextSimilarity(new SimilarityPolicy(ranked[1]!.score, 0.15, 0.6));
    expect(atThreshold.rank(query, [weak], 5)).toHaveLength(1);
  });
  it('rejectsPolicyWeightsOutsideZeroToOne', () => {
    expect(() => new SimilarityPolicy(1.1, 0.1, 0.5)).toThrow(InvalidInputException);
    expect(() => new SimilarityPolicy(0.2, -0.1, 0.5)).toThrow(InvalidInputException);
    expect(() => new SimilarityPolicy(0.2, 0.1, Number.NaN)).toThrow(InvalidInputException);
    expect(new SimilarityPolicy(0, 1, 0.5).sameServiceBoost).toBe(1);
  });
});

describe('CorrelationPolicy', () => {
  const policy = CorrelationPolicy.DEFAULT;
  const anchor = incident('a', 'Checkout card payments failing', 30);
  const reworded = incident('b', 'Card payment declined at checkout', 31);
  const timeout = incident('c', 'Payment page times out', 32);
  it('clustersSimilarOpenIncidentsOnTheSameServiceInsideTheWindow', () => {
    const cluster = policy.correlate(anchor, [timeout, anchor, reworded]);
    expect(cluster?.members.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(cluster?.windowMinutes).toBe(120);
  });
  it('needsAtLeastTwoOtherIncidentsForACluster', () => {
    expect(policy.correlate(anchor, [anchor, reworded])).toBeNull();
  });
  it('excludesOtherServicesAndIncidentsOutsideTheWindow', () => {
    const otherService = incident('d', 'Checkout card payments failing', 31, 'email');
    const early = { ...reworded, id: 'e', createdAt: new Date(at(30).getTime() - 121 * 60_000) };
    const edge = { ...reworded, id: 'f', createdAt: new Date(at(30).getTime() + 120 * 60_000) };
    const cluster = policy.correlate(anchor, [otherService, early, edge, timeout]);
    expect(cluster?.members.map((m) => m.id)).toEqual(['a', 'c', 'f']);
    expect(policy.correlate(anchor, [otherService, early, timeout])).toBeNull();
  });
  it('keepsTheWholeClusterInsideOneWindowNotJustEachMemberNearTheAnchor', () => {
    const single = new CorrelationPolicy(120, 1);
    const center = incident('a', 'Checkout card payments failing', 120);
    const before = { ...reworded, id: 'b', createdAt: at(10) };
    const after = { ...timeout, id: 'c', createdAt: at(230) };
    expect(single.correlate(center, [after, before])?.members.map((m) => m.id)).toEqual(['a', 'b']);
  });
  it('joinsIncidentsSimilarToAnyMemberNotOnlyTheAnchor', () => {
    const narrow = new CorrelationPolicy(
      120,
      2,
      new TextSimilarity(new SimilarityPolicy(0.5, 0, 0.6)),
    );
    const a = incident('a', 'Checkout card payments failing');
    const b = incident('b', 'Checkout card payment declined');
    const c = incident('c', 'Card payment declined page');
    expect(narrow.correlate(a, [c, b])?.members.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });
  it('describesTheClusterInHoursOrMinutes', () => {
    expect(CorrelationPolicy.describe(3, 120, 'Payment Gateway')).toBe(
      '3 open Payment Gateway incidents with similar text in 2 h',
    );
    expect(CorrelationPolicy.describe(4, 90, 'Email')).toBe(
      '4 open Email incidents with similar text in 90 min',
    );
  });
  it('rejectsNonPositiveWindowOrSize', () => {
    for (const [w, n] of [
      [0, 2],
      [1.5, 2],
      [60, 0],
      [60, 1.5],
    ] as const)
      expect(() => new CorrelationPolicy(w, n)).toThrow(InvalidInputException);
    expect(new CorrelationPolicy(1, 1).minOthers).toBe(1);
  });
});

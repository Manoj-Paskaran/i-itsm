import { describe, expect, it, vi } from 'vitest';
import { RuleBasedIntelligenceAdapter } from '../../application/incidents/rule-based-intelligence-adapter.js';
import { InMemoryIncidentRepository } from '../../application/testing/in-memory-incident-repository.js';
import { Incident } from '../../domain/incidents/index.js';
import { inState, snapshot } from '../../domain/incidents/test-fixtures.js';
import { asIncidentId, Duration } from '../../domain/shared/index.js';
import { later } from '../../domain/incidents/test-fixtures.js';
import { cosine, HttpIntelligenceAdapter } from './http-intelligence-adapter.js';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
async function setup(fetchFn: typeof fetch) {
  const incidents = new InMemoryIncidentRepository();
  const open = inState('ASSIGNED');
  const other = Incident.rehydrate({
    ...snapshot('ASSIGNED'),
    id: asIncidentId('other'),
    title: 'Printer jammed',
    description: 'Paper stuck in the printer tray',
  });
  for (const i of [open, other]) await incidents.save(i);
  const rules = new RuleBasedIntelligenceAdapter(incidents);
  const adapter = new HttpIntelligenceAdapter('http://ml:8001', incidents, rules, fetchFn);
  return { adapter, open, other };
}
const query = { title: 'WiFi down in office', description: 'Cannot connect to WiFi' };

describe('HttpIntelligenceAdapter', () => {
  it('ranksByEmbeddingCosineAboveTheModelThreshold', async () => {
    const fetchFn = vi.fn(() =>
      json({
        vectors: [
          [1, 0],
          [0.9, 0.1],
          [0, 1],
        ],
      }),
    );
    const { adapter, open } = await setup(fetchFn);
    const { result, source } = await adapter.similar(query, () => true, 5);
    expect(source).toBe('model');
    expect(result.map((m) => [m.incident.id, m.score, m.reasons])).toEqual([
      [open.id, 0.99, ['similar meaning (embedding model)']],
    ]);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('http://ml:8001/v1/embed');
    expect(JSON.parse(init.body as string)).toEqual({
      texts: [
        'WiFi down in office\nCannot connect to WiFi',
        'WiFi is unavailable\nUnable to connect to WiFi in the office.',
        'Printer jammed\nPaper stuck in the printer tray',
      ],
    });
  });
  it.each([
    ['a 501 not implemented', () => json({ error: { code: 'NOT_IMPLEMENTED' } }, 501)],
    ['an unreachable service', () => Promise.reject(new TypeError('fetch failed'))],
    ['a wrong number of vectors', () => json({ vectors: [[1, 0]] })],
  ])('fallsBackToRulesOn %s', async (_, response) => {
    const { adapter, open } = await setup(vi.fn(response));
    const { result, source } = await adapter.similar(query, () => true, 5);
    expect(source).toBe('rules');
    expect(result.map((m) => m.incident.id)).toEqual([open.id]);
  });
  it('delegatesClusterAndSuggestionsToTheFallback', async () => {
    const fetchFn = vi.fn();
    const { adapter, open } = await setup(fetchFn);
    expect((await adapter.cluster(open, () => true)).source).toBe('rules');
    expect((await adapter.suggestResolutions(query, () => true, 3)).source).toBe('rules');
    expect(fetchFn).not.toHaveBeenCalled();
  });
  const context = { serviceName: 'Office WiFi', categoryName: 'Network', now: later };
  it('asksTheMlModelForSlaRiskAndKeepsRuleReasons', async () => {
    const fetchFn = vi.fn(() => json({ probability: 0.812, level: 'high', source: 'model' }));
    const { adapter, open } = await setup(fetchFn);
    const { result, source } = await adapter.slaRisk(open, context);
    expect(source).toBe('model');
    expect(result).toEqual({
      probability: 0.81,
      level: 'HIGH',
      reasons: ['50% of the resolution window used', 'P2 has a tight window'],
    });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('http://ml:8001/v1/sla-risk');
    expect(JSON.parse(init.body as string)).toMatchObject({
      priority: 'P2',
      service: 'Office WiFi',
      category: 'Network',
      minutesOpen: 60,
      minutesToDeadline: 60,
    });
  });
  it.each([
    ['an unreachable service', () => Promise.reject(new TypeError('fetch failed'))],
    ['a missing probability', () => json({ level: 'high' })],
    ['a 422 validation error', () => json({}, 422)],
    ['a probability above 1', () => json({ probability: 1.5 })],
  ])('fallsBackToRuleSlaRiskOn %s', async (_, response) => {
    const { adapter, open } = await setup(vi.fn(response));
    const { result, source } = await adapter.slaRisk(open, context);
    expect(source).toBe('rules');
    expect(result).toMatchObject({ probability: 0.6, level: 'MEDIUM' });
  });
  it('skipsTheModelOnceTheResolutionDeadlineHasPassed', async () => {
    const fetchFn = vi.fn(() => json({ probability: 0.35 }));
    const { adapter, open } = await setup(fetchFn);
    const pastDeadline = { ...context, now: later.plus(Duration.ofHours(2)) };
    expect(await adapter.slaRisk(open, pastDeadline)).toMatchObject({
      result: { probability: 1, level: 'HIGH' },
      source: 'rules',
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('computesCosineSimilarityAndZeroForAZeroVector', () => {
    expect(cosine([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

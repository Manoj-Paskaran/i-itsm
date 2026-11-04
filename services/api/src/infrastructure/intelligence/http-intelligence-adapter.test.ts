import { describe, expect, it, vi } from 'vitest';
import { RuleBasedIntelligenceAdapter } from '../../application/incidents/rule-based-intelligence-adapter.js';
import { InMemoryIncidentRepository } from '../../application/testing/in-memory-incident-repository.js';
import { Incident } from '../../domain/incidents/index.js';
import { inState, snapshot } from '../../domain/incidents/test-fixtures.js';
import { asIncidentId } from '../../domain/shared/index.js';
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
  it('computesCosineSimilarityAndZeroForAZeroVector', () => {
    expect(cosine([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

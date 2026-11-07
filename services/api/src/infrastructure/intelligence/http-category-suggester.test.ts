import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeywordCategorySuggester } from '../../application/incidents/keyword-category-suggester.js';
import { Category } from '../../domain/catalog/index.js';
import { asCategoryId } from '../../domain/shared/index.js';
import { HttpCategorySuggester, MIN_MODEL_CONFIDENCE } from './http-category-suggester.js';

const categories = ['APPLICATION', 'DATABASE', 'NETWORK'].map((code) =>
  Category.create({
    id: asCategoryId(code.toLowerCase()),
    code,
    name: code,
    requiredSkill: code.toLowerCase(),
    active: true,
  }),
);
const text = 'WiFi down in office The network is unavailable';
const prediction = {
  category: 'database',
  confidence: 0.87,
  candidates: [{ category: 'database', score: 0.87 }],
  source: 'model',
};
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

function setup(fetchFn: typeof fetch) {
  const fallback = new KeywordCategorySuggester();
  const fallbackSpy = vi.spyOn(fallback, 'suggest');
  const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  const suggester = new HttpCategorySuggester('http://ml:8001', fallback, fetchFn);
  return { suggester, fallbackSpy, log };
}

async function expectKeywordFallback(fetchFn: typeof fetch) {
  const { suggester, fallbackSpy, log } = setup(fetchFn);
  expect(await suggester.suggest(text, categories)).toEqual(
    await new KeywordCategorySuggester().suggest(text, categories),
  );
  expect(fallbackSpy).toHaveBeenCalledExactlyOnceWith(text, categories);
  expect(log).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledWith(
    expect.stringMatching(/^category fallback to keyword rules: .+/),
  );
}

afterEach(() => vi.restoreAllMocks());

describe('HttpCategorySuggester', () => {
  it('mapsModelCodeToActiveCategory', async () => {
    const { suggester, fallbackSpy, log } = setup(vi.fn(() => json(prediction)));
    const result = await suggester.suggest(text, categories);
    expect(result).toEqual({ category: categories[1], confidence: 0.87, source: 'model' });
    expect(result.category).toBe(categories[1]);
    expect(fallbackSpy).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledExactlyOnceWith('category DATABASE via model (0.87)');
  });

  it('sendsLowerCaseAllowedCategories', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => json(prediction));
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const { suggester } = setup(fetchFn);
    await suggester.suggest(text, categories);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toEqual(new URL('http://ml:8001/v1/classify'));
    expect(init).toMatchObject({ method: 'POST', headers: { 'content-type': 'application/json' } });
    expect(JSON.parse(init!.body as string)).toEqual({
      text,
      allowedCategories: ['application', 'database', 'network'],
    });
    expect(timeout).toHaveBeenCalledExactlyOnceWith(3000);
    expect(init!.signal).toBe(timeout.mock.results[0]!.value);
  });

  it('fallsBackToKeywordsWhenServiceDown', async () => {
    await expectKeywordFallback(vi.fn(() => Promise.reject(new TypeError('fetch failed'))));
  });

  it('fallsBackOnTimeout', async () => {
    await expectKeywordFallback(
      vi.fn(() => Promise.reject(new DOMException('The operation was aborted', 'AbortError'))),
    );
  });

  it('fallsBackOnNonOkResponse', async () => {
    await expectKeywordFallback(vi.fn(() => json(prediction, 503)));
  });

  it('fallsBackOnUnknownCategory', async () => {
    await expectKeywordFallback(vi.fn(() => json({ ...prediction, category: 'storage' })));
  });

  it('fallsBackOnLowConfidence', async () => {
    await expectKeywordFallback(
      vi.fn(() => json({ ...prediction, confidence: MIN_MODEL_CONFIDENCE - 0.01 })),
    );
  });

  it('acceptsConfidenceAtThreshold', async () => {
    const { suggester, fallbackSpy } = setup(vi.fn(() => json({ ...prediction, confidence: 0.5 })));
    expect(await suggester.suggest(text, categories)).toEqual({
      category: categories[1],
      confidence: 0.5,
      source: 'model',
    });
    expect(fallbackSpy).not.toHaveBeenCalled();
  });

  it('reportsRulesSourceWhenServiceUsedRules', async () => {
    const { suggester, fallbackSpy, log } = setup(
      vi.fn(() => json({ ...prediction, source: 'rules' })),
    );
    expect(await suggester.suggest(text, categories)).toEqual({
      category: categories[1],
      confidence: 0.87,
      source: 'rules',
    });
    expect(fallbackSpy).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledExactlyOnceWith('category DATABASE via rules (0.87)');
  });

  it('reportsGeminiSourceAsModelButLogsGemini', async () => {
    const { suggester, log } = setup(vi.fn(() => json({ ...prediction, source: 'gemini' })));
    expect((await suggester.suggest(text, categories)).source).toBe('model');
    expect(log).toHaveBeenCalledExactlyOnceWith('category DATABASE via gemini (0.87)');
  });

  it('matchesCategoryCodesCaseInsensitively', async () => {
    const { suggester } = setup(vi.fn(() => json({ ...prediction, category: 'DaTaBaSe' })));
    expect((await suggester.suggest(text, categories)).category).toBe(categories[1]);
  });

  it.each([
    null,
    {},
    { ...prediction, category: 42 },
    { ...prediction, confidence: '0.87' },
    { ...prediction, confidence: -0.1 },
    { ...prediction, confidence: 1.1 },
    { ...prediction, source: 'unknown' },
    { ...prediction, candidates: [{ category: 'database', score: 'high' }] },
  ])('fallsBackOnMalformedBody (%j)', async (body) => {
    await expectKeywordFallback(vi.fn(() => json(body)));
  });

  it('fallsBackOnInvalidJson', async () => {
    await expectKeywordFallback(vi.fn(() => Promise.resolve(new Response('not JSON'))));
  });
});

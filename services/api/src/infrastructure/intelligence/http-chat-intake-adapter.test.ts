import { describe, expect, it, vi } from 'vitest';
import { RuleBasedChatIntake } from '../../application/incidents/rule-based-chat-intake.js';
import type { ChatIntakeReading } from '../../ports/chat-intake.js';
import { HttpChatIntakeAdapter } from './http-chat-intake-adapter.js';

const services = [{ id: '00000000-0000-4000-8000-000000000001', name: 'Payment Gateway' }];
const categories = ['application'];
const message = 'Card payment fails at checkout';
const cached: ChatIntakeReading = {
  engine: 'cache',
  model: 'test-model',
  reply: 'Sounds like card payments are failing.',
  title: 'Checkout payment failure',
  summary: 'The reporter cannot pay at checkout.',
  fields: {
    serviceId: { value: services[0]!.id, confidence: 0.95 },
    categoryCode: { value: 'application', confidence: 0.8 },
    impact: { value: 4, confidence: 0.88 },
    urgency: { value: 4, confidence: 0.7 },
    affectedUsers: null,
  },
};
const rules = new RuleBasedChatIntake();
const adapter = (fetchFn: typeof fetch, timeoutMs = 15000) =>
  new HttpChatIntakeAdapter('http://ml:8001/', timeoutMs, rules, fetchFn);

describe('HttpChatIntakeAdapter', () => {
  it('passesTheCacheEngineThrough', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(Response.json(cached));
    expect(await adapter(fetchFn).read(message, services, categories)).toEqual(cached);
    expect(fetchFn).toHaveBeenCalledExactlyOnceWith(
      'http://ml:8001/v1/chat-intake',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, services, categories }),
        signal: expect.any(AbortSignal) as unknown,
      }),
    );
  });

  it('fallsBackToRulesWhenMlServiceTimesOut', async () => {
    const fetchFn: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener('abort', () => reject(new DOMException('Timed out')), {
          once: true,
        });
      });
    expect(await adapter(fetchFn, 5).read(message, services, categories)).toEqual(
      await rules.read(),
    );
  });

  it.each([
    { ...cached, summary: null },
    { ...cached, reply: 'Can you tell me more?' },
    { ...cached, title: 'x'.repeat(81) },
    { ...cached, model: null },
    { ...cached, engine: 'invalid' },
    { ...cached, engine: 'rules' },
    { ...cached, fields: { ...cached.fields, impact: { value: 5, confidence: 0.9 } } },
    { ...cached, fields: { ...cached.fields, impact: { value: 4, confidence: '0.9' } } },
    { ...cached, fields: { ...cached.fields, urgency: { value: 4, confidence: 1.1 } } },
    { ...cached, fields: { ...cached.fields, affectedUsers: { value: 0, confidence: 0.9 } } },
    { ...cached, fields: { ...cached.fields, impact: { value: 4, confidence: 1, extra: true } } },
    { ...cached, fields: { ...cached.fields, categoryCode: { value: '', confidence: 0.8 } } },
    {
      ...cached,
      fields: { ...cached.fields, categoryCode: { value: 'application', confidence: 1.1 } },
    },
    { ...cached, fields: { impact: null } },
  ])('fallsBackToRulesOnMalformedAnswer %#', async (body) => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
    expect(await adapter(fetchFn).read(message, services, categories)).toEqual(await rules.read());
  });

  it('fallsBackToRulesOnInvalidJson', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response('not JSON'));
    expect(await adapter(fetchFn).read(message, services, categories)).toEqual(await rules.read());
  });

  it('fallsBackToRulesWhenMlServiceReturnsAnError', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    expect(await adapter(fetchFn).read(message, services, categories)).toEqual(await rules.read());
  });

  it('fallsBackToRulesWhenMlServiceCannotBeReached', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));
    expect(await adapter(fetchFn).read(message, services, categories)).toEqual(await rules.read());
  });

  it('fallsBackToRulesOnAnUnknownServiceId', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(Response.json(cached));
    expect(await adapter(fetchFn).read(message, [], categories)).toEqual(await rules.read());
  });

  it('passesThroughAWellFormedMlRulesAnswer', async () => {
    const reading = await rules.read();
    const fallback = { read: vi.fn<typeof rules.read>() };
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(Response.json(reading));
    const http = new HttpChatIntakeAdapter('http://ml:8001', 15000, fallback, fetchFn);
    expect(await http.read(message, services, categories)).toEqual(reading);
    expect(fallback.read).not.toHaveBeenCalled();
  });
});

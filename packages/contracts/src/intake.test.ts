import { describe, expect, it } from 'vitest';
import { ChatIntakeRequestSchema, ChatIntakeResponseSchema } from './index.js';

const service = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const none = {
  serviceId: null,
  categoryId: null,
  impact: null,
  urgency: null,
  affectedUsers: null,
};

describe('chat intake contract', () => {
  it('trimsTheFirstMessageAndRejectsAnEmptyOne', () => {
    expect(ChatIntakeRequestSchema.parse({ message: '  checkout is broken ' })).toEqual({
      message: 'checkout is broken',
    });
    expect(ChatIntakeRequestSchema.safeParse({ message: '  ' }).success).toBe(false);
    expect(ChatIntakeRequestSchema.safeParse({ message: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('acceptsAGeminiAnswerWithPerFieldConfidence', () => {
    const answer = {
      engine: 'cache',
      model: 'gemini-3.5-flash-lite',
      reply: 'Sounds like card payments are failing at checkout.',
      title: 'Card payments failing at checkout',
      description: 'Card payments fail at checkout.',
      fields: {
        serviceId: { value: service, confidence: 0.9 },
        categoryId: { value: service, confidence: 0.8 },
        impact: { value: 4, confidence: 0.85 },
        urgency: { value: 4, confidence: 0.6 },
        affectedUsers: null,
      },
    };
    expect(ChatIntakeResponseSchema.parse(answer)).toEqual(answer);
  });

  it('acceptsARulesAnswerWithNothingUnderstood', () => {
    const rules = { engine: 'rules', model: null, reply: null, title: null, description: null };
    expect(ChatIntakeResponseSchema.safeParse({ ...rules, fields: none }).success).toBe(true);
  });

  it('rejectsALevelOutsideOneToFourOrAConfidenceAboveOne', () => {
    const base = { engine: 'gemini', model: 'm', reply: 'r', title: 't', description: 'd' };
    const bad = (fields: object) =>
      ChatIntakeResponseSchema.safeParse({ ...base, fields: { ...none, ...fields } }).success;
    expect(bad({ impact: { value: 5, confidence: 0.9 } })).toBe(false);
    expect(bad({ urgency: { value: 3, confidence: 1.2 } })).toBe(false);
    expect(bad({ serviceId: { value: 'payment', confidence: 0.9 } })).toBe(false);
    expect(
      ChatIntakeResponseSchema.safeParse({ ...base, engine: 'adk', fields: none }).success,
    ).toBe(false);
  });
});

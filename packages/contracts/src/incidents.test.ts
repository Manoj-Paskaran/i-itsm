import { describe, expect, it } from 'vitest';
import {
  AssignRequestSchema,
  CloseAsDuplicateRequestSchema,
  CreateIncidentRequestSchema,
  IncidentActionSchema,
  IncidentInsightsSchema,
  FeedbackRequestSchema,
  IncidentListQuerySchema,
  NoteRequestSchema,
  ProvideInfoSchema,
  RejectRequestSchema,
  RequestInfoSchema,
  ResolveRequestSchema,
  SimilarityRequestSchema,
  SlaRiskSchema,
} from './incidents.js';

const id = '018f0662-2222-7222-8222-222222222222';
describe('incident requests', () => {
  it('validates a complete report and its bounds', () => {
    const report = {
      title: 'Payment failure',
      description: 'Payment gateway is down',
      serviceId: id,
      impact: 4,
      urgency: 4,
      affectedUsers: 100,
    };
    expect(CreateIncidentRequestSchema.safeParse(report).success).toBe(true);
    expect(CreateIncidentRequestSchema.safeParse({ ...report, categoryId: id }).success).toBe(true);
    for (const invalid of [
      { categoryId: 'application' },
      { title: 'no' },
      { description: 'short' },
      { serviceId: 'bad' },
      { impact: 5 },
      { urgency: 0 },
      { affectedUsers: 1_000_001 },
    ]) {
      expect(CreateIncidentRequestSchema.safeParse({ ...report, ...invalid }).success).toBe(false);
    }
  });
  it.each([
    [AssignRequestSchema, {}, { technicianId: 'bad' }],
    [CloseAsDuplicateRequestSchema, { duplicateOfId: id }, { duplicateOfId: 'bad' }],
    [NoteRequestSchema, { text: 'note' }, { text: '' }],
    [RequestInfoSchema, { question: 'question' }, { question: '' }],
    [ProvideInfoSchema, { answer: 'answer' }, { answer: '' }],
    [ResolveRequestSchema, { summary: 'fixed' }, { summary: '' }],
    [RejectRequestSchema, { reason: 'still broken' }, { reason: '' }],
    [FeedbackRequestSchema, { rating: 5 }, { rating: 6 }],
  ])('validates action request %#', (schema, valid, invalid) => {
    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse(invalid).success).toBe(false);
  });
  it('coerces and bounds the list limit', () => {
    expect(IncidentListQuerySchema.parse({ limit: '200' }).limit).toBe(200);
    expect(IncidentListQuerySchema.parse({}).limit).toBe(50);
    expect(IncidentListQuerySchema.safeParse({ limit: '201' }).success).toBe(false);
  });
});

it('acceptsGiveFeedbackAsAnAction', () => {
  expect(IncidentActionSchema.parse('giveFeedback')).toBe('giveFeedback');
});

describe('incident intelligence', () => {
  it('defaultsSimilarityDescriptionToEmptyAndBoundsTitle', () => {
    expect(SimilarityRequestSchema.parse({ title: '  Card payments failing ' })).toEqual({
      title: 'Card payments failing',
      description: '',
    });
    expect(SimilarityRequestSchema.safeParse({ title: 'no' }).success).toBe(false);
    expect(
      SimilarityRequestSchema.safeParse({ title: 'Checkout down', serviceId: 'bad' }).success,
    ).toBe(false);
  });
  it('rejectsInsightScoresOutsideZeroToOne', () => {
    const insights = {
      similar: [],
      cluster: null,
      suggestedResolutions: [
        {
          incident: { id, number: 'INC-1', title: 'Fixed' },
          summary: 'Restarted',
          rootCause: null,
          score: 0.5,
        },
      ],
      source: 'rules',
    };
    expect(IncidentInsightsSchema.safeParse(insights).success).toBe(true);
    const tooHigh = { ...insights.suggestedResolutions[0], score: 1.1 };
    expect(
      IncidentInsightsSchema.safeParse({ ...insights, suggestedResolutions: [tooHigh] }).success,
    ).toBe(false);
    expect(IncidentInsightsSchema.safeParse({ ...insights, source: 'gpt' }).success).toBe(false);
  });
  it('acceptsSlaRiskWithLevelReasonsAndSource', () => {
    const risk = {
      probability: 0.82,
      level: 'HIGH',
      reasons: ['82% of window used'],
      source: 'rules',
    };
    expect(SlaRiskSchema.safeParse(risk).success).toBe(true);
    expect(SlaRiskSchema.safeParse({ ...risk, level: 'high' }).success).toBe(false);
    expect(SlaRiskSchema.safeParse({ ...risk, probability: 1.2 }).success).toBe(false);
  });
});

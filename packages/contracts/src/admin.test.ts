import { describe, expect, it } from 'vitest';
import {
  AuditSearchQuerySchema,
  UpdateUserRequestSchema,
  UpsertSlaPolicyRequestSchema,
} from './admin.js';

describe('admin contracts', () => {
  it('rejects empty user updates', () => {
    expect(UpdateUserRequestSchema.safeParse({}).success).toBe(false);
  });
  it('requires each SLA priority exactly once', () => {
    const target = { priority: 'P1', responseMinutes: 5, resolutionMinutes: 30 };
    expect(
      UpsertSlaPolicyRequestSchema.safeParse({
        name: 'Default',
        serviceId: null,
        warningRatio: 0.75,
        targets: [target, target, target, target],
      }).success,
    ).toBe(false);
  });
  it('defaults and limits audit search results', () => {
    expect(AuditSearchQuerySchema.parse({}).limit).toBe(100);
    expect(AuditSearchQuerySchema.safeParse({ limit: '501' }).success).toBe(false);
  });
});

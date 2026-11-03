import { describe, expect, it } from 'vitest';
import { HealthResponseSchema } from './health.js';

const validPayload = {
  status: 'ok',
  service: 'api',
  version: '1.0.0',
  uptimeSeconds: 42,
  timestamp: '2026-11-03T00:00:00Z',
};

describe('HealthResponseSchema', () => {
  it('accepts a valid payload', () => {
    expect(HealthResponseSchema.safeParse(validPayload).success).toBe(true);
  });

  it('rejects an invalid status', () => {
    expect(HealthResponseSchema.safeParse({ ...validPayload, status: 'down' }).success).toBe(false);
  });

  it('rejects negative uptime', () => {
    expect(HealthResponseSchema.safeParse({ ...validPayload, uptimeSeconds: -1 }).success).toBe(
      false,
    );
  });
});

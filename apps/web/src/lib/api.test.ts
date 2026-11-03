import { afterEach, describe, expect, it, vi } from 'vitest';
import { getHealth } from './api';

const payload = {
  status: 'ok',
  service: 'api',
  version: '1.0.0',
  uptimeSeconds: 42,
  timestamp: '2026-11-03T00:00:00Z',
};
afterEach(() => vi.unstubAllGlobals());
describe('getHealth', () => {
  it('parses a valid health response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) }),
    );
    await expect(getHealth()).resolves.toEqual(payload);
  });
  it('rejects an invalid health response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ...payload, status: 'down' }),
      }),
    );
    await expect(getHealth()).rejects.toThrow();
  });
});

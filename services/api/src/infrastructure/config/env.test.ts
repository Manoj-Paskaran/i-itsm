import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

describe('loadEnv', () => {
  it('appliesDefaults', () => {
    expect(loadEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      WEB_ORIGIN: 'http://localhost:5173',
    });
  });
  it('rejectsNonNumericPort', () => {
    expect(() => loadEnv({ PORT: 'invalid' })).toThrow(/PORT/);
  });
  it('rejectsInvalidWebOrigin', () => {
    expect(() => loadEnv({ WEB_ORIGIN: 'invalid' })).toThrow(/WEB_ORIGIN/);
  });
  it('listsEveryInvalidField', () => {
    expect(() => loadEnv({ PORT: '0', WEB_ORIGIN: 'invalid' })).toThrow(/PORT.*WEB_ORIGIN/);
  });
});

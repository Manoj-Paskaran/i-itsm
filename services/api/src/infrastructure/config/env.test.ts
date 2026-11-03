import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

describe('loadEnv', () => {
  it('appliesDefaults', () => {
    expect(loadEnv({})).toEqual({
      NODE_ENV: 'development',
      JWT_SECRET: 'itsm-fixed-development-secret-not-for-production',
      ACCESS_TOKEN_TTL_SECONDS: 3600,
      REFRESH_TOKEN_TTL_SECONDS: 604800,
      PORT: 3000,
      DATABASE_URL: 'postgresql://itsm:itsm@localhost:5432/itsm',
      WEB_ORIGIN: 'http://localhost:5173',
    });
  });
  it('requiresSecretInProduction', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    expect(loadEnv({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32) }).JWT_SECRET).toBe(
      'x'.repeat(32),
    );
  });
  it('rejectsNonNumericPort', () => {
    expect(() => loadEnv({ PORT: 'invalid' })).toThrow(/PORT/);
  });
  it('rejectsNonPostgresDatabaseUrl', () => {
    expect(() => loadEnv({ DATABASE_URL: 'https://localhost/db' })).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ DATABASE_URL: 'not-a-url' })).toThrow(/DATABASE_URL/);
  });
  it('rejectsInvalidWebOrigin', () => {
    expect(() => loadEnv({ WEB_ORIGIN: 'invalid' })).toThrow(/WEB_ORIGIN/);
  });
  it('listsEveryInvalidField', () => {
    expect(() => loadEnv({ PORT: '0', WEB_ORIGIN: 'invalid' })).toThrow(/PORT.*WEB_ORIGIN/);
  });
});

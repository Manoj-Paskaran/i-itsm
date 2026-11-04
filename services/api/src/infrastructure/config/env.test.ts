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
      VALKEY_URL: 'redis://localhost:6379',
      MONITOR_ENABLED: true,
      MONITOR_INTERVAL_MS: 10000,
      ESCALATION_POLICY: 'demo',
      SMTP_URL: 'smtp://localhost:1025',
      NOTIFICATIONS_EMAIL_ENABLED: true,
      WEB_ORIGIN: 'http://localhost:5173',
    });
  });
  it('treatsABlankMlServiceUrlAsUnsetAndRejectsANonUrl', () => {
    expect(loadEnv({ ML_SERVICE_URL: '' }).ML_SERVICE_URL).toBeUndefined();
    expect(loadEnv({ ML_SERVICE_URL: 'http://ml:8001' }).ML_SERVICE_URL).toBe('http://ml:8001');
    expect(() => loadEnv({ ML_SERVICE_URL: 'not a url' })).toThrow(/ML_SERVICE_URL/);
  });
  it('configuresMonitoringAndProductionPolicy', () => {
    expect(loadEnv({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32) }).ESCALATION_POLICY).toBe(
      'standard',
    );
    expect(
      loadEnv({
        MONITOR_ENABLED: 'false',
        MONITOR_INTERVAL_MS: '1000',
        ESCALATION_POLICY: 'standard',
      }),
    ).toMatchObject({
      MONITOR_ENABLED: false,
      MONITOR_INTERVAL_MS: 1000,
      ESCALATION_POLICY: 'standard',
    });
    expect(() => loadEnv({ MONITOR_INTERVAL_MS: '999' })).toThrow(/MONITOR_INTERVAL_MS/);
    expect(() => loadEnv({ MONITOR_ENABLED: 'maybe' })).toThrow(/MONITOR_ENABLED/);
    expect(() => loadEnv({ VALKEY_URL: 'https://localhost' })).toThrow(/VALKEY_URL/);
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

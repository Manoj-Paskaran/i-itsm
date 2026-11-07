/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../app.module.js';
import {
  IDENTITY_PROVIDER,
  type IdentityProvider,
} from '../../application/auth/identity-provider.js';
import { MemoryUsers, fakeHasher } from '../../application/auth/testing.js';
import { Email } from '../../domain/shared/index.js';
import { ENV } from '../../infrastructure/config/config.module.js';
import { loadEnv, type Env } from '../../infrastructure/config/env.js';
import { PASSWORD_HASHER, USER_REPOSITORY } from '../../ports/index.js';
import { configureApp } from '../configure-app.js';

const identity = { email: 'alice@example.com', name: 'Alice' };
function fakeProvider() {
  return {
    name: 'google',
    isConfigured: vi.fn(() => true),
    createAuthorizationRequest: vi.fn(() => ({
      url: 'https://google.example/authorize',
      state: 'state',
      codeVerifier: 'verifier',
    })),
    exchangeCode: vi.fn<IdentityProvider['exchangeCode']>().mockResolvedValue(identity),
  };
}
function cookies(response: { headers: Record<string, unknown> }): string[] {
  return response.headers['set-cookie'] as string[];
}
function oidcCookie(value: unknown): string {
  return `itsm_oidc=${encodeURIComponent(JSON.stringify(value))}`;
}

describe('Google auth HTTP', () => {
  let app: INestApplication;
  let provider: ReturnType<typeof fakeProvider>;
  let users: MemoryUsers;
  let env: Env;
  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  beforeEach(async () => {
    provider = fakeProvider();
    users = new MemoryUsers();
    env = loadEnv({
      NODE_ENV: 'test',
      WEB_ORIGIN: 'https://desk.example',
      MONITOR_ENABLED: 'false',
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(IDENTITY_PROVIDER)
      .useValue(provider)
      .overrideProvider(USER_REPOSITORY)
      .useValue(users)
      .overrideProvider(PASSWORD_HASHER)
      .useValue(fakeHasher)
      .overrideProvider(ENV)
      .useValue(env)
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterEach(async () => {
    await app?.close();
  });

  it('providersReportsFalseWhenUnconfigured', async () => {
    provider.isConfigured.mockReturnValue(false);
    await request(server()).get('/api/auth/providers').expect(200, { google: false });
  });
  it('providersReportsTrueWhenConfigured', async () => {
    await request(server()).get('/api/auth/providers').expect(200, { google: true });
  });
  it('startRedirectsToWebOriginWhenUnconfigured', async () => {
    provider.isConfigured.mockReturnValue(false);
    await request(server())
      .get('/api/auth/google')
      .expect(302)
      .expect('Location', 'https://desk.example/login?error=google_unavailable');
    expect(provider.createAuthorizationRequest).not.toHaveBeenCalled();
  });
  it('startStoresShortLivedHttpOnlyStateAndVerifier', async () => {
    const response = await request(server())
      .get('/api/auth/google')
      .expect(302)
      .expect('Location', 'https://google.example/authorize');
    const cookie = cookies(response)[0]!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/auth/google');
    expect(cookie).toContain('Max-Age=600');
    expect(cookie).not.toContain('Secure');
    const value: unknown = JSON.parse(
      decodeURIComponent(cookie.split(';')[0]!.slice('itsm_oidc='.length)),
    );
    expect(value).toEqual({
      state: 'state',
      codeVerifier: 'verifier',
      createdAt: expect.any(Number) as unknown,
    });
  });
  it('startHandlesProviderFailure', async () => {
    provider.createAuthorizationRequest.mockImplementation(() => {
      throw new Error('failure');
    });
    await request(server())
      .get('/api/auth/google')
      .expect(302)
      .expect('Location', 'https://desk.example/login?error=google_failed');
  });
  it('callbackRejectsBadState', async () => {
    const start = await request(server()).get('/api/auth/google');
    const response = await request(server())
      .get('/api/auth/google/callback?code=code&state=other')
      .set('Cookie', cookies(start))
      .expect(302)
      .expect('Location', 'https://desk.example/login?error=google_state');
    expect(provider.exchangeCode).not.toHaveBeenCalled();
    expect(cookies(response)[0]).toContain('Expires=Thu, 01 Jan 1970');
    expect(cookies(response).some((cookie) => cookie.startsWith('itsm_refresh='))).toBe(false);
  });
  it('callbackRejectsMissingCookie', async () => {
    await request(server())
      .get('/api/auth/google/callback?code=code&state=state')
      .expect(302)
      .expect('Location', 'https://desk.example/login?error=google_state');
    expect(provider.exchangeCode).not.toHaveBeenCalled();
  });
  it.each([
    ['callbackRejectsMalformedCookie', 'itsm_oidc=not-json'],
    ['callbackRejectsIncompleteCookie', oidcCookie({ state: 'state' })],
    [
      'callbackRejectsExpiredCookie',
      oidcCookie({
        state: 'state',
        codeVerifier: 'verifier',
        createdAt: Date.now() - 11 * 60 * 1000,
      }),
    ],
    [
      'callbackRejectsFutureCookie',
      oidcCookie({
        state: 'state',
        codeVerifier: 'verifier',
        createdAt: Date.now() + 60 * 60 * 1000,
      }),
    ],
  ])('%s', async (_name, cookie) => {
    await request(server())
      .get('/api/auth/google/callback?code=code&state=state')
      .set('Cookie', cookie)
      .expect(302)
      .expect('Location', 'https://desk.example/login?error=google_state');
    expect(provider.exchangeCode).not.toHaveBeenCalled();
  });
  it('callbackRejectsGoogleDenialAndClearsCookie', async () => {
    const response = await request(server())
      .get('/api/auth/google/callback?error=access_denied')
      .expect(302)
      .expect('Location', 'https://desk.example/login?error=google_denied');
    expect(provider.exchangeCode).not.toHaveBeenCalled();
    expect(cookies(response)[0]).toContain('Expires=Thu, 01 Jan 1970');
  });
  it('callbackRejectsMissingCode', async () => {
    const start = await request(server()).get('/api/auth/google');
    await request(server())
      .get('/api/auth/google/callback?state=state')
      .set('Cookie', cookies(start))
      .expect(302)
      .expect('Location', 'https://desk.example/login?error=google_failed');
    expect(provider.exchangeCode).not.toHaveBeenCalled();
  });
  it('callbackRejectsProviderFailure', async () => {
    provider.exchangeCode.mockRejectedValue(new Error('failure'));
    const start = await request(server()).get('/api/auth/google');
    await request(server())
      .get('/api/auth/google/callback?code=code&state=state')
      .set('Cookie', cookies(start))
      .expect(302)
      .expect('Location', 'https://desk.example/login?error=google_failed');
    expect(users.users.size).toBe(0);
  });
  it('callbackRejectsInactiveAccount', async () => {
    await request(server())
      .post('/api/auth/register')
      .send({ ...identity, password: 'password', department: 'IT' })
      .expect(201);
    (await users.findByEmail(Email.of(identity.email)))!.deactivate();
    const start = await request(server()).get('/api/auth/google');
    const response = await request(server())
      .get('/api/auth/google/callback?code=code&state=state')
      .set('Cookie', cookies(start))
      .expect(302)
      .expect('Location', 'https://desk.example/login?error=account_inactive');
    expect(cookies(response).some((cookie) => cookie.startsWith('itsm_refresh='))).toBe(false);
  });
  it('callbackSetsRefreshCookieForValidLogin', async () => {
    const start = await request(server()).get('/api/auth/google');
    const response = await request(server())
      .get('/api/auth/google/callback?code=code&state=state')
      .set('Cookie', cookies(start))
      .expect(302)
      .expect('Location', 'https://desk.example/');
    expect(provider.exchangeCode).toHaveBeenCalledExactlyOnceWith('code', 'verifier');
    const refreshCookie = cookies(response).find((cookie) => cookie.startsWith('itsm_refresh='))!;
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('SameSite=Lax');
    expect(refreshCookie).toContain('Path=/api/auth;');
    expect(refreshCookie).toContain(`Max-Age=${env.REFRESH_TOKEN_TTL_SECONDS}`);
    expect(cookies(response)[0]).toContain('Expires=Thu, 01 Jan 1970');
    const refreshed = await request(server())
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    expect(refreshed.body.user).toMatchObject({ email: identity.email, role: 'EMPLOYEE' });
  });
  it('usesSecureCookiesInProduction', async () => {
    env.NODE_ENV = 'production';
    const start = await request(server()).get('/api/auth/google');
    expect(cookies(start)[0]).toContain('; Secure');
    const response = await request(server())
      .get('/api/auth/google/callback?code=code&state=state')
      .set('Cookie', cookies(start))
      .expect(302);
    expect(cookies(response)).toHaveLength(2);
    for (const cookie of cookies(response)) expect(cookie).toContain('; Secure');
  });
});

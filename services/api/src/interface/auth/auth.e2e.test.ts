/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { SignJWT } from 'jose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { MemoryUsers, fakeHasher } from '../../application/auth/testing.js';
import { asIncidentId, asUserId } from '../../domain/shared/index.js';
import { Role, UserFactory } from '../../domain/users/index.js';
import { loadEnv } from '../../infrastructure/config/env.js';
import {
  PASSWORD_HASHER,
  TOKEN_SERVICE,
  USER_REPOSITORY,
  type TokenService,
} from '../../ports/index.js';
import { configureApp } from '../configure-app.js';
const body = { name: 'Alice', email: 'alice@example.com', password: 'password', department: 'IT' };
describe('auth HTTP', () => {
  let app: INestApplication;
  let users: MemoryUsers;
  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  beforeEach(async () => {
    users = new MemoryUsers();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(USER_REPOSITORY)
      .useValue(users)
      .overrideProvider(PASSWORD_HASHER)
      .useValue(fakeHasher)
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterEach(async () => {
    await app?.close();
  });
  it('registerThenLoginReturnsTokens', async () => {
    const reg = await request(server()).post('/api/auth/register').send(body).expect(201);
    expect(reg.body.accessToken).toBeTruthy();
    expect(reg.headers['set-cookie']).toBeTruthy();
    const login = await request(server())
      .post('/api/auth/login')
      .send({ email: body.email, password: body.password })
      .expect(200);
    expect(login.body.user.role).toBe('EMPLOYEE');
  });
  it('loginWithWrongPasswordReturns401ErrorShape', async () => {
    const result = await request(server())
      .post('/api/auth/login')
      .send({ email: body.email, password: 'bad' })
      .expect(401);
    expect(result.body.error.code).toBe('INVALID_CREDENTIALS');
  });
  it('meWithoutTokenReturns401', async () => {
    await request(server()).get('/api/auth/me').expect(401);
  });
  it('meWithExpiredTokenReturns401', async () => {
    const key = new TextEncoder().encode(loadEnv().JWT_SECRET);
    const token = await new SignJWT({ role: 'EMPLOYEE' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('id')
      .setAudience('itsm-access')
      .setExpirationTime(1)
      .sign(key);
    await request(server()).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
  });
  it('refreshCookieIssuesNewAccessToken', async () => {
    const reg = await request(server()).post('/api/auth/register').send(body).expect(201);
    const cookie = reg.headers['set-cookie'] as unknown as string[];
    const result = await request(server())
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .expect(200);
    expect(result.body.accessToken).toBeTruthy();
  });
  it('employeeGets403OnConfigRoute', async () => {
    const reg = await request(server()).post('/api/auth/register').send(body);
    await request(server())
      .get('/api/auth/permissions-check/config')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .expect(403);
  });
  it('adminGets200OnConfigRoute', async () => {
    const admin = UserFactory.create({
      id: asUserId('7e762841-2e65-4a04-8f40-b9fd2574692d'),
      name: 'Admin',
      email: 'admin@example.com',
      passwordHash: 'hashed:password',
      role: Role.ADMIN,
    });
    await users.save(admin);
    const login = await request(server())
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'password' });
    await request(server())
      .get('/api/auth/permissions-check/config')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200, { ok: true });
  });
  it('invalidBodyReturns400WithIssues', async () => {
    const result = await request(server()).post('/api/auth/register').send({}).expect(400);
    expect(result.body.error.details.issues.length).toBeGreaterThan(0);
  });
  it('loginIsRateLimited', async () => {
    for (let i = 0; i < 10; i++)
      await request(server())
        .post('/api/auth/login')
        .send({ email: body.email, password: 'bad' })
        .expect(401);
    const response = await request(server())
      .post('/api/auth/login')
      .send({ email: body.email, password: 'bad' })
      .expect(429);
    expect(response.body.error.code).toBe('TOO_MANY_REQUESTS');
  });
  it('healthStaysPublic', async () => {
    await request(server()).get('/health').expect(200);
  });
  it('emailLinkSetsRefreshCookieAndRedirectsToIncident', async () => {
    const priya = UserFactory.create({
      id: asUserId('7e762841-2e65-4a04-8f40-b9fd2574692e'),
      name: 'Priya Sharma',
      email: 'priya@itsm.demo',
      passwordHash: 'hashed:password',
      department: 'Finance',
      role: Role.EMPLOYEE,
    });
    await users.save(priya);
    const tokens = app.get<TokenService>(TOKEN_SERVICE);
    const incidentId = asIncidentId('01900000-0000-7000-8000-000000000215');
    const token = await tokens.issueEmailLink(priya.id(), incidentId);
    const response = await request(server())
      .get('/api/auth/email-link')
      .query({ token })
      .expect(302);
    expect(response.headers.location).toBe(`http://localhost:5173/incidents/${incidentId}`);
    const cookie = response.headers['set-cookie'] as unknown as string[];
    expect(cookie.some((c) => c.startsWith('itsm_refresh='))).toBe(true);
    const refreshed = await request(server())
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .expect(200);
    expect(refreshed.body.user.id).toBe(priya.id());
  });
  it('invalidEmailLinkRedirectsToLogin', async () => {
    const missing = await request(server()).get('/api/auth/email-link').expect(302);
    expect(missing.headers.location).toBe('http://localhost:5173/login');
    const invalid = await request(server())
      .get('/api/auth/email-link')
      .query({ token: 'not-a-valid-jwt' })
      .expect(302);
    expect(invalid.headers.location).toBe('http://localhost:5173/login');
  });
});

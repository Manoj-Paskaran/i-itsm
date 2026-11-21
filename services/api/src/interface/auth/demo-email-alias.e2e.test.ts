/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { MemoryUsers, fakeHasher } from '../../application/auth/testing.js';
import { asUserId } from '../../domain/shared/index.js';
import { Role, UserFactory } from '../../domain/users/index.js';
import { ENV } from '../../infrastructure/config/config.module.js';
import { loadEnv } from '../../infrastructure/config/env.js';
import { PASSWORD_HASHER, USER_REPOSITORY } from '../../ports/index.js';
import { configureApp } from '../configure-app.js';

describe('demo email alias (DEMO_EMAIL_OVERRIDE)', () => {
  let app: INestApplication;
  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  beforeEach(async () => {
    const users = new MemoryUsers();
    await users.save(
      UserFactory.create({
        id: asUserId('5b8f2b0e-0d55-4a77-9a62-2f4f1b7f6c11'),
        name: 'Priya Sharma',
        email: 'me@example.com',
        passwordHash: 'hashed:demo1234',
        role: Role.EMPLOYEE,
        department: 'Finance',
      }),
    );
    const env = loadEnv({
      NODE_ENV: 'test',
      MONITOR_ENABLED: 'false',
      DEMO_EMAIL_OVERRIDE: 'priya@itsm.demo=me@example.com',
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
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
  it('seededAddressSignsInAsTheOverriddenAccount', async () => {
    const login = await request(server())
      .post('/api/auth/login')
      .send({ email: 'Priya@itsm.demo', password: 'demo1234' })
      .expect(200);
    expect(login.body.user.email).toBe('me@example.com');
  });
  it('realAddressStillSignsIn', async () => {
    await request(server())
      .post('/api/auth/login')
      .send({ email: 'me@example.com', password: 'demo1234' })
      .expect(200);
  });
  it('aliasStillNeedsTheRightPassword', async () => {
    await request(server())
      .post('/api/auth/login')
      .send({ email: 'priya@itsm.demo', password: 'wrong-password' })
      .expect(401);
  });
});

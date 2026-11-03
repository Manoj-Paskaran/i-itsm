import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { HealthResponseSchema } from '@itsm/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../configure-app.js';

describe('GET /health', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(module.createNestApplication());
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  it('returnsAValidHealthResponse', async () => {
    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get('/health')
      .expect(200);
    expect(HealthResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toMatchObject({ status: 'ok', service: 'api' });
  });
});

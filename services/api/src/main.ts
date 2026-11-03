import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './interface/configure-app.js';
import { ENV } from './infrastructure/config/config.module.js';
import type { Env } from './infrastructure/config/env.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const env = app.get<Env>(ENV);
  configureApp(app);
  app.enableCors({ origin: env.WEB_ORIGIN });
  app.enableShutdownHooks();
  await app.listen(env.PORT);
  console.log(`API listening at ${await app.getUrl()}`);
}

void bootstrap();

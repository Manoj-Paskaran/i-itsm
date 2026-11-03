import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';

/** Shared HTTP setup so tests boot the app exactly like main.ts does. */
export function configureApp(app: INestApplication): INestApplication {
  // Every API route lives under /api (the web dev proxy forwards it); /health stays at the root.
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.use(cookieParser());
  return app;
}

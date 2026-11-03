import { Module } from '@nestjs/common';
import { loadEnv } from './env.js';

export const ENV = Symbol('ENV');

@Module({
  providers: [{ provide: ENV, useFactory: loadEnv }],
  exports: [ENV],
})
export class ConfigModule {}

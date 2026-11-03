import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthService } from '../../application/auth/auth.service.js';
import { ConfigModule, ENV } from '../../infrastructure/config/config.module.js';
import type { Env } from '../../infrastructure/config/env.js';
import { RepositoriesModule } from '../../infrastructure/db/repositories/repositories.module.js';
import { Argon2PasswordHasher } from '../../infrastructure/auth/password-hasher.js';
import { JoseTokenService } from '../../infrastructure/auth/token.service.js';
import {
  PASSWORD_HASHER,
  TOKEN_SERVICE,
  USER_REPOSITORY,
  type PasswordHasher,
  type TokenService,
  type UserRepository,
} from '../../ports/index.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard, PermissionsGuard } from './guards.js';
import { ItsmExceptionFilter } from './exception.filter.js';
@Module({
  imports: [ConfigModule, RepositoriesModule, ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])],
  controllers: [AuthController],
  exports: [TOKEN_SERVICE],
  providers: [
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: TOKEN_SERVICE, useFactory: (env: Env) => new JoseTokenService(env), inject: [ENV] },
    {
      provide: AuthService,
      useFactory: (users: UserRepository, hasher: PasswordHasher, tokens: TokenService) =>
        new AuthService(users, hasher, tokens),
      inject: [USER_REPOSITORY, PASSWORD_HASHER, TOKEN_SERVICE],
    },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: ItsmExceptionFilter },
  ],
})
export class AuthModule {}

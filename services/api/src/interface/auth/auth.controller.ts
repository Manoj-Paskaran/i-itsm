import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  AuthResponseSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  type AuthResponse,
} from '@itsm/contracts';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { AuthService } from '../../application/auth/auth.service.js';
import { InvalidInputException, InvalidTokenException } from '../../domain/exceptions/index.js';
import { Permission, type User } from '../../domain/users/index.js';
import { ENV } from '../../infrastructure/config/config.module.js';
import type { Env } from '../../infrastructure/config/env.js';
import { parseDemoEmailOverride } from '../../infrastructure/db/seed/users.js';
import { CurrentUser, Public, RequirePermissions } from './decorators.js';
import { refreshCookieOptions, setRefreshCookie } from './refresh-cookie.js';
function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new InvalidInputException('Invalid input.', { issues: result.error.issues });
  return result.data;
}
@Controller('auth')
export class AuthController {
  /** Seeded address → real address when the seed ran with DEMO_EMAIL_OVERRIDE. */
  private readonly demoAlias: { from: string; to: string } | undefined;
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.demoAlias = parseDemoEmailOverride(env.DEMO_EMAIL_OVERRIDE);
  }
  /** The seeded address still signs in after the override replaced it (demo account cards). */
  private loginEmail(email: string): string {
    return this.demoAlias && email.trim().toLowerCase() === this.demoAlias.from
      ? this.demoAlias.to
      : email;
  }
  private respond(res: Response, session: Awaited<ReturnType<AuthService['login']>>): AuthResponse {
    setRefreshCookie(res, session.refresh, this.env);
    return AuthResponseSchema.parse({
      accessToken: session.access.token,
      expiresIn: session.access.expiresIn,
      user: session.user,
    });
  }
  @Public()
  @Post('register')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async register(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.register(parseBody(RegisterRequestSchema, body)));
  }
  @Public()
  @Post('login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const data = parseBody(LoginRequestSchema, body);
    return this.respond(res, await this.auth.login(this.loginEmail(data.email), data.password));
  }
  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token: unknown = (req.cookies as Record<string, unknown> | undefined)?.itsm_refresh;
    if (typeof token !== 'string') throw new InvalidTokenException();
    return this.respond(res, await this.auth.refresh(token));
  }
  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('itsm_refresh', refreshCookieOptions(this.env));
  }
  @Get('me') me(@CurrentUser() user: User) {
    return this.auth.me(user.id());
  }
  // Demo-only endpoint to show domain-driven RBAC.
  @Get('permissions-check/config') @RequirePermissions(Permission.CONFIG_MANAGE) checkConfig() {
    return { ok: true };
  }
}

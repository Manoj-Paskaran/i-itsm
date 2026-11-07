import { timingSafeEqual } from 'node:crypto';
import { Controller, Get, Inject, Logger, Query, Req, Res } from '@nestjs/common';
import { AuthProvidersResponseSchema } from '@itsm/contracts';
import type { CookieOptions, Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from '../../application/auth/auth.service.js';
import {
  AccountInactiveException,
  IDENTITY_PROVIDER,
  type IdentityProvider,
} from '../../application/auth/identity-provider.js';
import { ENV } from '../../infrastructure/config/config.module.js';
import type { Env } from '../../infrastructure/config/env.js';
import { Public } from './decorators.js';
import { setRefreshCookie } from './refresh-cookie.js';

const OIDC_COOKIE = 'itsm_oidc';
const OIDC_TTL_MS = 10 * 60 * 1000;
const OidcCookieSchema = z.object({
  state: z.string().min(1),
  codeVerifier: z.string().min(1),
  createdAt: z.number(),
});

@Public()
@Controller('auth')
export class GoogleAuthController {
  private readonly logger = new Logger(GoogleAuthController.name);
  constructor(
    private readonly auth: AuthService,
    @Inject(IDENTITY_PROVIDER) private readonly provider: IdentityProvider,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      path: '/api/auth/google',
      secure: this.env.NODE_ENV === 'production',
    };
  }
  private failure(res: Response, code: string) {
    this.logger.warn(`Google sign-in failed (${code}).`);
    const url = new URL('/login', this.env.WEB_ORIGIN);
    url.searchParams.set('error', code);
    res.redirect(302, url.toString());
  }

  @Get('providers')
  providers() {
    return AuthProvidersResponseSchema.parse({ google: this.provider.isConfigured() });
  }

  @Get('google')
  start(@Res() res: Response) {
    if (!this.provider.isConfigured()) return this.failure(res, 'google_unavailable');
    try {
      const { url, state, codeVerifier } = this.provider.createAuthorizationRequest();
      res.cookie(OIDC_COOKIE, JSON.stringify({ state, codeVerifier, createdAt: Date.now() }), {
        ...this.cookieOptions(),
        maxAge: OIDC_TTL_MS,
      });
      res.redirect(302, url);
    } catch {
      this.failure(res, 'google_failed');
    }
  }

  @Get('google/callback')
  async callback(
    @Req() req: Request,
    @Query() query: Record<string, unknown>,
    @Res() res: Response,
  ) {
    res.clearCookie(OIDC_COOKIE, this.cookieOptions());
    if (query.error !== undefined) return this.failure(res, 'google_denied');
    let cookie: z.infer<typeof OidcCookieSchema>;
    try {
      const raw: unknown = (req.cookies as Record<string, unknown> | undefined)?.[OIDC_COOKIE];
      if (typeof raw !== 'string') return this.failure(res, 'google_state');
      cookie = OidcCookieSchema.parse(JSON.parse(raw));
      const state = typeof query.state === 'string' ? Buffer.from(query.state) : Buffer.alloc(0);
      const expected = Buffer.from(cookie.state);
      const age = Date.now() - cookie.createdAt;
      if (
        age < 0 ||
        age >= OIDC_TTL_MS ||
        state.length !== expected.length ||
        !timingSafeEqual(state, expected)
      )
        return this.failure(res, 'google_state');
    } catch {
      return this.failure(res, 'google_state');
    }
    try {
      if (typeof query.code !== 'string' || !query.code) return this.failure(res, 'google_failed');
      const identity = await this.provider.exchangeCode(query.code, cookie.codeVerifier);
      const session = await this.auth.loginWithExternalIdentity(identity);
      setRefreshCookie(res, session.refresh, this.env);
      res.redirect(302, new URL('/', this.env.WEB_ORIGIN).toString());
    } catch (error) {
      this.failure(
        res,
        error instanceof AccountInactiveException ? 'account_inactive' : 'google_failed',
      );
    }
  }
}

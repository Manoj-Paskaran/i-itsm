import type { CookieOptions, Response } from 'express';
import type { Env } from '../../infrastructure/config/env.js';

export function refreshCookieOptions(env: Env): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/api/auth',
    secure: env.NODE_ENV === 'production',
  };
}
export function setRefreshCookie(
  res: Response,
  refresh: { token: string; maxAgeSeconds: number },
  env: Env,
) {
  res.cookie('itsm_refresh', refresh.token, {
    ...refreshCookieOptions(env),
    maxAge: refresh.maxAgeSeconds * 1000,
  });
}

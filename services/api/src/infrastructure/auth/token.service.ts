import { SignJWT, jwtVerify } from 'jose';
import { InvalidTokenException } from '../../domain/exceptions/index.js';
import { asUserId } from '../../domain/shared/index.js';
import { Role, type User } from '../../domain/users/index.js';
import type { AccessClaims, TokenService } from '../../ports/index.js';
import type { Env } from '../config/env.js';
export class JoseTokenService implements TokenService {
  private readonly key: Uint8Array;
  constructor(private readonly env: Env) {
    this.key = new TextEncoder().encode(env.JWT_SECRET);
  }
  private async issue(user: User, audience: string, ttl: number) {
    return new SignJWT({ role: user.role() })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id())
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(`${ttl}s`)
      .sign(this.key);
  }
  async issueAccess(user: User) {
    return {
      token: await this.issue(user, 'itsm-access', this.env.ACCESS_TOKEN_TTL_SECONDS),
      expiresIn: this.env.ACCESS_TOKEN_TTL_SECONDS,
    };
  }
  async issueRefresh(user: User) {
    return {
      token: await this.issue(user, 'itsm-refresh', this.env.REFRESH_TOKEN_TTL_SECONDS),
      maxAgeSeconds: this.env.REFRESH_TOKEN_TTL_SECONDS,
    };
  }
  private async verify(token: string, audience: string) {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        audience,
        algorithms: ['HS256'],
        requiredClaims: ['sub', 'exp'],
      });
      if (!payload.sub || !Object.values(Role).some((r) => r === payload.role))
        throw new Error('claims');
      return { sub: asUserId(payload.sub), role: payload.role as AccessClaims['role'] };
    } catch {
      throw new InvalidTokenException();
    }
  }
  verifyAccess(token: string): Promise<AccessClaims> {
    return this.verify(token, 'itsm-access');
  }
  async verifyRefresh(token: string) {
    const claims = await this.verify(token, 'itsm-refresh');
    return { userId: claims.sub };
  }
}

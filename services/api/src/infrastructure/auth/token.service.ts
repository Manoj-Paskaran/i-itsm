import { SignJWT, jwtVerify } from 'jose';
import { InvalidTokenException } from '../../domain/exceptions/index.js';
import { asIncidentId, asUserId, type IncidentId, type UserId } from '../../domain/shared/index.js';
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
  async issueEmailLink(userId: UserId, incidentId: IncidentId): Promise<string> {
    return new SignJWT({ incidentId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setAudience('itsm-email-link')
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(this.key);
  }
  async verifyEmailLink(token: string): Promise<{ userId: UserId; incidentId: IncidentId }> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        audience: 'itsm-email-link',
        algorithms: ['HS256'],
        requiredClaims: ['sub', 'exp'],
      });
      if (!payload.sub || typeof payload.incidentId !== 'string' || !payload.incidentId)
        throw new Error('claims');
      return { userId: asUserId(payload.sub), incidentId: asIncidentId(payload.incidentId) };
    } catch {
      throw new InvalidTokenException();
    }
  }
}

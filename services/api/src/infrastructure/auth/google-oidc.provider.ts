import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import {
  IdentityProviderException,
  type IdentityProvider,
} from '../../application/auth/identity-provider.js';
import type { Env } from '../config/env.js';

interface GoogleOidcDependencies {
  jwks?: JWTVerifyGetKey;
  fetch?: typeof globalThis.fetch;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  jwksEndpoint?: string;
}
const IdentityClaimsSchema = z.object({
  email: z.email(),
  email_verified: z.literal(true),
  name: z.string().trim().min(1).max(100).optional(),
});

/** OpenID Connect Adapter; the application never handles Google tokens or HTTP. */
export class GoogleOidcProvider implements IdentityProvider {
  readonly name = 'google';
  private readonly jwks: JWTVerifyGetKey;
  private readonly fetchToken: typeof globalThis.fetch;
  private readonly authorizationEndpoint: string;
  private readonly tokenEndpoint: string;

  constructor(
    private readonly env: Pick<
      Env,
      'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET' | 'GOOGLE_REDIRECT_URI'
    >,
    dependencies: GoogleOidcDependencies = {},
  ) {
    this.jwks =
      dependencies.jwks ??
      createRemoteJWKSet(
        new URL(dependencies.jwksEndpoint ?? 'https://www.googleapis.com/oauth2/v3/certs'),
      );
    this.fetchToken = dependencies.fetch ?? globalThis.fetch;
    this.authorizationEndpoint =
      dependencies.authorizationEndpoint ?? 'https://accounts.google.com/o/oauth2/v2/auth';
    this.tokenEndpoint = dependencies.tokenEndpoint ?? 'https://oauth2.googleapis.com/token';
  }

  isConfigured() {
    return Boolean(this.env.GOOGLE_CLIENT_ID && this.env.GOOGLE_CLIENT_SECRET);
  }

  createAuthorizationRequest() {
    if (!this.isConfigured()) throw new IdentityProviderException();
    const state = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(32).toString('base64url');
    const url = new URL(this.authorizationEndpoint);
    url.search = new URLSearchParams({
      response_type: 'code',
      scope: 'openid email profile',
      client_id: this.env.GOOGLE_CLIENT_ID!,
      redirect_uri: this.env.GOOGLE_REDIRECT_URI,
      state,
      code_challenge: createHash('sha256').update(codeVerifier).digest('base64url'),
      code_challenge_method: 'S256',
    }).toString();
    return { url: url.toString(), state, codeVerifier };
  }

  async exchangeCode(code: string, codeVerifier: string) {
    try {
      if (!this.isConfigured()) throw new IdentityProviderException();
      const response = await this.fetchToken(this.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: this.env.GOOGLE_CLIENT_ID!,
          client_secret: this.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: this.env.GOOGLE_REDIRECT_URI,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        }),
      });
      if (!response.ok) throw new IdentityProviderException();
      const { id_token } = z.object({ id_token: z.string().min(1) }).parse(await response.json());
      const { payload } = await jwtVerify(id_token, this.jwks, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: this.env.GOOGLE_CLIENT_ID!,
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'exp', 'iat'],
      });
      const identity = IdentityClaimsSchema.parse(payload);
      return { email: identity.email, name: identity.name ?? identity.email };
    } catch {
      // Do not expose token responses, JWTs or client credentials in an error or log.
      throw new IdentityProviderException();
    }
  }
}

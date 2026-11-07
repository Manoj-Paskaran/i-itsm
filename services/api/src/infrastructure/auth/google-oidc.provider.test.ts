import { createHash } from 'node:crypto';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { IdentityProviderException } from '../../application/auth/identity-provider.js';
import { GoogleOidcProvider } from './google-oidc.provider.js';

const env = {
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_REDIRECT_URI: 'http://localhost:5173/api/auth/google/callback',
};
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let jwks: ReturnType<typeof createLocalJWKSet>;
beforeAll(async () => {
  keys = await generateKeyPair('RS256');
  jwks = createLocalJWKSet({
    keys: [{ ...(await exportJWK(keys.publicKey)), kid: 'test-key', alg: 'RS256' }],
  });
});
function setup(config = env) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  const provider = new GoogleOidcProvider(config, { jwks, fetch });
  return { provider, fetch };
}
function idToken(claims: JWTPayload = {}) {
  return new SignJWT({
    sub: 'google-user',
    iss: 'https://accounts.google.com',
    aud: env.GOOGLE_CLIENT_ID,
    email: 'alice@example.com',
    email_verified: true,
    name: 'Alice',
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuedAt()
    .setExpirationTime(claims.exp ?? '5m')
    .sign(keys.privateKey);
}
describe('GoogleOidcProvider', () => {
  it('acceptsValidIdToken', async () => {
    const { provider, fetch } = setup();
    fetch.mockResolvedValue(Response.json({ id_token: await idToken() }));
    await expect(provider.exchangeCode('auth-code', 'verifier')).resolves.toEqual({
      email: 'alice@example.com',
      name: 'Alice',
    });
    expect(fetch).toHaveBeenCalledWith('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: 'auth-code',
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
        code_verifier: 'verifier',
      }),
    });
  });
  it.each([
    ['rejectsIdTokenWithWrongAudience', { aud: 'someone-else' }],
    ['rejectsUnverifiedEmail', { email_verified: false }],
    ['rejectsStringEmailVerification', { email_verified: 'true' }],
    ['rejectsMissingEmail', { email: undefined }],
    ['rejectsInvalidEmail', { email: 'invalid' }],
    ['rejectsWrongIssuer', { iss: 'https://attacker.example' }],
    ['rejectsExpiredIdToken', { exp: 1 }],
  ] satisfies [string, JWTPayload][])('%s', async (_name, claims) => {
    const { provider, fetch } = setup();
    fetch.mockResolvedValue(Response.json({ id_token: await idToken(claims) }));
    await expect(provider.exchangeCode('code', 'verifier')).rejects.toBeInstanceOf(
      IdentityProviderException,
    );
  });
  it('rejectsIdTokenSignedWithAnotherKey', async () => {
    const { provider, fetch } = setup();
    const other = await generateKeyPair('RS256');
    const jwt = await new SignJWT({ sub: 'user', email: 'alice@example.com', email_verified: true })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer('https://accounts.google.com')
      .setAudience('client-id')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(other.privateKey);
    fetch.mockResolvedValue(Response.json({ id_token: jwt }));
    await expect(provider.exchangeCode('code', 'verifier')).rejects.toBeInstanceOf(
      IdentityProviderException,
    );
  });
  it('acceptsBareGoogleIssuerAndUsesEmailWhenNameIsMissing', async () => {
    const { provider, fetch } = setup();
    fetch.mockResolvedValue(
      Response.json({ id_token: await idToken({ iss: 'accounts.google.com', name: undefined }) }),
    );
    await expect(provider.exchangeCode('code', 'verifier')).resolves.toEqual({
      email: 'alice@example.com',
      name: 'alice@example.com',
    });
  });
  it.each([
    ['rejectsFailedTokenExchange', () => new Response('denied', { status: 400 })],
    ['rejectsMissingIdToken', () => Response.json({ access_token: 'unused' })],
    ['rejectsInvalidTokenResponse', () => new Response('not-json')],
  ])('%s', async (_name, response) => {
    const { provider, fetch } = setup();
    fetch.mockResolvedValue(response());
    await expect(provider.exchangeCode('code', 'verifier')).rejects.toBeInstanceOf(
      IdentityProviderException,
    );
  });
  it('rejectsNetworkFailureWithoutExposingCredentials', async () => {
    const { provider, fetch } = setup();
    fetch.mockRejectedValue(new Error('secret response'));
    await expect(provider.exchangeCode('code', 'verifier')).rejects.toThrow(
      'External identity could not be verified.',
    );
  });
  it('authorizationUrlContainsS256ChallengeAndState', () => {
    const { provider } = setup();
    const request = provider.createAuthorizationRequest();
    const url = new URL(request.url);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      scope: 'openid email profile',
      client_id: 'client-id',
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      state: request.state,
      code_challenge: createHash('sha256').update(request.codeVerifier).digest('base64url'),
      code_challenge_method: 'S256',
    });
    expect(request.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const next = provider.createAuthorizationRequest();
    expect(next.state).not.toBe(request.state);
    expect(next.codeVerifier).not.toBe(request.codeVerifier);
  });
  it.each([
    { ...env, GOOGLE_CLIENT_ID: '' },
    { ...env, GOOGLE_CLIENT_SECRET: '' },
  ])('rejectsRequestsWithoutBothCredentials', async (config) => {
    const { provider, fetch } = setup(config);
    expect(provider.isConfigured()).toBe(false);
    expect(() => provider.createAuthorizationRequest()).toThrow(IdentityProviderException);
    await expect(provider.exchangeCode('code', 'verifier')).rejects.toBeInstanceOf(
      IdentityProviderException,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('usesInjectedEndpoints', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ id_token: await idToken() }));
    const provider = new GoogleOidcProvider(env, {
      jwks,
      fetch,
      authorizationEndpoint: 'https://test.example/authorize',
      tokenEndpoint: 'https://test.example/token',
    });
    expect(provider.createAuthorizationRequest().url).toMatch(
      /^https:\/\/test.example\/authorize\?/,
    );
    await provider.exchangeCode('code', 'verifier');
    expect(fetch.mock.calls[0]?.[0]).toBe('https://test.example/token');
  });
});

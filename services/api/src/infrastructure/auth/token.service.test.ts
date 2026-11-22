import { describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { InvalidTokenException } from '../../domain/exceptions/index.js';
import { asIncidentId, asUserId } from '../../domain/shared/index.js';
import { Role, UserFactory } from '../../domain/users/index.js';
import { loadEnv } from '../config/env.js';
import { JoseTokenService } from './token.service.js';
import { Argon2PasswordHasher } from './password-hasher.js';
const user = UserFactory.create({
  id: asUserId('0d988679-777a-4bb7-acb7-86af70a1bc71'),
  name: 'Alice',
  email: 'a@example.com',
  passwordHash: 'hash',
  role: Role.ADMIN,
});
describe('authentication adapters', () => {
  it('usesArgon2idAndVerifiesPasswords', async () => {
    const hasher = new Argon2PasswordHasher();
    const hash = await hasher.hash('password');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await hasher.verify(hash, 'password')).toBe(true);
    expect(await hasher.verify(hash, 'wrong')).toBe(false);
  });
  it('rejectsSwappedAndExpiredTokens', async () => {
    const env = loadEnv({});
    const tokens = new JoseTokenService(env);
    const access = await tokens.issueAccess(user);
    const refresh = await tokens.issueRefresh(user);
    expect(await tokens.verifyAccess(access.token)).toEqual({ sub: user.id(), role: Role.ADMIN });
    expect(await tokens.verifyRefresh(refresh.token)).toEqual({ userId: user.id() });
    await expect(tokens.verifyAccess(refresh.token)).rejects.toBeInstanceOf(InvalidTokenException);
    await expect(tokens.verifyRefresh(access.token)).rejects.toBeInstanceOf(InvalidTokenException);
    const expired = await new SignJWT({ role: Role.ADMIN })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id())
      .setAudience('itsm-access')
      .setExpirationTime(1)
      .sign(new TextEncoder().encode(env.JWT_SECRET));
    await expect(tokens.verifyAccess(expired)).rejects.toBeInstanceOf(InvalidTokenException);
  });
  it('issuesAndVerifiesEmailLinkTokensAndRejectsSwappedAudiences', async () => {
    const env = loadEnv({});
    const tokens = new JoseTokenService(env);
    const incidentId = asIncidentId('01900000-0000-7000-8000-000000000099');
    const linkToken = await tokens.issueEmailLink(user.id(), incidentId);
    expect(await tokens.verifyEmailLink(linkToken)).toEqual({
      userId: user.id(),
      incidentId,
    });
    const access = await tokens.issueAccess(user);
    await expect(tokens.verifyEmailLink(access.token)).rejects.toBeInstanceOf(
      InvalidTokenException,
    );
    await expect(tokens.verifyAccess(linkToken)).rejects.toBeInstanceOf(InvalidTokenException);
    await expect(tokens.verifyRefresh(linkToken)).rejects.toBeInstanceOf(InvalidTokenException);
  });
});

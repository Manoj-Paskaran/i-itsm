/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { AccountInactiveException } from './identity-provider.js';
import {
  InvalidCredentialsException,
  InvalidInputException,
  InvalidTokenException,
} from '../../domain/exceptions/index.js';
import { asUserId, Email } from '../../domain/shared/index.js';
import { Role, UserFactory } from '../../domain/users/index.js';
import type { TokenService } from '../../ports/index.js';
import { MemoryUsers, fakeHasher } from './testing.js';
const tokens: TokenService = {
  issueAccess: async () => ({ token: 'access', expiresIn: 3600 }),
  issueRefresh: async (u) => ({ token: u.id(), maxAgeSeconds: 60 }),
  verifyAccess: async () => ({ sub: asUserId('id'), role: Role.EMPLOYEE }),
  verifyRefresh: async (token) => ({ userId: asUserId(token) }),
};
const cmd = { name: 'Alice', email: 'alice@example.com', password: 'password', department: 'IT' };
function setup() {
  const users = new MemoryUsers();
  const hasher = {
    ...fakeHasher,
    verify: vi.fn((hash: string, plain: string) => fakeHasher.verify(hash, plain)),
  };
  return { users, hasher, auth: new AuthService(users, hasher, tokens) };
}
describe('AuthService', () => {
  it('existingActiveUserGetsSession', async () => {
    const { auth, users, hasher } = setup();
    const admin = UserFactory.create({
      id: asUserId('admin'),
      name: 'Admin',
      email: 'admin@example.com',
      passwordHash: 'existing-hash',
      role: Role.ADMIN,
    });
    await users.save(admin);
    const session = await auth.loginWithExternalIdentity({
      email: ' ADMIN@EXAMPLE.COM ',
      name: 'Google name',
    });
    expect(session).toMatchObject({
      user: { id: admin.id(), name: 'Admin', role: Role.ADMIN },
      access: { token: 'access' },
      refresh: { token: admin.id() },
    });
    expect(users.users.size).toBe(1);
    expect(admin.toSnapshot().passwordHash).toBe('existing-hash');
    expect(hasher.verify).not.toHaveBeenCalled();
  });
  it('unknownEmailCreatesEmployee', async () => {
    const { auth, users } = setup();
    const session = await auth.loginWithExternalIdentity({
      email: 'NEW@example.com',
      name: 'New Employee',
    });
    const user = await users.findByEmail(Email.of('new@example.com'));
    expect(session.user).toMatchObject({
      id: user?.id(),
      email: 'new@example.com',
      name: 'New Employee',
      role: Role.EMPLOYEE,
    });
    expect(session.access.token).toBe('access');
    expect(session.refresh.token).toBe(user?.id());
    expect(user?.toSnapshot()).toMatchObject({ department: 'Unspecified', active: true });
    expect(user?.toSnapshot().passwordHash).toMatch(/^hashed:[a-f0-9]{64}$/);
    await expect(auth.login('new@example.com', 'password')).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
    await auth.loginWithExternalIdentity({ email: 'new@example.com', name: 'New Employee' });
    expect(users.users.size).toBe(1);
  });
  it('inactiveUserIsRejected', async () => {
    const { auth, users } = setup();
    await auth.register(cmd);
    (await users.findByEmail(Email.of(cmd.email)))!.deactivate();
    await expect(
      auth.loginWithExternalIdentity({ email: cmd.email, name: cmd.name }),
    ).rejects.toBeInstanceOf(AccountInactiveException);
    expect(users.users.size).toBe(1);
  });
  it('registersEmployeeWithHashedPassword', async () => {
    const { auth, users } = setup();
    const result = await auth.register(cmd);
    const user = await users.findByEmail(Email.of(cmd.email));
    expect(user?.role()).toBe(Role.EMPLOYEE);
    expect(user?.toSnapshot().passwordHash).toBe('hashed:password');
    expect(result.user.id).toBe(user?.id());
  });
  it('rejectsDuplicateEmailOnRegister', async () => {
    const { auth } = setup();
    await auth.register(cmd);
    await expect(auth.register(cmd)).rejects.toBeInstanceOf(InvalidInputException);
  });
  it('loginRejectsUnknownEmailWithSameError', async () => {
    const { auth, hasher } = setup();
    await expect(auth.login(cmd.email, cmd.password)).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
    expect(hasher.verify).toHaveBeenCalledOnce();
  });
  it('loginRejectsWrongPassword', async () => {
    const { auth } = setup();
    await auth.register(cmd);
    await expect(auth.login(cmd.email, 'wrong')).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
  });
  it('loginRejectsInactiveUser', async () => {
    const { auth, users } = setup();
    await auth.register(cmd);
    (await users.findByEmail(Email.of(cmd.email)))!.deactivate();
    await expect(auth.login(cmd.email, cmd.password)).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
  });
  it('refreshRejectsDeactivatedUser', async () => {
    const { auth, users } = setup();
    const session = await auth.register(cmd);
    (await users.findById(asUserId(session.user.id)))!.deactivate();
    await expect(auth.refresh(session.refresh.token)).rejects.toBeInstanceOf(InvalidTokenException);
  });
  it('meReturnsPermissionsFromRole', async () => {
    const { auth, users } = setup();
    const admin = UserFactory.create({
      id: asUserId('id'),
      name: 'Admin',
      email: 'admin@example.com',
      passwordHash: 'hash',
      role: Role.ADMIN,
    });
    await users.save(admin);
    expect((await auth.me(admin.id())).permissions).toEqual([...admin.permissions()]);
  });
});

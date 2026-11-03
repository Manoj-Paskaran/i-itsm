/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';
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

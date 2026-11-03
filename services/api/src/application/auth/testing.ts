/* eslint-disable @typescript-eslint/require-await */
import { type Email, type UserId } from '../../domain/shared/index.js';
import { type Role, type User, type Technician } from '../../domain/users/index.js';
import type { PasswordHasher, UserRepository } from '../../ports/index.js';
export class MemoryUsers implements UserRepository {
  users = new Map<UserId, User>();
  async findById(id: UserId) {
    return this.users.get(id) ?? null;
  }
  async findByEmail(email: Email) {
    return [...this.users.values()].find((u) => u.email().equals(email)) ?? null;
  }
  async save(user: User) {
    this.users.set(user.id(), user);
  }
  async listAll() {
    return [...this.users.values()];
  }
  async listTechnicians(): Promise<Technician[]> {
    return [];
  }
  async listByRole(role: Role) {
    return [...this.users.values()].filter((u) => u.role() === role);
  }
}
export const fakeHasher: PasswordHasher = {
  hash: async (p) => `hashed:${p}`,
  verify: async (h, p) => h === `hashed:${p}`,
};

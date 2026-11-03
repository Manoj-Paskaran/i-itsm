/* eslint-disable @typescript-eslint/require-await -- Async ports backed by synchronous in-memory snapshots. */
import {
  UserFactory,
  type Role,
  type Technician,
  type User,
  type UserSnapshot,
} from '../../domain/users/index.js';
import type { Email, UserId } from '../../domain/shared/index.js';
import type { UserRepository } from '../../ports/index.js';
export class InMemoryUserRepository implements UserRepository {
  private readonly data = new Map<UserId, UserSnapshot>();
  async save(user: User) {
    this.data.set(user.id(), structuredClone(user.toSnapshot()));
  }
  async findById(id: UserId) {
    const s = this.data.get(id);
    return s ? UserFactory.rehydrate(structuredClone(s)) : null;
  }
  async findByEmail(email: Email) {
    const s = [...this.data.values()].find((u) => u.email === email.value);
    return s ? UserFactory.rehydrate(structuredClone(s)) : null;
  }
  async listTechnicians() {
    return [...this.data.values()]
      .filter((s) => s.role === 'TECHNICIAN' || s.role === 'TEAM_LEAD')
      .map((s) => UserFactory.rehydrate(structuredClone(s)) as Technician);
  }
  async listByRole(role: Role) {
    return [...this.data.values()]
      .filter((s) => s.role === role)
      .map((s) => UserFactory.rehydrate(structuredClone(s)));
  }
}

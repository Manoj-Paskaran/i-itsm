import type { UserId } from '../shared/index.js';
import type { Role, User } from '../users/index.js';

/** Identity captured at command time, including actions performed by the system. */
export class Actor {
  private constructor(
    readonly id: UserId | null,
    readonly role: Role | 'SYSTEM',
  ) {
    Object.freeze(this);
  }
  static user(user: User): Actor {
    return Actor.of(user.id(), user.role());
  }
  static of(id: UserId, role: Role): Actor {
    return new Actor(id, role);
  }
  static system(): Actor {
    return new Actor(null, 'SYSTEM');
  }
  isSystem(): boolean {
    return this.role === 'SYSTEM';
  }
  is(id: UserId): boolean {
    return this.id === id;
  }
}

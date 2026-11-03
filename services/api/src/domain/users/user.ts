import { Email, PasswordHash, type UserId } from '../shared/index.js';
import { text } from '../shared/validation.js';
import { UnauthorizedOperationException } from '../exceptions/index.js';
import type { Permission, Role } from './enums.js';
import type { UserCommonSnapshot, UserSnapshot } from './snapshot.js';
/** Abstract identity with polymorphic permissions. */
export abstract class User {
  private readonly userId: UserId;
  private userName: string;
  private readonly userEmail: Email;
  private readonly passwordHash: PasswordHash;
  private active: boolean;
  protected constructor(s: UserCommonSnapshot) {
    this.userId = s.id;
    this.userName = text(s.name, 'name', 100);
    this.userEmail = Email.of(s.email);
    this.passwordHash = PasswordHash.of(s.passwordHash);
    this.active = s.active;
  }
  id(): UserId {
    return this.userId;
  }
  name(): string {
    return this.userName;
  }
  email(): Email {
    return this.userEmail;
  }
  isActive(): boolean {
    return this.active;
  }
  abstract role(): Role;
  abstract permissions(): ReadonlySet<Permission>;
  abstract toSnapshot(): UserSnapshot;
  can(p: Permission): boolean {
    return this.active && this.permissions().has(p);
  }
  require(p: Permission): void {
    if (!this.can(p)) throw new UnauthorizedOperationException(this.role(), p);
  }
  deactivate(): void {
    this.active = false;
  }
  activate(): void {
    this.active = true;
  }
  rename(name: string): void {
    this.userName = text(name, 'name', 100);
  }
  protected commonSnapshot(): UserCommonSnapshot {
    return {
      id: this.userId,
      name: this.userName,
      email: this.userEmail.value,
      passwordHash: this.passwordHash.value,
      active: this.active,
    };
  }
}

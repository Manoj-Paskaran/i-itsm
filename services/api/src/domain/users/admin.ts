import { User } from './user.js';
import { Role } from './enums.js';
import { adminPermissions } from './permissions.js';
import type { UserCommonSnapshot, UserSnapshot } from './snapshot.js';
/** Admin with role-specific permissions. */
export class Admin extends User {
  private constructor(s: UserCommonSnapshot) {
    super(s);
  }
  static rehydrate(s: UserCommonSnapshot): Admin {
    return new Admin(s);
  }
  role(): typeof Role.ADMIN {
    return Role.ADMIN;
  }
  permissions() {
    return adminPermissions;
  }
  toSnapshot(): UserSnapshot {
    return { ...this.commonSnapshot(), role: this.role() };
  }
}

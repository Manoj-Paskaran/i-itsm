import { User } from './user.js';
import { Role } from './enums.js';
import { managerPermissions } from './permissions.js';
import type { UserCommonSnapshot, UserSnapshot } from './snapshot.js';
/** ITManager with role-specific permissions. */
export class ITManager extends User {
  private constructor(s: UserCommonSnapshot) {
    super(s);
  }
  static rehydrate(s: UserCommonSnapshot): ITManager {
    return new ITManager(s);
  }
  role(): typeof Role.IT_MANAGER {
    return Role.IT_MANAGER;
  }
  permissions() {
    return managerPermissions;
  }
  toSnapshot(): UserSnapshot {
    return { ...this.commonSnapshot(), role: this.role() };
  }
}

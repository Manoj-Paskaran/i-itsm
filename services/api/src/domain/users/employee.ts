import { User } from './user.js';
import { Role } from './enums.js';
import { employeePermissions } from './permissions.js';
import { text } from '../shared/validation.js';
import type { UserSnapshot } from './snapshot.js';
type Snapshot = Extract<UserSnapshot, { role: typeof Role.EMPLOYEE }>;
/** Employee who reports and verifies incidents. */
export class Employee extends User {
  private readonly department: string;
  private constructor(s: Snapshot) {
    super(s);
    this.department = text(s.department, 'department');
  }
  static rehydrate(s: Snapshot): Employee {
    return new Employee(s);
  }
  role(): typeof Role.EMPLOYEE {
    return Role.EMPLOYEE;
  }
  permissions() {
    return employeePermissions;
  }
  toSnapshot(): Snapshot {
    return { ...this.commonSnapshot(), role: this.role(), department: this.department };
  }
}

import { Role, Availability } from './enums.js';
import { Employee } from './employee.js';
import { Technician } from './technician.js';
import { TeamLead } from './team-lead.js';
import { Admin } from './admin.js';
import { ITManager } from './it-manager.js';
import { invalid } from '../shared/validation.js';
import type { NewUserDraft, UserSnapshot } from './snapshot.js';
import type { User } from './user.js';
/** Creates the appropriate polymorphic user for a role. */
export class UserFactory {
  static create(d: NewUserDraft): User {
    const common = {
      id: d.id,
      name: d.name,
      email: d.email,
      passwordHash: d.passwordHash,
      active: d.active ?? true,
    };
    switch (d.role) {
      case Role.EMPLOYEE:
        return Employee.rehydrate({
          ...common,
          role: d.role,
          department: d.department ?? invalid('department', d.department),
        });
      case Role.TECHNICIAN:
      case Role.TEAM_LEAD: {
        const fields = {
          skills: d.skills ?? invalid('skills', d.skills),
          maxActiveIncidents:
            d.maxActiveIncidents ?? invalid('maxActiveIncidents', d.maxActiveIncidents),
          availability: d.availability ?? Availability.AVAILABLE,
          experienceYears: d.experienceYears ?? 0,
          serviceHistory: d.serviceHistory ?? [],
        };
        return d.role === Role.TECHNICIAN
          ? Technician.rehydrate({ ...common, ...fields, role: d.role })
          : TeamLead.rehydrate({ ...common, ...fields, role: d.role, team: d.team ?? [] });
      }
      case Role.ADMIN:
        return Admin.rehydrate(common);
      case Role.IT_MANAGER:
        return ITManager.rehydrate(common);
      default:
        return invalid('role', d.role);
    }
  }
  static rehydrate(s: UserSnapshot): User {
    switch (s.role) {
      case Role.EMPLOYEE:
        return Employee.rehydrate(s);
      case Role.TECHNICIAN:
        return Technician.rehydrate(s);
      case Role.TEAM_LEAD:
        return TeamLead.rehydrate(s);
      case Role.ADMIN:
        return Admin.rehydrate(s);
      case Role.IT_MANAGER:
        return ITManager.rehydrate(s);
      default:
        return invalid('role', s);
    }
  }
}

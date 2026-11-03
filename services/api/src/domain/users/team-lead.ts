import { Technician } from './technician.js';
import { Role } from './enums.js';
import { teamLeadPermissions } from './permissions.js';
import { invalid } from '../shared/validation.js';
import type { UserId } from '../shared/index.js';
import type { UserSnapshot } from './snapshot.js';
type Snapshot = Extract<UserSnapshot, { role: typeof Role.TEAM_LEAD }>;
/** Technician who supervises a team. */
export class TeamLead extends Technician {
  private readonly team: Set<UserId>;
  private constructor(s: Snapshot) {
    super(s);
    this.team = new Set();
    for (const id of s.team) this.addMember(id);
  }
  static override rehydrate(
    s: Extract<UserSnapshot, { role: typeof Role.TECHNICIAN | typeof Role.TEAM_LEAD }>,
  ): TeamLead {
    if (s.role !== Role.TEAM_LEAD) return invalid('role', s.role);
    return new TeamLead(s);
  }
  override role(): typeof Role.TEAM_LEAD {
    return Role.TEAM_LEAD;
  }
  override permissions() {
    return teamLeadPermissions;
  }
  addMember(id: UserId): void {
    if (id === this.id()) invalid('member', id);
    this.team.add(id);
  }
  removeMember(id: UserId): void {
    this.team.delete(id);
  }
  supervises(id: UserId): boolean {
    return this.team.has(id);
  }
  override toSnapshot(): Snapshot {
    return {
      ...this.commonSnapshot(),
      ...this.technicianSnapshot(),
      role: this.role(),
      team: [...this.team],
    };
  }
}

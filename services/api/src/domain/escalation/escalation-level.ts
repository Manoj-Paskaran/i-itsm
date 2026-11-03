import { Role } from '../users/enums.js';
export const EscalationLevel = {
  TECHNICIAN: 'TECHNICIAN',
  TEAM_LEAD: 'TEAM_LEAD',
  SYS_ADMIN: 'SYS_ADMIN',
  IT_MANAGER: 'IT_MANAGER',
} as const;
export type EscalationLevel = (typeof EscalationLevel)[keyof typeof EscalationLevel];
const levels: readonly EscalationLevel[] = [
  EscalationLevel.TECHNICIAN,
  EscalationLevel.TEAM_LEAD,
  EscalationLevel.SYS_ADMIN,
  EscalationLevel.IT_MANAGER,
];
export function escalationRank(level: EscalationLevel): number {
  return levels.indexOf(level);
}
export function escalationRole(level: EscalationLevel): Role {
  return {
    TECHNICIAN: Role.TECHNICIAN,
    TEAM_LEAD: Role.TEAM_LEAD,
    SYS_ADMIN: Role.ADMIN,
    IT_MANAGER: Role.IT_MANAGER,
  }[level];
}

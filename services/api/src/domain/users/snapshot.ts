import type { UserId, ItServiceId } from '../shared/index.js';
import type { Role, Availability } from './enums.js';
export interface UserCommonSnapshot {
  readonly id: UserId;
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly active: boolean;
}
export interface TechnicianFields {
  readonly skills: readonly string[];
  readonly maxActiveIncidents: number;
  readonly availability: Availability;
  readonly experienceYears: number;
  readonly serviceHistory: readonly (readonly [ItServiceId, number])[];
}
export type UserSnapshot =
  | (UserCommonSnapshot & { readonly role: typeof Role.EMPLOYEE; readonly department: string })
  | (UserCommonSnapshot & TechnicianFields & { readonly role: typeof Role.TECHNICIAN })
  | (UserCommonSnapshot &
      TechnicianFields & { readonly role: typeof Role.TEAM_LEAD; readonly team: readonly UserId[] })
  | (UserCommonSnapshot & { readonly role: typeof Role.ADMIN | typeof Role.IT_MANAGER });
export interface NewUserDraft {
  readonly role: Role;
  readonly id: UserId;
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly active?: boolean;
  readonly department?: string;
  readonly skills?: readonly string[];
  readonly maxActiveIncidents?: number;
  readonly availability?: Availability;
  readonly experienceYears?: number;
  readonly serviceHistory?: readonly (readonly [ItServiceId, number])[];
  readonly team?: readonly UserId[];
}

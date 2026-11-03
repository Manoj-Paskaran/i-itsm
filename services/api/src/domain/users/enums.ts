export const Role = {
  EMPLOYEE: 'EMPLOYEE',
  TECHNICIAN: 'TECHNICIAN',
  TEAM_LEAD: 'TEAM_LEAD',
  ADMIN: 'ADMIN',
  IT_MANAGER: 'IT_MANAGER',
} as const;
export type Role = (typeof Role)[keyof typeof Role];
export const Availability = {
  AVAILABLE: 'AVAILABLE',
  BUSY: 'BUSY',
  OFF_SHIFT: 'OFF_SHIFT',
  ON_LEAVE: 'ON_LEAVE',
} as const;
export type Availability = (typeof Availability)[keyof typeof Availability];
export const Permission = {
  INCIDENT_REPORT: 'INCIDENT_REPORT',
  INCIDENT_VIEW_OWN: 'INCIDENT_VIEW_OWN',
  INCIDENT_VIEW_ASSIGNED: 'INCIDENT_VIEW_ASSIGNED',
  INCIDENT_VIEW_ALL: 'INCIDENT_VIEW_ALL',
  INCIDENT_WORK: 'INCIDENT_WORK',
  INCIDENT_ASSIGN: 'INCIDENT_ASSIGN',
  INCIDENT_VERIFY_OWN: 'INCIDENT_VERIFY_OWN',
  INCIDENT_FEEDBACK: 'INCIDENT_FEEDBACK',
  CONFIG_MANAGE: 'CONFIG_MANAGE',
  REPORTS_VIEW: 'REPORTS_VIEW',
  AUDIT_VIEW: 'AUDIT_VIEW',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

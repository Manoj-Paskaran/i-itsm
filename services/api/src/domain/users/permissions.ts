import { Permission as P, type Permission } from './enums.js';
// A read-only facade also prevents mutation through JavaScript's Set methods.
function permissionSet(values: readonly Permission[]): ReadonlySet<Permission> {
  const set = new Set(values);
  const facade: ReadonlySet<Permission> = Object.freeze({
    get size() {
      return set.size;
    },
    has: set.has.bind(set),
    entries: set.entries.bind(set),
    keys: set.keys.bind(set),
    values: set.values.bind(set),
    forEach: (
      fn: (value: Permission, value2: Permission, set: ReadonlySet<Permission>) => void,
      thisArg?: unknown,
    ) => {
      set.forEach((value) => fn.call(thisArg, value, value, facade));
    },
    [Symbol.iterator]: set[Symbol.iterator].bind(set),
    [Symbol.toStringTag]: 'Set',
  });
  return facade;
}
export const employeePermissions = permissionSet([
  P.INCIDENT_REPORT,
  P.INCIDENT_VIEW_OWN,
  P.INCIDENT_VERIFY_OWN,
  P.INCIDENT_FEEDBACK,
]);
export const technicianPermissions = permissionSet([P.INCIDENT_VIEW_ASSIGNED, P.INCIDENT_WORK]);
export const teamLeadPermissions = permissionSet([
  ...technicianPermissions,
  P.INCIDENT_ASSIGN,
  P.REPORTS_VIEW,
  P.INCIDENT_VIEW_ALL,
]);
export const adminPermissions = permissionSet([
  P.INCIDENT_VIEW_ALL,
  P.INCIDENT_ASSIGN,
  P.CONFIG_MANAGE,
  P.REPORTS_VIEW,
  P.AUDIT_VIEW,
]);
export const managerPermissions = permissionSet([
  P.INCIDENT_VIEW_ALL,
  P.INCIDENT_ASSIGN,
  P.REPORTS_VIEW,
  P.AUDIT_VIEW,
]);

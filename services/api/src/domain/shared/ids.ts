import { text } from './validation.js';
export type UserId = string & { readonly __brand: 'UserId' };
export function asUserId(value: string): UserId {
  text(value, 'userId');
  return value as UserId;
}
export type IncidentId = string & { readonly __brand: 'IncidentId' };
export function asIncidentId(value: string): IncidentId {
  text(value, 'incidentId');
  return value as IncidentId;
}
export type ItServiceId = string & { readonly __brand: 'ItServiceId' };
export function asItServiceId(value: string): ItServiceId {
  text(value, 'itServiceId');
  return value as ItServiceId;
}
export type CategoryId = string & { readonly __brand: 'CategoryId' };
export function asCategoryId(value: string): CategoryId {
  text(value, 'categoryId');
  return value as CategoryId;
}
export type AuditId = string & { readonly __brand: 'AuditId' };
export function asAuditId(value: string): AuditId {
  text(value, 'auditId');
  return value as AuditId;
}
export type SlaPolicyId = string & { readonly __brand: 'SlaPolicyId' };
export function asSlaPolicyId(value: string): SlaPolicyId {
  text(value, 'slaPolicyId');
  return value as SlaPolicyId;
}

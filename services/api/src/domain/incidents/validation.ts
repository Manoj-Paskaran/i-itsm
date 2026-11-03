import { InvalidIncidentException } from '../exceptions/index.js';

export function incidentText(value: string, field: string, min: number, max: number): string {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max)
    throw new InvalidIncidentException(`${field} must contain ${min}–${max} characters`);
  return value.trim();
}

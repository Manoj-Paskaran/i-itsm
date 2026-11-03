import { InvalidInputException } from '../exceptions/index.js';
export function invalid(field: string, value: unknown): never {
  throw new InvalidInputException(`Invalid ${field}.`, { field, value });
}
export function text(value: string, field: string, max = Infinity): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    return invalid(field, value);
  return value.trim();
}
export function numberIn(
  value: number,
  field: string,
  min: number,
  max: number,
  integer = false,
): number {
  if (
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    return invalid(field, value);
  return value;
}

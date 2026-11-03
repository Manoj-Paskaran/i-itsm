import { invalid } from './validation.js';
/** Immutable incidentnumber value. */
export class IncidentNumber {
  private constructor(readonly value: string) {}
  static of(value: string): IncidentNumber {
    if (typeof value !== 'string') return invalid('incidentNumber', value);
    if (!(typeof value === 'string' && /^INC[0-9]{4,8}$/.test(value)))
      return invalid('incidentNumber', value);
    return new IncidentNumber(value);
  }
  static fromSequence(n: number): IncidentNumber {
    if (!Number.isInteger(n) || n < 0 || n > 99999999) return invalid('sequence', n);
    return IncidentNumber.of(`INC${String(n).padStart(4, '0')}`);
  }
  equals(other: IncidentNumber): boolean {
    return this.value === other.value;
  }
  toString(): string {
    return this.value;
  }
  toJSON(): string {
    return this.value;
  }
}

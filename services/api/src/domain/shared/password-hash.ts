import { invalid } from './validation.js';
/** Immutable passwordhash value. */
export class PasswordHash {
  private constructor(readonly value: string) {}
  static of(value: string): PasswordHash {
    if (typeof value !== 'string') return invalid('passwordHash', value);
    if (!(typeof value === 'string' && value.trim().length > 0))
      return invalid('passwordHash', value);
    return new PasswordHash(value);
  }

  equals(other: PasswordHash): boolean {
    return this.value === other.value;
  }
  toString(): string {
    return '[redacted]';
  }
  toJSON(): string {
    return '[redacted]';
  }
}

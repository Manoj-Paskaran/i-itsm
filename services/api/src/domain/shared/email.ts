import { invalid } from './validation.js';
/** Immutable email value. */
export class Email {
  private constructor(readonly value: string) {}
  static of(value: string): Email {
    if (typeof value !== 'string') return invalid('email', value);
    value = value.trim().toLowerCase();
    if (!(
      typeof value === 'string' &&
      value.length <= 254 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ))
      return invalid('email', value);
    return new Email(value);
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }
  toString(): string {
    return this.value;
  }
  toJSON(): string {
    return this.value;
  }
}

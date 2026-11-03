import { invalid } from './validation.js';
/** Immutable skilltag value. */
export class SkillTag {
  private constructor(readonly value: string) {}
  static of(value: string): SkillTag {
    if (typeof value !== 'string') return invalid('skill', value);
    value = value.trim().toLowerCase();
    if (!(typeof value === 'string' && /^[a-z][a-z0-9-]{1,31}$/.test(value)))
      return invalid('skill', value);
    return new SkillTag(value);
  }

  equals(other: SkillTag): boolean {
    return this.value === other.value;
  }
  toString(): string {
    return this.value;
  }
  toJSON(): string {
    return this.value;
  }
}

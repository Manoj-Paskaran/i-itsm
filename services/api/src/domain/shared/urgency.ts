import { Level } from './level.js';
/** Four-point urgency scale. */
export class Urgency extends Level {
  private constructor(value: number) {
    super(value, ['Low', 'Medium', 'High', 'Critical']);
  }
  static of(value: number): Urgency {
    return new Urgency(value);
  }
}

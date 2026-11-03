import { Level } from './level.js';
/** Four-point impact scale. */
export class Impact extends Level {
  private constructor(value: number) {
    super(value, ['Low', 'Medium', 'High', 'Critical']);
  }
  static of(value: number): Impact {
    return new Impact(value);
  }
}

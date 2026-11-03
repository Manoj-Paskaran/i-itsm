import { Level } from './level.js';
/** Four-point businesscriticality scale. */
export class BusinessCriticality extends Level {
  private constructor(value: number) {
    super(value, ['Low', 'Medium', 'High', 'Mission-critical']);
  }
  static of(value: number): BusinessCriticality {
    return new BusinessCriticality(value);
  }
}

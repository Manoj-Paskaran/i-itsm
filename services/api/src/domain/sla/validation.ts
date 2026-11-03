import { invalid } from '../shared/validation.js';

export function validateWarningRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio >= 1) return invalid('warningRatio', ratio);
  return ratio;
}

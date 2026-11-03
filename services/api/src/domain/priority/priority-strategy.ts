import type { PriorityInput } from './priority-input.js';
import type { PriorityAssessment } from './priority-assessment.js';

/** Strategy pattern contract and threshold configuration for priority algorithms. */
export interface PriorityStrategy {
  readonly name: string;
  assess(input: PriorityInput): PriorityAssessment;
}

export interface PriorityThresholds {
  readonly p1: number;
  readonly p2: number;
  readonly p3: number;
}

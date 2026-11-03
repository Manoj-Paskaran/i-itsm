import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config';

// Stryker runs only the fast unit tests (domain + application). HTTP e2e and
// repository tests add minutes per mutant without covering the mutated code.
export default mergeConfig(
  base,
  defineConfig({
    test: { include: ['src/domain/**/*.test.ts', 'src/application/**/*.test.ts'] },
  }),
);

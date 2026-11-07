import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.stryker-tmp/**',
      '**/reports/**',
      '**/.turbo/**',
      '**/node_modules/**',
      '**/.pnpm-store/**',
      'services/ml/**',
      '**/*.config.*',
      '**/routeTree.gen.ts',
      'e2e/test-results/**',
      'e2e/playwright-report/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: { parserOptions: { projectService: true } },
  },
  {
    files: ['apps/web/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['services/api/src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@nestjs/*',
                'drizzle-orm*',
                'pg',
                'bullmq',
                'express',
                '@google/*',
                'zod',
                'reflect-metadata',
              ],
              message: 'Domain layer must stay framework-free',
            },
          ],
        },
      ],
    },
  },
  prettier,
);

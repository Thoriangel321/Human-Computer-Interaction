import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'shared/**/*.test.ts',
      'server/**/*.test.ts',
      'client/**/*.test.ts'
    ],
    coverage: {
      provider: 'v8',
      include: ['shared/**/*.ts'],
      exclude: ['shared/**/*.test.ts'],
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 80
      }
    }
  }
});
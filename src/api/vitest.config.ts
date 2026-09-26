import { defineConfig } from 'vitest/config';

// Unit tests: colocated *.spec.ts files, no database.
export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.spec.ts'],
  },
});

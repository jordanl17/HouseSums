import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests live next to the code: src/lib/*.test.ts and scripts/*.test.ts.
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
});

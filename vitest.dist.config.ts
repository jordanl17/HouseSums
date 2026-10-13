import { defineConfig } from 'vitest/config';

/**
 * Page-quality tests over the built site (npm run check:pages, after npm run build). Kept apart
 * from the unit tests (vitest.config.ts) because they need dist/. Honours SITE_URL, BASE_PATH
 * and DIST_DIR like the build (scripts/lib/site.mjs).
 */
export default defineConfig({
  test: {
    include: ['tests/built/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});

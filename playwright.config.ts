import { defineConfig, devices } from '@playwright/test';
import { normaliseBase } from './src/lib/url';

/**
 * End-to-end tests run against the built site (npm run build first), served by
 * `astro preview` with the same BASE_PATH the build used. Tests navigate with
 * relative paths ('./', 'sources/') so they work under any base path.
 *
 * Locally Playwright uses the Chromium preinstalled at PLAYWRIGHT_BROWSERS_PATH.
 * CI installs it with `npx playwright install --with-deps chromium`.
 */
const PORT = 4322;
// 127.0.0.1 rather than localhost, so requests never go through an HTTP proxy.
const HOST = '127.0.0.1';
// Same default as astro.config.mjs. The preview gets the raw value, exactly as the build did.
const basePath = process.env.BASE_PATH || '/HouseSums';
const base = normaliseBase(basePath);
const baseURL = `http://${HOST}:${PORT}${base}`;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile-360',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 780 } },
    },
    {
      name: 'desktop-1280',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    // --ignore-lock keeps `astro preview` in the foreground. Without it, Astro 7 moves the
    // server to the background when it detects a coding agent, and Playwright sees the
    // command exit early. It also skips the lock file, so stray background servers do not clash.
    command: `npm run preview -- --port ${PORT} --host ${HOST} --ignore-lock`,
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 60_000,
    env: {
      BASE_PATH: basePath,
      ASTRO_TELEMETRY_DISABLED: '1',
    },
  },
});

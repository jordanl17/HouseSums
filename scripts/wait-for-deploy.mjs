// Waits until the live site serves the build for EXPECTED_SHA, so the live tests
// never run against the previous deploy still sitting in the Pages CDN.
// Usage: LIVE_URL=https://... EXPECTED_SHA=<commit> node scripts/wait-for-deploy.mjs
// Without EXPECTED_SHA it only waits for the page to return 200.

const liveUrl = process.env.LIVE_URL?.replace(/\/?$/, '/');
const expected = process.env.EXPECTED_SHA;
const timeoutMs = Number(process.env.WAIT_TIMEOUT_MS ?? 300_000);
const intervalMs = 10_000;

if (!liveUrl) {
  console.error('LIVE_URL is not set');
  process.exit(1);
}

const deadline = Date.now() + timeoutMs;
let last = 'no response';

while (Date.now() < deadline) {
  try {
    const res = await fetch(liveUrl, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
    });
    const html = await res.text();
    const sha = html.match(/<meta name="hs-build" content="([^"]*)"/)?.[1];
    last = `HTTP ${res.status}, build ${sha ?? 'unknown'}`;
    if (res.ok && (!expected || sha === expected)) {
      console.log(`Live site is serving the expected build: ${last}`);
      process.exit(0);
    }
  } catch (error) {
    last = String(error);
  }
  console.log(`Waiting for ${liveUrl} (${last})`);
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}

console.error(`Timed out after ${timeoutMs / 1000}s waiting for the live site. Last: ${last}`);
process.exit(1);

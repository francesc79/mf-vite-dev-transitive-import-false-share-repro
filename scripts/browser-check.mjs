import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const consumerRoot = fileURLToPath(new URL('../packages/consumer/', import.meta.url));
// Start from a cold optimizer cache, as after `pnpm install` / a dependency upgrade.
await rm(new URL('node_modules/.vite', `file://${consumerRoot}`), { recursive: true, force: true });

const { createServer } = await import(new URL('node_modules/vite/dist/node/index.js', `file://${consumerRoot}`).href);
const server = await createServer({ root: consumerRoot, configFile: `${consumerRoot}vite.config.js`, logLevel: 'warn' });
await server.listen();
const url = server.resolvedUrls.local[0];

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const result = await page.evaluate(() => {
    const cache = globalThis.__mf_module_cache__?.share ?? {};
    return {
      text: document.querySelector('#app')?.textContent,
      providerInitialized: Boolean(globalThis.__repro_standalone_provider_init__),
      cachedShares: Object.keys(cache).filter(key => key.startsWith('default:')),
    };
  });

  console.log(JSON.stringify({ seedSharedCache: process.env.REPRO_SEED_SHARED_CACHE === '1', ...result, errors }, null, 2));
  assert.equal(result.providerInitialized, true, 'the standalone provider was not initialized');
  assert.deepEqual(errors, [], 'the dev page threw in the browser');
  assert.equal(result.text, 'hello: avatar of user');
} finally {
  await browser.close();
  await server.close();
}

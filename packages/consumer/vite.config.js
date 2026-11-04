import { federation } from '@module-federation/vite';
import { defineConfig } from 'vite';

import { seedSharedCacheSource } from './seed-shared-cache.js';

const seedSharedCache = process.env.REPRO_SEED_SHARED_CACHE === '1';
// A non-root base (an app served under a path prefix): with base '/' the plugin's middleware answers
// the HTML entry proxy itself and later transform hooks (such as the bootstrap below) never run on it.
const BASE = '/app/consumer/';

// While serving, the precompiled provider (packages/provider, served from node_modules) is initialized
// before the consumer's hostAutoInit, by prepending its bootstrap to the Module Federation HTML entry proxy.
function standaloneProviderDevBootstrap() {
  return {
    name: 'repro-standalone-provider-dev-bootstrap',
    apply: 'serve',
    enforce: 'post',
    transform(code, id) {
      if (!decodeURIComponent(id).replace(/^\0+/, '').startsWith('virtual:mf-html-entry-proxy')) return null;

      return [
        "const initKey = '__repro_standalone_provider_init__';",
        `const providerUrl = ${JSON.stringify(`${BASE}node_modules/@repro/provider/dist/standaloneProviderRemoteEntry.js`)};`,
        ...(seedSharedCache ? [`const seedSharedCache = ${seedSharedCacheSource};`] : []),
        'globalThis[initKey] ||= import(/* @vite-ignore */ providerUrl)',
        '  .then(({ init }) => init({}))',
        ...(seedSharedCache ? ['  .then(async (runtime) => { await seedSharedCache(runtime); return runtime; })'] : []),
        '  ;',
        'await globalThis[initKey];',
        code,
      ].join('\n');
    },
  };
}

export default defineConfig({
  base: BASE,
  server: { port: 5199, strictPort: true },
  plugins: [
    federation({
      name: 'consumer',
      filename: 'remoteEntry.js',
      exposes: { './expose': './src/expose.js' },
      remotes: {},
      dts: false,
      runtime: 'enhanced',
      shareStrategy: 'version-first',
      // Every shared module is consume-only (import: false), provided by the
      // standalone provider.
      shared: {
        '@repro/lib': { singleton: true, import: false },
        '@repro/hooks': { singleton: true, import: false },
        '@repro/hooks/media': { singleton: true, import: false },
      },
    }),
    standaloneProviderDevBootstrap(),
  ],
});

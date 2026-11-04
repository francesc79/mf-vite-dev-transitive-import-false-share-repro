import { federation } from '@module-federation/vite';
import { defineConfig } from 'vite';

// Precompiled standalone container that only provides the shared singletons.
export default defineConfig({
  base: './',
  build: {
    target: 'esnext',
    minify: false,
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: './src/noop.js',
    },
  },
  plugins: [
    federation({
      name: 'standaloneProvider',
      filename: 'standaloneProviderRemoteEntry.js',
      exposes: {},
      remotes: {},
      dts: false,
      manifest: false,
      runtime: 'enhanced',
      shareStrategy: 'version-first',
      shared: {
        '@repro/lib': { singleton: true },
        '@repro/hooks': { singleton: true },
        '@repro/hooks/media': { singleton: true },
      },
    }),
  ],
});

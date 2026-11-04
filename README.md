# `@module-federation/vite` dev: a shared subpath reached only through another shared package stays `undefined`

Minimal **dev server** (`vite serve`) reproduction for `@module-federation/vite` 1.23.8 with Vite 8.3.5,
also reproduced on `main` at `ae90d57` (1.23.9 + #1542). It contains no application-framework dependencies.
Issue draft: [`ISSUE.md`](ISSUE.md).

Repository: [francesc79/mf-vite-dev-transitive-import-false-share-repro](https://github.com/francesc79/mf-vite-dev-transitive-import-false-share-repro)

## Setup

| Package | Role |
|---|---|
| `@repro/hooks` (`.` and `./media`) | shared package with a shared subpath |
| `@repro/lib` | shared package that imports `@repro/hooks/media` |
| `@repro/provider` | precompiled standalone container that **provides** all singletons |
| `@repro/consumer` | dev app, every share `import: false` |

The consumer application imports `@repro/lib` and `@repro/hooks`, never `@repro/hooks/media`.
While serving, a small plugin prepends the provider bootstrap (`import(remoteEntry).then(init)`) to the
Module Federation HTML entry proxy, so the provider is initialized before the consumer's `hostAutoInit`.
The consumer uses a non-root `base` (`/app/consumer/`): with `base: '/'` the plugin
middleware answers the entry proxy itself and no later `transform` runs on it.

## Reproduce

Requirements: Node 24.15+, pnpm 10, Google Chrome at `/usr/bin/google-chrome`.

```bash
git clone git@github.com:francesc79/mf-vite-dev-transitive-import-false-share-repro.git
cd mf-vite-dev-transitive-import-false-share-repro
pnpm install
pnpm repro              # fails
pnpm repro:workaround   # passes
```

`pnpm repro` builds the provider, starts the consumer dev server with a cold optimizer cache, opens it in
headless Chrome and fails with:

```text
TypeError: useAvatar is not a function
```

The page stays on `loading`. `pnpm dev` starts the same dev server for manual inspection at
`http://localhost:5199/app/consumer/`.

## Expected

`hello: avatar of user`: the provider is initialized first and owns `@repro/hooks/media@1.0.0`.

## What happens

1. The generated `hostAutoInit` seeds the share cache (`__mf_module_cache__.share`) only for the shares the
   app imports directly: `@repro/hooks` and `@repro/lib`. `@repro/hooks/media` is missing from the seed
   items, although it is in `__mfHostInitShareBatches` and `materialize: true` in the local shared map.
2. Seeding `@repro/lib` imports its source, where `import { useAvatar } from '@repro/hooks/media'` is
   rewritten to the consumer's dev `loadShare` wrapper for `@repro/hooks/media`.
3. That wrapper finds nothing in the cache and waits for `initPromise`. When the promise resolves the share is
   still not in the cache, and the dev wrapper has no `loadLazyShares` fallback (it is generated only for
   `build`), so it throws `Shared module @repro/hooks/media was imported before federation bootstrap
   finished`.
4. That rejection is tracked by `__mfTrackPendingShareLoad` and never surfaces. `useAvatar` stays
   `undefined` for good, even though `default:@repro/hooks/media` lands in the cache a moment later (it is
   listed in `cachedShares` in the diagnostic output).

It fails on every load of the same dev server, not only after a cold start. The seed list comes from
`getMaterializedShares()`, whose `package.json` dependency closure maps the dependency `@repro/hooks` to a
single shared key (the package root), so the subpath `@repro/hooks/media` is never added. Removing the
`@repro/hooks` root from both shared configs makes the subpath the only key for that package: it is then
seeded and the page renders.

## Workaround (`pnpm repro:workaround`)

`REPRO_SEED_SHARED_CACHE=1` makes the bootstrap publish every singleton the provider runtime offers into
`__mf_module_cache__.share` right after `init()`, before `hostAutoInit` runs
(`packages/consumer/seed-shared-cache.js`).

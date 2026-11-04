# [Bug]: dev — an `import: false` shared subpath used only by another shared package stays `undefined`

## Describe the bug

In dev (`vite serve`), a consume-only (`import: false`) shared **subpath** that the application never
imports itself, but that another shared package imports, is never seeded by the generated `hostAutoInit`.
Its dev `loadShare` wrapper then gives up and its named exports stay `undefined`, although the provider
container registered the share and it reaches `__mf_module_cache__.share` moments later.

Shape of the reproduction:

- `@repro/hooks` exports `.` and `./media`; `@repro/lib` depends on `@repro/hooks` and does
  `import { useAvatar } from '@repro/hooks/media'`;
- a precompiled standalone container (`@repro/provider`) provides `@repro/lib`, `@repro/hooks` and
  `@repro/hooks/media` as singletons and is initialized before the consumer's `hostAutoInit`;
- the consumer declares the same three shares with `import: false` and imports only `@repro/lib` and
  `@repro/hooks` (never `@repro/hooks/media`).

The page fails with:

```text
TypeError: useAvatar is not a function
```

It fails on every load of the same dev server, not only on the first one after a cold start.

### What happens

1. `hostAutoInit` seeds `default:@repro/hooks` and `default:@repro/lib` only. `@repro/hooks/media` is in
   `__mfHostInitShareBatches` and `materialize: true` in the local shared map, but not among the seed
   items.
2. Seeding `@repro/lib` evaluates its source, where `@repro/hooks/media` is rewritten to the consumer's dev
   `loadShare` wrapper.
3. That wrapper misses the cache, waits for `initPromise`, misses it again, and finds no
   `loadLazyShares` (it is generated only when `command === 'build'`), so it throws
   `Shared module @repro/hooks/media was imported before federation bootstrap finished.`
4. The rejection is collected by `__mfTrackPendingShareLoad` and never surfaces. The binding stays
   `undefined` even after the provider's copy lands in the cache, because this wrapper (unlike the
   eager/lazy variants) does not subscribe to the shared cache.

### Where it seems to come from

`getMaterializedShares()` (`src/virtualModules/virtualRemoteEntry.ts`) follows the dependencies of each
materialized share through `package.json`, but maps each dependency **package name** to a single shared key
(`configured`, which prefers the package root). `@repro/lib → @repro/hooks` therefore adds `@repro/hooks`
and never `@repro/hooks/media`.

Confirmed by removing the `@repro/hooks` root from both shared configs: `configured` then maps
`@repro/hooks` to `@repro/hooks/media`, the subpath is seeded and the page renders.

### Possible fixes

- Make the dev wrapper for host-provided shares recover like the build output does: after `initPromise`,
  resolve a cache miss through the runtime (`loadShare`) and/or subscribe to the shared cache
  (`__mfSubscribeSharedCache`) instead of failing permanently.
- And/or let the dependency closure in `getMaterializedShares()` include the configured subpath shares of
  a dependency package that the dependent actually imports.

A workaround on the consumer side (`pnpm repro:workaround`) is to publish every singleton of the provider
runtime into `__mf_module_cache__.share` right after its `init()`, before `hostAutoInit` runs.

## Version

- `@module-federation/vite` 1.23.9 (also 1.23.8, and `main` at `ae90d57`, 1.23.9 + #1542)
- `vite` 8.3.5
- Node 24.15.0, Chrome (headless)

## Reproduction

https://github.com/francesc79/mf-vite-dev-transitive-import-false-share-repro

```bash
git clone git@github.com:francesc79/mf-vite-dev-transitive-import-false-share-repro.git
cd mf-vite-dev-transitive-import-false-share-repro
pnpm install
pnpm repro              # fails: useAvatar is not a function
pnpm repro:workaround   # passes: hello: avatar of user
```

Requirements: Node 24.15+, pnpm 10, Google Chrome at `/usr/bin/google-chrome`. `pnpm dev` serves the
consumer at `http://localhost:5199/app/consumer/` for manual inspection.

The consumer uses a non-root `base`. With `base: '/'` the plugin's middleware answers the HTML entry proxy
directly, so the reproduction's own provider bootstrap plugin cannot prepend the provider initialization to
it.

## Relevant log output

```text
[vite] (client) [Unhandled rejection] TypeError: useAvatar is not a function
 > renderTopbar .../node_modules/@repro/lib/index.js:6:10
```

```json
{
  "text": "loading",
  "providerInitialized": true,
  "cachedShares": ["default:@repro/hooks", "default:@repro/lib", "default:@repro/hooks/media"],
  "errors": ["useAvatar is not a function"]
}
```

## Validations

- [x] Read the docs.
- [x] Read the common issues list.
- [x] Checked that there isn't already an issue that reports the same bug.
- [x] The provided reproduction is a minimal reproducible example of the bug.
